import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BenhNhan } from './benh-nhan.entity';
import { CreatePatientDto } from './dto/patient.dto';

@Injectable()
export class PatientRepository {
  constructor(@InjectRepository(BenhNhan) private readonly patients: Repository<BenhNhan>) {}

  findByAccount(idTaiKhoan: string) {
    return this.patients.findOne({ where: { idTaiKhoan } });
  }

  findByEmail(email: string) {
    return this.patients
      .createQueryBuilder('bn')
      .where('lower(bn.email) = :email', { email: email.toLowerCase() })
      .getOne();
  }

  findByPhone(soDienThoai: string) {
    return this.patients.findOne({ where: { soDienThoai } });
  }

  create(dto: CreatePatientDto) {
    return this.patients.save(
      this.patients.create({
        idTaiKhoan: dto.idTaiKhoan,
        hoTen: dto.hoTen,
        ngaySinh: dto.ngaySinh.slice(0, 10),
        gioiTinh: dto.gioiTinh,
        soDienThoai: dto.soDienThoai,
        email: dto.email.toLowerCase(),
        diaChi: dto.diaChi,
        trangThai: 'Active',
      }),
    );
  }
}
