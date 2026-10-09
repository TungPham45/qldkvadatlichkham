const base = process.env.GATEWAY_URL || 'http://localhost:3000/api';

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
}

function assert(condition, message, extra) {
  if (!condition) {
    console.error('FAIL', message, extra ?? '');
    process.exitCode = 1;
    throw new Error(message);
  }
  console.log('OK', message);
}

const stamp = Date.now().toString().slice(-7);
const patientA = {
  hoTen: 'Benh nhan A',
  ngaySinh: '1995-01-15',
  gioiTinh: 'Nam',
  soDienThoai: `090${stamp.slice(0, 7)}`,
  email: `a${stamp}@example.com`,
  diaChi: 'Ha Noi',
  username: `bn_a_${stamp}`,
  password: '123456',
  confirmPassword: '123456',
};
const patientB = {
  ...patientA,
  hoTen: 'Benh nhan B',
  soDienThoai: `091${stamp.slice(0, 7)}`,
  email: `b${stamp}@example.com`,
  username: `bn_b_${stamp}`,
};

const registeredA = await request('/auth/register', { method: 'POST', body: patientA });
assert(registeredA.status === 201 || registeredA.status === 200, 'patient register', registeredA);

const duplicateUser = await request('/auth/register', { method: 'POST', body: { ...patientB, username: patientA.username } });
assert(duplicateUser.status === 409 && duplicateUser.data.code === 'USERNAME_ALREADY_EXISTS', 'duplicate username', duplicateUser);

const duplicateEmail = await request('/auth/register', { method: 'POST', body: { ...patientB, email: patientA.email } });
assert(duplicateEmail.status === 409 && duplicateEmail.data.code === 'EMAIL_ALREADY_EXISTS', 'duplicate email', duplicateEmail);

const registeredB = await request('/auth/register', { method: 'POST', body: patientB });
assert(registeredB.status === 201 || registeredB.status === 200, 'second patient register', registeredB);

const badLogin = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong-pass' } });
assert(badLogin.status === 401 && badLogin.data.code === 'INVALID_CREDENTIALS', 'bad login', badLogin);

const admin = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: '123456' } });
const doctor = await request('/auth/login', { method: 'POST', body: { username: 'bs1', password: '123456' } });
assert(admin.status === 201 || admin.status === 200, 'admin login', admin);
assert(admin.data.user.role === 'MANAGER', 'admin redirects as manager', admin.data.user);
assert(doctor.status === 201 || doctor.status === 200, 'doctor login', doctor);
assert(doctor.data.user.role === 'DOCTOR', 'doctor role', doctor.data.user);
assert(registeredA.data.user.role === 'PATIENT', 'patient role', registeredA.data.user);

const forbidden = await request('/manager/doctor-schedules/1/approve', {
  method: 'PATCH',
  token: registeredA.data.accessToken,
});
assert(forbidden.status === 403 && forbidden.data.code === 'FORBIDDEN', 'patient cannot approve', forbidden);

const dayBase = new Date(Date.UTC(2026, 10, 1));
dayBase.setUTCDate(1 + (Number(stamp) % 27));
const day = dayBase.toISOString().slice(0, 10);
const created = await request('/doctor-schedules', {
  method: 'POST',
  token: doctor.data.accessToken,
  body: { items: [{ ngayLamViec: day, ca: 'SANG' }, { ngayLamViec: day, ca: 'CHIEU' }] },
});
assert(created.status === 201 || created.status === 200, 'doctor registers shifts', created);
assert(created.data.items.every((item) => item.statusCode === 'PENDING'), 'new shifts are pending', created.data);

const duplicateShift = await request('/doctor-schedules', {
  method: 'POST',
  token: doctor.data.accessToken,
  body: { items: [{ ngayLamViec: day, ca: 'SANG' }] },
});
assert(duplicateShift.status === 409 && duplicateShift.data.code === 'SCHEDULE_ALREADY_REGISTERED', 'duplicate shift', duplicateShift);

const hidden = await request(`/appointments/availability?doctorId=1&date=${day}`, { token: registeredA.data.accessToken });
assert(hidden.status === 200 && hidden.data.slots.length === 0, 'pending schedule is hidden', hidden.data);

const queue = await request(`/manager/doctor-schedules?week=${day}`, { token: admin.data.accessToken });
assert(queue.status === 200, 'manager sees schedules', queue.status);
const morning = created.data.items.find((item) => item.shift === 'SANG');
const afternoon = created.data.items.find((item) => item.shift === 'CHIEU');
const approved = await request(`/manager/doctor-schedules/${morning.id}/approve`, { method: 'PATCH', token: admin.data.accessToken });
assert(approved.status === 200 && approved.data.statusCode === 'APPROVED', 'approve morning', approved.data);
const rejected = await request(`/manager/doctor-schedules/${afternoon.id}/reject`, {
  method: 'PATCH',
  token: admin.data.accessToken,
  body: { lyDo: 'Trung lich hop chuyen khoa' },
});
assert(rejected.status === 200 && rejected.data.statusCode === 'REJECTED', 'reject afternoon', rejected.data);

const visible = await request(`/appointments/availability?doctorId=1&date=${day}`, { token: registeredA.data.accessToken });
assert(visible.status === 200, 'approved availability', visible.status);
assert(visible.data.slots.some((slot) => slot.start === '07:30:00' && slot.available), 'morning slot visible', visible.data.slots.slice(0, 3));
assert(!visible.data.slots.some((slot) => slot.start >= '13:30:00'), 'rejected afternoon hidden', visible.data.slots);

const payload = { bacSiId: 1, ngayHen: day, gioHen: '07:30:00', lyDoKham: 'Dau hong va sot nhe' };
const [first, second] = await Promise.all([
  request('/appointments', { method: 'POST', token: registeredA.data.accessToken, body: payload }),
  request('/appointments', { method: 'POST', token: registeredB.data.accessToken, body: payload }),
]);
const results = [first, second].sort((a, b) => a.status - b.status);
assert(results[0].status === 200 || results[0].status === 201, 'one booking succeeds', results[0]);
assert(results[1].status === 409 && results[1].data.code === 'APPOINTMENT_SLOT_ALREADY_BOOKED', 'other booking conflicts', results[1]);

const after = await request(`/appointments/availability?doctorId=1&date=${day}`, { token: registeredA.data.accessToken });
const booked = after.data.slots.find((slot) => slot.start === '07:30:00');
assert(booked && booked.available === false, 'booked slot disabled', booked);
const mine = await request('/appointments/me', { token: results[0].data ? registeredA.data.accessToken : registeredB.data.accessToken });
assert(mine.status === 200, 'patient can list appointments', mine.status);

if (process.exitCode) process.exit(process.exitCode);
console.log('SMOKE PASSED');
