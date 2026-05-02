import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { ApiError } from './ApiError';

export interface TokenPayload {
  userId: string;
  role: string;
  tokenVersion: number;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  if (!env.ACCESS_TOKEN_SECRET) {
    throw new ApiError(500, 'ACCESS_TOKEN_SECRET is missing');
  }
  return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
    expiresIn: (env.ACCESS_TOKEN_EXPIRY || '15m') as any,
  });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  if (!env.REFRESH_TOKEN_SECRET) {
    throw new ApiError(500, 'REFRESH_TOKEN_SECRET is missing');
  }
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
    expiresIn: (env.REFRESH_TOKEN_EXPIRY || '7d') as any,
  });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  if (!env.ACCESS_TOKEN_SECRET) {
    throw new ApiError(500, 'ACCESS_TOKEN_SECRET is missing');
  }
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_SECRET) as TokenPayload;
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired access token');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  if (!env.REFRESH_TOKEN_SECRET) {
    throw new ApiError(500, 'REFRESH_TOKEN_SECRET is missing');
  }
  try {
    return jwt.verify(token, env.REFRESH_TOKEN_SECRET) as TokenPayload;
  } catch (error) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
};
