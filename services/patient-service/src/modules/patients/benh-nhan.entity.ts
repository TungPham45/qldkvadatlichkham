import { bigintColumn, dateColumn } from '@qlpk/common';
import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'benh_nhan' })
export class BenhNhan {
  @Column({ name: 'id_benh_nhan', type: 'bigint', primary: true, generated: 'identity', transformer: bigintColumn })
  idBenhNhan: number;

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

  @Column({ name: 'dia_chi', type: 'varchar', length: 255, nullable: true })
  diaChi: string | null;

  @Column({ name: 'so_bao_hiem_y_te', type: 'varchar', length: 50, nullable: true })
  soBaoHiemYTe: string | null;

  @Column({ name: 'trang_thai', length: 30, default: 'Active' })
  trangThai: string;

  @CreateDateColumn({ name: 'ngay_tao', type: 'timestamptz' })
  ngayTao: Date;

  @UpdateDateColumn({ name: 'ngay_cap_nhat', type: 'timestamptz' })
  ngayCapNhat: Date;
}
