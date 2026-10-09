import assert from 'node:assert/strict';
import test from 'node:test';
import { AppointmentService } from '../dist/modules/appointments/appointment.service.js';

const dto = { bacSiId: 7, ngayHen: '2099-01-12', gioHen: '07:30', lyDoKham: 'Khám định kỳ' };
const schedule = { id: 11, doctorId: 7, date: dto.ngayHen, startTime: '07:30:00', endTime: '11:30:00', slotMinutes: 30, status: 'Da duyet' };

async function run(options = {}) {
  const originalFetch = globalThis.fetch;
  const sql = [];
  let saved = 0;
  let released = 0;
  let invalidated = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/internal/patients/by-account/')) return new Response(JSON.stringify({ id: 9, hoTen: 'Bệnh nhân' }));
    if (String(url).includes('/internal/doctors?')) return new Response(JSON.stringify([{ id: 7, hoTen: 'Bác sĩ', chuyenKhoa: null, maBacSi: null }]));
    throw new Error(`Unexpected internal request: ${url}`);
  };
  const repository = {
    create(value) { return value; },
    async save(value) { saved += 1; return { ...value, idLichHen: 13 }; },
  };
  const manager = {
    async query(statement, parameters) {
      sql.push({ statement, parameters });
      if (statement.includes('FROM bac_si')) return [{ id_bac_si: 7 }];
      if (statement.includes('FROM benh_nhan')) return options.missingProfile ? [] : [{ id_benh_nhan: 9 }];
      if (statement.includes('FROM lich_lam_viec')) return options.changedSchedule ? [] : [schedule];
      if (statement.includes('FROM lich_hen')) return options.booked ? [{ id_lich_hen: 1 }] : [];
      throw new Error(`Unexpected query: ${statement}`);
    },
    getRepository() { return repository; },
  };
  const service = new AppointmentService({}, { async transaction(callback) { return callback(manager); } },
    { client: { async del() { invalidated += 1; } } },
    { async acquire() { return 'owner'; }, async release() { released += 1; } });
  try {
    return { result: await service.book('patient-account', dto), sql, saved, released, invalidated };
  } catch (error) {
    return { error, sql, saved, released, invalidated };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('booking locks the doctor before revalidating current approved schedules and saves an available slot', async () => {
  const result = await run();
  assert.equal(result.error, undefined);
  assert.match(result.sql[0].statement, /FROM bac_si.*FOR UPDATE/);
  assert.match(result.sql[1].statement, /FOR KEY SHARE/);
  assert.deepEqual(result.sql[1].parameters, [9, 'patient-account']);
  assert.match(result.sql[2].statement, /FROM lich_lam_viec/);
  assert.equal(result.result.gioKetThuc, '08:00:00');
  assert.equal(result.saved, 1);
  assert.equal(result.released, 1);
  assert.equal(result.invalidated, 1);
});

test('a schedule removed or rejected before the doctor lock is acquired cannot be booked', async () => {
  const result = await run({ changedSchedule: true });
  assert.equal(result.error.getResponse().code, 'SCHEDULE_NOT_APPROVED');
  assert.equal(result.saved, 0);
  assert.equal(result.released, 1);
});

test('a deleted patient profile cannot create an appointment from an earlier profile lookup', async () => {
  const result = await run({ missingProfile: true });
  assert.equal(result.error.getResponse().code, 'PATIENT_NOT_FOUND');
  assert.equal(result.saved, 0);
  assert.equal(result.released, 1);
});

test('an already booked slot is rejected and the distributed lock is released', async () => {
  const result = await run({ booked: true });
  assert.equal(result.error.getResponse().code, 'APPOINTMENT_SLOT_ALREADY_BOOKED');
  assert.equal(result.saved, 0);
  assert.equal(result.released, 1);
});
