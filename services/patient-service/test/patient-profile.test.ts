import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DataSource, EntityManager } from 'typeorm';
import type { PatientRepository } from '../src/modules/patients/patient.repository';

type BenhNhan = import('../src/modules/patients/benh-nhan.entity').BenhNhan;
type CreateOwnPatientDto = import('../src/modules/patients/dto/patient.dto').CreateOwnPatientDto;
type UpdateOwnPatientDto = import('../src/modules/patients/dto/patient.dto').UpdateOwnPatientDto;
// Use Nest's compiled output so TypeORM receives TypeScript's decorator metadata.
const { BenhNhan } = require('../dist/modules/patients/benh-nhan.entity') as typeof import('../src/modules/patients/benh-nhan.entity');
const { CreateOwnPatientDto, UpdateOwnPatientDto } = require('../dist/modules/patients/dto/patient.dto') as typeof import('../src/modules/patients/dto/patient.dto');
const { PatientController } = require('../dist/modules/patients/patient.controller') as typeof import('../src/modules/patients/patient.controller');
const { PatientService } = require('../dist/modules/patients/patient.service') as typeof import('../src/modules/patients/patient.service');

const accountId = '8d6f5bbf-5375-4370-bc2c-97bd3f7e4712';
const otherAccountId = '8d6f5bbf-5375-4370-bc2c-97bd3f7e4713';

function profile(): BenhNhan {
  return Object.assign(new BenhNhan(), {
    idBenhNhan: 1, idTaiKhoan: accountId, hoTen: 'Nguyễn An', ngaySinh: '1990-01-01',
    gioiTinh: 'Nam', soDienThoai: '0912345678', email: 'an@example.com', diaChi: 'Địa chỉ cũ',
    soBaoHiemYTe: 'BH123', trangThai: 'Active',
  });
}

function fixture(initial: BenhNhan | null, options: { linked?: boolean; active?: boolean } = {}) {
  let stored = initial ? { ...initial } : null;
  let transactions = 0;
  let removed = false;
  const accountConditions: unknown[] = [];
  const queries: unknown[] = [];
  const accountBuilder = {
    select() { return this; }, from() { return this; },
    where(condition: string, parameters: unknown) { accountConditions.push({ condition, parameters }); return this; },
    andWhere(condition: string, parameters: unknown) { accountConditions.push({ condition, parameters }); return this; },
    setLock(mode: string) { assert.equal(mode, 'pessimistic_write'); return this; },
    async getRawOne() { return options.active === false ? undefined : { id: accountId }; },
  };
  const repository = {
    async findOne(query: { where: { idTaiKhoan?: string; soDienThoai?: string }; lock?: { mode: string } }) {
      queries.push(query);
      if (query.where.idTaiKhoan) {
        return stored?.idTaiKhoan === query.where.idTaiKhoan ? { ...stored } : null;
      }
      return stored?.soDienThoai === query.where.soDienThoai ? { ...stored } : null;
    },
    createQueryBuilder() {
      let email = '';
      return {
        where(_: string, parameters: { email: string }) { email = parameters.email; return this; },
        async getOne() { return stored?.email?.toLowerCase() === email ? { ...stored } : null; },
      };
    },
    create(value: Partial<BenhNhan>) { return Object.assign(new BenhNhan(), { idBenhNhan: 2 }, value); },
    async save(value: BenhNhan) { stored = { ...value }; return value; },
    async remove(value: BenhNhan) {
      assert.equal(value.idTaiKhoan, accountId);
      if (options.linked) throw Object.assign(new Error('foreign key'), { code: '23503' });
      stored = null;
      removed = true;
    },
  };
  const manager = {
    createQueryBuilder: () => accountBuilder,
    getRepository(entity: unknown) { assert.equal(entity, BenhNhan); return repository; },
  } as unknown as EntityManager;
  const dataSource = {
    async transaction<T>(work: (scope: EntityManager) => Promise<T>) { transactions += 1; return work(manager); },
  } as unknown as DataSource;
  const service = new PatientService({} as PatientRepository, dataSource);
  return { service, queries, accountConditions, get stored() { return stored; }, get transactions() { return transactions; }, get removed() { return removed; } };
}

function statusError(status: number, code: string) {
  return (error: unknown) => {
    const candidate = error as { getStatus(): number; getResponse(): { code: string } };
    assert.equal(candidate.getStatus(), status);
    assert.equal(candidate.getResponse().code, code);
    return true;
  };
}

test('create uses authenticated account and defaults optional profile fields to null', async () => {
  const state = fixture(null);
  const created = await state.service.createOwn(accountId, { hoTen: 'Nguyễn An', idTaiKhoan: otherAccountId, trangThai: 'Locked' } as CreateOwnPatientDto);
  assert.equal(created.idTaiKhoan, accountId);
  assert.equal(created.hoTen, 'Nguyễn An');
  assert.equal(created.trangThai, 'Active');
  assert.equal(created.email, null);
  assert.equal(state.transactions, 1);
  assert.deepEqual(state.accountConditions[0], { condition: 'account.id_tai_khoan = :idTaiKhoan', parameters: { idTaiKhoan: accountId } });
});

