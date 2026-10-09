import { normalizeDate, normalizeTime } from './schedule';

export const dateColumn = {
  to: (value: string | null) => value,
  from: (value: string | Date | null) => (value == null ? value : normalizeDate(value)),
};

export const timeColumn = {
  to: (value: string | null) => value,
  from: (value: string | null) => (value == null ? value : normalizeTime(String(value))),
};

export const bigintColumn = {
  to: (value: number | null) => value,
  from: (value: string | number | null) => (value == null ? value : Number(value)),
};

export function isDbConflict(error: unknown): { code: string; constraint: string } | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { code?: string; constraint?: string };
  if (candidate.code === '23505' || candidate.code === '23P01') {
    return { code: candidate.code, constraint: candidate.constraint ?? '' };
  }
  return null;
}
