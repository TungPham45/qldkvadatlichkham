import { Global, Injectable, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }

  onModuleDestroy() {
    return this.client.quit();
  }
}

const RELEASE_LUA = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class DistributedLockService {
  constructor(private readonly redis: RedisService) {}

  async acquire(key: string, ttlMs = 8000): Promise<string | null> {
    const token = crypto.randomUUID();
    const result = await this.redis.client.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  async release(key: string, token: string): Promise<void> {
    await this.redis.client.eval(RELEASE_LUA, 1, key, token);
  }
}

@Global()
@Module({
  providers: [RedisService, DistributedLockService],
  exports: [RedisService, DistributedLockService],
})
export class RedisModule {}
