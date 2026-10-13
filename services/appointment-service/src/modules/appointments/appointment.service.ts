import { Injectable } from '@nestjs/common';
import {
  AppException,
  AppointmentStatus,
  APPROVED_SCHEDULE_STATUSES,
  ErrorCode,
  bookingWindows,
  generateSlots,
  internalRequest,
  isDbConflict,
  isPastSlot,
  normalizeTime,
  shiftBand,
  timeToMinutes,
} from '@qlpk/common';
import { DataSource } from 'typeorm';
import { DistributedLockService } from '../../redis/redis.module';
import { RedisService } from '../../redis/redis.module';
import { CreateAppointmentDto } from './dto/appointment.dto';
import { AppointmentRepository } from './appointment.repository';
import { LichHen } from './lich-hen.entity';

interface ApprovedSchedule {
  id: number;
  doctorId: number;
  date: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  status: string;
  note?: string | null;
}

interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
  scheduleId: number;
  note: string | null;
}

interface DoctorBrief {
  id: number;
  hoTen: string;
  maBacSi: string | null;
  chuyenKhoa: { id: number; ten: string | null } | null;
}

interface PatientBrief {
  id: number;
  hoTen: string;
  soDienThoai?: string | null;
}

@Injectable()
export class AppointmentService {
  constructor(
    private readonly repo: AppointmentRepository,
    private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly lock: DistributedLockService,
  ) {}

  async availability(doctorId: number, date: string) {
    const day = date.slice(0, 10);
    const cacheKey = this.cacheKey(doctorId, day);
    const cached = await this.redis.client.get(cacheKey);
    if (cached) return JSON.parse(cached) as ReturnType<AppointmentService['buildAvailability']>;
    const payload = await this.buildAvailability(doctorId, day);
    await this.redis.client.set(cacheKey, JSON.stringify(payload), 'EX', 45);
    return payload;
  }

  private otpKey(accountId: string, benhNhanId: number) {
    return `appointment:otp:${accountId}:${benhNhanId}`;
  }

  private otpCooldownKey(accountId: string, benhNhanId: number) {
    return `appointment:otp:cooldown:${accountId}:${benhNhanId}`;
  }

  private maskPhone(phone: string) {
    if (phone.length < 7) return phone;
    return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
  }

