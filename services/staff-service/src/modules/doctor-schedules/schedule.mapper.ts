import {
  exactShift,
  isApprovedScheduleStatus,
  ScheduleStatus,
  timeToMinutes,
} from '@qlpk/common';
import { LichLamViec } from '../../database/entities';

export type ScheduleCode = 'PENDING' | 'APPROVED' | 'REJECTED';

export function statusCode(status: string): ScheduleCode {
  if (status === ScheduleStatus.PENDING) return 'PENDING';
  if (status === ScheduleStatus.REJECTED) return 'REJECTED';
  if (isApprovedScheduleStatus(status)) return 'APPROVED';
  return 'PENDING';
}

export function toScheduleView(row: LichLamViec) {
  const shift = exactShift(row.gioBatDau, row.gioKetThuc);
  const minutes = Math.max(0, timeToMinutes(row.gioKetThuc) - timeToMinutes(row.gioBatDau));
  return {
    id: row.idLichLamViec,
    doctorId: row.idBacSi,
    date: row.ngayLamViec,
    shift,
    startTime: row.gioBatDau,
    endTime: row.gioKetThuc,
    slotMinutes: row.thoiLuongMoiCa,
    status: row.trangThai,
    statusCode: statusCode(row.trangThai),
    note: row.ghiChu,
    hours: Math.round((minutes / 60) * 10) / 10,
    createdAt: row.ngayTao,
    updatedAt: row.ngayCapNhat,
  };
}
