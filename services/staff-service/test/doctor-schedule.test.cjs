const assert = require('node:assert/strict');
const test = require('node:test');
require('reflect-metadata');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');
const { Reflector } = require('@nestjs/core');
const { RolesGuard, ROLES_KEY, ScheduleStatus, ErrorCode } = require('@qlpk/common');
const { BacSi, LichLamViec } = require('../dist/database/entities');
const { DoctorScheduleService } = require('../dist/modules/doctor-schedules/doctor-schedule.service');
const { DoctorScheduleController } = require('../dist/modules/doctor-schedules/doctor-schedule.controller');
const { ManageScheduleDto } = require('../dist/modules/doctor-schedules/dto/schedule.dto');

const input = (overrides = {}) => ({ doctorId: 1, ngayLamViec: '2027-01-11', gioBatDau: '07:30', gioKetThuc: '11:30', thoiLuongMoiCa: 30, statusCode: 'APPROVED', ghiChu: '  Ca sáng  ', ...overrides });
const row = (overrides = {}) => ({ idLichLamViec: 1, idBacSi: 1, ngayLamViec: '2027-01-11', gioBatDau: '07:30:00', gioKetThuc: '11:30:00', thoiLuongMoiCa: 30, trangThai: ScheduleStatus.APPROVED, ghiChu: null, ...overrides });
const hasCode = (code) => (error) => error.getResponse().code === code;

function fixture(initialRows = [], appointments = []) {
  let rows = structuredClone(initialRows);
  const locks = [];
  const invalidations = [];
  const doctors = [{ idBacSi: 1, trangThai: 'Active' }, { idBacSi: 2, trangThai: 'Active' }];
  const dataSource = { transaction: async (work) => {
    const pending = structuredClone(rows);
    const repository = {
      findOne: async ({ where, lock }) => { assert.equal(lock.mode, 'pessimistic_write'); locks.push('schedule'); return pending.find((item) => item.idLichLamViec === where.idLichLamViec) || null; },
      create: (values) => ({ ...values }),
      save: async (value) => {
        const index = pending.findIndex((item) => item.idLichLamViec === value.idLichLamViec);
        if (index >= 0) pending[index] = value;
        else { value.idLichLamViec = Math.max(0, ...pending.map((item) => item.idLichLamViec)) + 1; pending.push(value); }
        return value;
      },
      delete: async ({ idLichLamViec }) => { const index = pending.findIndex((item) => item.idLichLamViec === idLichLamViec); if (index >= 0) pending.splice(index, 1); },
      createQueryBuilder: () => {
        const parameters = {};
        const query = {
          where: (_sql, values) => { Object.assign(parameters, values); return query; },
          andWhere: (_sql, values) => { Object.assign(parameters, values); return query; },
          setLock: () => query,
          getOne: async () => pending.find((item) => item.idBacSi === parameters.doctorId && item.ngayLamViec === parameters.date && item.trangThai !== ScheduleStatus.REJECTED && item.idLichLamViec !== parameters.excludeId && item.gioBatDau < parameters.end && item.gioKetThuc > parameters.start) || null,
          getMany: async () => pending.filter((item) => parameters.ids.includes(item.idLichLamViec)),
        };
        return query;
      },
    };
    const manager = {
      getRepository: (entity) => {
        if (entity === LichLamViec) return repository;
        assert.equal(entity, BacSi);
        return { findOne: async ({ where, lock }) => { assert.equal(lock.mode, 'pessimistic_write'); locks.push('doctor:' + where.idBacSi); return doctors.find((doctor) => doctor.idBacSi === where.idBacSi) || null; } };
      },
      createQueryBuilder: () => {
        const parameters = {};
        const query = {
          select: () => query, from: () => query, limit: () => query,
          where: (_sql, values) => { Object.assign(parameters, values); return query; },
          andWhere: (_sql, values) => { Object.assign(parameters, values); return query; },
          getRawOne: async () => appointments.find((item) => item.doctorId === parameters.doctorId && item.date === parameters.date && item.time >= parameters.start && item.time < parameters.end && !parameters.done.includes(item.status)),
        };
        return query;
      },
    };
    const result = await work(manager);
    rows = pending;
    return result;
  } };
  const repo = { findById: async (id) => structuredClone(rows.find((item) => item.idLichLamViec === id) || null), findDoctorByAccount: async () => doctors[0] };
  const service = new DoctorScheduleService(repo, dataSource, {});
  service.invalidateAvailability = async (doctorId, date) => { invalidations.push({ doctorId, date }); };
  return { service, rows: () => rows, locks, invalidations };
}

test('manager CRUD normalizes and persists schema fields, locks doctor before schedule and invalidates both dates', async () => {
  const f = fixture();
  const created = await f.service.managerCreate(input());
  assert.equal(created.statusCode, 'APPROVED');
  assert.equal(created.startTime, '07:30:00');
  assert.equal(created.note, 'Ca sáng');
  const updated = await f.service.managerUpdate(created.id, input({ doctorId: 2, ngayLamViec: '2027-01-12', gioBatDau: '13:30', gioKetThuc: '17:30' }));
  assert.equal(updated.doctorId, 2);
  assert.equal(updated.date, '2027-01-12');
  assert.deepEqual(f.locks.slice(1), ['doctor:1', 'doctor:2', 'schedule']);
  assert.deepEqual(f.invalidations.slice(-2), [{ doctorId: 1, date: '2027-01-11' }, { doctorId: 2, date: '2027-01-12' }]);
  await f.service.managerRemove(created.id);
  assert.equal(f.rows().length, 0);
});

