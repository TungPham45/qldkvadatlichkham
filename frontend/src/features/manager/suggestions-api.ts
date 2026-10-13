import { api } from '../../api/client';

export interface SuggestionDisease {
  id: number;
  code: string;
  name: string;
  group: string | null;
  suggestionCount: number;
  configured: boolean;
}

export interface SuggestionMedicine {
  id: number;
  code: string;
  name: string;
  activeIngredient: string | null;
  strength: string | null;
  unit: string | null;
  group: string | null;
  stockQuantity: number;
  active: boolean;
}

export interface MedicineSuggestion {
  id: number;
  diseaseId: number;
  medicineId: number;
  priority: number;
  purpose: string | null;
  dosage: string | null;
  quantity: number | null;
  note: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  medicine: SuggestionMedicine;
}

export interface SuggestionProtocol {
  disease: {
    id: number;
    code: string;
    name: string;
    group: string | null;
    description: string | null;
  };
  applying: boolean;
  items: MedicineSuggestion[];
}

export interface SuggestionItemInput {
  medicineId: number;
  priority?: number;
  purpose?: string;
  dosage?: string;
  quantity?: number | null;
  note?: string;
  active?: boolean;
}

export interface SuggestionStats {
  diseaseTotal: number;
  configuredDiseases: number;
  suggestionTotal: number;
  lastUpdatedAt: string | null;
}

export const suggestionsApi = {
  stats: () => api.get<SuggestionStats>('/medicine-suggestions/stats').then((r) => r.data),
  diseases: (params: Record<string, unknown>) =>
    api
      .get<{ items: SuggestionDisease[]; total: number; page: number; limit: number; groups: string[] }>(
        '/medicine-suggestions/diseases',
        { params },
      )
      .then((r) => r.data),
  byDisease: (diseaseId: number, activeOnly = false) =>
    api
      .get<SuggestionProtocol>(`/medicine-suggestions/by-disease/${diseaseId}`, {
        params: activeOnly ? { activeOnly: true } : undefined,
      })
      .then((r) => r.data),
  save: (diseaseId: number, body: { applying?: boolean; items: SuggestionItemInput[] }) =>
    api.put<SuggestionProtocol>(`/medicine-suggestions/by-disease/${diseaseId}`, body).then((r) => r.data),
  add: (diseaseId: number, body: SuggestionItemInput) =>
    api.post<SuggestionProtocol>(`/medicine-suggestions/by-disease/${diseaseId}`, body).then((r) => r.data),
  loadTemplate: (diseaseId: number) =>
    api
      .post<SuggestionProtocol>(`/medicine-suggestions/by-disease/${diseaseId}/load-template`)
      .then((r) => r.data),
  setApplying: (diseaseId: number, applying: boolean) =>
    api
      .put<SuggestionProtocol>(`/medicine-suggestions/by-disease/${diseaseId}/applying`, { applying })
      .then((r) => r.data),
  update: (id: number, body: Partial<SuggestionItemInput>) =>
    api.put<SuggestionProtocol>(`/medicine-suggestions/${id}`, body).then((r) => r.data),
  remove: (id: number) => api.delete<SuggestionProtocol>(`/medicine-suggestions/${id}`).then((r) => r.data),
};