test('create refuses to replace an existing profile', async () => {
  const state = fixture(profile());
  await assert.rejects(state.service.createOwn(accountId, { hoTen: 'Tên mới' }), statusError(409, 'PATIENT_PROFILE_ALREADY_EXISTS'));
  assert.equal(state.stored?.hoTen, 'Nguyễn An');
});

test('update preserves omitted fields, clears explicit null, and normalizes email', async () => {
  const state = fixture(profile());
  const updated = await state.service.updateOwn(accountId, { email: 'NEW@EXAMPLE.COM', diaChi: null, soBaoHiemYTe: null });
  assert.equal(updated.email, 'new@example.com');
  assert.equal(updated.diaChi, null);
  assert.equal(updated.soBaoHiemYTe, null);
  assert.equal(updated.hoTen, 'Nguyễn An');
  assert.equal(updated.ngaySinh, '1990-01-01');
  assert.ok(state.queries.some((query) => (query as { lock?: { mode: string } }).lock?.mode === 'pessimistic_write'));
});

test('update refuses absent own profile and ignores input identity', async () => {
  const state = fixture(profile());
  await assert.rejects(state.service.updateOwn(otherAccountId, { hoTen: 'Tên mới', idTaiKhoan: accountId } as UpdateOwnPatientDto), statusError(404, 'PATIENT_NOT_FOUND'));
  assert.equal(state.stored?.idTaiKhoan, accountId);
  assert.equal(state.stored?.hoTen, 'Nguyễn An');
});

test('update refuses future birthday and empty change', async () => {
  const state = fixture(profile());
  await assert.rejects(state.service.updateOwn(accountId, { ngaySinh: '2999-12-31' }), statusError(400, 'VALIDATION_ERROR'));
  await assert.rejects(state.service.updateOwn(accountId, {}), statusError(400, 'VALIDATION_ERROR'));
  assert.equal(state.stored?.ngaySinh, '1990-01-01');
});

test('inactive account cannot mutate own profile', async () => {
  const state = fixture(profile(), { active: false });
  await assert.rejects(state.service.updateOwn(accountId, { hoTen: 'Tên mới' }), statusError(403, 'FORBIDDEN'));
  assert.equal(state.stored?.hoTen, 'Nguyễn An');
});

test('delete keeps referenced clinical profile and returns conflict', async () => {
  const state = fixture(profile(), { linked: true });
  await assert.rejects(state.service.deleteOwn(accountId), statusError(409, 'PATIENT_PROFILE_IN_USE'));
  assert.equal(state.removed, false);
  assert.equal(state.stored?.idTaiKhoan, accountId);
});

test('delete unreferenced profile then create again for same account', async () => {
  const state = fixture(profile());
  assert.deepEqual(await state.service.deleteOwn(accountId), { deleted: true });
  assert.equal(state.stored, null);
  const created = await state.service.createOwn(accountId, { hoTen: 'Thông tin mới' });
  assert.equal(created.idTaiKhoan, accountId);
  assert.equal(created.hoTen, 'Thông tin mới');
});

test('DTO validates null semantics, names, dates and immutable fields', async () => {
  const nullable = plainToInstance(UpdateOwnPatientDto, { ngaySinh: null, email: '', diaChi: '   ' });
  assert.deepEqual(await validate(nullable), []);
  assert.equal(nullable.email, null);
  assert.equal(nullable.diaChi, null);
  for (const input of [{ hoTen: null }, { hoTen: '   ' }, { ngaySinh: '2026-02-30' }, { ngaySinh: '2026-01-01T12:00:00Z' }, { gioiTinh: 'unknown' }]) {
    assert.ok((await validate(plainToInstance(UpdateOwnPatientDto, input))).length > 0);
  }
  assert.ok((await validate(plainToInstance(CreateOwnPatientDto, {}))).length > 0);
  const forbidden = await validate(plainToInstance(UpdateOwnPatientDto, { hoTen: 'Tên hợp lệ', idTaiKhoan: otherAccountId, trangThai: 'Locked' }), { whitelist: true, forbidNonWhitelisted: true });
  assert.deepEqual(forbidden.map((item) => item.property).sort(), ['idTaiKhoan', 'trangThai']);
});

test('every public profile endpoint requires patient role', () => {
  for (const action of ['me', 'createOwn', 'updateOwn', 'deleteOwn'] as const) {
    assert.deepEqual(Reflect.getMetadata('roles', PatientController.prototype[action]), ['PATIENT']);
    assert.equal(Reflect.getMetadata('__guards__', PatientController.prototype[action]).length, 2);
  }
});
