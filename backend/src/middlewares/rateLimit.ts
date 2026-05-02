import rateLimit, { Options } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisClient } from '../db/redis';
import { ApiError } from '../utils/ApiError';

export const createRateLimiter = (options: Partial<Options>) => {
  const { skip: userSkip, ...restOptions } = options;

  return rateLimit({
    store: new RedisStore({
      // @ts-expect-error - ioredis call type discrepancy is fine here
      sendCommand: (...args: string[]) => redisClient.call(...args),
    }),
    handler: (req, res, next, options) => {
      // Return a standard 429 response via the global error handler
      next(new ApiError(429, options.message || 'Too many requests, please try again later.'));
    },
    ...restOptions,
    // skip must come AFTER spread so it cannot be overwritten
    skip: async (req, res) => {
      // Read fresh each call — dotenvx may override NODE_ENV at startup
      const isTest = process.env.NODE_ENV === 'test';
      if (isTest) return true;
      if (userSkip) return await userSkip(req, res);
      return false;
    },
  });
};

export const globalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: 'draft-7', // combined `RateLimit` header
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => req.originalUrl.startsWith('/api/v1/health'),
});
