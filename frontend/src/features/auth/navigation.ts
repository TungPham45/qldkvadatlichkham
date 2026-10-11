import type { AppRole } from '../../types';

export const roleNavigation: Record<AppRole, Array<{ to: string; label: string }>> = {
  PATIENT: [
    { to: '/', label: 'Trang chủ' },
    { to: '/patient/appointments/book', label: 'Đặt lịch khám' },
    { to: '/patient/appointments', label: 'Lịch hẹn của tôi' },
  ],
  DOCTOR: [
    { to: '/doctor/dashboard', label: 'Tổng quan' },
    { to: '/doctor/schedule', label: 'Đăng ký lịch làm việc' },
  ],
  MANAGER: [
    { to: '/manager/patients', label: 'Quản lý Bệnh nhân' },
    { to: '/manager/doctors', label: 'Quản lý Bác sĩ' },
    { to: '/manager/specialties', label: 'Quản lý Chuyên khoa' },
    { to: '/manager/accounts', label: 'Quản lý Tài khoản' },
    { to: '/manager/doctor-schedules', label: 'Quản lý Lịch khám' },
  ],
};
