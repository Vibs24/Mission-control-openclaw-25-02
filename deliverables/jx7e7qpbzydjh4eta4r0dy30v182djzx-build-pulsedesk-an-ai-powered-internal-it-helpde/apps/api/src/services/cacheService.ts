import RedisPkg from 'ioredis';
import { env } from '../config/env.js';
const Redis: any = RedisPkg as any;

export const redis = env.redisUrl ? new Redis(env.redisUrl, { lazyConnect: true }) : null;

export async function cacheSession(token: string, userId: string) {
  if (!redis) return;
  await redis.set(`session:${token}`, userId, 'EX', 60 * 60 * 8);
}

export async function publishTicketEvent(event: object) {
  if (!redis) return;
  await redis.publish('tickets.events', JSON.stringify(event));
}
