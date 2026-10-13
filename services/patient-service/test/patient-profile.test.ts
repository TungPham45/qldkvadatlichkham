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
    idBenhNhan: 1, hoTen: 'Nguyễn An', ngaySinh: '1990-01-01',
    gioiTinh: 'Nam', soDienThoai: '0912345678', email: 'an@example.com', diaChi: 'Địa chỉ cũ',
    coBhyt: true, soBhyt: 'DN4010123456789', trangThai: 'Active',
  });
}

function fixture(initial: BenhNhan | null, options: {
  linked?: boolean; active?: boolean; shared?: boolean; relative?: boolean;
  duplicateBhyt?: string; saveConflict?: { code: string; constraint: string };
} = {}) {
  let stored = initial ? { ...initial } : null;
  let linkOwnerId: string | null = initial && !options.relative ? accountId : null;
  let relativeLinked = options.relative === true;
  let aborted = false;
  let savepointProfile = stored ? { ...stored } : null;
  let transactions = 0;
  let removed = false;
  const accountConditions: unknown[] = [];
  const queries: unknown[] = [];
  const sqlCalls: string[] = [];
  const accountBuilder = {
    select() { return this; }, from() { return this; },
    where(condition: string, parameters: unknown) { accountConditions.push({ condition, parameters }); return this; },
    andWhere(condition: string, parameters: unknown) { accountConditions.push({ condition, parameters }); return this; },
    setLock(mode: string) { assert.equal(mode, 'pessimistic_write'); return this; },
    async getRawOne() { return options.active === false ? undefined : { id: accountId }; },
  };
  const repository = {
    async findOne(query: { where: { idBenhNhan?: number; soDienThoai?: string }; lock?: { mode: string } }) {
      queries.push(query);
      if (query.where.idBenhNhan != null) {
        return stored?.idBenhNhan === query.where.idBenhNhan ? { ...stored } : null;
      }
      return stored?.soDienThoai === query.where.soDienThoai ? { ...stored } : null;
    },
    createQueryBuilder() {
      let lookup: { email?: string; soBhyt?: string } = {};
      return {
        where(_: string, parameters: { email?: string; soBhyt?: string }) { lookup = parameters; return this; },
        async getOne() {
          if (lookup.email) return stored?.email?.toLowerCase() === lookup.email ? { ...stored } : null;
          if (lookup.soBhyt) {
            if (options.duplicateBhyt?.toUpperCase() === lookup.soBhyt) return { ...profile(), idBenhNhan: 999, soBhyt: options.duplicateBhyt };
            return stored?.soBhyt?.toUpperCase() === lookup.soBhyt ? { ...stored } : null;
          }
          return null;
        },
      };
    },
    create(value: Partial<BenhNhan>) { return Object.assign(new BenhNhan(), { idBenhNhan: 2 }, value); },
    async save(value: BenhNhan) {
      if (options.saveConflict) throw Object.assign(new Error('unique constraint'), options.saveConflict);
      stored = { ...value }; return value;
    },
    async remove(value: BenhNhan) {
      assert.equal(value.idBenhNhan, stored?.idBenhNhan);
      if (options.linked) { aborted = true; throw Object.assign(new Error('foreign key'), { code: '23503' }); }
      stored = null;
      linkOwnerId = null;
      removed = true;
    },
  };
  const manager = {
    createQueryBuilder: () => accountBuilder,
    getRepository(entity: unknown) { assert.equal(entity, BenhNhan); return repository; },
    async query(sql: string, params: unknown[] = []) {
      sqlCalls.push(sql);
      const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('rollback to savepoint')) { aborted = false; stored = savepointProfile ? { ...savepointProfile } : null; return []; }
      if (aborted) throw Object.assign(new Error('current transaction is aborted'), { code: '25P02' });
      if (normalized.startsWith('savepoint')) { savepointProfile = stored ? { ...stored } : null; return []; }
      if (normalized.includes('from tai_khoan_benh_nhan') && normalized.includes('la_chu_ho_so = true') && normalized.includes('select 1')) {
        return linkOwnerId && params[0] === linkOwnerId ? [{ ok: 1 }] : [];
      }
      if (normalized.includes('from tai_khoan_benh_nhan link') && normalized.includes('for update')) {
        if (normalized.includes('la_chu_ho_so = false')) {
          return relativeLinked && params[0] === accountId && params[1] === stored?.idBenhNhan
            ? [{ loaiQuanHe: 'NguoiThan', laChuHoSo: false, duocDatLichHo: true }] : [];
        }
        if (params[0] !== accountId || !stored || linkOwnerId !== accountId) return [];
        return [{ id: stored.idBenhNhan }];
      }
      if (normalized.includes('from tai_khoan_benh_nhan') && normalized.includes('id_tai_khoan <>')) {
        return options.shared ? [{ ok: 1 }] : [];
      }
      if (normalized.startsWith('select 1 as ok from tai_khoan_benh_nhan where id_benh_nhan')) {
        return linkOwnerId || relativeLinked || options.shared ? [{ ok: 1 }] : [];
      }
      if (normalized.startsWith('insert into tai_khoan_benh_nhan')) {
        linkOwnerId = String(params[0]);
        return [];
      }
      if (normalized.startsWith('delete from tai_khoan_benh_nhan')) {
        if (normalized.includes('la_chu_ho_so = false')) { relativeLinked = false; return []; }
        if (params[0] === linkOwnerId) linkOwnerId = null;
        return [];
      }
      return [];
    },
  } as unknown as EntityManager;
  const dataSource = {
    async transaction<T>(work: (scope: EntityManager) => Promise<T>) {
      transactions += 1;
<<<<<<< HEAD
      const snapshot = { stored: stored ? { ...stored } : null, linkOwnerId, relativeLinked, removed };
      try {
        const result = await work(manager);
        if (aborted) throw Object.assign(new Error('aborted transaction cannot commit'), { code: '25P02' });
        return result;
      } catch (error) {
        stored = snapshot.stored; linkOwnerId = snapshot.linkOwnerId;
        relativeLinked = snapshot.relativeLinked; removed = snapshot.removed; aborted = false;
=======
      const snapshot = { stored: stored ? { ...stored } : null, linkOwnerId, removed };
      try {
        return await work(manager);
      } catch (error) {
        stored = snapshot.stored;
        linkOwnerId = snapshot.linkOwnerId;
        removed = snapshot.removed;
>>>>>>> 4d0d13c508dbea20eec8b30b3188d70376b4009a
        throw error;
      }
    },
    async query(sql: string, params?: unknown[]) { return manager.query(sql, params); },
  } as unknown as DataSource;
  const service = new PatientService({} as PatientRepository, dataSource);
  return {
    service,
    queries,
    accountConditions,
    sqlCalls,
    get stored() { return stored; },
    get linkOwnerId() { return linkOwnerId; },
    get relativeLinked() { return relativeLinked; },
    get transactions() { return transactions; },
    get removed() { return removed; },
  };
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
  const created = await state.service.createOwn(accountId, { hoTen: 'Nguyễn An', soDienThoai: '0912345678', coBhyt: false, idTaiKhoan: otherAccountId, trangThai: 'Locked' } as CreateOwnPatientDto);
  assert.equal(created.idTaiKhoan, accountId);
  assert.equal(created.hoTen, 'Nguyễn An');
  assert.equal(created.trangThai, 'Active');
  assert.equal(created.email, null);
  assert.equal(state.transactions, 1);
  assert.equal(state.linkOwnerId, accountId);
  assert.deepEqual(state.accountConditions[0], { condition: 'account.id_tai_khoan = :idTaiKhoan', parameters: { idTaiKhoan: accountId } });
});

