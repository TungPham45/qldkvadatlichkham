import { api } from '../../api/client';
import type { PatientProfile } from '../../types';

export interface PatientProfileInput {
  hoTen: string;
  ngaySinh: string | null;
  gioiTinh: string | null;
  soDienThoai: string | null;
  email: string | null;
  diaChi: string | null;
  soBaoHiemYTe: string | null;
}

export const patientProfileChangedEvent = 'patient-profile-changed';

function profileChanged<T>(value: T): T {
  window.dispatchEvent(new Event(patientProfileChangedEvent));
  return value;
}

export const patientApi = {
  me: () => api.get<PatientProfile>('/patients/me').then((response) => response.data),
  createMine: (payload: PatientProfileInput) => api.post<PatientProfile>('/patients/me', payload).then((response) => profileChanged(response.data)),
  updateMine: (payload: Partial<PatientProfileInput>) => api.patch<PatientProfile>('/patients/me', payload).then((response) => profileChanged(response.data)),
  deleteMine: () => api.delete<{ deleted: boolean }>('/patients/me').then((response) => profileChanged(response.data)),
};
