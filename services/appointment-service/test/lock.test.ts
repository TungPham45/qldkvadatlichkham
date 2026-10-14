import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import test from 'node:test';
import { DistributedLockService, RedisService } from '../src/redis/redis.module';

function redisAvailable(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (available: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

test('redis lock is exclusive and only the owner releases it', async (context) => {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = Number(process.env.REDIS_PORT || 6379);
  if (!await redisAvailable(host, port)) {
    context.skip(`Redis integration unavailable at ${host}:${port}`);
    return;
  }
  process.env.REDIS_HOST = host;
  process.env.REDIS_PORT = String(port);
  const redis = new RedisService();
  const lock = new DistributedLockService(redis);
  const key = `appointment:lock:test:${Date.now()}`;
  const first = await lock.acquire(key, 5000);
  const second = await lock.acquire(key, 5000);
  assert.ok(first);
  assert.equal(second, null);
  await lock.release(key, 'someone-else');
  const stillHeld = await lock.acquire(key, 5000);
  assert.equal(stillHeld, null);
  await lock.release(key, first!);
  const third = await lock.acquire(key, 5000);
  assert.ok(third);
  await lock.release(key, third!);
  await redis.client.quit();
});
