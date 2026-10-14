import type { AppRole } from '../../types';

export const roleNavigation: Record<AppRole, Array<{ to: string; label: string }>> = {
  PATIENT: [
    { to: '/', label: 'Trang chủ' },
    { to: '/patient/appointments/book', label: 'Đặt lịch khám' },
    { to: '/patient/appointments', label: 'Lịch hẹn của tôi' },
    { to: '/patient/invoices', label: 'Hóa đơn của tôi' },
    { to: '/my-records', label: 'Lịch sử khám' },
  ],
  DOCTOR: [
    { to: '/doctor/dashboard', label: 'Tổng quan' },
    { to: '/doctor/schedule', label: 'Đăng ký lịch làm việc' },
    { to: '/doctor/appointments/confirmation', label: 'Xác nhận lịch hẹn' },
    { to: '/doctor/examinations', label: 'Khám bệnh' },
    { to: '/medical-history', label: 'Lịch sử khám' },
  ],
  MANAGER: [
    { to: '/manager/patients', label: 'Quản lý Bệnh nhân' },
    { to: '/manager/doctors', label: 'Quản lý Bác sĩ' },
    { to: '/manager/specialties', label: 'Quản lý Chuyên khoa' },
    { to: '/manager/medicines', label: 'Quản lý Thuốc' },
    { to: '/manager/clinical-services', label: 'Quản lý Dịch vụ' },
    { to: '/manager/diseases', label: 'Danh mục tên bệnh' },
    { to: '/manager/medicine-suggestions', label: 'Gợi ý thuốc' },
    { to: '/manager/accounts', label: 'Quản lý Tài khoản' },
    { to: '/manager/doctor-schedules', label: 'Duyệt lịch làm việc' },
    { to: '/reception', label: 'Giám sát quá trình khám' },
    { to: '/medical-history', label: 'Lịch sử khám' },
  ],
};
