import type { AppRole } from '../../types';

export const roleNavigation: Record<AppRole, Array<{ to: string; label: string }>> = {
  PATIENT: [
    { to: '/patient/dashboard', label: 'Tổng quan' },
    { to: '/patient/appointments/book', label: 'Đặt lịch khám' },
    { to: '/patient/appointments', label: 'Lịch hẹn của tôi' },
  ],
  DOCTOR: [
    { to: '/doctor/dashboard', label: 'Tổng quan' },
    { to: '/doctor/schedule', label: 'Đăng ký lịch làm việc' },
  ],
  MANAGER: [
    { to: '/manager/dashboard', label: 'Tổng quan' },
    { to: '/manager/accounts', label: 'Quản lý tài khoản' },
    { to: '/manager/doctor-schedules', label: 'Quản lý lịch làm việc' },
  ],
};
