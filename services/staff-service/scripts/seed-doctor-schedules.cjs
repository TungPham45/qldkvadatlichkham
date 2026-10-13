const apiUrl = (process.env.SEED_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');
const from = process.env.SEED_SCHEDULE_FROM || '2026-09-18';
const to = process.env.SEED_SCHEDULE_TO || '2026-10-18';
const shifts = [
  { start: '07:30', end: '11:30' },
  { start: '13:30', end: '17:30' },
];
let token;

async function request(route, method = 'GET', body) {
  const response = await fetch(apiUrl + route, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(`${method} ${route}: HTTP ${response.status} ${data.code || ''} ${data.message || ''}`);
    error.code = data.code;
    throw error;
  }
  return data;
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Ngày phải có dạng YYYY-MM-DD.');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Ngày không hợp lệ.');
  return date;
}

function weekStart(value) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const first = parseDate(from);
  const last = parseDate(to);
  if (first > last || last - first > 366 * 86400000) throw new Error('Khoảng tạo lịch phải từ 1 đến 367 ngày.');
  if (!process.env.SEED_ADMIN_USERNAME || !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('Thiếu SEED_ADMIN_USERNAME hoặc SEED_ADMIN_PASSWORD để đăng nhập admin qua API.');
  }
  const auth = await request('/auth/login', 'POST', { username: process.env.SEED_ADMIN_USERNAME, password: process.env.SEED_ADMIN_PASSWORD });
  if (auth.user.role !== 'MANAGER') throw new Error('Tài khoản tạo lịch phải là admin.');
  token = auth.accessToken;
  const firstPage = await request('/auth/accounts/doctors?page=1&pageSize=100');
  const directory = [...firstPage.items];
  for (let page = 2; page <= Math.ceil(firstPage.total / firstPage.pageSize); page++) {
    directory.push(...(await request(`/auth/accounts/doctors?page=${page}&pageSize=100`)).items);
  }
  const doctors = [...new Map(directory.filter(doctor => doctor.trangThai === 'Active').map(doctor => [doctor.id, doctor])).values()];
  if (!doctors.length) throw new Error('Không có bác sĩ đang hoạt động để tạo lịch mẫu.');
  const existing = [];
  for (const date = parseDate(weekStart(from)); date <= last; date.setUTCDate(date.getUTCDate() + 7)) {
    const response = await request('/manager/doctor-schedules?week=' + date.toISOString().slice(0, 10));
    existing.push(...response.doctors.flatMap(doctor => doctor.schedules));
  }
  let created = 0;
  let skipped = 0;
  for (const doctor of doctors) {
    let doctorCreated = 0;
    for (const date = parseDate(from); date <= last; date.setUTCDate(date.getUTCDate() + 1)) {
      if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
      const day = date.toISOString().slice(0, 10);
      for (const shift of shifts) {
        if (existing.some(item => item.doctorId === doctor.id && item.date.slice(0, 10) === day && item.statusCode !== 'REJECTED'
          && item.startTime.slice(0, 5) < shift.end && item.endTime.slice(0, 5) > shift.start)) {
          skipped++;
          continue;
        }
        try {
          const item = await request('/manager/doctor-schedules', 'POST', {
            doctorId: doctor.id, ngayLamViec: day, gioBatDau: shift.start, gioKetThuc: shift.end,
            thoiLuongMoiCa: 30, statusCode: 'APPROVED', ghiChu: 'Lịch mẫu ' + from + ' – ' + to,
          });
          existing.push(item);
          created++;
          doctorCreated++;
        } catch (error) {
          // A concurrent registration takes precedence over adding sample data.
          if (error.code === 'SCHEDULE_ALREADY_REGISTERED') skipped++;
          else throw error;
        }
      }
    }
    console.log(`Bác sĩ ${doctor.id}: thêm ${doctorCreated} ca.`);
  }
  console.log(`Hoàn tất ${from} – ${to}: thêm ${created} ca, giữ nguyên ${skipped} ô đã có lịch.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
