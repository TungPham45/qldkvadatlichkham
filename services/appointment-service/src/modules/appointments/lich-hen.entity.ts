import { bigintColumn, dateColumn, timeColumn } from '@qlpk/common';
import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'lich_hen' })
export class LichHen {
  @Column({ name: 'id_lich_hen', type: 'bigint', primary: true, generated: 'identity', transformer: bigintColumn })
  idLichHen: number;

  @Column({ name: 'id_benh_nhan', type: 'bigint', transformer: bigintColumn })
  idBenhNhan: number;

  @Column({ name: 'id_bac_si', type: 'bigint', transformer: bigintColumn })
  idBacSi: number;

  @Column({ name: 'ngay_hen', type: 'date', transformer: dateColumn })
  ngayHen: string;

  @Column({ name: 'gio_hen', type: 'time', transformer: timeColumn })
  gioHen: string;

  @Column({ name: 'ly_do_kham', type: 'text', nullable: true })
  lyDoKham: string | null;

  @Column({ name: 'trang_thai', length: 50 })
  trangThai: string;

  @Column({ name: 'nguon_dat_lich', type: 'varchar', length: 50, nullable: true })
  nguonDatLich: string | null;

  @Column({ name: 'ghi_chu', type: 'text', nullable: true })
  ghiChu: string | null;

  @Column({ name: 'ly_do_huy', type: 'text', nullable: true })
  lyDoHuy: string | null;

  @Column({ name: 'thoi_gian_huy', type: 'timestamptz', nullable: true })
  thoiGianHuy: Date | null;

  @Column({ name: 'thoi_gian_check_in', type: 'timestamptz', nullable: true })
  thoiGianCheckIn: Date | null;

  @Column({ name: 'thoi_gian_bat_dau_kham', type: 'timestamptz', nullable: true })
  thoiGianBatDauKham: Date | null;

  @Column({ name: 'thoi_gian_ket_thuc_kham', type: 'timestamptz', nullable: true })
  thoiGianKetThucKham: Date | null;

  @CreateDateColumn({ name: 'ngay_tao', type: 'timestamptz' })
  ngayTao: Date;

  @UpdateDateColumn({ name: 'ngay_cap_nhat', type: 'timestamptz' })
  ngayCapNhat: Date;
}
