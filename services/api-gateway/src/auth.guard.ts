import type { IncomingMessage, ServerResponse } from 'http';
import jwt from 'jsonwebtoken';

const PUBLIC_POST = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/refresh']);

export function sendJson(res: ServerResponse, status: number, code: string, message: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ statusCode: status, code, message }));
}

interface AccountIdentity {
  id: string;
  vaiTro: string;
  role: string;
  trangThai: string;
}

export async function authGuard(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'OPTIONS' || url === '/health') {
    next();
    return;
  }
  if (url.startsWith('/api/internal') || url.startsWith('/internal')) {
    sendJson(res, 404, 'NOT_FOUND', 'Không tìm thấy.');
    return;
  }
  if (!url.startsWith('/api') || (req.method === 'POST' && PUBLIC_POST.has(url))) {
    next();
    return;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  let payload: jwt.JwtPayload;
  try {
    if (!token) throw new Error('missing token');
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET || '');
    if (typeof decoded === 'string' || decoded.type !== 'access' || !decoded.sub) throw new Error('invalid token');
    payload = decoded;
  } catch {
    sendJson(res, 401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    return;
  }

  // Account status must be checked for every request, including tokens issued before a lock or deletion.
  let account: AccountIdentity;
  try {
    const authUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
    const response = await fetch(`${authUrl.replace(/\/$/, '')}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401) {
      sendJson(res, 401, 'UNAUTHORIZED', 'Tài khoản không còn tồn tại hoặc phiên đăng nhập đã hết hạn.');
      return;
    }
    if (response.status === 403) {
      sendJson(res, 403, 'ACCOUNT_DISABLED', 'Tài khoản đang bị khóa hoặc ngừng hoạt động.');
      return;
    }
    if (!response.ok) throw new Error('account verification failed');
    account = await response.json() as AccountIdentity;
    if (!account || typeof account.id !== 'string' || typeof account.role !== 'string'
      || typeof account.vaiTro !== 'string' || typeof account.trangThai !== 'string') {
      throw new Error('invalid account verification response');
    }
  } catch {
    sendJson(res, 502, 'INTERNAL_ERROR', 'Dịch vụ xác thực tạm thời không phản hồi.');
    return;
  }
  if (account.trangThai !== 'Active') {
    sendJson(res, 403, 'ACCOUNT_DISABLED', 'Tài khoản đang bị khóa hoặc ngừng hoạt động.');
    return;
  }
  if (account.id !== payload.sub || account.role !== payload.role || account.vaiTro !== payload.vaiTro) {
    sendJson(res, 401, 'UNAUTHORIZED', 'Thông tin tài khoản đã thay đổi. Vui lòng đăng nhập lại.');
    return;
  }
  req.headers['x-user-id'] = account.id;
  req.headers['x-user-role'] = account.vaiTro;
  req.headers['x-app-role'] = account.role;
  next();
}
