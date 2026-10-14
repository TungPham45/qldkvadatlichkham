export type AppRole = 'PATIENT' | 'DOCTOR' | 'MANAGER';

export interface AuthUser {
  id: string;
  username: string;
  role: AppRole;
  vaiTro: string;
  trangThai: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface PatientProfile {
  id: number;
  hoTen: string;
  ngaySinh: string | null;
  gioiTinh: string | null;
  soDienThoai: string | null;
  email: string | null;
  diaChi: string | null;
  coBhyt: boolean;
  soBhyt: string | null;
  trangThai: string;
}

export type PatientRelation =
  | 'BanThan'
  | 'Bo'
  | 'Me'
  | 'Con'
  | 'Vo'
  | 'Chong'
  | 'NguoiThan'
  | 'NguoiChamSoc';

export interface BookablePatient extends PatientProfile {
  loaiQuanHe: PatientRelation | string;
  laChuHoSo: boolean;
  duocDatLichHo: boolean;
}

export interface Specialty {
  id: number;
  ten: string;
  moTa: string | null;
}

export interface DoctorProfile {
  id: number;
  hoTen: string;
  email: string | null;
  soDienThoai: string | null;
  bangCap: string | null;
  maBacSi: string | null;
  gioiTinh: string | null;
  nhanBhyt: boolean;
  chuyenKhoa: { id: number; ten: string | null } | null;
}

export type ScheduleCode = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ShiftCode = 'SANG' | 'CHIEU';

export interface ScheduleItem {
  id: number;
  doctorId: number;
  date: string;
  shift: ShiftCode | null;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  status: string;
  statusCode: ScheduleCode;
  note: string | null;
  hours: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AppointmentItem {
  id: number;
  benhNhanId: number;
  bacSiId: number;
  ngayHen: string;
  gioBatDau: string;
  gioKetThuc: string | null;
  lyDoKham: string | null;
  trangThai: string;
  bacSi: { id: number; hoTen: string; maBacSi: string | null; chuyenKhoa: { id: number; ten: string | null } | null } | null;
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
}
