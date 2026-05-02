import { Router } from 'express';
import mongoose from 'mongoose';
import { redisClient } from '../db/redis';
import { env } from '../config/env';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Liveness check
router.get('/live', (req, res) => {
  res.status(200).json(
    new ApiResponse({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }, 'Success')
  );
});

// Readiness check
router.get('/ready', asyncHandler(async (req, res, next) => {
  let mongoStatus = 'down';
  let redisStatus = 'down';
  let geminiStatus = 'down';

  try {
    // Check Mongo reachability
    if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
      await mongoose.connection.db.command({ ping: 1 });
      mongoStatus = 'up';
    }

    // Check Redis reachability
    if (redisClient.status === 'ready') {
      await redisClient.ping();
      redisStatus = 'up';
    }

    // Check Gemini reachability
    if (env.GEMINI_API_KEY) {
      // Lightest possible fetch to ensure the network can route to Google
      // A 400 error (bad key) still means the service is reachable.
      // If we want strict config validation, we'd check response.ok, but reachability is enough for now.
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      if (response.status < 500) {
        geminiStatus = 'up';
      }
    }

  } catch (error) {
    // Errors imply network partition or downtime; swallowed deliberately to set status='down'
  }

  const isReady = mongoStatus === 'up' && redisStatus === 'up' && geminiStatus === 'up';

  if (!isReady) {
    return next(new ApiError(503, 'Not ready'));
  }

  res.status(200).json(
    new ApiResponse({
      status: 'ready',
      services: {
        mongo: mongoStatus,
        redis: redisStatus,
        gemini: geminiStatus
      }
    }, 'Success')
  );
}));

export default router;
