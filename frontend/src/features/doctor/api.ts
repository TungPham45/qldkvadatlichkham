import { api } from '../../api/client';
import type { DoctorProfile, Specialty } from '../../types';

export const doctorApi = {
  me: () => api.get<DoctorProfile>('/doctors/me').then((response) => response.data),
  specialties: () => api.get<Specialty[]>('/specialties').then((response) => response.data),
  bookable: (chuyenKhoaId?: string) =>
    api.get<DoctorProfile[]>('/doctors', { params: { bookable: 'true', ...(chuyenKhoaId ? { chuyenKhoaId } : {}) } }).then((response) => response.data),
  dates: (doctorId: number, from: string, to: string) =>
    api.get<string[]>(`/doctors/${doctorId}/dates`, { params: { from, to } }).then((response) => response.data),
};
