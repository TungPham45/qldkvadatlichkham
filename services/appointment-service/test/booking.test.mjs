import assert from 'node:assert/strict';
import test from 'node:test';
import { AppointmentService } from '../dist/modules/appointments/appointment.service.js';

const dto = { benhNhanId: 9, bacSiId: 7, ngayHen: '2099-01-12', gioHen: '07:30', lyDoKham: 'Khám định kỳ', maOtp: '123456' };
const schedule = { id: 11, doctorId: 7, date: dto.ngayHen, startTime: '07:30:00', endTime: '11:30:00', slotMinutes: 30, status: 'Da duyet' };

async function run(options = {}) {
  const originalFetch = globalThis.fetch;
  const sql = [];
  let saved = 0;
  let released = 0;
  const deletedKeys = [];
  globalThis.fetch = async (url) => {
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
      if (statement.includes('FROM tai_khoan\n')) return options.disabledAccount ? [] : [{ id_tai_khoan: 'patient-account' }];
      if (statement.includes('FROM bac_si')) return [{ id_bac_si: 7 }];
<<<<<<< HEAD
      if (statement.includes('FROM tai_khoan_benh_nhan')) return options.revokedLink ? [] : [{ id_benh_nhan: 9 }];
      if (statement.includes('FROM benh_nhan')) return options.missingProfile ? [] : [{ id: '9', hoTen: 'Bệnh nhân', soDienThoai: '0901234567' }];
=======
      if (statement.includes('FROM benh_nhan')) return options.missingProfile ? [] : [{ id: 9, hoTen: 'Bệnh nhân', soDienThoai: '0901234567' }];
>>>>>>> 4d0d13c508dbea20eec8b30b3188d70376b4009a
      if (statement.includes('FROM lich_lam_viec')) return options.changedSchedule ? [] : [schedule];
      if (statement.includes('FROM lich_hen')) return options.booked ? [{ id_lich_hen: 1 }] : [];
      if (statement.includes('INSERT INTO thong_bao')) return [];
      throw new Error(`Unexpected query: ${statement}`);
    },
    getRepository() { return repository; },
  };
  const service = new AppointmentService({}, { async transaction(callback) { return callback(manager); } },
    { client: {
<<<<<<< HEAD
      async get() { return JSON.stringify({ maOtp: options.invalidOtp ? '000000' : dto.maOtp }); },
      async del(key) { deletedKeys.push(key); },
=======
      async get() { return JSON.stringify({ maOtp: dto.maOtp }); },
      async del() { invalidated += 1; },
>>>>>>> 4d0d13c508dbea20eec8b30b3188d70376b4009a
    } },
    { async acquire() { return 'owner'; }, async release() { released += 1; } });
  try {
    return { result: await service.book('patient-account', dto), sql, saved, released, deletedKeys };
  } catch (error) {
    return { error, sql, saved, released, deletedKeys };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('booking locks the account before doctor and checks linked patient rights in the same transaction', async () => {
  const result = await run();
  assert.equal(result.error, undefined);
  assert.match(result.sql[0].statement, /FROM tai_khoan[\s\S]*FOR SHARE/);
  assert.match(result.sql[1].statement, /FROM bac_si.*FOR UPDATE/);
  assert.match(result.sql[2].statement, /FOR SHARE OF link/);
  assert.match(result.sql[2].statement, /link\.duoc_dat_lich_ho = TRUE OR link\.la_chu_ho_so = TRUE/);
  assert.deepEqual(result.sql[2].parameters, [9, 'patient-account']);
  assert.match(result.sql[3].statement, /FROM benh_nhan[\s\S]*FOR SHARE/);
  assert.match(result.sql[4].statement, /FROM lich_lam_viec/);
  assert.equal(result.result.gioKetThuc, '08:00:00');
  assert.equal(result.result.benhNhanId, 9);
  assert.equal(result.saved, 1);
  assert.equal(result.released, 1);
<<<<<<< HEAD
  assert.deepEqual(result.deletedKeys, ['appointment:otp:patient-account:9', 'availability:7:2099-01-12']);
=======
  assert.equal(result.invalidated, 2);
>>>>>>> 4d0d13c508dbea20eec8b30b3188d70376b4009a
});

test('a schedule removed or rejected before the doctor lock is acquired cannot be booked', async () => {
  const result = await run({ changedSchedule: true });
  assert.equal(result.error.getResponse().code, 'SCHEDULE_NOT_APPROVED');
  assert.equal(result.saved, 0);
  assert.equal(result.released, 1);
});

<<<<<<< HEAD
test('a deleted profile or revoked link cannot create an appointment', async () => {
  for (const options of [{ missingProfile: true }, { revokedLink: true }]) {
    const result = await run(options);
    assert.equal(result.error.getResponse().code, 'FORBIDDEN');
    assert.equal(result.saved, 0);
    assert.equal(result.released, 1);
  }
});

test('a locked or deleted account cannot book with an earlier access token and OTP', async () => {
  const result = await run({ disabledAccount: true });
  assert.equal(result.error.getResponse().code, 'ACCOUNT_DISABLED');
  assert.equal(result.sql.length, 1);
=======
test('an unlinked patient profile cannot be booked by the account', async () => {
  const result = await run({ missingProfile: true });
  assert.equal(result.error.getResponse().code, 'FORBIDDEN');
>>>>>>> 4d0d13c508dbea20eec8b30b3188d70376b4009a
  assert.equal(result.saved, 0);
  assert.equal(result.released, 1);
});

test('OTP verification is preserved when profile and schedule management change', async () => {
  const result = await run({ invalidOtp: true });
  assert.equal(result.error.getResponse().code, 'OTP_INVALID');
  assert.equal(result.sql.length, 0);
  assert.equal(result.saved, 0);
});

test('an already booked slot is rejected and the distributed lock is released', async () => {
  const result = await run({ booked: true });
  assert.equal(result.error.getResponse().code, 'APPOINTMENT_SLOT_ALREADY_BOOKED');
  assert.equal(result.saved, 0);
  assert.equal(result.released, 1);
});