test('overlapping create or update rolls back; rejected schedules do not reserve hours', async () => {
  const f = fixture([row(), row({ idLichLamViec: 2, gioBatDau: '13:30:00', gioKetThuc: '17:30:00' })]);
  await assert.rejects(f.service.managerCreate(input()), hasCode(ErrorCode.SCHEDULE_ALREADY_REGISTERED));
  await assert.rejects(f.service.managerUpdate(2, input()), hasCode(ErrorCode.SCHEDULE_ALREADY_REGISTERED));
  assert.equal(f.rows().length, 2);
  assert.equal(f.rows()[1].gioBatDau, '13:30:00');
  const rejected = fixture([row({ trangThai: ScheduleStatus.REJECTED })]);
  await rejected.service.managerCreate(input());
  assert.equal(rejected.rows().length, 2);
});

test('unfinished appointments prevent moving hours, disabling or deleting; notes can still be edited', async () => {
  const f = fixture([row()], [{ doctorId: 1, date: '2027-01-11', time: '08:00:00', status: 'Da xac nhan' }]);
  await assert.rejects(f.service.managerUpdate(1, input({ gioBatDau: '08:30' })), hasCode(ErrorCode.SCHEDULE_NOT_EDITABLE));
  await assert.rejects(f.service.managerUpdate(1, input({ statusCode: 'REJECTED' })), hasCode(ErrorCode.SCHEDULE_NOT_EDITABLE));
  await assert.rejects(f.service.managerRemove(1), hasCode(ErrorCode.SCHEDULE_NOT_EDITABLE));
  await f.service.managerUpdate(1, input({ ghiChu: 'Ghi chú mới' }));
  assert.equal(f.rows()[0].ghiChu, 'Ghi chú mới');
  assert.equal(f.rows()[0].trangThai, ScheduleStatus.APPROVED);
});

test('cancelled and completed appointments allow removing a schedule', async () => {
  const f = fixture([row()], ['Huy', 'Hoan thanh'].map((status) => ({ doctorId: 1, date: '2027-01-11', time: '08:00:00', status })));
  await f.service.managerRemove(1);
  assert.equal(f.rows().length, 0);
});

test('invalid time ranges, oversized slots and unknown doctors never create schedules', async () => {
  const f = fixture();
  await assert.rejects(f.service.managerCreate(input({ gioKetThuc: '07:00' })), hasCode(ErrorCode.VALIDATION_ERROR));
  await assert.rejects(f.service.managerCreate(input({ thoiLuongMoiCa: 241 })), hasCode(ErrorCode.VALIDATION_ERROR));
  await assert.rejects(f.service.managerCreate(input({ doctorId: 999 })), hasCode(ErrorCode.DOCTOR_NOT_FOUND));
  assert.equal(f.rows().length, 0);
});

test('DTO rejects impossible dates, invalid times, zero slots and unknown statuses', async () => {
  assert.equal((await validate(plainToInstance(ManageScheduleDto, input()))).length, 0);
  for (const invalid of [{ ngayLamViec: '2027-02-30' }, { gioBatDau: '25:00' }, { gioBatDau: '07:30:15' }, { thoiLuongMoiCa: 0 }, { doctorId: -1 }, { statusCode: 'Active' }]) {
    assert.ok((await validate(plainToInstance(ManageScheduleDto, input(invalid)))).length > 0);
  }
});

test('manager schedule CRUD/list/approval reject doctor and patient roles', () => {
  const guard = new RolesGuard(new Reflector());
  for (const method of ['list', 'managerCreate', 'managerUpdate', 'managerRemove', 'approve', 'reject', 'bulk']) {
    const handler = DoctorScheduleController.prototype[method];
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, handler), ['MANAGER']);
    for (const role of ['DOCTOR', 'PATIENT']) {
      assert.throws(() => guard.canActivate({ getHandler: () => handler, getClass: () => DoctorScheduleController, switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }), hasCode(ErrorCode.FORBIDDEN));
    }
  }
});

test('doctors retain pending schedule edits and deletes with ownership enforcement', async () => {
  const f = fixture([row({ trangThai: ScheduleStatus.PENDING }), row({ idLichLamViec: 2, idBacSi: 2, trangThai: ScheduleStatus.PENDING })]);
  await f.service.update('doctor-account', 1, { ngayLamViec: '2027-01-12', ca: 'CHIEU' });
  assert.equal(f.rows()[0].gioBatDau, '13:30:00');
  await assert.rejects(f.service.remove('doctor-account', 2), hasCode(ErrorCode.FORBIDDEN));
  await f.service.remove('doctor-account', 1);
  assert.equal(f.rows().length, 1);
});

test('bulk approval fails if a pending schedule changed after searching, and preserves approval workflow otherwise', async () => {
  const f = fixture([row({ trangThai: ScheduleStatus.PENDING })]);
  const snapshots = () => f.rows().map((item) => ({ id: String(item.idLichLamViec), doctorId: String(item.idBacSi), ngayLamViec: item.ngayLamViec, gioBatDau: item.gioBatDau, gioKetThuc: item.gioKetThuc, thoiLuongMoiCa: item.thoiLuongMoiCa, ghiChu: item.ghiChu }));
  f.service.repo.queryManagerSchedules = async () => {
    const before = snapshots();
    f.rows()[0].ngayLamViec = '2027-01-12';
    return before;
  };
  await assert.rejects(f.service.bulkApprove({ week: '2027-01-11', date: '2027-01-11' }), hasCode(ErrorCode.SCHEDULE_NOT_EDITABLE));
  assert.equal(f.rows()[0].trangThai, ScheduleStatus.PENDING);
  f.service.repo.queryManagerSchedules = async () => snapshots();
  const result = await f.service.bulkApprove({ week: '2027-01-11' });
  assert.equal(result.approved, 1);
  assert.equal(f.rows()[0].trangThai, ScheduleStatus.APPROVED);
});
