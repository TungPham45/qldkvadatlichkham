import { api } from '../../api/client';

export type ManagedStatus = 'Active' | 'Inactive' | 'Locked';

export interface DirectoryResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ManagedPatient {
  id: number;
  accountId: string | null;
  username: string;
  hoTen: string;
  ngaySinh: string | null;
  gioiTinh: string | null;
  soDienThoai: string | null;
  email: string | null;
  diaChi: string | null;
  coBhyt: boolean;
  soBhyt: string | null;
  trangThai: ManagedStatus;
}

export interface ManagedDoctor {
  id: number;
  accountId: string;
  username: string;
  hoTen: string;
  ngaySinh: string;
  gioiTinh: 'Nam' | 'Nu';
  soDienThoai: string;
  email: string;
  bangCap: string;
  soChungChiHanhNghe: string;
  nhanBhyt: boolean;
  trangThai: ManagedStatus;
  chuyenKhoaId: number | null;
  chuyenKhoa: string | null;
}

export interface ManagedSpecialty {
  id: number;
  ten: string;
  moTa: string | null;
  trangThai: 'Active' | 'Inactive';
  soBacSi: number;
}

export interface DirectoryFilters {
  page: number;
  pageSize: number;
  q?: string;
  gioiTinh?: string;
  trangThai?: string;
}

type DirectoryExportFilters = Omit<DirectoryFilters, 'page' | 'pageSize'>;

async function fetchAllPages<T>(
  fetchPage: (params: DirectoryFilters) => Promise<DirectoryResult<T>>,
  filters: DirectoryExportFilters,
) {
  const pageSize = 100;
  const items: T[] = [];
  let page = 1;
  let total = 0;
  do {
    const result = await fetchPage({ ...filters, page, pageSize });
    items.push(...result.items);
    total = result.total;
    page += 1;
  } while (items.length < total);
  return items;
}

const fetchPatients = (params: DirectoryFilters) => api.get<DirectoryResult<ManagedPatient>>('/auth/accounts/patients', { params }).then((response) => response.data);
const fetchDoctors = (params: DirectoryFilters) => api.get<DirectoryResult<ManagedDoctor>>('/auth/accounts/doctors', { params }).then((response) => response.data);
const fetchSpecialties = (params: Omit<DirectoryFilters, 'gioiTinh'>) => api.get<DirectoryResult<ManagedSpecialty>>('/manager/specialties', { params }).then((response) => response.data);

export const directoryApi = {
  patients: fetchPatients,
  allPatients: (params: DirectoryExportFilters) => fetchAllPages(fetchPatients, params),
  createPatient: (body: Record<string, unknown>) => api.post('/auth/accounts/patients', body).then((response) => response.data),
  updatePatient: (id: number, body: Record<string, unknown>) => api.patch(`/auth/accounts/patients/${id}`, body).then((response) => response.data),
  deletePatient: (id: number) => api.delete(`/auth/accounts/patients/${id}`).then((response) => response.data),
  doctors: fetchDoctors,
  allDoctors: (params: DirectoryExportFilters) => fetchAllPages(fetchDoctors, params),
  createDoctor: (body: Record<string, unknown>) => api.post<{ id: number }>('/auth/accounts/doctors', body).then((response) => response.data),
  updateDoctor: (id: number, body: Record<string, unknown>) => api.patch(`/auth/accounts/doctors/${id}`, body).then((response) => response.data),
  deleteDoctor: (id: number) => api.delete(`/auth/accounts/doctors/${id}`).then((response) => response.data),
  uploadDoctorPhoto: (id: number, photo: File) => {
    const form = new FormData();
    form.append('photo', photo);
    return api.post(`/auth/accounts/doctors/${id}/photo`, form).then((response) => response.data);
  },
  doctorPhoto: (id: number) => api.get<Blob>(`/auth/accounts/doctors/${id}/photo`, { responseType: 'blob' }).then((response) => response.data),
  specialties: fetchSpecialties,
  allSpecialties: (params: DirectoryExportFilters) => fetchAllPages(fetchSpecialties, params),
  createSpecialty: (body: Record<string, unknown>) => api.post('/manager/specialties', body).then((response) => response.data),
  updateSpecialty: (id: number, body: Record<string, unknown>) => api.patch(`/manager/specialties/${id}`, body).then((response) => response.data),
  deleteSpecialty: (id: number) => api.delete(`/manager/specialties/${id}`).then((response) => response.data),
  activeSpecialties: () => api.get<Array<{ id: number; ten: string }>>('/specialties').then((response) => response.data),
};
