import { bigintColumn, dateColumn, timeColumn } from '@qlpk/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'chuyen_khoa' })
export class ChuyenKhoa {
  @Column({ name: 'id_chuyen_khoa', type: 'bigint', primary: true, generated: 'identity', transformer: bigintColumn })
  idChuyenKhoa: number;

  @Column({ name: 'ten_chuyen_khoa', length: 150 })
  tenChuyenKhoa: string;

  @Column({ name: 'mo_ta', type: 'text', nullable: true })
  moTa: string | null;

  @Column({ name: 'trang_thai', length: 30 })
  trangThai: string;
}

@Entity({ name: 'bac_si' })
export class BacSi {
  @Column({ name: 'id_bac_si', type: 'bigint', primary: true, generated: 'identity', transformer: bigintColumn })
  idBacSi: number;

  @Column({ name: 'id_tai_khoan', type: 'uuid' })
  idTaiKhoan: string;

  @Column({ name: 'ho_ten', length: 150 })
  hoTen: string;

  @Column({ name: 'ngay_sinh', type: 'date', nullable: true, transformer: dateColumn })
  ngaySinh: string | null;

  @Column({ name: 'gioi_tinh', type: 'varchar', length: 20, nullable: true })
  gioiTinh: string | null;

  @Column({ name: 'so_dien_thoai', type: 'varchar', length: 20, nullable: true })
  soDienThoai: string | null;

  @Column({ name: 'email', type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ name: 'bang_cap', type: 'varchar', length: 255, nullable: true })
  bangCap: string | null;

  @Column({ name: 'so_chung_chi_hanh_nghe', type: 'varchar', length: 100, nullable: true })
  soChungChiHanhNghe: string | null;

  @Column({ name: 'trang_thai', length: 30 })
  trangThai: string;
}

@Entity({ name: 'bac_si_chuyen_khoa' })
export class BacSiChuyenKhoa {
  @PrimaryColumn({ name: 'id_bac_si', type: 'bigint', transformer: bigintColumn })
  idBacSi: number;

  @PrimaryColumn({ name: 'id_chuyen_khoa', type: 'bigint', transformer: bigintColumn })
  idChuyenKhoa: number;

  @Column({ name: 'la_chuyen_khoa_chinh', default: false })
  laChuyenKhoaChinh: boolean;
}

@Entity({ name: 'lich_lam_viec' })
export class LichLamViec {
  @Column({ name: 'id_lich_lam_viec', type: 'bigint', primary: true, generated: 'identity', transformer: bigintColumn })
  idLichLamViec: number;

  @Column({ name: 'id_bac_si', type: 'bigint', transformer: bigintColumn })
  idBacSi: number;

  @Column({ name: 'ngay_lam_viec', type: 'date', transformer: dateColumn })
  ngayLamViec: string;

  @Column({ name: 'gio_bat_dau', type: 'time', transformer: timeColumn })
  gioBatDau: string;

  @Column({ name: 'gio_ket_thuc', type: 'time', transformer: timeColumn })
  gioKetThuc: string;

  @Column({ name: 'thoi_luong_moi_ca', type: 'int', default: 30 })
  thoiLuongMoiCa: number;

  @Column({ name: 'trang_thai', length: 30 })
  trangThai: string;

  @Column({ name: 'ghi_chu', type: 'text', nullable: true })
  ghiChu: string | null;

  @CreateDateColumn({ name: 'ngay_tao', type: 'timestamptz' })
  ngayTao: Date;

  @UpdateDateColumn({ name: 'ngay_cap_nhat', type: 'timestamptz' })
  ngayCapNhat: Date;
}

@Entity({ name: 'quan_ly' })
export class QuanLy {
  @Column({ name: 'id_quan_ly', type: 'bigint', primary: true, generated: 'identity', transformer: bigintColumn })
  idQuanLy: number;

  @Column({ name: 'id_tai_khoan', type: 'uuid' })
  idTaiKhoan: string;

  @Column({ name: 'ho_ten', length: 150 })
  hoTen: string;

  @Column({ name: 'so_dien_thoai', type: 'varchar', length: 20, nullable: true })
  soDienThoai: string | null;

  @Column({ name: 'email', type: 'varchar', length: 150, nullable: true })
  email: string | null;
}

export const STAFF_ENTITIES = [ChuyenKhoa, BacSi, BacSiChuyenKhoa, LichLamViec, QuanLy];
