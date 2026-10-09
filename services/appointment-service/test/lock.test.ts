import assert from 'node:assert/strict';
import test from 'node:test';
import { DistributedLockService, RedisService } from '../src/redis/redis.module';

test('redis lock is exclusive and only the owner releases it', async () => {
  process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
  process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';
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
