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
}
