import './load-env';
import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import jwt from 'jsonwebtoken';
import type { IncomingMessage, ServerResponse } from 'http';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

const PUBLIC_POST = new Set(['/api/auth/login', '/api/auth/register', '/api/auth/refresh']);

function sendJson(res: ServerResponse, status: number, code: string, message: string) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ statusCode: status, code, message }));
}

function authGuard(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  if (req.method === 'OPTIONS') {
    next();
    return;
  }
  const url = (req.url || '').split('?')[0];
  if (url === '/health' || url.startsWith('/health?')) {
    next();
    return;
  }
  if (url.startsWith('/api/internal') || url.startsWith('/internal')) {
    sendJson(res, 404, 'NOT_FOUND', 'Không tìm thấy.');
    return;
  }
  if (!url.startsWith('/api')) {
    next();
    return;
  }
  if (req.method === 'POST' && PUBLIC_POST.has(url)) {
    next();
    return;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    sendJson(res, 401, 'UNAUTHORIZED', 'Bạn chưa đăng nhập.');
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || '') as {
      sub: string;
      vaiTro: string;
      role: string;
      type: string;
    };
    if (payload.type !== 'access') throw new Error('type');
    req.headers['x-user-id'] = payload.sub;
    req.headers['x-user-role'] = payload.vaiTro;
    req.headers['x-app-role'] = payload.role;
    next();
  } catch {
    sendJson(res, 401, 'UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
  }
}

function serviceFor(url: string) {
  const path = url.replace(/^\/api/, '');
  if (path.startsWith('/auth')) return process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
  if (path.startsWith('/patients')) return process.env.PATIENT_SERVICE_URL || 'http://localhost:3002';
  if (
    path.startsWith('/specialties') ||
    path.startsWith('/doctors') ||
    path.startsWith('/doctor-schedules') ||
    path.startsWith('/manager')
  ) {
    return process.env.STAFF_SERVICE_URL || 'http://localhost:3003';
  }
  if (path.startsWith('/appointments')) return process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3004';
  return process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
}

function proxy(): RequestHandler {
  return createProxyMiddleware({
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    router: (req) => serviceFor((req as IncomingMessage).url || ''),
    onError: (_error, _req, res) => {
      const response = res as ServerResponse;
      sendJson(response, 502, 'INTERNAL_ERROR', 'Dịch vụ tạm thời không phản hồi.');
    },
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.enableCors({ origin: true, credentials: true, allowedHeaders: ['content-type', 'authorization'] });
  app.use(authGuard);
  app.use('/api', proxy());
  const port = Number(process.env.GATEWAY_PORT || 3000);
  await app.listen(port);
  console.log(`api-gateway listening on ${port}`);
}

bootstrap();
