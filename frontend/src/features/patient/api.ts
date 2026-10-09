import { api } from '../../api/client';
import type { PatientProfile } from '../../types';

export const patientApi = {
  me: () => api.get<PatientProfile>('/patients/me').then((response) => response.data),
};
