import { api } from '../../api/client';
import type { DoctorProfile, ScheduleCode, ScheduleItem } from '../../types';

export interface ManagerScheduleInput {
  doctorId: number;
  ngayLamViec: string;
  gioBatDau: string;
  gioKetThuc: string;
  thoiLuongMoiCa: number;
  statusCode: ScheduleCode;
  ghiChu: string;
}

export interface ManagerScheduleFilters {
  week: string;
  chuyenKhoaId?: string;
  status?: string;
  q?: string;
  date?: string;
  shift?: string;
}

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
  doctors: () => api.get<DoctorProfile[]>('/doctors').then((response) => response.data),
  schedules: (params: ManagerScheduleFilters) =>
    api.get<{ summary: { total: number; pending: number; approved: number; rejected: number }; doctors: ManagerDoctorGroup[] }>('/manager/doctor-schedules', { params })
      .then((response) => response.data),
  createSchedule: (body: ManagerScheduleInput) => api.post<ScheduleItem>('/manager/doctor-schedules', body).then((response) => response.data),
  updateSchedule: (id: number, body: ManagerScheduleInput) => api.patch<ScheduleItem>(`/manager/doctor-schedules/${id}`, body).then((response) => response.data),
  deleteSchedule: (id: number) => api.delete(`/manager/doctor-schedules/${id}`),
  approve: (id: number) => api.patch(`/manager/doctor-schedules/${id}/approve`),
  reject: (id: number, lyDo: string) => api.patch(`/manager/doctor-schedules/${id}/reject`, { lyDo }),
  bulkApprove: (week: string, chuyenKhoaId?: string, filters?: { q?: string; date?: string; shift?: string }) =>
    api.post('/manager/doctor-schedules/bulk-approve', { week, chuyenKhoaId: chuyenKhoaId ? Number(chuyenKhoaId) : undefined, ...filters }),
};
