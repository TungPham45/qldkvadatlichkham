import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  addDays,
  AppException,
  APPROVED_SCHEDULE_STATUSES,
  ErrorCode,
  exactShift,
  internalRequest,
  isApprovedScheduleStatus,
  isDbConflict,
  isEditableScheduleStatus,
  normalizeDate,
  normalizeTime,
  ScheduleStatus,
  shiftByCode,
  startOfWeek,
  timeToMinutes,
  todayInVietnam,
  weekDays,
} from '@qlpk/common';
import { DataSource, Repository } from 'typeorm';
import { LichLamViec } from '../../database/entities';
import { BulkApproveDto, CreateSchedulesDto, ManagerScheduleQueryDto, RejectScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';
import { DoctorScheduleRepository, ScheduleRow } from './doctor-schedule.repository';
import { statusCode, toScheduleView } from './schedule.mapper';

@Injectable()
export class DoctorScheduleService {
  constructor(
    private readonly repo: DoctorScheduleRepository,
    private readonly dataSource: DataSource,
    @InjectRepository(LichLamViec) private readonly schedules: Repository<LichLamViec>,
  ) {}

  async myWeek(accountId: string, week?: string) {
    const doctor = await this.requireDoctor(accountId);
    const range = this.weekRange(week);
    const rows = await this.repo.findWeekForDoctor(doctor.idBacSi, range.weekStart, range.weekEnd);
    return {
      doctor: this.doctorBrief(doctor),
      ...range,
      items: rows.map(toScheduleView),
      summary: this.summarize(rows.map((row) => row.trangThai)),
    };
  }

  async create(accountId: string, dto: CreateSchedulesDto) {
    const doctor = await this.requireDoctor(accountId);
    const slotMinutes = Number(process.env.SLOT_DURATION_MINUTES || 30);
    const today = todayInVietnam();
    const seen = new Set<string>();
    for (const item of dto.items) {
      const key = `${item.ngayLamViec.slice(0, 10)}:${item.ca}`;
      if (seen.has(key)) {
        throw new AppException(409, ErrorCode.SCHEDULE_ALREADY_REGISTERED, 'Ca này đã được đăng ký.');
      }
      seen.add(key);
    }
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const repository = manager.getRepository(LichLamViec);
        const created: LichLamViec[] = [];
        for (const item of dto.items) {
          const shift = shiftByCode(item.ca);
          if (!shift) {
            throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Ca làm việc không hợp lệ.');
          }
          const date = item.ngayLamViec.slice(0, 10);
          if (date < today) {
            throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Không đăng ký ca trong quá khứ.');
          }
          const overlap = await repository
            .createQueryBuilder('l')
            .where('l.idBacSi = :doctorId', { doctorId: doctor.idBacSi })
            .andWhere('l.ngayLamViec = :date', { date })
            .andWhere('l.trangThai <> :rejected', { rejected: ScheduleStatus.REJECTED })
            .andWhere('l.gioBatDau < :end AND l.gioKetThuc > :start', { start: shift.start, end: shift.end })
            .getOne();
          if (overlap) {
            throw new AppException(409, ErrorCode.SCHEDULE_ALREADY_REGISTERED, 'Ca này đã được đăng ký.');
          }
          const row = await repository.save(
            repository.create({
              idBacSi: doctor.idBacSi,
              ngayLamViec: date,
              gioBatDau: shift.start,
              gioKetThuc: shift.end,
              thoiLuongMoiCa: slotMinutes,
              trangThai: ScheduleStatus.PENDING,
              ghiChu: null,
            }),
          );
          created.push(row);
        }
        return created;
      });
      return { items: saved.map(toScheduleView) };
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (isDbConflict(error)) {
        throw new AppException(409, ErrorCode.SCHEDULE_ALREADY_REGISTERED, 'Ca này đã được đăng ký.');
      }
      throw error;
    }
  }

  async update(accountId: string, id: number, dto: UpdateScheduleDto) {
    const doctor = await this.requireDoctor(accountId);
    const row = await this.ownedSchedule(doctor.idBacSi, id);
    if (row.trangThai !== ScheduleStatus.PENDING) {
      throw new AppException(409, ErrorCode.SCHEDULE_NOT_EDITABLE, 'Chỉ sửa được ca đang chờ duyệt.');
    }
    const shift = shiftByCode(dto.ca)!;
    const date = dto.ngayLamViec.slice(0, 10);
    if (date < todayInVietnam()) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Không đăng ký ca trong quá khứ.');
    }
    const overlap = await this.repo.findOverlap(doctor.idBacSi, date, shift.start, shift.end, id);
    if (overlap) {
      throw new AppException(409, ErrorCode.SCHEDULE_ALREADY_REGISTERED, 'Ca này đã được đăng ký.');
    }
    row.ngayLamViec = date;
    row.gioBatDau = shift.start;
    row.gioKetThuc = shift.end;
    try {
      return toScheduleView(await this.schedules.save(row));
    } catch (error) {
      if (isDbConflict(error)) {
        throw new AppException(409, ErrorCode.SCHEDULE_ALREADY_REGISTERED, 'Ca này đã được đăng ký.');
      }
      throw error;
    }
  }

  async remove(accountId: string, id: number) {
    const doctor = await this.requireDoctor(accountId);
    const row = await this.ownedSchedule(doctor.idBacSi, id);
    if (!isEditableScheduleStatus(row.trangThai) || isApprovedScheduleStatus(row.trangThai)) {
      throw new AppException(409, ErrorCode.SCHEDULE_NOT_EDITABLE, 'Không xóa được ca đã duyệt.');
    }
    await this.schedules.delete({ idLichLamViec: id });
    return { success: true };
  }

  async managerList(query: ManagerScheduleQueryDto) {
    const range = this.weekRange(query.week);
    const rows = await this.repo.queryManagerSchedules({
      from: range.weekStart,
      to: range.weekEnd,
      chuyenKhoaId: query.chuyenKhoaId,
      doctorId: query.doctorId,
      statuses: this.statusFilter(query.status),
      q: query.q?.trim(),
    });
    const summaryRows = await this.repo.queryManagerSchedules({
      from: range.weekStart,
      to: range.weekEnd,
    });
    return {
      ...range,
      summary: this.summarize(summaryRows.map((row) => row.trangThai)),
      doctors: this.groupDoctors(rows),
    };
  }

  async managerDoctor(doctorId: number, week?: string) {
    const doctor = await this.repo.findDoctorById(doctorId);
    if (!doctor || doctor.trangThai !== 'Active') {
      throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Không tìm thấy bác sĩ.');
    }
    const range = this.weekRange(week);
    const rows = await this.repo.queryManagerSchedules({
      from: range.weekStart,
      to: range.weekEnd,
      doctorId,
    });
    const grouped = this.groupDoctors(rows);
    return {
      ...range,
      doctor: grouped[0] ?? {
        id: doctor.idBacSi,
        hoTen: doctor.hoTen,
        maBacSi: doctor.soChungChiHanhNghe,
        chuyenKhoaId: null,
        chuyenKhoa: null,
        totalShifts: 0,
        totalHours: 0,
        statusCode: null,
        schedules: [],
      },
    };
  }

  async approve(id: number) {
    const row = await this.requireSchedule(id);
    if (isApprovedScheduleStatus(row.trangThai)) return toScheduleView(row);
    if (row.trangThai !== ScheduleStatus.PENDING) {
      throw new AppException(409, ErrorCode.SCHEDULE_NOT_EDITABLE, 'Chỉ duyệt được ca đang chờ duyệt.');
    }
    row.trangThai = ScheduleStatus.APPROVED;
    const saved = await this.schedules.save(row);
    await this.invalidateAvailability(saved.idBacSi, saved.ngayLamViec);
    return toScheduleView(saved);
  }

  async reject(id: number, dto: RejectScheduleDto) {
    const row = await this.requireSchedule(id);
    if (row.trangThai !== ScheduleStatus.PENDING) {
      throw new AppException(409, ErrorCode.SCHEDULE_NOT_EDITABLE, 'Chỉ từ chối được ca đang chờ duyệt.');
    }
    row.trangThai = ScheduleStatus.REJECTED;
    row.ghiChu = dto.lyDo.trim();
    const saved = await this.schedules.save(row);
    await this.invalidateAvailability(saved.idBacSi, saved.ngayLamViec);
    return toScheduleView(saved);
  }

  async bulkApprove(dto: BulkApproveDto) {
    const range = this.weekRange(dto.week);
    const rows = await this.repo.queryManagerSchedules({
      from: range.weekStart,
      to: range.weekEnd,
      doctorId: dto.doctorId,
      chuyenKhoaId: dto.chuyenKhoaId,
      statuses: [ScheduleStatus.PENDING],
    });
    const ids = rows.map((row) => Number(row.id));
    if (!ids.length) return { approved: 0, items: [] };
    await this.schedules
      .createQueryBuilder()
      .update(LichLamViec)
      .set({ trangThai: ScheduleStatus.APPROVED })
      .where('id_lich_lam_viec IN (:...ids)', { ids })
      .andWhere('trang_thai = :pending', { pending: ScheduleStatus.PENDING })
      .execute();
    const updated = await this.schedules
      .createQueryBuilder('l')
      .where('l.idLichLamViec IN (:...ids)', { ids })
      .getMany();
    await Promise.all(updated.map((row) => this.invalidateAvailability(row.idBacSi, row.ngayLamViec)));
    return { approved: updated.length, items: updated.map(toScheduleView) };
  }

  async dashboard(accountId: string) {
    const manager = await this.repo.findManagerByAccount(accountId);
    const range = this.weekRange(todayInVietnam());
    const rows = await this.repo.queryManagerSchedules({ from: range.weekStart, to: range.weekEnd });
    const summary = this.summarize(rows.map((row) => row.trangThai));
    const doctorIds = new Set(rows.map((row) => String(row.doctorId)));
    let appointmentsToday: number | null = null;
    let appointmentsWeek: number | null = null;
    try {
      const stats = await internalRequest<{ today: number; week: number }>(
        `${process.env.APPOINTMENT_SERVICE_URL}/internal/appointments/stats`,
      );
      appointmentsToday = stats.today;
      appointmentsWeek = stats.week;
    } catch {
      appointmentsToday = null;
      appointmentsWeek = null;
    }
    return {
      manager: manager
        ? { hoTen: manager.hoTen, email: manager.email, soDienThoai: manager.soDienThoai }
        : null,
      ...range,
      pendingCount: summary.pending,
      approvedCount: summary.approved,
      doctorsWithSchedule: doctorIds.size,
      appointmentsToday,
      appointmentsWeek,
    };
  }

  async approvedOnDate(doctorId: number, date: string) {
    const rows = await this.schedules
      .createQueryBuilder('l')
      .where('l.idBacSi = :doctorId', { doctorId })
      .andWhere('l.ngayLamViec = :date', { date })
      .andWhere('l.trangThai IN (:...statuses)', { statuses: [...APPROVED_SCHEDULE_STATUSES] })
      .orderBy('l.gioBatDau', 'ASC')
      .getMany();
    return rows.map((row) => ({
      id: row.idLichLamViec,
      doctorId: row.idBacSi,
      date: row.ngayLamViec,
      startTime: normalizeTime(row.gioBatDau),
      endTime: normalizeTime(row.gioKetThuc),
      slotMinutes: row.thoiLuongMoiCa,
      status: row.trangThai,
    }));
  }

  private async requireDoctor(accountId: string) {
    const doctor = await this.repo.findDoctorByAccount(accountId);
    if (!doctor || doctor.trangThai !== 'Active') {
      throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Không tìm thấy hồ sơ bác sĩ.');
    }
    return doctor;
  }

  private async ownedSchedule(doctorId: number, id: number) {
    const row = await this.requireSchedule(id);
    if (row.idBacSi !== doctorId) {
      throw new AppException(403, ErrorCode.FORBIDDEN, 'Bạn không sở hữu ca làm việc này.');
    }
    return row;
  }

  private async requireSchedule(id: number) {
    const row = await this.repo.findById(id);
    if (!row) throw new AppException(404, ErrorCode.SCHEDULE_NOT_FOUND, 'Không tìm thấy lịch làm việc.');
    return row;
  }

  private weekRange(week?: string) {
    const anchor = week ? week.slice(0, 10) : todayInVietnam();
    const weekStart = startOfWeek(anchor);
    const weekEnd = addDays(weekStart, 6);
    return { weekStart, weekEnd, days: weekDays(weekStart) };
  }

  private statusFilter(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    if (status === 'PENDING') return [ScheduleStatus.PENDING];
    if (status === 'REJECTED') return [ScheduleStatus.REJECTED];
    if (status === 'APPROVED') return [...APPROVED_SCHEDULE_STATUSES];
    return undefined;
  }

  private summarize(statuses: string[]) {
    return {
      total: statuses.length,
      pending: statuses.filter((status) => status === ScheduleStatus.PENDING).length,
      approved: statuses.filter((status) => isApprovedScheduleStatus(status)).length,
      rejected: statuses.filter((status) => status === ScheduleStatus.REJECTED).length,
    };
  }

  private groupDoctors(rows: ScheduleRow[]) {
    const map = new Map<string, ReturnType<DoctorScheduleService['emptyDoctor']>>();
    for (const row of rows) {
      const key = String(row.doctorId);
      if (!map.has(key)) {
        map.set(key, this.emptyDoctor(row));
      }
      const doctor = map.get(key)!;
      const start = normalizeTime(String(row.gioBatDau));
      const end = normalizeTime(String(row.gioKetThuc));
      const hours = Math.max(0, timeToMinutes(end) - timeToMinutes(start)) / 60;
      doctor.totalShifts += 1;
      doctor.totalHours = Math.round((doctor.totalHours + hours) * 10) / 10;
      doctor.schedules.push({
        id: Number(row.id),
        doctorId: Number(row.doctorId),
        date: normalizeDate(row.ngayLamViec),
        shift: exactShift(start, end),
        startTime: start,
        endTime: end,
        slotMinutes: Number(row.thoiLuongMoiCa),
        status: row.trangThai,
        statusCode: statusCode(row.trangThai),
        note: row.ghiChu,
        hours: Math.round(hours * 10) / 10,
        createdAt: row.ngayTao,
        updatedAt: row.ngayCapNhat,
      });
    }
    return [...map.values()].map((doctor) => {
      const codes = doctor.schedules.map((item) => item.statusCode);
      doctor.statusCode = codes.includes('PENDING') ? 'PENDING' : codes.includes('APPROVED') ? 'APPROVED' : codes.includes('REJECTED') ? 'REJECTED' : null;
      return doctor;
    });
  }

  private emptyDoctor(row: ScheduleRow) {
    return {
      id: Number(row.doctorId),
      hoTen: row.hoTen,
      maBacSi: row.maBacSi,
      chuyenKhoaId: row.chuyenKhoaId == null ? null : Number(row.chuyenKhoaId),
      chuyenKhoa: row.tenChuyenKhoa,
      totalShifts: 0,
      totalHours: 0,
      statusCode: null as 'PENDING' | 'APPROVED' | 'REJECTED' | null,
      schedules: [] as Array<ReturnType<typeof toScheduleView>>,
    };
  }

  private async invalidateAvailability(doctorId: number, date: string) {
    try {
      await internalRequest(
        `${process.env.APPOINTMENT_SERVICE_URL}/internal/appointments/cache?doctorId=${doctorId}&date=${date.slice(0, 10)}`,
        { method: 'DELETE' },
      );
    } catch (error) {
      console.error('Khong xoa duoc cache khung gio', error);
    }
  }

  private doctorBrief(doctor: { idBacSi: number; hoTen: string; soChungChiHanhNghe: string | null; email: string | null }) {
    return {
      id: doctor.idBacSi,
      hoTen: doctor.hoTen,
      maBacSi: doctor.soChungChiHanhNghe,
      email: doctor.email,
    };
  }
}
