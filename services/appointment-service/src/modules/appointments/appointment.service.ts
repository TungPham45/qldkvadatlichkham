import { Injectable } from '@nestjs/common';
import {
  AppException,
  AppointmentStatus,
  APPROVED_SCHEDULE_STATUSES,
  ErrorCode,
  generateSlots,
  internalRequest,
  isDbConflict,
  isPastSlot,
  normalizeTime,
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

  async book(accountId: string, dto: CreateAppointmentDto) {
    const patient = await internalRequest<PatientBrief>(
      `${process.env.PATIENT_SERVICE_URL}/internal/patients/by-account/${accountId}`,
    );
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
          'SELECT id_benh_nhan FROM benh_nhan WHERE id_benh_nhan = $1 AND id_tai_khoan = $2 FOR KEY SHARE',
          [patient.id, accountId],
        );
        if (!profiles.length) {
          throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Vui lòng thêm thông tin cá nhân trước khi đặt khám.');
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
            ngayHen: date,
            gioHen: start,
            lyDoKham: dto.lyDoKham.trim(),
            trangThai: AppointmentStatus.PENDING,
            nguonDatLich: 'Online',
          }),
        );
        return { saved, endTime: matched.slot.end };
      });
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
    const patient = await internalRequest<PatientBrief>(
      `${process.env.PATIENT_SERVICE_URL}/internal/patients/by-account/${accountId}`,
    );
    const result = await this.repo.paginate(patient.id, page, pageSize, upcoming);
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
    const slots: Array<{ start: string; end: string; available: boolean; scheduleId: number }> = [];
    const seen = new Set<string>();
    for (const schedule of schedules) {
      for (const slot of generateSlots(schedule.startTime, schedule.endTime, schedule.slotMinutes)) {
        if (seen.has(slot.start) || isPastSlot(date, slot.start)) continue;
        seen.add(slot.start);
        slots.push({
          start: slot.start,
          end: slot.end,
          available: !taken.has(slot.start),
          scheduleId: schedule.id,
        });
      }
    }
    slots.sort((a, b) => a.start.localeCompare(b.start));
    return { doctorId, date, slots };
  }

  private async approvedSchedules(doctorId: number, date: string) {
    return internalRequest<ApprovedSchedule[]>(
      `${process.env.STAFF_SERVICE_URL}/internal/schedules/approved?doctorId=${doctorId}&date=${date}`,
    );
  }

  private matchSlot(schedules: ApprovedSchedule[], start: string) {
    for (const schedule of schedules) {
      const slot = generateSlots(schedule.startTime, schedule.endTime, schedule.slotMinutes).find(
        (item) => item.start === start,
      );
      if (slot) return { schedule, slot };
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