test('create refuses to replace an existing profile', async () => {
  const state = fixture(profile());
  await assert.rejects(state.service.createOwn(accountId, { hoTen: 'Tên mới', soDienThoai: '0911111111', coBhyt: true }), statusError(409, 'PATIENT_PROFILE_ALREADY_EXISTS'));
  assert.equal(state.stored?.hoTen, 'Nguyễn An');
});

test('update preserves omitted fields, clears explicit null, and normalizes email', async () => {
  const state = fixture(profile());
  const updated = await state.service.updateOwn(accountId, { email: 'NEW@EXAMPLE.COM', diaChi: null, coBhyt: false });
  assert.equal(updated.email, 'new@example.com');
  assert.equal(updated.diaChi, null);
  assert.equal(updated.coBhyt, false);
  assert.equal(updated.soBhyt, null);
  assert.equal(updated.hoTen, 'Nguyễn An');
  assert.equal(updated.ngaySinh, '1990-01-01');
  assert.ok(state.queries.some((query) => (query as { lock?: { mode: string } }).lock?.mode === 'pessimistic_write'));
});

test('update refuses absent own profile and ignores input identity', async () => {
  const state = fixture(profile());
  await assert.rejects(state.service.updateOwn(otherAccountId, { hoTen: 'Tên mới', idTaiKhoan: accountId } as UpdateOwnPatientDto), statusError(404, 'PATIENT_NOT_FOUND'));
  assert.equal(state.linkOwnerId, accountId);
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
  assert.equal(state.linkOwnerId, accountId);
});

