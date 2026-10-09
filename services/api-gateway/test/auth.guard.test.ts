import assert from 'node:assert/strict';
import test from 'node:test';
import type { IncomingMessage, ServerResponse } from 'http';
import jwt from 'jsonwebtoken';
import { authGuard } from '../src/auth.guard';

const identity = { id: 'account-1', role: 'PATIENT', vaiTro: 'NguoiDung', trangThai: 'Active' };

async function invoke(options: { response?: Response; unavailable?: boolean; path?: string; method?: string; token?: string }) {
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = 'gateway-unit-test-secret';
  let lookups = 0;
  globalThis.fetch = async () => {
    lookups += 1;
    if (options.unavailable) throw new Error('offline');
    return options.response || new Response(JSON.stringify(identity), { status: 200 });
  };
  const token = options.token ?? jwt.sign({ sub: identity.id, role: identity.role, vaiTro: identity.vaiTro, type: 'access' }, process.env.JWT_ACCESS_SECRET);
  const request = { url: options.path || '/api/patients/me', method: options.method || 'GET', headers: { authorization: token ? `Bearer ${token}` : '', 'x-user-id': 'forged-id' } } as unknown as IncomingMessage;
  let body = '';
  let passed = false;
  const response = { statusCode: 200, setHeader() {}, end(value: string) { body = value; } } as unknown as ServerResponse;
  try {
    await authGuard(request, response, () => { passed = true; });
    return { request, status: response.statusCode, data: body ? JSON.parse(body) : null, passed, lookups };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = originalSecret;
  }
}

test('active account is checked and forwarded headers come from the verified account', async () => {
  const result = await invoke({});
  assert.equal(result.passed, true);
  assert.equal(result.lookups, 1);
  assert.equal(result.request.headers['x-user-id'], identity.id);
  assert.equal(result.request.headers['x-app-role'], 'PATIENT');
});

test('a locked account cannot use a token issued before it was locked', async () => {
  const result = await invoke({ response: new Response('{}', { status: 403 }) });
  assert.equal(result.passed, false);
  assert.equal(result.status, 403);
  assert.equal(result.data.code, 'ACCOUNT_DISABLED');
});

test('a deleted account cannot use an existing token', async () => {
  const result = await invoke({ response: new Response('{}', { status: 401 }) });
  assert.equal(result.status, 401);
  assert.equal(result.passed, false);
});

test('a stale role cannot pass account verification', async () => {
  const result = await invoke({ response: new Response(JSON.stringify({ ...identity, role: 'MANAGER', vaiTro: 'Admin' }), { status: 200 }) });
  assert.equal(result.status, 401);
  assert.equal(result.passed, false);
});

test('missing or invalid tokens are rejected before querying the auth service', async () => {
  for (const token of ['', 'invalid-token']) {
    const result = await invoke({ token });
    assert.equal(result.status, 401);
    assert.equal(result.lookups, 0);
  }
});

test('internal endpoints stay hidden and public login remains accessible', async () => {
  const internal = await invoke({ path: '/api/internal/patients' });
  assert.equal(internal.status, 404);
  assert.equal(internal.lookups, 0);
  const login = await invoke({ path: '/api/auth/login', method: 'POST', token: '' });
  assert.equal(login.passed, true);
  assert.equal(login.lookups, 0);
});

test('account verification fails closed when the auth service is unavailable', async () => {
  const result = await invoke({ unavailable: true });
  assert.equal(result.status, 502);
  assert.equal(result.passed, false);
});

test('an invalid account response is handled as a service failure', async () => {
  const result = await invoke({ response: new Response('null', { status: 200 }) });
  assert.equal(result.status, 502);
  assert.equal(result.passed, false);
});
