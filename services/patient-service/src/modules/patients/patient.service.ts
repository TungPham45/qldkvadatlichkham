import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode, isDbConflict } from '@qlpk/common';
import { CreatePatientDto } from './dto/patient.dto';
import { BenhNhan } from './benh-nhan.entity';
import { PatientRepository } from './patient.repository';

@Injectable()
export class PatientService {
  constructor(private readonly patients: PatientRepository) {}

  async create(dto: CreatePatientDto) {
    const existing = await this.patients.findByAccount(dto.idTaiKhoan);
    if (existing) return this.toView(existing);

    const emailOwner = await this.patients.findByEmail(dto.email);
    if (emailOwner) {
      throw new AppException(409, ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng.');
    }
    const phoneOwner = await this.patients.findByPhone(dto.soDienThoai);
    if (phoneOwner) {
      throw new AppException(409, ErrorCode.PHONE_ALREADY_EXISTS, 'Số điện thoại đã được sử dụng.');
    }

    try {
      const created = await this.patients.create(dto);
      return this.toView(created);
    } catch (error) {
      const conflict = isDbConflict(error);
      if (conflict?.constraint.includes('email')) {
        throw new AppException(409, ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng.');
      }
      const raced = await this.patients.findByAccount(dto.idTaiKhoan);
      if (raced) return this.toView(raced);
      throw error;
    }
  }

  async byAccount(idTaiKhoan: string) {
    const patient = await this.patients.findByAccount(idTaiKhoan);
    if (!patient) {
      throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ bệnh nhân.');
    }
    return this.toView(patient);
  }

  toView(patient: BenhNhan) {
    return {
      id: patient.idBenhNhan,
      idTaiKhoan: patient.idTaiKhoan,
      hoTen: patient.hoTen,
      ngaySinh: patient.ngaySinh,
      gioiTinh: patient.gioiTinh,
      soDienThoai: patient.soDienThoai,
      email: patient.email,
      diaChi: patient.diaChi,
      soBaoHiemYTe: patient.soBaoHiemYTe,
      trangThai: patient.trangThai,
    };
  }
}
