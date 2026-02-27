import Redis from 'ioredis';
import { env } from './env';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
    });

    _redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    _redis.on('connect', () => {
      console.log('✅ Redis connected');
    });
  }
  return _redis;
}

export { Redis };
