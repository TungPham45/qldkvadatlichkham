import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AppException, ROLES_KEY } from '@qlpk/common';
import { DataSource } from 'typeorm';
import { AccountsController } from '../dist/modules/auth/accounts.controller.js';
import { AccountsService } from '../dist/modules/auth/accounts.service.js';
import { AccountsQueryDto, AccountStatusDto } from '../dist/modules/auth/dto/accounts.dto.js';
import { CreateDoctorByManagerDto, CreatePatientByManagerDto, PatientProfilesQueryDto, ProfilesQueryDto, UpdateDoctorByManagerDto, UpdatePatientByManagerDto } from '../dist/modules/auth/dto/manager-profiles.dto.js';
import { TaiKhoan } from '../dist/modules/auth/tai-khoan.entity.js';

function account(id: string, vaiTro = 'Admin', trangThai = 'Active'): TaiKhoan {
  return Object.assign(new TaiKhoan(), { idTaiKhoan: id, tenDangNhap: id, vaiTro, trangThai });
}

function fixture(target: TaiKhoan, options: { actor?: TaiKhoan; related?: boolean; foreignKey?: boolean; noOwner?: boolean; bhytConflict?: boolean } = {}) {
  const actor = options.actor || account('actor');
  const admins = [actor, ...(target.vaiTro === 'Admin' && target.idTaiKhoan !== actor.idTaiKhoan ? [target] : [])];
  const sql: string[] = [];
  let saved = 0;
  let deleted = 0;
  const builder = {
    where() { return this; }, orderBy() { return this; }, setLock() { return this; },
    async getMany() { return admins; },
  };
  const repository = {
    createQueryBuilder() { return builder; },
    async findOne({ where }: { where: { idTaiKhoan: string } }) {
      return [actor, target].find((item) => item.idTaiKhoan === where.idTaiKhoan) || null;
    },
    async save(value: TaiKhoan) { saved += 1; return value; },
    async delete() { deleted += 1; return { affected: 1 }; },
  };
  const manager = {
    getRepository() { return repository; },
    async query(statement: string) {
      sql.push(statement);
      if (statement.includes('SELECT id_tai_khoan FROM tai_khoan_benh_nhan')) return options.noOwner ? [] : [{ id_tai_khoan: target.idTaiKhoan }];
      if (statement.includes('SELECT id_tai_khoan, la_chu_ho_so')) return options.noOwner ? [] : [{ id_tai_khoan: target.idTaiKhoan, la_chu_ho_so: true }];
      if (statement.includes('UPDATE benh_nhan') && options.bhytConflict) throw { code: '23505', constraint: 'uq_benh_nhan_so_bhyt' };
      if (statement.includes('SELECT id_bac_si')) return [{ id_bac_si: '7' }];
      if (statement.includes('SELECT id_benh_nhan')) return [{ id_benh_nhan: '8' }];
      if (statement.includes('SELECT 1')) return options.related ? [{ exists: 1 }] : [];
      if (statement.startsWith('DELETE FROM') && options.foreignKey) {
        throw { code: '23503', constraint: 'fk_lich_hen_benh_nhan' };
      }
      return [];
    },
  };
  const dataSource = {
    getRepository() { return repository; },
    async transaction(callback: (value: typeof manager) => unknown) { return callback(manager); },
  } as unknown as DataSource;
  return { service: new AccountsService(dataSource), sql, mutations: () => ({ saved, deleted }) };
}

function rejectsWith(code: string) {
  return (error: unknown) => error instanceof AppException && (error.getResponse() as { code: string }).code === code;
}

test('account endpoints require manager role', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AccountsController), ['MANAGER']);
});

test('query and status DTOs reject invalid filters, status and pagination', () => {
  const query = plainToInstance(AccountsQueryDto, { page: '0', pageSize: '101', vaiTro: 'DOCTOR', trangThai: 'Deleted' });
  assert.equal(validateSync(query).length, 4);
  assert.equal(validateSync(plainToInstance(AccountStatusDto, { trangThai: 'Deleted' })).length, 1);
  assert.equal(validateSync(plainToInstance(AccountsQueryDto, { page: '2', pageSize: '10', vaiTro: 'BacSi', trangThai: 'Active' })).length, 0);
});

