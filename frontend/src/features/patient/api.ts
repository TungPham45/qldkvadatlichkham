import { api } from '../../api/client';
import type { BookablePatient, PatientProfile } from '../../types';

export interface PatientProfileInput {
  hoTen: string;
  ngaySinh: string | null;
  gioiTinh: string | null;
  soDienThoai: string;
  email: string | null;
  diaChi: string | null;
  coBhyt: boolean;
  soBhyt?: string | null;
}

export interface RelativeProfileInput extends PatientProfileInput {
  loaiQuanHe: 'Bo' | 'Me' | 'Con' | 'Vo' | 'Chong' | 'NguoiThan' | 'NguoiChamSoc';
}

export const patientProfileChangedEvent = 'patient-profile-changed';

function profileChanged<T>(value: T): T {
  window.dispatchEvent(new Event(patientProfileChangedEvent));
  return value;
}

export const patientApi = {
  me: () => api.get<PatientProfile>('/patients/me').then((response) => response.data),
  bookable: () => api.get<BookablePatient[]>('/patients/bookable').then((response) => response.data),
  createMine: (payload: PatientProfileInput) => api.post<PatientProfile>('/patients/me', payload).then((response) => profileChanged(response.data)),
  createRelative: (payload: RelativeProfileInput) => api.post<BookablePatient>('/patients/relatives', payload).then((response) => profileChanged(response.data)),
  updateRelative: (id: number, payload: Partial<RelativeProfileInput>) =>
    api.patch<BookablePatient>(`/patients/relatives/${id}`, payload).then((response) => profileChanged(response.data)),
  deleteRelative: (id: number) =>
    api.delete<{ deleted: boolean }>(`/patients/relatives/${id}`).then((response) => profileChanged(response.data)),
  updateMine: (payload: Partial<PatientProfileInput>) => api.patch<PatientProfile>('/patients/me', payload).then((response) => profileChanged(response.data)),
  deleteMine: () => api.delete<{ deleted: boolean }>('/patients/me').then((response) => profileChanged(response.data)),
};
