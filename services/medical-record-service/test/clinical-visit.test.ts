import assert from 'node:assert/strict';
import test from 'node:test';
import { AppRole, AppointmentStatus, todayInVietnam } from '@qlpk/common';
import { ClinicalVisitService } from '../src/clinical-visit.service';

const doctor = {
  sub: 'doctor-account',
  username: 'doctor',
  vaiTro: 'BacSi',
  role: AppRole.DOCTOR,
  type: 'access',
} as const;

test('start exam locks the assigned visit and records the checked-in to in-progress transition', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ appointmentId: 12, patientId: 3, doctorId: 7, status: AppointmentStatus.CHECKED_IN, date: todayInVietnam() }];
      }
      return [];
    },
  };
  const db = { transaction: (callback: (value: typeof manager) => unknown) => callback(manager) };
  const service = new ClinicalVisitService(db as never);

  const result = await service.start(doctor as never, 12);

  assert.equal(result.status, AppointmentStatus.IN_PROGRESS);
  assert.ok(calls.some((call) => call.sql.includes('thoi_gian_bat_dau_kham')));
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO lich_su_lich_hen')));
  assert.deepEqual(calls[0].parameters, [12, doctor.sub]);
});

test('complete exam refuses to finish before a valid medical record exists', async () => {
  const manager = {
    async query(sql: string) {
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ appointmentId: 20, patientId: 3, doctorId: 7, status: AppointmentStatus.IN_PROGRESS }];
      }
      if (sql.includes('FROM phieu_kham')) return [];
      return [];
    },
  };
  const db = { transaction: (callback: (value: typeof manager) => unknown) => callback(manager) };
  const service = new ClinicalVisitService(db as never);

  await assert.rejects(
    service.complete(doctor as never, 20),
    (error: { getResponse?: () => { code?: string } }) => error.getResponse?.().code === 'MEDICAL_RECORD_INCOMPLETE',
  );
});

test('start exam rejects a checked-in appointment from another date', async () => {
  const manager = {
    async query(sql: string) {
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ appointmentId: 30, patientId: 3, doctorId: 7, status: AppointmentStatus.CHECKED_IN, date: '2020-01-01' }];
      }
      return [];
    },
  };
  const db = { transaction: (callback: (value: typeof manager) => unknown) => callback(manager) };
  const service = new ClinicalVisitService(db as never);

  await assert.rejects(
    service.start(doctor as never, 30),
    (error: { getResponse?: () => { code?: string } }) => error.getResponse?.().code === 'VISIT_DATE_INVALID',
  );
});

test('draft medical record accepts incomplete fields and does not invent a diagnosis', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ appointmentId: 41, patientId: 3, doctorId: 7, status: AppointmentStatus.IN_PROGRESS }];
      }
      if (sql.includes('FROM phieu_kham WHERE id_lich_hen=$1 FOR UPDATE')) return [];
      if (sql.includes('INSERT INTO phieu_kham')) return [{ id: 81 }];
      if (sql.includes('FROM chan_doan')) return [];
      return [];
    },
  };
  const db = { transaction: (callback: (value: typeof manager) => unknown) => callback(manager) };
  const service = new ClinicalVisitService(db as never);

  const result = await service.saveRecord(doctor as never, 41, { symptoms: 'Đau đầu' });

  assert.equal(result.id, 81);
  const recordInsert = calls.find((call) => call.sql.includes('INSERT INTO phieu_kham'));
  assert.equal(recordInsert?.parameters[3], 'Đau đầu');
  assert.equal(recordInsert?.parameters[4], null);
  assert.equal(calls.some((call) => call.sql.includes('FROM danh_muc_ten_benh')), false);
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO chan_doan')), false);
});

test('draft update preserves fields omitted by the doctor', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ appointmentId: 42, patientId: 3, doctorId: 7, status: AppointmentStatus.IN_PROGRESS }];
      }
      if (sql.includes('FROM phieu_kham WHERE id_lich_hen=$1 FOR UPDATE')) {
        return [{ id: 82, symptoms: 'Sốt', examResult: 'Khám cũ', conclusion: 'Kết luận cũ', treatment: 'Điều trị cũ', noClinicalServices: false, noPrescription: false }];
      }
      if (sql.includes('INSERT INTO phieu_kham')) return [{ id: 82 }];
      if (sql.includes('FROM chan_doan')) return [{ id: 5, diseaseId: 9, primary: true, note: null }];
      return [];
    },
  };
  const db = { transaction: (callback: (value: typeof manager) => unknown) => callback(manager) };
  const service = new ClinicalVisitService(db as never);

  await service.saveRecord(doctor as never, 42, { doctorNotes: 'Theo dõi thêm' });

  const recordInsert = calls.find((call) => call.sql.includes('INSERT INTO phieu_kham'));
  assert.deepEqual(recordInsert?.parameters.slice(3, 8), ['Sốt', 'Khám cũ', 'Kết luận cũ', 'Điều trị cũ', 'Theo dõi thêm']);
  assert.equal(calls.some((call) => call.sql.includes('UPDATE chan_doan')), false);
});