test('delete unreferenced profile then create again for same account', async () => {
  const state = fixture(profile());
  assert.deepEqual(await state.service.deleteOwn(accountId), { deleted: true });
  assert.equal(state.stored, null);
  const created = await state.service.createOwn(accountId, { hoTen: 'Thông tin mới', soDienThoai: '0987654321', coBhyt: true, soBhyt: 'DN4010987654321' });
  assert.equal(created.idTaiKhoan, accountId);
  assert.equal(created.hoTen, 'Thông tin mới');
  assert.equal(created.soDienThoai, '0987654321');
  assert.equal(created.coBhyt, true);
  assert.equal(created.soBhyt, 'DN4010987654321');
});

test('create with coBhyt true requires soBhyt number', async () => {
  const state = fixture(null);
  await assert.rejects(
    state.service.createOwn(accountId, { hoTen: 'Thiếu số BHYT', soDienThoai: '0911222333', coBhyt: true }),
    statusError(400, 'VALIDATION_ERROR'),
  );
});

test('update coBhyt false clears soBhyt', async () => {
  const state = fixture(profile());
  const updated = await state.service.updateOwn(accountId, { coBhyt: false });
  assert.equal(updated.coBhyt, false);
  assert.equal(updated.soBhyt, null);
});

test('partial BHYT update preserves current card, normalizes new card and clears null', async () => {
  const state = fixture(profile());
  const retained = await state.service.updateOwn(accountId, { coBhyt: true });
  assert.equal(retained.soBhyt, 'DN4010123456789');
  const normalized = await state.service.updateOwn(accountId, { soBhyt: '  dn4010987654321  ' });
  assert.equal(normalized.coBhyt, true);
  assert.equal(normalized.soBhyt, 'DN4010987654321');
  const cleared = await state.service.updateOwn(accountId, { soBhyt: null });
  assert.equal(cleared.coBhyt, false);
  assert.equal(cleared.soBhyt, null);
});

test('BHYT card belonging to another patient returns conflict before writing', async () => {
  const state = fixture(profile(), { duplicateBhyt: 'dn4010987654321' });
  await assert.rejects(state.service.updateOwn(accountId, { soBhyt: 'DN4010987654321' }), statusError(409, 'BHYT_ALREADY_EXISTS'));
  assert.equal(state.stored?.soBhyt, 'DN4010123456789');
});

