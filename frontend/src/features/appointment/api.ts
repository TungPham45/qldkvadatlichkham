import { api } from '../../api/client';
import type { AppointmentItem } from '../../types';

export interface AvailabilitySlot {
  start: string;
  end: string;
  available: boolean;
}

export interface AvailabilityShift {
  code: 'SANG' | 'CHIEU' | 'TOI';
  label: string;
  start: string;
  end: string;
  slotMinutes: number | null;
  available: number;
  total: number;
  note: string | null;
  slots: AvailabilitySlot[];
}

export const appointmentApi = {
  mine: (params: { page?: number; pageSize?: number; upcoming?: boolean }) =>
    api.get<{ items: AppointmentItem[]; total: number }>('/appointments/me', {
      params: { ...params, upcoming: params.upcoming ? 'true' : undefined },
    }).then((response) => response.data),
  availability: (doctorId: number, date: string) =>
    api.get<{ slots: AvailabilitySlot[]; shifts?: AvailabilityShift[] }>('/appointments/availability', {
      params: { doctorId, date },
    }).then((response) => response.data),
  sendOtp: (benhNhanId: number) =>
    api.post<{
      soDienThoaiMask: string;
      hetHanSauGiay: number;
      maOtpGiaLap: string;
      thongBao: string;
    }>('/appointments/otp/send', { benhNhanId }).then((response) => response.data),
  book: (body: { benhNhanId: number; bacSiId: number; ngayHen: string; gioHen: string; lyDoKham: string; maOtp: string }) =>
    api.post('/appointments', body).then((response) => response.data),
};
