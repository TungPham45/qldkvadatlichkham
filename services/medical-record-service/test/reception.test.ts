import assert from 'node:assert/strict';
import test from 'node:test';
import { AppRole, AppointmentStatus } from '@qlpk/common';
import { ReceptionService } from '../src/reception.service';

const doctor = {
  sub: 'doctor-account',
  username: 'bs1',
  vaiTro: 'BacSi',
  role: AppRole.DOCTOR,
  type: 'access',
} as const;

const manager = {
  sub: 'manager-account',
  username: 'admin',
  vaiTro: 'Admin',
  role: AppRole.MANAGER,
  type: 'access',
} as const;

test('doctor reception list is scoped by the logged-in account and includes pending appointments', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const db = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('COUNT(*)')) return [{ total: 1 }];
      return [{ appointmentId: 17, status: AppointmentStatus.PENDING }];
    },
  };
  const service = new ReceptionService(db as never);
  const result = await service.list(doctor as never, { page: 1, limit: 10 });

  assert.equal(result.total, 1);
  assert.match(calls[0].sql, /bs\.id_tai_khoan = \$1/);
  assert.equal(calls[0].parameters[0], doctor.sub);
  assert.match(calls[1].sql, /Cho xac nhan/);
});

test('confirm moves only a pending appointment to confirmed and records history', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) {
        return [{ id: 23, status: AppointmentStatus.PENDING, receptionId: null }];
      }
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  const result = await service.confirm(manager as never, 23);

  assert.equal(result.status, AppointmentStatus.CONFIRMED);
  assert.deepEqual(calls[1].parameters, [23, AppointmentStatus.CONFIRMED]);
  assert.deepEqual(calls[2].parameters?.slice(0, 3), [23, AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]);
});

test('reception changes a confirmed appointment to checked-in in the same transaction', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) {
        return [{ id: 31, status: AppointmentStatus.CONFIRMED, receptionId: null }];
      }
      if (sql.includes('INSERT INTO tiep_nhan_benh_nhan')) return [{ id: 8 }];
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  const result = await service.save(manager as never, 31, { appointmentId: 31, initialSymptoms: 'Sốt' }, false);

  assert.equal(result.status, AppointmentStatus.CHECKED_IN);
  const statusUpdate = calls.find((call) => call.sql.includes('UPDATE lich_hen'));
  assert.deepEqual(statusUpdate?.parameters, [31, AppointmentStatus.CHECKED_IN]);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO lich_su_lich_hen')));
});

test('reception rejects an unconfirmed appointment before inserting reception data', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      return [{ id: 41, status: AppointmentStatus.PENDING, receptionId: null }];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  await assert.rejects(
    service.save(manager as never, 41, { appointmentId: 41 }, false),
    (error: { getResponse?: () => { code?: string } }) => error.getResponse?.().code === 'APPOINTMENT_STATUS_INVALID',
  );
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO tiep_nhan_benh_nhan')), false);
});

test('doctor cannot lock or mutate an appointment assigned to another doctor', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  await assert.rejects(
    service.confirm(doctor as never, 99),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 404,
  );
  assert.match(calls[0].sql, /bs\.id_tai_khoan = \$2/);
  assert.deepEqual(calls[0].parameters, [99, doctor.sub]);
});
