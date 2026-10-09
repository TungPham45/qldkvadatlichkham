import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ScheduleStatus, shiftByCode } from '@qlpk/common';
import { Repository } from 'typeorm';
import { BacSi, LichLamViec, QuanLy } from '../../database/entities';

export interface ScheduleRow {
  id: string;
  doctorId: string;
  hoTen: string;
  maBacSi: string | null;
  chuyenKhoaId: string | null;
  tenChuyenKhoa: string | null;
  ngayLamViec: string;
  gioBatDau: string;
  gioKetThuc: string;
  thoiLuongMoiCa: number;
  trangThai: string;
  ghiChu: string | null;
  ngayTao: Date;
  ngayCapNhat: Date;
}

@Injectable()
export class DoctorScheduleRepository {
  constructor(
    @InjectRepository(LichLamViec) private readonly schedules: Repository<LichLamViec>,
    @InjectRepository(BacSi) private readonly doctors: Repository<BacSi>,
    @InjectRepository(QuanLy) private readonly managers: Repository<QuanLy>,
  ) {}

  schedulesOf() {
    return this.schedules;
  }

  findDoctorByAccount(idTaiKhoan: string) {
    return this.doctors.findOne({ where: { idTaiKhoan } });
  }

  findDoctorById(idBacSi: number) {
    return this.doctors.findOne({ where: { idBacSi } });
  }

  findManagerByAccount(idTaiKhoan: string) {
    return this.managers.findOne({ where: { idTaiKhoan } });
  }

  findById(id: number) {
    return this.schedules.findOne({ where: { idLichLamViec: id } });
  }

  findWeekForDoctor(doctorId: number, from: string, to: string) {
    return this.schedules
      .createQueryBuilder('l')
      .where('l.idBacSi = :doctorId', { doctorId })
      .andWhere('l.ngayLamViec BETWEEN :from AND :to', { from, to })
      .orderBy('l.ngayLamViec', 'ASC')
      .addOrderBy('l.gioBatDau', 'ASC')
      .getMany();
  }

  findOverlap(doctorId: number, date: string, start: string, end: string, excludeId?: number) {
    const query = this.schedules
      .createQueryBuilder('l')
      .where('l.idBacSi = :doctorId', { doctorId })
      .andWhere('l.ngayLamViec = :date', { date })
      .andWhere('l.trangThai <> :rejected', { rejected: ScheduleStatus.REJECTED })
      .andWhere('l.gioBatDau < :end AND l.gioKetThuc > :start', { start, end });
    if (excludeId) query.andWhere('l.idLichLamViec <> :excludeId', { excludeId });
    return query.getOne();
  }

  async queryManagerSchedules(filter: {
    from: string;
    to: string;
    chuyenKhoaId?: number;
    doctorId?: number;
    statuses?: string[];
    q?: string;
    date?: string;
    shift?: 'SANG' | 'CHIEU';
  }): Promise<ScheduleRow[]> {
    const query = this.schedules
      .createQueryBuilder('l')
      .innerJoin('bac_si', 'bs', 'bs.id_bac_si = l.id_bac_si')
      .leftJoin('bac_si_chuyen_khoa', 'bsck', 'bsck.id_bac_si = bs.id_bac_si AND bsck.la_chuyen_khoa_chinh = true')
      .leftJoin('chuyen_khoa', 'ck', 'ck.id_chuyen_khoa = bsck.id_chuyen_khoa')
      .where('l.ngay_lam_viec BETWEEN :from AND :to', { from: filter.from, to: filter.to })
      .select('l.id_lich_lam_viec', 'id')
      .addSelect('l.id_bac_si', 'doctorId')
      .addSelect('bs.ho_ten', 'hoTen')
      .addSelect('bs.so_chung_chi_hanh_nghe', 'maBacSi')
      .addSelect('ck.id_chuyen_khoa', 'chuyenKhoaId')
      .addSelect('ck.ten_chuyen_khoa', 'tenChuyenKhoa')
      .addSelect('l.ngay_lam_viec', 'ngayLamViec')
      .addSelect('l.gio_bat_dau', 'gioBatDau')
      .addSelect('l.gio_ket_thuc', 'gioKetThuc')
      .addSelect('l.thoi_luong_moi_ca', 'thoiLuongMoiCa')
      .addSelect('l.trang_thai', 'trangThai')
      .addSelect('l.ghi_chu', 'ghiChu')
      .addSelect('l.ngay_tao', 'ngayTao')
      .addSelect('l.ngay_cap_nhat', 'ngayCapNhat')
      .orderBy('bs.ho_ten', 'ASC')
      .addOrderBy('l.ngay_lam_viec', 'ASC')
      .addOrderBy('l.gio_bat_dau', 'ASC');

    if (filter.chuyenKhoaId) query.andWhere('ck.id_chuyen_khoa = :chuyenKhoaId', { chuyenKhoaId: filter.chuyenKhoaId });
    if (filter.doctorId) query.andWhere('l.id_bac_si = :doctorId', { doctorId: filter.doctorId });
    if (filter.statuses?.length) query.andWhere('l.trang_thai IN (:...statuses)', { statuses: filter.statuses });
    if (filter.date) query.andWhere('l.ngay_lam_viec = :date', { date: filter.date });
    if (filter.shift) {
      const shift = shiftByCode(filter.shift)!;
      query.andWhere('l.gio_bat_dau < :shiftEnd AND l.gio_ket_thuc > :shiftStart', { shiftStart: shift.start, shiftEnd: shift.end });
    }
    if (filter.q) query.andWhere('(bs.ho_ten ILIKE :q OR bs.so_chung_chi_hanh_nghe ILIKE :q OR ck.ten_chuyen_khoa ILIKE :q OR l.ghi_chu ILIKE :q OR CAST(l.ngay_lam_viec AS text) ILIKE :q)', { q: `%${filter.q}%` });
    return query.getRawMany<ScheduleRow>();
  }
}
