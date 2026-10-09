export const VaiTro = {
  ADMIN: 'Admin',
  BAC_SI: 'BacSi',
  NGUOI_DUNG: 'NguoiDung',
} as const;

export type VaiTroValue = (typeof VaiTro)[keyof typeof VaiTro];

export const AppRole = {
  PATIENT: 'PATIENT',
  DOCTOR: 'DOCTOR',
  MANAGER: 'MANAGER',
} as const;

export type AppRoleValue = (typeof AppRole)[keyof typeof AppRole];

export function vaiTroToRole(vaiTro: string): AppRoleValue {
  if (vaiTro === VaiTro.BAC_SI) return AppRole.DOCTOR;
  if (vaiTro === VaiTro.NGUOI_DUNG) return AppRole.PATIENT;
  return AppRole.MANAGER;
}

export function roleHomePath(role: AppRoleValue): string {
  if (role === AppRole.DOCTOR) return '/doctor/dashboard';
  if (role === AppRole.MANAGER) return '/manager/dashboard';
  return '/patient/dashboard';
}

export interface AccessTokenPayload {
  sub: string;
  username: string;
  vaiTro: VaiTroValue;
  role: AppRoleValue;
  type: 'access' | 'refresh';
}
