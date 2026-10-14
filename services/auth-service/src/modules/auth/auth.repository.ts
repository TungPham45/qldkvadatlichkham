import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaiKhoan } from './tai-khoan.entity';

@Injectable()
export class AuthRepository {
  constructor(@InjectRepository(TaiKhoan) private readonly accounts: Repository<TaiKhoan>) {}

  findByUsername(username: string) {
    return this.accounts.findOne({ where: { tenDangNhap: username } });
  }

  findById(id: string) {
    return this.accounts.findOne({ where: { idTaiKhoan: id } });
  }

  async hasPaymentPermission(id: string) {
    try {
      const rows = await this.accounts.manager.query(
        'SELECT quyen_thanh_toan FROM quan_ly WHERE id_tai_khoan = $1',
        [id],
      );
      return rows[0]?.quyen_thanh_toan === true;
    } catch (error) {
      if ((error as { code?: string })?.code === '42703') return false;
      throw error;
    }
  }

  createPatientAccount(username: string, passwordHash: string) {
    return this.accounts.save(
      this.accounts.create({
        tenDangNhap: username,
        matKhauMaHoa: passwordHash,
        vaiTro: 'NguoiDung',
        trangThai: 'Active',
      }),
    );
  }

  deleteById(id: string) {
    return this.accounts.delete({ idTaiKhoan: id });
  }

  async findAccountIdsByPhone(phone: string) {
    const rows = await this.accounts.manager.query(
      `SELECT DISTINCT profile.id_tai_khoan AS "idTaiKhoan"
       FROM (
         SELECT ql.id_tai_khoan, ql.so_dien_thoai
         FROM quan_ly ql
         UNION ALL
         SELECT bs.id_tai_khoan, bs.so_dien_thoai
         FROM bac_si bs
         UNION ALL
         SELECT link.id_tai_khoan, bn.so_dien_thoai
         FROM tai_khoan_benh_nhan link
         JOIN benh_nhan bn ON bn.id_benh_nhan = link.id_benh_nhan
         WHERE link.la_chu_ho_so = TRUE AND link.trang_thai = 'Active'
       ) profile
       JOIN tai_khoan tk ON tk.id_tai_khoan = profile.id_tai_khoan
       WHERE profile.so_dien_thoai = $1
       LIMIT 2`,
      [phone],
    ) as Array<{ idTaiKhoan: string }>;
    return rows.map((row) => row.idTaiKhoan);
  }

  updatePassword(id: string, passwordHash: string) {
    return this.accounts.update({ idTaiKhoan: id }, { matKhauMaHoa: passwordHash });
  }
}
