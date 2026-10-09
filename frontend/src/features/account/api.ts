import { api } from '../../api/client';
import type { AppRole } from '../../types';

export type AccountStatus = 'Active' | 'Inactive' | 'Locked';
export type AccountRole = 'Admin' | 'BacSi' | 'NguoiDung';

export interface ManagedAccount {
  id: string;
  username: string;
  vaiTro: AccountRole;
  role: AppRole;
  trangThai: AccountStatus;
  hoTen: string | null;
  email: string | null;
  soDienThoai: string | null;
  ngayTao: string;
  ngayCapNhat: string;
}

export const accountApi = {
  list: (params: { page?: number; pageSize?: number; q?: string; vaiTro?: string; trangThai?: string }) =>
    api.get<{ items: ManagedAccount[]; total: number; page: number; pageSize: number }>('/auth/accounts', { params })
      .then((response) => response.data),
  updateStatus: (id: string, trangThai: AccountStatus) =>
    api.patch(`/auth/accounts/${id}/status`, { trangThai }).then((response) => response.data),
  remove: (id: string) => api.delete(`/auth/accounts/${id}`).then((response) => response.data),
};