test('case insensitive database BHYT constraint race maps to conflict and rolls back', async () => {
  const state = fixture(null, { saveConflict: { code: '23505', constraint: 'uq_benh_nhan_so_bhyt' } });
  await assert.rejects(state.service.createOwn(accountId, {
    hoTen: 'Nguyễn An', soDienThoai: '0912345678', coBhyt: true, soBhyt: 'dn4010987654321',
  }), statusError(409, 'BHYT_ALREADY_EXISTS'));
  assert.equal(state.stored, null);
  assert.equal(state.linkOwnerId, null);
});

test('own mutation never falls back to a relative or delegated profile', async () => {
  const state = fixture(profile(), { relative: true });
  await assert.rejects(state.service.updateOwn(accountId, { hoTen: 'Không được sửa người thân' }), statusError(404, 'PATIENT_NOT_FOUND'));
  await assert.rejects(state.service.deleteOwn(accountId), statusError(404, 'PATIENT_NOT_FOUND'));
  assert.equal(state.relativeLinked, true);
  assert.equal(state.stored?.hoTen, 'Nguyễn An');
});

test('own delete protects profile shared with another account', async () => {
  const state = fixture(profile(), { shared: true });
  await assert.rejects(state.service.deleteOwn(accountId), statusError(409, 'PATIENT_PROFILE_IN_USE'));
  assert.equal(state.linkOwnerId, accountId);
  assert.equal(state.stored?.idBenhNhan, 1);
});

test('removing delegated relative with clinical data commits unlink using savepoint', async () => {
  const state = fixture(profile(), { relative: true, linked: true });
  assert.deepEqual(await state.service.deleteRelative(accountId, 1), { deleted: true });
  assert.equal(state.relativeLinked, false);
  assert.equal(state.stored?.idBenhNhan, 1);
  assert.ok(state.sqlCalls.includes('ROLLBACK TO SAVEPOINT delete_relative_profile'));
});

test('DTO validates null semantics, names, dates and immutable fields', async () => {
  const nullable = plainToInstance(UpdateOwnPatientDto, { ngaySinh: null, email: '', diaChi: '   ' });
  assert.deepEqual(await validate(nullable), []);
  assert.equal(nullable.email, null);
  assert.equal(nullable.diaChi, null);
  for (const input of [{ hoTen: null }, { hoTen: '   ' }, { ngaySinh: '2026-02-30' }, { ngaySinh: '2026-01-01T12:00:00Z' }, { gioiTinh: 'unknown' }]) {
    assert.ok((await validate(plainToInstance(UpdateOwnPatientDto, input))).length > 0);
  }
  for (const coBhyt of ['false', 'true', null, 0, 1]) {
    assert.ok((await validate(plainToInstance(UpdateOwnPatientDto, { coBhyt }))).length > 0);
  }
  assert.deepEqual(await validate(plainToInstance(UpdateOwnPatientDto, { coBhyt: true })), []);
  assert.ok((await validate(plainToInstance(CreateOwnPatientDto, { hoTen: 'Nguyễn An', soDienThoai: '0912345678', coBhyt: true }))).length > 0);
  assert.ok((await validate(plainToInstance(CreateOwnPatientDto, {}))).length > 0);
  const forbidden = await validate(plainToInstance(UpdateOwnPatientDto, { hoTen: 'Tên hợp lệ', idTaiKhoan: otherAccountId, trangThai: 'Locked' }), { whitelist: true, forbidNonWhitelisted: true });
  assert.deepEqual(forbidden.map((item) => item.property).sort(), ['idTaiKhoan', 'trangThai']);
});

test('every public profile endpoint requires patient role', () => {
  for (const action of ['me', 'bookable', 'createOwn', 'updateOwn', 'deleteOwn'] as const) {
    assert.deepEqual(Reflect.getMetadata('roles', PatientController.prototype[action]), ['PATIENT']);
    assert.equal(Reflect.getMetadata('__guards__', PatientController.prototype[action]).length, 2);
  }
});
