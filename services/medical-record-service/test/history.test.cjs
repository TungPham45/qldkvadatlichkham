const assert = require('node:assert/strict');
const test = require('node:test');
const { MedicalService } = require('../dist/main.js');

function fixture() {
  const calls = [];
  const service = new MedicalService({
    async query(sql, values) {
      calls.push({ sql, values: [...values] });
      return sql.includes('COUNT(*)') ? [{ total: 0 }] : [];
    },
  });
  return { service, calls };
}

test('patient history uses an active owner link and ignores a requested unrelated patient ID', async () => {
  const { service, calls } = fixture();
  const result = await service.history({ role: 'PATIENT', sub: 'patient-account' }, { page: 1, limit: 10, patientId: 999 });
  for (const { sql } of calls) {
    assert.match(sql, /EXISTS \([\s\S]*FROM tai_khoan_benh_nhan owner/);
    assert.match(sql, /owner\.id_benh_nhan = bn\.id_benh_nhan AND owner\.id_tai_khoan = \$1/);
    assert.match(sql, /owner\.la_chu_ho_so = TRUE AND owner\.trang_thai = 'Active'/);
    assert.doesNotMatch(sql, /bn\.id_tai_khoan/);
  }
  assert.deepEqual(calls[0].values, ['patient-account']);
  assert.deepEqual(result.items, []);
});

test('doctor history retains doctor account scope', async () => {
  const { service, calls } = fixture();
  await service.history({ role: 'DOCTOR', sub: 'doctor-account' }, { page: 1, limit: 10, doctorId: 99 });
  assert.match(calls[0].sql, /bs\.id_tai_khoan = \$1/);
  assert.deepEqual(calls[0].values, ['doctor-account']);
});

test('admin history retains patient and doctor filters and pagination', async () => {
  const { service, calls } = fixture();
  await service.history({ role: 'MANAGER', sub: 'admin-account' }, { page: 2, limit: 5, patientId: 4, doctorId: 7 });
  assert.match(calls[0].sql, /pk\.id_benh_nhan = \$1 AND pk\.id_bac_si = \$2/);
  assert.deepEqual(calls[0].values, [4, 7]);
  assert.deepEqual(calls[1].values, [4, 7, 5, 5]);
});
