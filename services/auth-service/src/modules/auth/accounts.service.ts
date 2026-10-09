import { Injectable } from '@nestjs/common';
import { AppException, ErrorCode, vaiTroToRole } from '@qlpk/common';
import { DataSource, EntityManager } from 'typeorm';
import { AccountsQueryDto, AccountStatus } from './dto/accounts.dto';
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
      .leftJoin('benh_nhan', 'patient', 'patient.id_tai_khoan = account.id_tai_khoan');
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
      const profiles = await manager.query('SELECT id_benh_nhan FROM benh_nhan WHERE id_tai_khoan = $1 FOR UPDATE', [account.idTaiKhoan]);
      if (!profiles.length) return;
      const history = await manager.query('SELECT 1 FROM tien_su_benh WHERE id_benh_nhan = $1 LIMIT 1', [profiles[0].id_benh_nhan]);
      if (history.length) throw new AppException(409, 'ACCOUNT_HAS_RELATED_DATA', linkedDataMessage);
      await manager.query('DELETE FROM benh_nhan WHERE id_tai_khoan = $1', [account.idTaiKhoan]);
    }
  }
}
