import type { AppRole } from '../types';

export const hospitalName = import.meta.env.VITE_HOSPITAL_NAME || 'Phòng khám đa khoa';
export const hospitalSubtitle = import.meta.env.VITE_HOSPITAL_SUBTITLE || 'Cổng thông tin đặt lịch';
export const hospitalHotline = import.meta.env.VITE_HOSPITAL_HOTLINE || '';

export function roleLabel(role: AppRole) {
  if (role === 'DOCTOR') return 'Bác sĩ';
  if (role === 'MANAGER') return 'Admin';
  return 'Bệnh nhân';
}

export function roleHome(role: AppRole) {
  if (role === 'DOCTOR') return '/doctor/dashboard';
  if (role === 'MANAGER') return '/manager/dashboard';
  return '/patient/dashboard';
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

export function formatTime(value?: string | null) {
  if (!value) return '—';
  return value.slice(0, 5);
}

export function weekdayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const labels = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return labels[utc.getUTCDay()];
}

export function startOfWeek(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

export function initials(name?: string | null) {
  const parts = (name || '?').trim().split(/\s+/);
  return parts.slice(-2).map((part) => part[0]?.toUpperCase() || '').join('');
}

export function ageLabel(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = todayIso().split('-').map(Number);
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age -= 1;
  return age >= 0 ? `${age} tuổi` : '';
}

export function genderLabel(value?: string | null) {
  if (value === 'Nam') return 'Nam';
  if (value === 'Nu') return 'Nữ';
  if (value === 'Khac') return 'Khác';
  return value || '—';
}

export function appointmentLabel(status: string) {
  const map: Record<string, string> = {
    'Cho xac nhan': 'Chờ xác nhận',
    'Da xac nhan': 'Đã xác nhận',
    'Da check-in': 'Đã check-in',
    'Dang kham': 'Đang khám',
    'Hoan thanh': 'Hoàn thành',
    Huy: 'Đã hủy',
  };
  return map[status] || status;
}

export function scheduleLabel(code: string) {
  if (code === 'PENDING') return 'Chờ duyệt';
  if (code === 'APPROVED') return 'Đã duyệt';
  if (code === 'REJECTED') return 'Bị từ chối';
  if (code === 'SELECTED') return 'Đang chọn';
  return 'Trống';
}
