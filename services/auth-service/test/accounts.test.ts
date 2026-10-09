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
import { TaiKhoan } from '../dist/modules/auth/tai-khoan.entity.js';

function account(id: string, vaiTro = 'Admin', trangThai = 'Active'): TaiKhoan {
  return Object.assign(new TaiKhoan(), { idTaiKhoan: id, tenDangNhap: id, vaiTro, trangThai });
}

function fixture(target: TaiKhoan, options: { actor?: TaiKhoan; related?: boolean; foreignKey?: boolean } = {}) {
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

test('patient account with medical history is retained', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { related: true });
  await assert.rejects(result.service.remove('actor', 'patient'), rejectsWith('ACCOUNT_HAS_RELATED_DATA'));
  assert.equal(result.sql.some((statement) => statement.startsWith('DELETE')), false);
});

test('clinical foreign key conflicts produce a Vietnamese retention explanation', async () => {
  const result = fixture(account('patient', 'NguoiDung'), { foreignKey: true });
  await assert.rejects(result.service.remove('actor', 'patient'), (error) => {
    assert.ok(rejectsWith('ACCOUNT_HAS_RELATED_DATA')(error));
    assert.match((error as AppException).message, /khóa hoặc ngừng hoạt động/);
    return true;
  });
  assert.equal(result.mutations().deleted, 0);
});

test('an unused patient profile and its account can be removed', async () => {
  const result = fixture(account('patient', 'NguoiDung'));
  assert.deepEqual(await result.service.remove('actor', 'patient'), { success: true });
  assert.ok(result.sql.some((statement) => statement.startsWith('DELETE FROM benh_nhan')));
  assert.equal(result.mutations().deleted, 1);
});
