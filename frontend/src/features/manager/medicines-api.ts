import { api } from '../../api/client';

export interface Medicine {
  id: number;
  code: string;
  name: string;
  activeIngredient: string | null;
  strength: string | null;
  unit: string | null;
  group: string | null;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  lowStock: boolean;
  stockLabel: string;
  expiryDate: string | null;
  manufacturer: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineInput {
  name: string;
  activeIngredient: string;
  strength: string;
  unit: string;
  group: string;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
  expiryDate: string;
  manufacturer: string;
  active: boolean;
}

export interface MedicineListResult {
  items: Medicine[];
  total: number;
  page: number;
  limit: number;
  groups: string[];
  units: string[];
  stats: { total: number; safe: number; low: number };
}

export const medicinesApi = {
  list: (params: Record<string, unknown>) =>
    api.get<MedicineListResult>('/medicines', { params }).then((r) => r.data),
  create: (body: MedicineInput) => api.post<Medicine>('/medicines', body).then((r) => r.data),
  update: (id: number, body: MedicineInput) => api.put<Medicine>(`/medicines/${id}`, body).then((r) => r.data),
  remove: (id: number) => api.delete<{ id: number; deleted: boolean; deactivated?: boolean }>(`/medicines/${id}`).then((r) => r.data),
};
