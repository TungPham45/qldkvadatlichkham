import { api } from '../../api/client';
import type { AppointmentItem } from '../../types';

export const appointmentApi = {
  mine: (params: { page?: number; pageSize?: number; upcoming?: boolean }) =>
    api.get<{ items: AppointmentItem[]; total: number }>('/appointments/me', {
      params: { ...params, upcoming: params.upcoming ? 'true' : undefined },
    }).then((response) => response.data),
  availability: (doctorId: number, date: string) =>
    api.get<{ slots: Array<{ start: string; end: string; available: boolean }> }>('/appointments/availability', {
      params: { doctorId, date },
    }).then((response) => response.data),
  book: (body: { bacSiId: number; ngayHen: string; gioHen: string; lyDoKham: string }) =>
    api.post('/appointments', body).then((response) => response.data),
};