  private async loadBookablePatient(accountId: string, benhNhanId: number) {
    const profiles = await this.dataSource.query(
      `SELECT bn.id_benh_nhan AS id,
              bn.ho_ten AS "hoTen",
              bn.so_dien_thoai AS "soDienThoai"
       FROM benh_nhan bn
       JOIN tai_khoan_benh_nhan link
         ON link.id_benh_nhan = bn.id_benh_nhan
        AND link.id_tai_khoan = $2
       WHERE bn.id_benh_nhan = $1
         AND bn.trang_thai = 'Active'
         AND link.trang_thai = 'Active'
         AND (link.duoc_dat_lich_ho = TRUE OR link.la_chu_ho_so = TRUE)`,
      [benhNhanId, accountId],
    ) as PatientBrief[];
    if (!profiles.length) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Bạn không được đặt lịch cho người này.');
    }
    return profiles[0];
  }

  async sendBookingOtp(accountId: string, benhNhanId: number) {
    const patient = await this.loadBookablePatient(accountId, benhNhanId);
    const phone = patient.soDienThoai?.trim() || '';
    if (!/^0\d{9,10}$/.test(phone)) {
      throw new AppException(
        400,
        ErrorCode.VALIDATION_ERROR,
        'Hồ sơ người tới khám chưa có số điện thoại hợp lệ. Hãy cập nhật SĐT trước khi đặt lịch.',
      );
    }
    const cooldownKey = this.otpCooldownKey(accountId, benhNhanId);
    const cooling = await this.redis.client.get(cooldownKey);
    if (cooling) {
      throw new AppException(429, ErrorCode.VALIDATION_ERROR, 'Vui lòng đợi khoảng 60 giây trước khi gửi lại mã OTP.');
    }
    const maOtp = String(Math.floor(100000 + Math.random() * 900000));
    await this.redis.client.set(
      this.otpKey(accountId, benhNhanId),
      JSON.stringify({ maOtp, soDienThoai: phone }),
      'EX',
      300,
    );
    await this.redis.client.set(cooldownKey, '1', 'EX', 60);
    return {
      soDienThoaiMask: this.maskPhone(phone),
      hetHanSauGiay: 300,
      // Giả lập SMS: trả mã về client để nhập khi chưa có nhà cung cấp SMS thật.
      maOtpGiaLap: maOtp,
      thongBao: `Đã giả lập gửi OTP tới ${this.maskPhone(phone)}. Dùng mã hiển thị trên màn hình để xác minh.`,
    };
  }

  private async assertBookingOtp(accountId: string, benhNhanId: number, maOtp: string) {
    const raw = await this.redis.client.get(this.otpKey(accountId, benhNhanId));
    if (!raw) {
      throw new AppException(400, ErrorCode.OTP_EXPIRED, 'Mã OTP đã hết hạn hoặc chưa được gửi. Hãy gửi lại mã.');
    }
    let payload: { maOtp?: string };
    try {
      payload = JSON.parse(raw) as { maOtp?: string };
    } catch {
      throw new AppException(400, ErrorCode.OTP_EXPIRED, 'Mã OTP không còn hiệu lực. Hãy gửi lại mã.');
    }
    if (payload.maOtp !== maOtp) {
      throw new AppException(400, ErrorCode.OTP_INVALID, 'Mã OTP không đúng. Vui lòng kiểm tra lại.');
    }
  }

  async book(accountId: string, dto: CreateAppointmentDto) {
    if (!dto.maOtp?.trim()) {
      throw new AppException(400, ErrorCode.OTP_REQUIRED, 'Cần nhập mã OTP để xác minh người đặt lịch.');
    }
    await this.assertBookingOtp(accountId, dto.benhNhanId, dto.maOtp.trim());

    const date = dto.ngayHen.slice(0, 10);
    const start = normalizeTime(dto.gioHen);
    if (isPastSlot(date, start)) {
      throw new AppException(409, ErrorCode.APPOINTMENT_SLOT_UNAVAILABLE, 'Khung giờ này đã qua.');
    }

    const lockKey = `appointment:lock:${dto.bacSiId}:${date}:${start}`;
    const token = await this.lock.acquire(lockKey, 8000);
    if (!token) {
      throw new AppException(409, ErrorCode.APPOINTMENT_SLOT_ALREADY_BOOKED, 'Khung giờ này vừa được người khác đặt.');
    }

    try {
      const { saved, endTime } = await this.dataSource.transaction(async (manager) => {
        // Use the same doctor lock as schedule management, then validate the current approved slots.
        const doctors = await manager.query(
          'SELECT id_bac_si FROM bac_si WHERE id_bac_si = $1 AND trang_thai = $2 FOR UPDATE',
          [dto.bacSiId, 'Active'],
        );
        if (!doctors.length) {
          throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Không tìm thấy bác sĩ.');
        }
        const profiles = await manager.query(
          `SELECT bn.id_benh_nhan AS id, bn.ho_ten AS "hoTen", bn.so_dien_thoai AS "soDienThoai"
           FROM benh_nhan bn
           JOIN tai_khoan_benh_nhan link
             ON link.id_benh_nhan = bn.id_benh_nhan
            AND link.id_tai_khoan = $2
           WHERE bn.id_benh_nhan = $1
             AND bn.trang_thai = 'Active'
             AND link.trang_thai = 'Active'
             AND (link.duoc_dat_lich_ho = TRUE OR link.la_chu_ho_so = TRUE)
           FOR KEY SHARE OF bn, link`,
          [dto.benhNhanId, accountId],
        ) as PatientBrief[];
        if (!profiles.length) {
          throw new AppException(403, ErrorCode.FORBIDDEN, 'Bạn không được đặt lịch cho người này.');
        }
        const patient = profiles[0];
        if (!patient.soDienThoai || !/^0\d{9,10}$/.test(patient.soDienThoai)) {
          throw new AppException(
            400,
            ErrorCode.VALIDATION_ERROR,
            'Hồ sơ người tới khám chưa có số điện thoại hợp lệ.',
          );
        }
        const schedules = await manager.query(
          `SELECT id_lich_lam_viec AS id, id_bac_si AS "doctorId", ngay_lam_viec::text AS date,
                  gio_bat_dau AS "startTime", gio_ket_thuc AS "endTime",
                  thoi_luong_moi_ca AS "slotMinutes", trang_thai AS status
           FROM lich_lam_viec WHERE id_bac_si = $1 AND ngay_lam_viec = $2 AND trang_thai = ANY($3::varchar[])`,
          [dto.bacSiId, date, [...APPROVED_SCHEDULE_STATUSES]],
        ) as ApprovedSchedule[];
        const matched = this.matchSlot(schedules, start);
        if (!matched || isPastSlot(date, start)) {
          throw new AppException(409, ErrorCode.SCHEDULE_NOT_APPROVED, 'Bác sĩ chưa có lịch làm việc đã duyệt cho khung giờ này.');
        }
        const existing = await manager.query(
          `SELECT id_lich_hen FROM lich_hen
           WHERE id_bac_si = $1 AND ngay_hen = $2 AND gio_hen = $3 AND trang_thai <> 'Huy'
           LIMIT 1`,
          [dto.bacSiId, date, start],
        );
        if (existing.length) {
          throw new AppException(409, ErrorCode.APPOINTMENT_SLOT_ALREADY_BOOKED, 'Khung giờ này vừa được người khác đặt.');
        }
        const repository = manager.getRepository(LichHen);
        const saved = await repository.save(
          repository.create({
            idBenhNhan: patient.id,
            idBacSi: dto.bacSiId,
            idTaiKhoanDat: accountId,
            ngayHen: date,
            gioHen: start,
            lyDoKham: dto.lyDoKham.trim(),
            trangThai: AppointmentStatus.PENDING,
            nguonDatLich: 'Online',
          }),
        );
        await manager.query(
          `INSERT INTO thong_bao
             (id_tai_khoan, id_lich_hen, loai, kenh, tieu_de, noi_dung, trang_thai, thoi_gian_gui)
           VALUES ($1, $2, 'Dat lich', 'Ung dung', 'Đặt lịch khám thành công', $3, 'Chua doc', CURRENT_TIMESTAMP)`,
          [accountId, saved.idLichHen, `Lịch khám cho ${patient.hoTen} ngày ${date} lúc ${start} đã được ghi nhận.`],
        );
        return { saved, endTime: matched.slot.end };
      });
      await this.redis.client.del(this.otpKey(accountId, dto.benhNhanId));
      await this.redis.client.del(this.cacheKey(dto.bacSiId, date));
      const doctors = await this.lookupDoctors([dto.bacSiId]);
      return this.toView(saved, doctors.get(dto.bacSiId), endTime);
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (isDbConflict(error)) {
        throw new AppException(409, ErrorCode.APPOINTMENT_SLOT_ALREADY_BOOKED, 'Khung giờ này vừa được người khác đặt.');
      }
      throw error;
    } finally {
      await this.lock.release(lockKey, token);
    }
  }

  async mine(accountId: string, page = 1, pageSize = 10, upcoming = false) {
    const linked = await this.dataSource.query(
      `SELECT link.id_benh_nhan AS id
       FROM tai_khoan_benh_nhan link
       WHERE link.id_tai_khoan = $1
         AND link.trang_thai = 'Active'`,
      [accountId],
    ) as Array<{ id: string | number }>;
    const patientIds = linked.map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0);
    const result = await this.repo.paginate(patientIds, accountId, page, pageSize, upcoming);
    const doctors = await this.lookupDoctors(result.items.map((item) => item.idBacSi));
    return {
      page,
      pageSize,
      total: result.total,
      items: result.items.map((item) => this.toView(item, doctors.get(item.idBacSi))),
    };
  }

  stats() {
    return this.repo.counts();
  }

  private async buildAvailability(doctorId: number, date: string) {
    const schedules = await this.approvedSchedules(doctorId, date);
    const booked = await this.repo.bookedTimes(doctorId, date);
    const taken = new Set(booked.map((row) => normalizeTime(row.gioHen)));
    const slots: AvailabilitySlot[] = [];
    const seen = new Set<string>();
    for (const schedule of schedules) {
      for (const window of bookingWindows(schedule.startTime, schedule.endTime)) {
        for (const slot of generateSlots(window.start, window.end, schedule.slotMinutes)) {
          if (seen.has(slot.start) || isPastSlot(date, slot.start)) continue;
          seen.add(slot.start);
          slots.push({
            start: slot.start,
            end: slot.end,
            available: !taken.has(slot.start),
            scheduleId: schedule.id,
            note: schedule.note?.trim() || null,
          });
        }
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    return {
      doctorId,
      date,
      slots: slots.map(({ start, end, available }) => ({ start, end, available })),
      shifts: groupShifts(slots),
    };
  }

  private async approvedSchedules(doctorId: number, date: string) {
    return internalRequest<ApprovedSchedule[]>(
      `${process.env.STAFF_SERVICE_URL}/internal/schedules/approved?doctorId=${doctorId}&date=${date}`,
    );
  }

  private matchSlot(schedules: ApprovedSchedule[], start: string) {
    for (const schedule of schedules) {
      for (const window of bookingWindows(schedule.startTime, schedule.endTime)) {
        const slot = generateSlots(window.start, window.end, schedule.slotMinutes).find((item) => item.start === start);
        if (slot) return { schedule, slot };
      }
    }
    return null;
  }

  private async lookupDoctors(ids: number[]) {
    const unique = [...new Set(ids)];
    const map = new Map<number, DoctorBrief>();
    if (!unique.length) return map;
    try {
      const doctors = await internalRequest<DoctorBrief[]>(
        `${process.env.STAFF_SERVICE_URL}/internal/doctors?ids=${unique.join(',')}`,
      );
      for (const doctor of doctors) map.set(Number(doctor.id), doctor);
    } catch {
      return map;
    }
    return map;
  }

  invalidate(doctorId: number, date: string) {
    return this.redis.client.del(this.cacheKey(doctorId, date.slice(0, 10)));
  }

  private cacheKey(doctorId: number, date: string) {
    return `availability:${doctorId}:${date}`;
  }

  private toView(row: LichHen, doctor?: DoctorBrief, endTime?: string) {
    return {
      id: row.idLichHen,
      benhNhanId: row.idBenhNhan,
      bacSiId: row.idBacSi,
      ngayHen: row.ngayHen,
      gioBatDau: normalizeTime(row.gioHen),
      gioKetThuc: endTime ?? null,
      lyDoKham: row.lyDoKham,
      trangThai: row.trangThai,
      nguonDatLich: row.nguonDatLich,
      ngayTao: row.ngayTao,
      ngayCapNhat: row.ngayCapNhat,
      bacSi: doctor
        ? { id: doctor.id, hoTen: doctor.hoTen, maBacSi: doctor.maBacSi, chuyenKhoa: doctor.chuyenKhoa }
        : null,
    };
  }
}

function groupShifts(slots: AvailabilitySlot[]) {
  const order = ['SANG', 'CHIEU', 'TOI'] as const;
  const grouped = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const band = shiftBand(slot.start);
    const items = grouped.get(band.code) ?? [];
    items.push(slot);
    grouped.set(band.code, items);
  }
  return order.flatMap((code) => {
    const items = grouped.get(code);
    if (!items?.length) return [];
    const durations = new Set(items.map((slot) => timeToMinutes(slot.end) - timeToMinutes(slot.start)));
    const notes = [...new Set(items.map((slot) => slot.note).filter((note): note is string => Boolean(note)))];
    return [{
      code,
      label: shiftBand(items[0].start).label,
      start: items[0].start,
      end: items[items.length - 1].end,
      slotMinutes: durations.size === 1 ? [...durations][0] : null,
      available: items.filter((slot) => slot.available).length,
      total: items.length,
      note: notes.length ? notes.join(' · ') : null,
      slots: items.map(({ start, end, available }) => ({ start, end, available })),
    }];
  });
}
