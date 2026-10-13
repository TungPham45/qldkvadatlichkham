import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode, isDbConflict } from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';
import { CreateOwnPatientDto, CreatePatientDto, CreateRelativePatientDto, UpdateOwnPatientDto, UpdateRelativePatientDto } from './dto/patient.dto';
import { BenhNhan } from './benh-nhan.entity';
import { PatientRepository } from './patient.repository';

@Injectable()
export class PatientService {
  constructor(private readonly patients: PatientRepository, private readonly dataSource: DataSource) {}

  private async profileTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction(work);
    } catch (error) {
      const conflict = isDbConflict(error);
      if (conflict?.constraint === 'uq_benh_nhan_so_bhyt') {
        throw new AppException(409, 'BHYT_ALREADY_EXISTS', 'Số thẻ BHYT đã được sử dụng cho một hồ sơ bệnh nhân khác.');
      }
      if (conflict?.constraint === 'uq_tkbn_mot_ban_than' || conflict?.constraint === 'uq_benh_nhan_chu_ho_so') {
        throw new AppException(409, 'PATIENT_PROFILE_ALREADY_EXISTS', 'Bạn đã có thông tin cá nhân. Hãy chọn sửa thông tin.');
      }
      throw error;
    }
  }

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
    const rows = await manager.query(
      `SELECT link.id_benh_nhan AS id
       FROM tai_khoan_benh_nhan link
       WHERE link.id_tai_khoan = $1
         AND link.la_chu_ho_so = TRUE
         AND link.trang_thai = 'Active'
       FOR UPDATE`,
      [idTaiKhoan],
    ) as Array<{ id: string | number }>;
    const id = rows[0]?.id;
    if (!id) throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ bệnh nhân.');
    const patient = await manager.getRepository(BenhNhan).findOne({
      where: { idBenhNhan: Number(id) },
      lock: { mode: 'pessimistic_write' },
    });
    if (!patient) throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ bệnh nhân.');
    return patient;
  }

  private async validateProfile(manager: EntityManager, dto: CreateOwnPatientDto | UpdateOwnPatientDto, patientId?: number, current?: BenhNhan) {
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
    const bhyt = this.resolveBhyt(dto, current);
    if (bhyt?.soBhyt) {
      const owner = await repository.createQueryBuilder('bn')
        .where('upper(bn.so_bhyt) = :soBhyt', { soBhyt: bhyt.soBhyt }).getOne();
      if (owner && owner.idBenhNhan !== patientId) {
        throw new AppException(409, 'BHYT_ALREADY_EXISTS', 'Số thẻ BHYT đã được sử dụng cho một hồ sơ bệnh nhân khác.');
      }
    }
  }

  private resolveBhyt(dto: { coBhyt?: boolean; soBhyt?: string | null }, current?: BenhNhan): Pick<BenhNhan, 'coBhyt' | 'soBhyt'> | undefined {
    if (dto.coBhyt === false) return { coBhyt: false, soBhyt: null };
    if (dto.coBhyt === true) {
      const value = dto.soBhyt === undefined ? current?.soBhyt : dto.soBhyt;
      const soBhyt = typeof value === 'string' ? value.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{10,15}$/.test(soBhyt)) {
        throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Hãy nhập số thẻ BHYT (10–15 ký tự chữ hoặc số) để xác nhận có BHYT.');
      }
      return { coBhyt: true, soBhyt };
    }
    if (dto.soBhyt !== undefined) {
      if (dto.soBhyt == null || dto.soBhyt === '') return { coBhyt: false, soBhyt: null };
      const soBhyt = dto.soBhyt.trim().toUpperCase();
      if (!/^[A-Z0-9]{10,15}$/.test(soBhyt)) {
        throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Số BHYT gồm 10–15 ký tự chữ hoặc số.');
      }
      return { coBhyt: true, soBhyt };
    }
    return undefined;
  }

  private profileChanges(dto: CreateOwnPatientDto | UpdateOwnPatientDto, current?: BenhNhan) {
    const changes: Partial<BenhNhan> = {};
    for (const field of ['hoTen', 'ngaySinh', 'gioiTinh', 'soDienThoai', 'email', 'diaChi'] as const) {
      const value = dto[field];
      if (value !== undefined) {
        Object.assign(changes, { [field]: field === 'email' && value ? value.toLowerCase() : value });
      }
    }
    const bhyt = this.resolveBhyt(dto, current);
    if (bhyt) Object.assign(changes, bhyt);
    return changes;
  }

  async createOwn(idTaiKhoan: string, dto: CreateOwnPatientDto) {
    return this.profileTransaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      const existing = await manager.query(
        `SELECT 1 AS ok
         FROM tai_khoan_benh_nhan
         WHERE id_tai_khoan = $1 AND la_chu_ho_so = TRUE
         LIMIT 1`,
        [idTaiKhoan],
      );
      if (existing.length) {
        throw new AppException(409, 'PATIENT_PROFILE_ALREADY_EXISTS', 'Bạn đã có thông tin cá nhân. Hãy chọn sửa thông tin.');
      }
      await this.validateProfile(manager, dto);
      const repository = manager.getRepository(BenhNhan);
      const patient = repository.create({
        trangThai: 'Active',
        ngaySinh: null,
        gioiTinh: null,
        soDienThoai: null,
        email: null,
        diaChi: null,
        coBhyt: false,
        soBhyt: null,
        ...this.profileChanges(dto),
      });
      const saved = await repository.save(patient);
      await manager.query(
        `INSERT INTO tai_khoan_benh_nhan
           (id_tai_khoan, id_benh_nhan, loai_quan_he, la_chu_ho_so, duoc_dat_lich_ho, trang_thai)
         VALUES ($1, $2, 'BanThan', TRUE, TRUE, 'Active')`,
        [idTaiKhoan, saved.idBenhNhan],
      );
      return this.toView(saved, idTaiKhoan);
    });
  }

  private toBookableView(
    patient: BenhNhan,
    link: { loaiQuanHe: string; laChuHoSo: boolean; duocDatLichHo: boolean },
  ) {
    return {
      id: patient.idBenhNhan,
      hoTen: patient.hoTen,
      ngaySinh: patient.ngaySinh,
      gioiTinh: patient.gioiTinh,
      soDienThoai: patient.soDienThoai,
      email: patient.email,
      diaChi: patient.diaChi,
      coBhyt: patient.coBhyt === true,
      soBhyt: patient.soBhyt ?? null,
      trangThai: patient.trangThai,
      loaiQuanHe: link.loaiQuanHe,
      laChuHoSo: link.laChuHoSo,
      duocDatLichHo: link.duocDatLichHo,
    };
  }

  private async linkedRelative(manager: EntityManager, idTaiKhoan: string, patientId: number) {
    const rows = await manager.query(
      `SELECT link.loai_quan_he AS "loaiQuanHe",
              link.la_chu_ho_so AS "laChuHoSo",
              link.duoc_dat_lich_ho AS "duocDatLichHo"
       FROM tai_khoan_benh_nhan link
       WHERE link.id_tai_khoan = $1
         AND link.id_benh_nhan = $2
         AND link.trang_thai = 'Active'
         AND link.la_chu_ho_so = FALSE
         AND link.duoc_dat_lich_ho = TRUE
       FOR UPDATE`,
      [idTaiKhoan, patientId],
    ) as Array<{ loaiQuanHe: string; laChuHoSo: boolean; duocDatLichHo: boolean }>;
    if (!rows.length) {
      throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ người thân để chỉnh sửa.');
    }
    const patient = await manager.getRepository(BenhNhan).findOne({
      where: { idBenhNhan: patientId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!patient || patient.trangThai !== 'Active') {
      throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ người thân để chỉnh sửa.');
    }
    return { patient, link: rows[0] };
  }

  async createRelative(idTaiKhoan: string, dto: CreateRelativePatientDto) {
    return this.profileTransaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      await this.validateProfile(manager, dto);
      const repository = manager.getRepository(BenhNhan);
      const patient = repository.create({
        trangThai: 'Active',
        ngaySinh: null,
        gioiTinh: null,
        soDienThoai: null,
        email: null,
        diaChi: null,
        coBhyt: false,
        soBhyt: null,
        ...this.profileChanges(dto),
      });
      const saved = await repository.save(patient);
      await manager.query(
        `INSERT INTO tai_khoan_benh_nhan
           (id_tai_khoan, id_benh_nhan, loai_quan_he, la_chu_ho_so, duoc_dat_lich_ho, trang_thai)
         VALUES ($1, $2, $3, FALSE, TRUE, 'Active')`,
        [idTaiKhoan, saved.idBenhNhan, dto.loaiQuanHe],
      );
      return this.toBookableView(saved, {
        loaiQuanHe: dto.loaiQuanHe,
        laChuHoSo: false,
        duocDatLichHo: true,
      });
    });
  }

  async updateRelative(idTaiKhoan: string, patientId: number, dto: UpdateRelativePatientDto) {
    return this.profileTransaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      const { patient, link } = await this.linkedRelative(manager, idTaiKhoan, patientId);
      const changes = this.profileChanges(dto, patient);
      if (Object.keys(changes).length === 0 && dto.loaiQuanHe === undefined) {
        throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Hãy nhập thông tin cần cập nhật.');
      }
      await this.validateProfile(manager, dto, patient.idBenhNhan, patient);
      Object.assign(patient, changes);
      const saved = await manager.getRepository(BenhNhan).save(patient);
      let loaiQuanHe = link.loaiQuanHe;
      if (dto.loaiQuanHe && dto.loaiQuanHe !== link.loaiQuanHe) {
        await manager.query(
          `UPDATE tai_khoan_benh_nhan
           SET loai_quan_he = $3
           WHERE id_tai_khoan = $1 AND id_benh_nhan = $2`,
          [idTaiKhoan, patientId, dto.loaiQuanHe],
        );
        loaiQuanHe = dto.loaiQuanHe;
      }
      return this.toBookableView(saved, {
        loaiQuanHe,
        laChuHoSo: false,
        duocDatLichHo: true,
      });
    });
  }

  async deleteRelative(idTaiKhoan: string, patientId: number) {
    return this.profileTransaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      const { patient } = await this.linkedRelative(manager, idTaiKhoan, patientId);
      await manager.query(
        `DELETE FROM tai_khoan_benh_nhan
         WHERE id_tai_khoan = $1 AND id_benh_nhan = $2 AND la_chu_ho_so = FALSE`,
        [idTaiKhoan, patientId],
      );
      const remaining = await manager.query(
        `SELECT 1 AS ok FROM tai_khoan_benh_nhan WHERE id_benh_nhan = $1 LIMIT 1`,
        [patientId],
      );
      if (!remaining.length) {
        await manager.query('SAVEPOINT delete_relative_profile');
        try {
          await manager.getRepository(BenhNhan).remove(patient);
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === '23503')) {
            throw error;
          }
          await manager.query('ROLLBACK TO SAVEPOINT delete_relative_profile');
          // Hồ sơ đã có lịch/hồ sơ khám: chỉ gỡ liên kết đặt hộ, giữ dữ liệu bệnh nhân.
        }
        await manager.query('RELEASE SAVEPOINT delete_relative_profile');
      }
      return { deleted: true };
    });
  }

  async updateOwn(idTaiKhoan: string, dto: UpdateOwnPatientDto) {
    return this.profileTransaction(async (manager) => {
      await this.lockAccount(manager, idTaiKhoan);
      const patient = await this.ownPatient(manager, idTaiKhoan);
      const changes = this.profileChanges(dto, patient);
      if (Object.keys(changes).length === 0) {
        throw new AppException(400, ErrorCode.VALIDATION_ERROR, 'Hãy nhập thông tin cần cập nhật.');
      }
      await this.validateProfile(manager, dto, patient.idBenhNhan, patient);
      Object.assign(patient, changes);
      return this.toView(await manager.getRepository(BenhNhan).save(patient), idTaiKhoan);
    });
  }

  async deleteOwn(idTaiKhoan: string) {
    try {
      return await this.profileTransaction(async (manager) => {
        await this.lockAccount(manager, idTaiKhoan);
        const patient = await this.ownPatient(manager, idTaiKhoan);
        const shared = await manager.query(
          `SELECT 1 FROM tai_khoan_benh_nhan
           WHERE id_benh_nhan = $1 AND id_tai_khoan <> $2 LIMIT 1`,
          [patient.idBenhNhan, idTaiKhoan],
        );
        if (shared.length) {
          throw new AppException(409, 'PATIENT_PROFILE_IN_USE', 'Hồ sơ đang được liên kết với tài khoản khác để đặt lịch hộ nên không thể xóa. Bạn vẫn có thể sửa thông tin.');
        }
        await manager.query(
          `DELETE FROM tai_khoan_benh_nhan
           WHERE id_tai_khoan = $1 AND id_benh_nhan = $2`,
          [idTaiKhoan, patient.idBenhNhan],
        );
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
    if (existing) return this.toView(existing, dto.idTaiKhoan);

    try {
      return await this.createOwn(dto.idTaiKhoan, {
        hoTen: dto.hoTen.trim(), ngaySinh: dto.ngaySinh.slice(0, 10), gioiTinh: dto.gioiTinh,
        soDienThoai: dto.soDienThoai.trim(), email: dto.email.trim(), diaChi: dto.diaChi.trim(),
        coBhyt: dto.coBhyt ?? false, soBhyt: dto.soBhyt,
      });
    } catch (error) {
<<<<<<< HEAD
=======
      const conflict = isDbConflict(error);
      if (conflict?.constraint.includes('email')) {
        throw new AppException(409, ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng.');
      }
      if (conflict?.constraint.includes('so_dien_thoai')) {
        throw new AppException(409, ErrorCode.PHONE_ALREADY_EXISTS, 'Số điện thoại đã được sử dụng.');
      }
>>>>>>> 4d0d13c508dbea20eec8b30b3188d70376b4009a
      const raced = await this.patients.findByAccount(dto.idTaiKhoan);
      if (raced) return this.toView(raced, dto.idTaiKhoan);
      throw error;
    }
  }

  async byAccount(idTaiKhoan: string) {
    const patient = await this.patients.findByAccount(idTaiKhoan);
    if (!patient) {
      throw new AppException(404, ErrorCode.PATIENT_NOT_FOUND, 'Không tìm thấy hồ sơ bệnh nhân.');
    }
    return this.toView(patient, idTaiKhoan);
  }

  async bookable(idTaiKhoan: string) {
    const rows = await this.dataSource.query(
      `SELECT bn.id_benh_nhan AS id,
              bn.ho_ten AS "hoTen",
              to_char(bn.ngay_sinh, 'YYYY-MM-DD') AS "ngaySinh",
              bn.gioi_tinh AS "gioiTinh",
              bn.so_dien_thoai AS "soDienThoai",
              bn.email AS email,
              bn.dia_chi AS "diaChi",
              bn.co_bhyt AS "coBhyt",
              bn.so_bhyt AS "soBhyt",
              bn.trang_thai AS "trangThai",
              link.loai_quan_he AS "loaiQuanHe",
              link.la_chu_ho_so AS "laChuHoSo",
              link.duoc_dat_lich_ho AS "duocDatLichHo"
       FROM tai_khoan_benh_nhan link
       JOIN benh_nhan bn ON bn.id_benh_nhan = link.id_benh_nhan
       WHERE link.id_tai_khoan = $1
         AND link.trang_thai = 'Active'
         AND bn.trang_thai = 'Active'
         AND (link.duoc_dat_lich_ho = TRUE OR link.la_chu_ho_so = TRUE)
       ORDER BY link.la_chu_ho_so DESC, bn.ho_ten ASC`,
      [idTaiKhoan],
    ) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      hoTen: String(row.hoTen),
      ngaySinh: row.ngaySinh ? String(row.ngaySinh) : null,
      gioiTinh: row.gioiTinh ? String(row.gioiTinh) : null,
      soDienThoai: row.soDienThoai ? String(row.soDienThoai) : null,
      email: row.email ? String(row.email) : null,
      diaChi: row.diaChi ? String(row.diaChi) : null,
      coBhyt: row.coBhyt === true,
      soBhyt: row.soBhyt ? String(row.soBhyt) : null,
      trangThai: String(row.trangThai),
      loaiQuanHe: String(row.loaiQuanHe),
      laChuHoSo: row.laChuHoSo === true,
      duocDatLichHo: row.duocDatLichHo === true,
    }));
  }

  toView(patient: BenhNhan, idTaiKhoan?: string) {
    return {
      id: patient.idBenhNhan,
      idTaiKhoan: idTaiKhoan ?? null,
      hoTen: patient.hoTen,
      ngaySinh: patient.ngaySinh,
      gioiTinh: patient.gioiTinh,
      soDienThoai: patient.soDienThoai,
      email: patient.email,
      diaChi: patient.diaChi,
      coBhyt: patient.coBhyt === true,
      soBhyt: patient.soBhyt ?? null,
      trangThai: patient.trangThai,
    };
  }
}
