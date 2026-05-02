import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

// Ensure we have a secret to sign the CSRF tokens
const CSRF_SECRET = env.ACCESS_TOKEN_SECRET || 'fallback_csrf_secret_for_dev';

export const generateCsrfToken = (req: Request, res: Response): string => {
  // Generate a random token
  const token = crypto.randomBytes(32).toString('hex');
  
  // Create an HMAC hash of the token
  const hash = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(token)
    .digest('hex');

  // Set the hash in an httpOnly cookie
  res.cookie('_csrf', hash, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  // Return the plain token (this will be sent in the JSON response)
  return token;
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Exempt safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt webhooks
  if (req.originalUrl.startsWith('/api/v1/webhooks')) {
    return next();
  }

  // Retrieve token from header and hash from cookie
  const tokenFromHeader = req.headers['x-csrf-token'] as string;
  const hashFromCookie = req.cookies['_csrf'];

  if (!tokenFromHeader || !hashFromCookie) {
    return next(new ApiError(403, 'CSRF token missing'));
  }

  // Compute expected hash from the provided token
  const expectedHash = crypto
    .createHmac('sha256', CSRF_SECRET)
    .update(tokenFromHeader)
    .digest('hex');

  // Use timing-safe equal to prevent timing attacks
  if (
    expectedHash.length !== hashFromCookie.length ||
    !crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hashFromCookie))
  ) {
    return next(new ApiError(403, 'Invalid CSRF token'));
  }

  next();
};
