import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'tai_khoan' })
export class TaiKhoan {
  @PrimaryGeneratedColumn('uuid', { name: 'id_tai_khoan' })
  idTaiKhoan: string;

  @Column({ name: 'ten_dang_nhap', length: 100 })
  tenDangNhap: string;

  @Column({ name: 'mat_khau_ma_hoa', length: 255 })
  matKhauMaHoa: string;

  @Column({ name: 'vai_tro', length: 50 })
  vaiTro: string;

  @Column({ name: 'trang_thai', length: 30, default: 'Active' })
  trangThai: string;

  @CreateDateColumn({ name: 'ngay_tao', type: 'timestamptz' })
  ngayTao: Date;

  @UpdateDateColumn({ name: 'ngay_cap_nhat', type: 'timestamptz' })
  ngayCapNhat: Date;
}
