import assert from 'node:assert/strict';
import test from 'node:test';
import { AppRole, AppointmentStatus, todayInVietnam } from '@qlpk/common';
import { ReceptionService } from '../src/reception.service';

const doctor = {
  sub: 'doctor-account',
  username: 'bs1',
  vaiTro: 'BacSi',
  role: AppRole.DOCTOR,
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

test('waiting exam stage contains checked-in patients only', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const db = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('COUNT(*)')) return [{ total: 0 }];
      return [];
    },
  };
  const service = new ReceptionService(db as never);

  await service.list(doctor as never, { page: 1, limit: 10, stage: 'EXAM_WAITING' });

  assert.ok(calls[0].parameters.includes(AppointmentStatus.CHECKED_IN));
  assert.equal(calls[0].parameters.includes(AppointmentStatus.CONFIRMED), false);
});

test('confirm moves only a pending appointment to confirmed and records history', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) {
        return [{ id: 23, status: AppointmentStatus.PENDING, receptionId: null, bookingAccountId: 'patient-account', date: '2026-10-14', time: '08:30:00', doctorId: 7, doctorName: 'Bác sĩ A' }];
      }
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  const result = await service.confirm(doctor as never, 23);

  assert.equal(result.status, AppointmentStatus.CONFIRMED);
  assert.deepEqual(calls[1].parameters, [23, AppointmentStatus.CONFIRMED]);
  assert.deepEqual(calls[2].parameters?.slice(0, 3), [23, AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO thong_bao')));
  assert.equal(calls.some((call) => call.sql.includes('INSERT INTO tiep_nhan_benh_nhan')), false);
});

test('reception changes a confirmed appointment to checked-in in the same transaction', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT') && sql.includes('FOR UPDATE')) {
        return [{ id: 31, status: AppointmentStatus.CONFIRMED, receptionId: null, date: todayInVietnam() }];
      }
      if (sql.includes('INSERT INTO tiep_nhan_benh_nhan')) return [{ id: 8 }];
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  const fullValidCheckIn = {
    appointmentId: 31,
    temperature: 37,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    heartRate: 75,
    spo2: 98,
    weight: 60,
    height: 165,
    initialSymptoms: 'Sốt nhẹ và mệt mỏi',
  };

  const result = await service.save(doctor as never, 31, fullValidCheckIn, false);

  assert.equal(result.status, AppointmentStatus.CHECKED_IN);
  const statusUpdate = calls.find((call) => call.sql.includes('UPDATE lich_hen'));
  assert.deepEqual(statusUpdate?.parameters, [31, AppointmentStatus.CHECKED_IN]);
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO lich_su_lich_hen')));
});

test('reception rejects any missing required field during check-in', async () => {
  const service = new ReceptionService({} as never);
  const base = {
    appointmentId: 31,
    temperature: 37,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    heartRate: 75,
    spo2: 98,
    weight: 60,
    height: 165,
    initialSymptoms: 'Sốt',
  };

  await assert.rejects(
    service.save(doctor as never, 31, { ...base, temperature: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập nhiệt độ.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, systolicBloodPressure: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập huyết áp tâm thu.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, diastolicBloodPressure: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập huyết áp tâm trương.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, heartRate: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập nhịp tim.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, spo2: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập chỉ số SpO₂.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, weight: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập cân nặng.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, height: undefined }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập chiều cao.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, initialSymptoms: '   ' }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Vui lòng nhập triệu chứng ban đầu.',
  );
});

test('reception rejects invalid vital signs ranges and relationships', async () => {
  const service = new ReceptionService({} as never);
  const base = {
    appointmentId: 31,
    temperature: 37,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    heartRate: 75,
    spo2: 98,
    weight: 60,
    height: 165,
    initialSymptoms: 'Sốt',
  };

  await assert.rejects(
    service.save(doctor as never, 31, { ...base, systolicBloodPressure: 100, diastolicBloodPressure: 120 }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Huyết áp tâm thu phải lớn hơn huyết áp tâm trương.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, spo2: 132 }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Chỉ số SpO₂ không được vượt quá 100%.',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, heartRate: 280 }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Nhịp tim không hợp lệ. Vui lòng kiểm tra lại (30 - 250 bpm).',
  );
  await assert.rejects(
    service.save(doctor as never, 31, { ...base, temperature: 48 }, false),
    (error: { getResponse?: () => { message?: string } }) => error.getResponse?.().message === 'Nhiệt độ phải từ 30°C đến 45°C.',
  );
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

  const fullValidCheckIn = {
    appointmentId: 41,
    temperature: 37,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    heartRate: 75,
    spo2: 98,
    weight: 60,
    height: 165,
    initialSymptoms: 'Sốt',
  };

  await assert.rejects(
    service.save(doctor as never, 41, fullValidCheckIn, false),
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

test('doctor rejection persists the reason, history and patient notification', async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const transactionManager = {
    async query(sql: string, parameters: unknown[]) {
      calls.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ id: 52, status: AppointmentStatus.PENDING, receptionId: null, bookingAccountId: 'patient-account', date: '2026-10-20', time: '09:15:00', doctorId: 7, doctorName: 'Bác sĩ A' }];
      }
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);
  (service as unknown as { invalidateAvailability: () => Promise<void> }).invalidateAvailability = async () => undefined;

  const result = await service.reject(doctor as never, 52, 'Bác sĩ có lịch cấp cứu');

  assert.equal(result.status, AppointmentStatus.CANCELLED);
  assert.ok(calls.some((call) => call.sql.includes('ly_do_huy') && call.parameters.includes('Bác sĩ có lịch cấp cứu')));
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO lich_su_lich_hen') && call.parameters.includes('Bac si tu choi')));
  assert.ok(calls.some((call) => call.sql.includes('INSERT INTO thong_bao') && call.parameters.includes('patient-account')));
});

test('check-in is rejected outside the appointment date in Vietnam', async () => {
  const transactionManager = {
    async query(sql: string) {
      if (sql.includes('FOR UPDATE OF lh')) {
        return [{ id: 61, status: AppointmentStatus.CONFIRMED, receptionId: null, date: '2020-01-01' }];
      }
      return [];
    },
  };
  const db = { async transaction(callback: (manager: typeof transactionManager) => unknown) { return callback(transactionManager); } };
  const service = new ReceptionService(db as never);

  const fullValidCheckIn = {
    appointmentId: 61,
    temperature: 37,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    heartRate: 75,
    spo2: 98,
    weight: 60,
    height: 165,
    initialSymptoms: 'Sốt',
  };

  await assert.rejects(
    service.save(doctor as never, 61, fullValidCheckIn, false),
    (error: { getResponse?: () => { code?: string } }) => error.getResponse?.().code === 'APPOINTMENT_STATUS_INVALID',
  );
});
