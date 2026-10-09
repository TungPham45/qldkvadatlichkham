import { api } from '../../api/client';
import type { ScheduleItem } from '../../types';

export interface ManagerDashboard {
  pendingCount: number;
  approvedCount: number;
  doctorsWithSchedule: number;
  appointmentsToday: number | null;
  appointmentsWeek: number | null;
  manager: { hoTen: string } | null;
}

export interface ManagerDoctorGroup {
  id: number;
  hoTen: string;
  maBacSi: string | null;
  chuyenKhoa: string | null;
  totalShifts: number;
  totalHours: number;
  statusCode: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  schedules: ScheduleItem[];
}

export const managerApi = {
  dashboard: () => api.get<ManagerDashboard>('/manager/dashboard').then((response) => response.data),
  schedules: (params: { week: string; chuyenKhoaId?: string; status?: string; q?: string }) =>
    api.get<{ summary: { total: number; pending: number; approved: number }; doctors: ManagerDoctorGroup[] }>('/manager/doctor-schedules', { params })
      .then((response) => response.data),
  approve: (id: number) => api.patch(`/manager/doctor-schedules/${id}/approve`),
  reject: (id: number, lyDo: string) => api.patch(`/manager/doctor-schedules/${id}/reject`, { lyDo }),
  bulkApprove: (week: string, chuyenKhoaId?: string) =>
    api.post('/manager/doctor-schedules/bulk-approve', { week, chuyenKhoaId: chuyenKhoaId ? Number(chuyenKhoaId) : undefined }),
};