test('patient gender supports other or unspecified values while doctor validation remains unchanged', () => {
  const profile = {
    hoTen: 'Người bệnh', ngaySinh: '2000-01-01', soDienThoai: '0901234567', email: 'patient@example.test',
    diaChi: 'Địa chỉ', trangThai: 'Active', coBhyt: false, username: 'patient.test', password: 'password',
    bangCap: 'Bác sĩ', soChungChiHanhNghe: 'CCHN-001', chuyenKhoaId: 1, nhanBhyt: false,
  };
  for (const gioiTinh of ['Khac', null]) {
    assert.equal(validateSync(plainToInstance(CreatePatientByManagerDto, { ...profile, gioiTinh })).length, 0);
    assert.equal(validateSync(plainToInstance(UpdatePatientByManagerDto, { ...profile, gioiTinh })).length, 0);
    assert.ok(validateSync(plainToInstance(CreateDoctorByManagerDto, { ...profile, gioiTinh })).some((error) => error.property === 'gioiTinh'));
    assert.ok(validateSync(plainToInstance(UpdateDoctorByManagerDto, { ...profile, gioiTinh })).some((error) => error.property === 'gioiTinh'));
  }
  assert.equal(validateSync(plainToInstance(PatientProfilesQueryDto, { gioiTinh: 'Khac' })).length, 0);
  assert.equal(validateSync(plainToInstance(ProfilesQueryDto, { gioiTinh: 'Khac' })).length, 1);
});

test('a disabled admin cannot mutate accounts with an existing access token', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { actor: account('actor', 'Admin', 'Locked') });
  await assert.rejects(result.service.updateStatus('actor', 'patient', 'Inactive'), rejectsWith('ACCOUNT_DISABLED'));
  assert.deepEqual(result.mutations(), { saved: 0, deleted: 0 });
});

test('admin cannot disable or delete the current account', async () => {
  const actor = account('actor');
  const result = fixture(actor, { actor });
  await assert.rejects(result.service.updateStatus('actor', 'actor', 'Locked'), rejectsWith('ACCOUNT_SELF_CHANGE'));
  await assert.rejects(result.service.remove('actor', 'actor'), rejectsWith('ACCOUNT_SELF_DELETE'));
  assert.deepEqual(result.mutations(), { saved: 0, deleted: 0 });
  assert.deepEqual(result.sql, []);
});

test('another account status can be changed within a transaction', async () => {
  const result = fixture(account('patient', 'NguoiDung'));
  const response = await result.service.updateStatus('actor', 'patient', 'Locked');
  assert.equal(response.trangThai, 'Locked');
  assert.equal(response.role, 'PATIENT');
  assert.deepEqual(result.mutations(), { saved: 1, deleted: 0 });
});

test('doctor account with schedules is retained without cascading schedule deletion', async () => {
  const result = fixture(account('doctor', 'BacSi'), { related: true });
  await assert.rejects(result.service.remove('actor', 'doctor'), rejectsWith('ACCOUNT_HAS_RELATED_DATA'));
  assert.equal(result.sql.some((statement) => statement.startsWith('DELETE')), false);
  assert.equal(result.mutations().deleted, 0);
});

test('deleting a patient account removes only its links and retains medical history', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { related: true });
  assert.deepEqual(await result.service.remove('actor', 'patient'), { success: true });
  assert.deepEqual(result.sql, ['DELETE FROM tai_khoan_benh_nhan WHERE id_tai_khoan = $1']);
  assert.equal(result.mutations().deleted, 1);
});

test('clinical foreign key conflicts produce a Vietnamese retention explanation', async () => {
  const result = fixture(account('doctor', 'BacSi'), { foreignKey: true });
  await assert.rejects(result.service.remove('actor', 'doctor'), (error) => {
    assert.ok(rejectsWith('ACCOUNT_HAS_RELATED_DATA')(error));
    assert.match((error as AppException).message, /khóa hoặc ngừng hoạt động/);
    return true;
  });
  assert.equal(result.mutations().deleted, 0);
});

