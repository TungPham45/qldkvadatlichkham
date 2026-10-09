import { api } from '../../api/client';
import type { ScheduleItem } from '../../types';

export const scheduleApi = {
  mine: (week: string) =>
    api.get<{ items: ScheduleItem[]; summary: { total: number; pending: number; approved: number } }>('/doctor-schedules/me', { params: { week } })
      .then((response) => response.data),
  submit: (items: Array<{ ngayLamViec: string; ca: string }>) =>
    api.post('/doctor-schedules', { items }).then((response) => response.data),
};
