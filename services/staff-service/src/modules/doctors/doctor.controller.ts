import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccessTokenPayload, AppException, AppRole, APPROVED_SCHEDULE_STATUSES, CurrentUser, ErrorCode, InternalGuard, JwtAuthGuard, normalizeDate, Roles, RolesGuard, todayInVietnam } from '@qlpk/common';
import { Repository } from 'typeorm';
import { BacSi, LichLamViec } from '../../database/entities';

@Controller()
export class DoctorController {
  constructor(
    @InjectRepository(BacSi) private readonly doctors: Repository<BacSi>,
    @InjectRepository(LichLamViec) private readonly schedules: Repository<LichLamViec>,
  ) {}

  @Get('doctors/me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.DOCTOR)
  async me(@CurrentUser() user: AccessTokenPayload) {
    const doctor = await this.withSpecialtyByAccount(user.sub);
    if (!doctor) throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Không tìm thấy hồ sơ bác sĩ.');
    return doctor;
  }

  @Get('doctors')
  @UseGuards(JwtAuthGuard)
  async list(@Query('chuyenKhoaId') chuyenKhoaId?: string, @Query('bookable') bookable?: string) {
    return this.queryDoctors({
      chuyenKhoaId: chuyenKhoaId ? Number(chuyenKhoaId) : undefined,
      bookable: bookable === 'true',
    });
  }

  @Get('doctors/:id/dates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AppRole.PATIENT, AppRole.MANAGER)
  async dates(@Param('id', ParseIntPipe) id: number, @Query('from') from?: string, @Query('to') to?: string) {
    const start = (from || todayInVietnam()).slice(0, 10);
    const end = (to || start).slice(0, 10);
    const rows = await this.schedules
      .createQueryBuilder('l')
      .select('l.ngayLamViec', 'date')
      .where('l.idBacSi = :id', { id })
      .andWhere('l.trangThai IN (:...statuses)', { statuses: [...APPROVED_SCHEDULE_STATUSES] })
      .andWhere('l.ngayLamViec BETWEEN :start AND :end', { start, end })
      .andWhere('l.ngayLamViec >= :today', { today: todayInVietnam() })
      .groupBy('l.ngayLamViec')
      .orderBy('l.ngayLamViec', 'ASC')
      .getRawMany<{ date: string }>();
    return rows.map((row) => normalizeDate(row.date));
  }

  @Get('internal/doctors')
  @UseGuards(InternalGuard)
  async internalList(@Query('ids') ids?: string) {
    const parsed = (ids || '')
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (!parsed.length) return [];
    return this.queryDoctors({ ids: parsed });
  }

  private async withSpecialtyByAccount(accountId: string) {
    const rows = await this.queryDoctors({ accountId });
    return rows[0] ?? null;
  }

  private async queryDoctors(filter: { chuyenKhoaId?: number; bookable?: boolean; ids?: number[]; accountId?: string }) {
    const query = this.doctors
      .createQueryBuilder('bs')
      .leftJoin('bac_si_chuyen_khoa', 'bsck', 'bsck.id_bac_si = bs.id_bac_si AND bsck.la_chuyen_khoa_chinh = true')
      .leftJoin('chuyen_khoa', 'ck', 'ck.id_chuyen_khoa = bsck.id_chuyen_khoa')
      .where('bs.trang_thai = :active', { active: 'Active' })
      .select('bs.id_bac_si', 'id')
      .addSelect('bs.ho_ten', 'hoTen')
      .addSelect('bs.email', 'email')
      .addSelect('bs.so_dien_thoai', 'soDienThoai')
      .addSelect('bs.bang_cap', 'bangCap')
      .addSelect('bs.so_chung_chi_hanh_nghe', 'maBacSi')
      .addSelect('bs.gioi_tinh', 'gioiTinh')
      .addSelect('ck.id_chuyen_khoa', 'chuyenKhoaId')
      .addSelect('ck.ten_chuyen_khoa', 'chuyenKhoa')
      .orderBy('bs.ho_ten', 'ASC');

    if (filter.chuyenKhoaId) query.andWhere('ck.id_chuyen_khoa = :chuyenKhoaId', { chuyenKhoaId: filter.chuyenKhoaId });
    if (filter.ids?.length) query.andWhere('bs.id_bac_si IN (:...ids)', { ids: filter.ids });
    if (filter.accountId) query.andWhere('bs.id_tai_khoan = :accountId', { accountId: filter.accountId });
    if (filter.bookable) {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM lich_lam_viec l
          WHERE l.id_bac_si = bs.id_bac_si
            AND l.trang_thai IN (:...approved)
            AND l.ngay_lam_viec >= :today
        )`,
        { approved: [...APPROVED_SCHEDULE_STATUSES], today: todayInVietnam() },
      );
    }

    const rows = await query.getRawMany<{
      id: string;
      hoTen: string;
      email: string | null;
      soDienThoai: string | null;
      bangCap: string | null;
      maBacSi: string | null;
      gioiTinh: string | null;
      chuyenKhoaId: string | null;
      chuyenKhoa: string | null;
    }>();

    return rows.map((row) => ({
      id: Number(row.id),
      hoTen: row.hoTen,
      email: row.email,
      soDienThoai: row.soDienThoai,
      bangCap: row.bangCap,
      maBacSi: row.maBacSi,
      gioiTinh: row.gioiTinh,
      chuyenKhoa: row.chuyenKhoaId ? { id: Number(row.chuyenKhoaId), ten: row.chuyenKhoa } : null,
    }));
  }
}
