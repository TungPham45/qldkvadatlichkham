import { AppException, ErrorCode } from './errors';

export async function internalRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('x-internal-token', process.env.INTERNAL_TOKEN ?? '');
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as T & { code?: string; message?: string }) : ({} as T);
  if (!response.ok) {
    const body = data as { code?: string; message?: string };
    throw new AppException(
      response.status,
      body.code || ErrorCode.INTERNAL_ERROR,
      body.message || 'Dịch vụ nội bộ trả về lỗi.',
    );
  }
  return data;
}