test('a patient login account can be removed without deleting any independent profile', async () => {
  const result = fixture(account('patient', 'NguoiDung'));
  assert.deepEqual(await result.service.remove('actor', 'patient'), { success: true });
  assert.ok(result.sql.some((statement) => statement.startsWith('DELETE FROM tai_khoan_benh_nhan')));
  assert.equal(result.sql.some((statement) => statement.includes('FROM benh_nhan')), false);
  assert.equal(result.mutations().deleted, 1);
});

test('directory profile deletion removes only an unused patient and retains its login account', async () => {
  const result = fixture(account('patient', 'NguoiDung'));
  assert.deepEqual(await result.service.removeProfile('actor', 'benh_nhan', 'id_benh_nhan', 8), { success: true });
  assert.ok(result.sql.some((statement) => statement.startsWith('DELETE FROM benh_nhan WHERE id_benh_nhan')));
  assert.equal(result.mutations().deleted, 0);
  assert.equal(result.sql.some((statement) => /benh_nhan WHERE id_tai_khoan/.test(statement)), false);
});

test('directory can delete a patient profile with no linked login account', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { noOwner: true });
  assert.deepEqual(await result.service.removeProfile('actor', 'benh_nhan', 'id_benh_nhan', 8), { success: true });
  assert.equal(result.mutations().deleted, 0);
});

test('directory patient deletion preserves profiles referenced by clinical records', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { foreignKey: true });
  await assert.rejects(result.service.removeProfile('actor', 'benh_nhan', 'id_benh_nhan', 8), rejectsWith('PATIENT_PROFILE_IN_USE'));
  assert.equal(result.mutations().deleted, 0);
});

test('a duplicate BHYT number from the migration unique index becomes a readable conflict', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { bhytConflict: true });
  await assert.rejects(result.service.updatePatient('actor', 8, {
    hoTen: 'Bệnh nhân', ngaySinh: '2000-01-01', gioiTinh: 'Nam', soDienThoai: '0901234567',
    email: 'patient@example.test', diaChi: 'Địa chỉ', trangThai: 'Active', coBhyt: true, soBhyt: 'DN4010000000001',
  }), rejectsWith('BHYT_ALREADY_EXISTS'));
});

test('account search builds valid joins for independent patient profiles without multiplying linked relatives', async () => {
  const dataSource = new DataSource({ type: 'postgres', entities: [TaiKhoan] });
  await (dataSource as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  const repository = dataSource.getRepository(TaiKhoan);
  repository.findOne = async () => account('actor');
  const originalBuilder = repository.createQueryBuilder.bind(repository);
  const queries: Array<{ sql: string; parameters: unknown[] }> = [];
  function capture(builder: ReturnType<typeof repository.createQueryBuilder>): ReturnType<typeof repository.createQueryBuilder> {
    const originalClone = builder.clone.bind(builder);
    builder.clone = () => capture(originalClone());
    builder.getRawMany = async () => {
      const [sql, parameters] = builder.getQueryAndParameters();
      queries.push({ sql, parameters });
      return [{ id: 'patient', username: 'patient', vaiTro: 'NguoiDung', trangThai: 'Active' }] as never;
    };
    builder.getCount = async () => 1;
    return builder;
  }
  repository.createQueryBuilder = (...args) => capture(originalBuilder(...args));
  const service = new AccountsService(dataSource);
  const result = await service.list('actor', plainToInstance(AccountsQueryDto, { q: 'a_%', page: '2', pageSize: '10' }));
  assert.equal(result.items[0].role, 'PATIENT');
  assert.match(queries[0].sql, /LEFT JOIN "tai_khoan_benh_nhan" "patient_link"/);
  assert.match(queries[0].sql, /patient_link.la_chu_ho_so = TRUE/);
  assert.match(queries[0].sql, /patient.id_benh_nhan = patient_link.id_benh_nhan/);
  assert.doesNotMatch(queries[0].sql, /patient.id_tai_khoan|mat_khau_ma_hoa/);
  assert.ok(queries[0].parameters.includes('%a\\_\\%%'));
  assert.match(queries[0].sql, /LIMIT 10 OFFSET 10/);
});
