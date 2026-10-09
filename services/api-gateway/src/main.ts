import './load-env';
import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createProxyMiddleware, RequestHandler } from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'http';
import { authGuard, sendJson } from './auth.guard';

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'api-gateway' };
  }
}

@Module({ controllers: [HealthController] })
class AppModule {}

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
