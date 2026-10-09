import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode, isDbConflict } from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';
import { CreateOwnPatientDto, CreatePatientDto, UpdateOwnPatientDto } from './dto/patient.dto';
import { BenhNhan } from './benh-nhan.entity';
import { PatientRepository } from './patient.repository';

@Injectable()
export class PatientService {
  constructor(private readonly patients: PatientRepository, private readonly dataSource: DataSource) {}

  private async lockAccount(manager: EntityManager, idTaiKhoan: string) {
    const account = await manager.createQueryBuilder()
      .select('account.id_tai_khoan', 'id')
      .from('tai_khoan', 'account')
      .where('account.id_tai_khoan = :idTaiKhoan', { idTaiKhoan })
      .andWhere('account.vai_tro = :role', { role: 'NguoiDung' })
      .andWhere('account.trang_thai = :status', { status: 'Active' })
      .setLock('pessimistic_write')
      .getRawOne();
    if (!account) throw new AppException(403, ErrorCode.FORBIDDEN, 'Tài khoản bệnh nhân không còn hoạt động.');
  }

  private async ownPatient(manager: EntityManager, idTaiKhoan: string) {
    const patient = await manager.getRepository(BenhNhan).findOne({
      where: { idTaiKhoan }, lock: { mode: 'pessimistic_write' },
    });
    if (!patient) throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ bệnh nhân.');
    return patient;
  }

  private async validateProfile(manager: EntityManager, dto: CreateOwnPatientDto | UpdateOwnPatientDto, patientId?: number) {
    if (dto.ngaySinh && dto.ngaySinh > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })) {
      throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Ngày sinh không được ở tương lai.');
    }
    const repository = manager.getRepository(BenhNhan);
    if (dto.email) {
      const owner = await repository.createQueryBuilder('bn')
        .where('lower(bn.email) = :email', { email: dto.email.toLowerCase() }).getOne();
      if (owner && owner.idBenhNhan !== patientId) {
        throw new AppException(409, ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng.');
      }
    }
    if (dto.soDienThoai) {
      const owner = await repository.findOne({ where: { soDienThoai: dto.soDienThoai } });
      if (owner && owner.idBenhNhan !== patientId) {
        throw new AppException(409, ErrorCode.PHONE_ALREADY_EXISTS, 'Số điện thoại đã được sử dụng.');
      }
    }
  }

  private profileChanges(dto: CreateOwnPatientDto | UpdateOwnPatientDto) {
    const changes: Partial<BenhNhan> = {};
    for (const field of ['hoTen', 'ngaySinh', 'gioiTinh', 'soDienThoai', 'email', 'diaChi', 'soBaoHiemYTe'] as const) {
      const value = dto[field];
      if (value !== undefined) {
        Object.assign(changes, { [field]: field === 'email' && value ? value.toLowerCase() : value });
      }
    }
    return changes;
  }

  async createOwn(idTaiKhoan: string, dto: CreateOwnPatientDto) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      const repository = manager.getRepository(BenhNhan);
      if (await repository.findOne({ where: { idTaiKhoan } })) {
        throw new AppException(409, 'PATIENT_PROFILE_ALREADY_EXISTS', 'Bạn đã có thông tin cá nhân. Hãy chọn sửa thông tin.');
      }
      await this.validateProfile(manager, dto);
      const patient = repository.create({
        idTaiKhoan, trangThai: 'Active', ngaySinh: null, gioiTinh: null,
        soDienThoai: null, email: null, diaChi: null, soBaoHiemYTe: null,
        ...this.profileChanges(dto),
      });
      return this.toView(await repository.save(patient));
    });
  }

  async updateOwn(idTaiKhoan: string, dto: UpdateOwnPatientDto) {
    return this.dataSource.transaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      const patient = await this.ownPatient(manager, idTaiKhoan);
      const changes = this.profileChanges(dto);
      if (Object.keys(changes).length === 0) {
        throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Hãy nhập thông tin cần cập nhật.');
      }
      await this.validateProfile(manager, dto, patient.idBenhNhan);
      Object.assign(patient, changes);
      return this.toView(await manager.getRepository(BenhNhan).save(patient));
    });
  }

  async deleteOwn(idTaiKhoan: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.lockAccount(manager, idTaiKhoan);
        const patient = await this.ownPatient(manager, idTaiKhoan);
        await manager.getRepository(BenhNhan).remove(patient);
        return { deleted: true };
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
        throw new AppException(409, 'PATIENT_PROFILE_IN_USE', 'Không thể xóa thông tin cá nhân đã có lịch hẹn hoặc hồ sơ khám bệnh. Bạn vẫn có thể sửa thông tin.');
      }
      throw error;
    }
  }

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
