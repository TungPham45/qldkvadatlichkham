import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode, isDbConflict, vaiTroToRole } from '@qlpk/common';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager } from 'typeorm';
import { AccountsQueryDto, AccountStatus } from './dto/accounts.dto';
import { CreateDoctorByManagerDto, CreatePatientByManagerDto, ProfilesQueryDto, UpdateDoctorByManagerDto, UpdatePatientByManagerDto } from './dto/manager-profiles.dto';
import { TaiKhoan } from './tai-khoan.entity';

const linkedDataMessage = 'Tài khoản đang có lịch làm việc, lịch khám hoặc hồ sơ y tế nên không thể xóa. Hãy khóa hoặc ngừng hoạt động tài khoản để giữ lại dữ liệu liên quan.';

@Injectable()
export class AccountsService {
  constructor(private readonly dataSource: DataSource) {}

  async list(actorId: string, query: AccountsQueryDto) {
    await this.requireManager(actorId);
    const builder = this.dataSource.getRepository(TaiKhoan).createQueryBuilder('account')
      .leftJoin('quan_ly', 'manager', 'manager.id_tai_khoan = account.id_tai_khoan')
      .leftJoin('bac_si', 'doctor', 'doctor.id_tai_khoan = account.id_tai_khoan')
      .leftJoin(
        'tai_khoan_benh_nhan',
        'patient_link',
        'patient_link.id_tai_khoan = account.id_tai_khoan AND patient_link.la_chu_ho_so = TRUE',
      )
      .leftJoin('benh_nhan', 'patient', 'patient.id_benh_nhan = patient_link.id_benh_nhan');
    if (query.vaiTro) builder.andWhere('account.vai_tro = :vaiTro', { vaiTro: query.vaiTro });
    if (query.trangThai) builder.andWhere('account.trang_thai = :trangThai', { trangThai: query.trangThai });
    if (query.q?.trim()) {
      const search = `%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`;
      builder.andWhere(`(account.ten_dang_nhap ILIKE :search
        OR COALESCE(manager.ho_ten, doctor.ho_ten, patient.ho_ten, '') ILIKE :search
        OR COALESCE(manager.email, doctor.email, patient.email, '') ILIKE :search
        OR COALESCE(manager.so_dien_thoai, doctor.so_dien_thoai, patient.so_dien_thoai, '') ILIKE :search)`, { search });
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const [items, total] = await Promise.all([
      builder.clone().select('account.id_tai_khoan', 'id')
        .addSelect('account.ten_dang_nhap', 'username')
        .addSelect('account.vai_tro', 'vaiTro')
        .addSelect('account.trang_thai', 'trangThai')
        .addSelect('account.ngay_tao', 'ngayTao')
        .addSelect('account.ngay_cap_nhat', 'ngayCapNhat')
        .addSelect('COALESCE(manager.ho_ten, doctor.ho_ten, patient.ho_ten)', 'hoTen')
        .addSelect('COALESCE(manager.email, doctor.email, patient.email)', 'email')
        .addSelect('COALESCE(manager.so_dien_thoai, doctor.so_dien_thoai, patient.so_dien_thoai)', 'soDienThoai')
        .orderBy('account.ten_dang_nhap', 'ASC').addOrderBy('account.id_tai_khoan', 'ASC')
        .offset((page - 1) * pageSize).limit(pageSize).getRawMany(),
      builder.clone().getCount(),
    ]);
    return { items: items.map((item) => ({ ...item, role: vaiTroToRole(item.vaiTro) })), total, page, pageSize };
  }

  async listPatients(actorId: string, query: ProfilesQueryDto) {
    await this.requireManager(actorId);
    const { where, values } = this.profileFilters(query, 'patient', ['patient.ho_ten', 'patient.email', 'patient.so_dien_thoai', 'account.ten_dang_nhap']);
    const joins = `FROM benh_nhan patient
      JOIN tai_khoan_benh_nhan link ON link.id_benh_nhan = patient.id_benh_nhan AND link.la_chu_ho_so = TRUE
      JOIN tai_khoan account ON account.id_tai_khoan = link.id_tai_khoan`;
    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total ${joins} ${where}`,
      values,
    );
    const offsetIndex = values.length + 1;
    const limitIndex = values.length + 2;
    const items = await this.dataSource.query(
      `SELECT patient.id_benh_nhan AS id, account.id_tai_khoan AS "accountId", account.ten_dang_nhap AS username,
        patient.ho_ten AS "hoTen", patient.ngay_sinh AS "ngaySinh", patient.gioi_tinh AS "gioiTinh",
        patient.so_dien_thoai AS "soDienThoai", patient.email, patient.dia_chi AS "diaChi",
        patient.co_bhyt AS "coBhyt", patient.so_bhyt AS "soBhyt", account.trang_thai AS "trangThai"
       ${joins}
       ${where} ORDER BY patient.id_benh_nhan ASC OFFSET $${offsetIndex} LIMIT $${limitIndex}`,
      [...values, (query.page - 1) * query.pageSize, query.pageSize],
    );
    return {
      items: items.map((item: { id: string; coBhyt: boolean | string | null; soBhyt?: string | null }) => ({
        ...item,
        id: Number(item.id),
        coBhyt: item.coBhyt === true || item.coBhyt === 'true' || item.coBhyt === 't',
        soBhyt: item.soBhyt ?? null,
      })),
      total: Number(countRows[0]?.total || 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async listDoctors(actorId: string, query: ProfilesQueryDto) {
    await this.requireManager(actorId);
    const { where, values } = this.profileFilters(query, 'doctor', ['doctor.ho_ten', 'doctor.email', 'doctor.so_dien_thoai', 'doctor.so_chung_chi_hanh_nghe', 'account.ten_dang_nhap']);
    const joins = `FROM bac_si doctor
      JOIN tai_khoan account ON account.id_tai_khoan = doctor.id_tai_khoan
      LEFT JOIN bac_si_chuyen_khoa link ON link.id_bac_si = doctor.id_bac_si AND link.la_chuyen_khoa_chinh = true
      LEFT JOIN chuyen_khoa specialty ON specialty.id_chuyen_khoa = link.id_chuyen_khoa`;
    const countRows = await this.dataSource.query(`SELECT COUNT(*)::int AS total ${joins} ${where}`, values);
    const offsetIndex = values.length + 1;
    const limitIndex = values.length + 2;
    const items = await this.dataSource.query(
      `SELECT doctor.id_bac_si AS id, doctor.id_tai_khoan AS "accountId", account.ten_dang_nhap AS username,
        doctor.ho_ten AS "hoTen", doctor.ngay_sinh AS "ngaySinh", doctor.gioi_tinh AS "gioiTinh",
        doctor.so_dien_thoai AS "soDienThoai", doctor.email, doctor.bang_cap AS "bangCap",
        doctor.so_chung_chi_hanh_nghe AS "soChungChiHanhNghe", doctor.nhan_bhyt AS "nhanBhyt",
        account.trang_thai AS "trangThai",
        specialty.id_chuyen_khoa AS "chuyenKhoaId", specialty.ten_chuyen_khoa AS "chuyenKhoa"
       ${joins} ${where} ORDER BY doctor.id_bac_si ASC OFFSET $${offsetIndex} LIMIT $${limitIndex}`,
      [...values, (query.page - 1) * query.pageSize, query.pageSize],
    );
    return {
      items: items.map((item: { id: string; chuyenKhoaId: string | null; nhanBhyt: boolean | string | null; coBhyt?: boolean | string | null }) => ({
        ...item,
        id: Number(item.id),
        chuyenKhoaId: item.chuyenKhoaId ? Number(item.chuyenKhoaId) : null,
        nhanBhyt: item.nhanBhyt === true || item.nhanBhyt === 'true' || item.nhanBhyt === 't',
      })),
      total: Number(countRows[0]?.total || 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async requireDoctor(actorId: string, id: number) {
    await this.requireManager(actorId);
    const rows = await this.dataSource.query('SELECT 1 FROM bac_si WHERE id_bac_si=$1', [id]);
    if (!rows.length) throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Không tìm thấy bác sĩ.');
  }

  async createPatient(actorId: string, dto: CreatePatientByManagerDto) {
    await this.requireManager(actorId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertUniqueProfile(manager, 'benh_nhan', dto.email, dto.soDienThoai);
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const accounts = await manager.query(
          `INSERT INTO tai_khoan (ten_dang_nhap, mat_khau_ma_hoa, vai_tro, trang_thai) VALUES ($1, $2, 'NguoiDung', $3) RETURNING id_tai_khoan`,
          [dto.username, passwordHash, dto.trangThai],
        );
        const soBhyt = dto.coBhyt === true && dto.soBhyt ? dto.soBhyt.trim().toUpperCase() : null;
        const rows = await manager.query(
          `INSERT INTO benh_nhan (ho_ten, ngay_sinh, gioi_tinh, so_dien_thoai, email, dia_chi, co_bhyt, so_bhyt, trang_thai)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id_benh_nhan AS id`,
          [dto.hoTen.trim(), dto.ngaySinh.slice(0, 10), dto.gioiTinh, dto.soDienThoai, dto.email.trim().toLowerCase(), dto.diaChi.trim(), Boolean(soBhyt), soBhyt, dto.trangThai],
        );
        await manager.query(
          `INSERT INTO tai_khoan_benh_nhan (id_tai_khoan, id_benh_nhan, loai_quan_he, la_chu_ho_so, duoc_dat_lich_ho, trang_thai)
           VALUES ($1,$2,'BanThan',TRUE,TRUE,'Active')`,
          [accounts[0].id_tai_khoan, rows[0].id],
        );
        return { id: Number(rows[0].id) };
      });
    } catch (error) {
      this.translateCreateConflict(error);
    }
  }

  async updatePatient(actorId: string, id: number, dto: UpdatePatientByManagerDto) {
    await this.requireManager(actorId);
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT link.id_tai_khoan
         FROM tai_khoan_benh_nhan link
         WHERE link.id_benh_nhan = $1 AND link.la_chu_ho_so = TRUE
         FOR UPDATE`,
        [id],
      );
      if (!rows.length) throw new AppException(404, 'PATIENT_NOT_FOUND', 'Không tìm thấy bệnh nhân.');
      await this.assertUniqueProfile(manager, 'benh_nhan', dto.email, dto.soDienThoai, id);
      const soBhyt = dto.coBhyt === true && dto.soBhyt ? dto.soBhyt.trim().toUpperCase() : null;
      await manager.query(
        `UPDATE benh_nhan SET ho_ten=$2, ngay_sinh=$3, gioi_tinh=$4, so_dien_thoai=$5, email=$6, dia_chi=$7,
          co_bhyt=$8, so_bhyt=$9, trang_thai=$10, ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_benh_nhan=$1`,
        [id, dto.hoTen.trim(), dto.ngaySinh.slice(0, 10), dto.gioiTinh, dto.soDienThoai, dto.email.trim().toLowerCase(), dto.diaChi.trim(), Boolean(soBhyt), soBhyt, dto.trangThai],
      );
      await manager.query('UPDATE tai_khoan SET trang_thai=$2, ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_tai_khoan=$1', [rows[0].id_tai_khoan, dto.trangThai]);
      return { id };
    });
  }

  async createDoctor(actorId: string, dto: CreateDoctorByManagerDto) {
    await this.requireManager(actorId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertUniqueDoctor(manager, dto.username, dto.soDienThoai, dto.soChungChiHanhNghe);
        await this.assertUniqueProfile(manager, 'bac_si', dto.email, dto.soDienThoai);
        await this.assertSpecialty(manager, dto.chuyenKhoaId);
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const accounts = await manager.query(
          `INSERT INTO tai_khoan (ten_dang_nhap, mat_khau_ma_hoa, vai_tro, trang_thai) VALUES ($1, $2, 'BacSi', $3) RETURNING id_tai_khoan`,
          [dto.username.trim(), passwordHash, dto.trangThai],
        );
        const rows = await manager.query(
          `INSERT INTO bac_si (id_tai_khoan, ho_ten, ngay_sinh, gioi_tinh, so_dien_thoai, email, bang_cap, so_chung_chi_hanh_nghe, nhan_bhyt, trang_thai)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id_bac_si AS id`,
          [accounts[0].id_tai_khoan, dto.hoTen.trim(), dto.ngaySinh.slice(0, 10), dto.gioiTinh, dto.soDienThoai, dto.email.trim().toLowerCase(), dto.bangCap.trim(), dto.soChungChiHanhNghe.trim(), dto.nhanBhyt === true, dto.trangThai],
        );
        await manager.query('INSERT INTO bac_si_chuyen_khoa (id_bac_si, id_chuyen_khoa, la_chuyen_khoa_chinh) VALUES ($1,$2,true)', [rows[0].id, dto.chuyenKhoaId]);
        return { id: Number(rows[0].id) };
      });
    } catch (error) {
      this.translateCreateConflict(error);
    }
  }

  async updateDoctor(actorId: string, id: number, dto: UpdateDoctorByManagerDto) {
    await this.requireManager(actorId);
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager.query('SELECT id_tai_khoan FROM bac_si WHERE id_bac_si = $1 FOR UPDATE', [id]);
        if (!rows.length) throw new AppException(404, ErrorCode.DOCTOR_NOT_FOUND, 'Không tìm thấy bác sĩ.');
        await this.assertUniqueDoctor(manager, undefined, dto.soDienThoai, dto.soChungChiHanhNghe, id);
        await this.assertUniqueProfile(manager, 'bac_si', dto.email, dto.soDienThoai, id);
        await this.assertSpecialty(manager, dto.chuyenKhoaId);
        await manager.query(
          `UPDATE bac_si SET ho_ten=$2, ngay_sinh=$3, gioi_tinh=$4, so_dien_thoai=$5, email=$6, bang_cap=$7,
            so_chung_chi_hanh_nghe=$8, nhan_bhyt=$9, trang_thai=$10, ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_bac_si=$1`,
          [id, dto.hoTen.trim(), dto.ngaySinh.slice(0, 10), dto.gioiTinh, dto.soDienThoai, dto.email.trim().toLowerCase(), dto.bangCap.trim(), dto.soChungChiHanhNghe.trim(), dto.nhanBhyt === true, dto.trangThai],
        );
        await manager.query('UPDATE tai_khoan SET trang_thai=$2, ngay_cap_nhat=CURRENT_TIMESTAMP WHERE id_tai_khoan=$1', [rows[0].id_tai_khoan, dto.trangThai]);
        await manager.query('DELETE FROM bac_si_chuyen_khoa WHERE id_bac_si=$1', [id]);
        await manager.query('INSERT INTO bac_si_chuyen_khoa (id_bac_si,id_chuyen_khoa,la_chuyen_khoa_chinh) VALUES ($1,$2,true)', [id, dto.chuyenKhoaId]);
        return { id };
      });
    } catch (error) {
      this.translateCreateConflict(error);
    }
  }

  async removeProfile(actorId: string, table: 'benh_nhan' | 'bac_si', idColumn: 'id_benh_nhan' | 'id_bac_si', id: number) {
    await this.requireManager(actorId);
    const rows = table === 'benh_nhan'
      ? await this.dataSource.query(
        `SELECT link.id_tai_khoan
         FROM tai_khoan_benh_nhan link
         WHERE link.id_benh_nhan = $1 AND link.la_chu_ho_so = TRUE
         LIMIT 1`,
        [id],
      )
      : await this.dataSource.query(`SELECT id_tai_khoan FROM ${table} WHERE ${idColumn}=$1`, [id]);
    if (!rows.length) throw new AppException(404, 'PROFILE_NOT_FOUND', 'Không tìm thấy hồ sơ cần xóa.');
    return this.remove(actorId, rows[0].id_tai_khoan);
  }

  async updateStatus(actorId: string, accountId: string, status: AccountStatus) {
    return this.dataSource.transaction(async (manager) => {
      const admins = await this.lockAdmins(manager, actorId);
      const account = await this.findLocked(manager, accountId);
      if (actorId === accountId && status !== 'Active') {
        throw new AppException(409, 'ACCOUNT_SELF_CHANGE', 'Bạn không thể khóa hoặc ngừng hoạt động tài khoản đang đăng nhập.');
      }
      this.protectLastAdmin(account, admins, status !== 'Active');
      account.trangThai = status;
      const saved = await manager.getRepository(TaiKhoan).save(account);
      return { id: saved.idTaiKhoan, username: saved.tenDangNhap, vaiTro: saved.vaiTro, role: vaiTroToRole(saved.vaiTro), trangThai: saved.trangThai };
    });
  }

  async remove(actorId: string, accountId: string) {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const admins = await this.lockAdmins(manager, actorId);
        const account = await this.findLocked(manager, accountId);
        if (actorId === accountId) {
          throw new AppException(409, 'ACCOUNT_SELF_DELETE', 'Bạn không thể xóa tài khoản đang đăng nhập.');
        }
        this.protectLastAdmin(account, admins, true);
        await this.removeUnusedProfile(manager, account);
        await manager.getRepository(TaiKhoan).delete({ idTaiKhoan: accountId });
        return { success: true };
      });
    } catch (error) {
      if (error && typeof error === 'object' && (error as { code?: string }).code === '23503') {
        throw new AppException(409, 'ACCOUNT_HAS_RELATED_DATA', linkedDataMessage);
      }
      throw error;
    }
  }

  private async requireManager(actorId: string) {
    const actor = await this.dataSource.getRepository(TaiKhoan).findOne({ where: { idTaiKhoan: actorId } });
    this.assertManager(actor);
  }

  private profileFilters(query: ProfilesQueryDto, alias: string, columns: string[]) {
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (query.q?.trim()) {
      values.push(`%${query.q.trim()}%`);
      clauses.push(`(${columns.map((column) => `${column} ILIKE $${values.length}`).join(' OR ')})`);
    }
    if (query.gioiTinh) {
      values.push(query.gioiTinh);
      clauses.push(`${alias}.gioi_tinh = $${values.length}`);
    }
    if (query.trangThai) {
      values.push(query.trangThai);
      clauses.push(`account.trang_thai = $${values.length}`);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
  }

  private async assertUniqueProfile(manager: EntityManager, table: 'benh_nhan' | 'bac_si', email: string, phone: string, excludeId?: number) {
    const idColumn = table === 'benh_nhan' ? 'id_benh_nhan' : 'id_bac_si';
    const params: unknown[] = [email.trim().toLowerCase(), phone];
    const excluded = excludeId ? `AND ${idColumn} <> $3` : '';
    if (excludeId) params.push(excludeId);
    const rows = await manager.query(
      `SELECT CASE WHEN lower(email)=$1 THEN 'email' ELSE 'phone' END AS conflict
       FROM ${table} WHERE (lower(email)=$1 OR so_dien_thoai=$2) ${excluded} LIMIT 1`,
      params,
    );
    if (rows[0]?.conflict === 'email') throw new AppException(409, ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng.');
    if (rows.length) throw new AppException(409, ErrorCode.PHONE_ALREADY_EXISTS, 'Số điện thoại đã được sử dụng.');
  }

  private async assertUniqueDoctor(manager: EntityManager, username: string | undefined, phone: string, license: string, excludeId?: number) {
    if (username) {
      const accounts = await manager.query('SELECT 1 FROM tai_khoan WHERE lower(ten_dang_nhap)=lower($1) LIMIT 1', [username.trim()]);
      if (accounts.length) {
        throw new AppException(409, ErrorCode.USERNAME_ALREADY_EXISTS, 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên đăng nhập khác.');
      }
    }

    const params: unknown[] = [phone.trim(), license.trim().toLowerCase()];
    const excluded = excludeId ? 'AND id_bac_si <> $3' : '';
    if (excludeId) params.push(excludeId);
    const rows = await manager.query(
      `SELECT CASE WHEN so_dien_thoai=$1 THEN 'phone' ELSE 'license' END AS conflict
       FROM bac_si
       WHERE (so_dien_thoai=$1 OR lower(so_chung_chi_hanh_nghe)=$2) ${excluded}
       ORDER BY CASE WHEN so_dien_thoai=$1 THEN 0 ELSE 1 END
       LIMIT 1`,
      params,
    );
    if (rows[0]?.conflict === 'phone') {
      throw new AppException(409, ErrorCode.PHONE_ALREADY_EXISTS, 'Số điện thoại đã được sử dụng bởi bác sĩ khác.');
    }
    if (rows.length) {
      throw new AppException(409, 'LICENSE_ALREADY_EXISTS', 'Số chứng chỉ hành nghề (CCHN) đã tồn tại.');
    }
  }

  private async assertSpecialty(manager: EntityManager, specialtyId: number) {
    const rows = await manager.query("SELECT 1 FROM chuyen_khoa WHERE id_chuyen_khoa=$1 AND trang_thai='Active'", [specialtyId]);
    if (!rows.length) throw new AppException(400, 'SPECIALTY_NOT_FOUND', 'Chuyên khoa không tồn tại hoặc đã ngừng hoạt động.');
  }

  private translateCreateConflict(error: unknown): never {
    const conflict = isDbConflict(error);
    if (conflict?.constraint.includes('ten_dang_nhap')) throw new AppException(409, ErrorCode.USERNAME_ALREADY_EXISTS, 'Tên đăng nhập đã tồn tại.');
    if (conflict?.constraint.includes('email')) throw new AppException(409, ErrorCode.EMAIL_ALREADY_EXISTS, 'Email đã được sử dụng.');
    if (conflict?.constraint.includes('so_dien_thoai')) throw new AppException(409, ErrorCode.PHONE_ALREADY_EXISTS, 'Số điện thoại đã được sử dụng.');
    if (conflict?.constraint.includes('so_chung_chi')) throw new AppException(409, 'LICENSE_ALREADY_EXISTS', 'Số chứng chỉ hành nghề đã tồn tại.');
    throw error;
  }

  private assertManager(actor: TaiKhoan | null | undefined) {
    if (!actor) throw new AppException(401, ErrorCode.UNAUTHORIZED, 'Tài khoản không còn tồn tại.');
    if (actor.trangThai !== 'Active') throw new AppException(403, ErrorCode.ACCOUNT_DISABLED, 'Tài khoản đang bị khóa hoặc ngừng hoạt động.');
    if (actor.vaiTro !== 'Admin') throw new AppException(403, ErrorCode.FORBIDDEN, 'Chỉ admin được quản lý tài khoản.');
  }

  private async lockAdmins(manager: EntityManager, actorId: string) {
    // Always lock the same ordered set before the target to serialize admin mutations.
    const admins = await manager.getRepository(TaiKhoan).createQueryBuilder('account')
      .where('account.vai_tro = :role', { role: 'Admin' })
      .orderBy('account.id_tai_khoan', 'ASC').setLock('pessimistic_write').getMany();
    this.assertManager(admins.find((account) => account.idTaiKhoan === actorId));
    return admins;
  }

  private async findLocked(manager: EntityManager, accountId: string) {
    const account = await manager.getRepository(TaiKhoan).findOne({
      where: { idTaiKhoan: accountId }, lock: { mode: 'pessimistic_write' },
    });
    if (!account) throw new AppException(404, 'ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản.');
    return account;
  }

  private protectLastAdmin(account: TaiKhoan, admins: TaiKhoan[], removesActive: boolean) {
    if (removesActive && account.vaiTro === 'Admin' && account.trangThai === 'Active'
      && admins.filter((admin) => admin.trangThai === 'Active').length <= 1) {
      throw new AppException(409, 'LAST_ACTIVE_ADMIN', 'Phải giữ ít nhất một tài khoản admin đang hoạt động.');
    }
  }

  private async removeUnusedProfile(manager: EntityManager, account: TaiKhoan) {
    if (account.vaiTro === 'Admin') {
      await manager.query('DELETE FROM quan_ly WHERE id_tai_khoan = $1', [account.idTaiKhoan]);
    } else if (account.vaiTro === 'BacSi') {
      const profiles = await manager.query('SELECT id_bac_si FROM bac_si WHERE id_tai_khoan = $1 FOR UPDATE', [account.idTaiKhoan]);
      if (!profiles.length) return;
      const schedules = await manager.query('SELECT 1 FROM lich_lam_viec WHERE id_bac_si = $1 LIMIT 1', [profiles[0].id_bac_si]);
      if (schedules.length) throw new AppException(409, 'ACCOUNT_HAS_RELATED_DATA', linkedDataMessage);
      await manager.query('DELETE FROM bac_si WHERE id_tai_khoan = $1', [account.idTaiKhoan]);
    } else if (account.vaiTro === 'NguoiDung') {
      // benh_nhan is an independent clinical record. Deleting the login account
      // only removes tai_khoan_benh_nhan through its FK cascade; the patient and
      // all medical history remain intact.
      return;
    }
  }
}
