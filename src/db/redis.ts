import { Redis } from 'ioredis';
import { env } from '../config/env';

// Singleton client for standard caching and rate limiting
export const redisClient = new Redis(env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

// Factory function for BullMQ (BullMQ requires separate clients for Queue, Worker, and Events)
export const createRedisConnection = () => {
  return new Redis(env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
};

export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();
    console.log('Successfully connected to Redis');
  } catch (error) {
    console.error('Error connecting to Redis:', error);
    process.exit(1); // Failure causes startup to abort
  }
};

// Handle connection errors gracefully after initial connection
redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});
