import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { User, IUser } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import mongoose from 'mongoose';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

export const authenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1];

  if (!token) {
    throw new ApiError(401, 'Authentication required');
  }

  try {
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId).select('+tokenVersion');
    if (!user) {
      throw new ApiError(401, 'User associated with token no longer exists');
    }

    if (user.accountState === 'banned') {
      throw new ApiError(401, 'Account is banned');
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      throw new ApiError(401, 'Session is invalid or expired');
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, 'Invalid or expired token');
  }
});

export const optionalAuthenticate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = verifyAccessToken(token);

    const user = await User.findById(decoded.userId).select('+tokenVersion');
    if (user && user.accountState !== 'banned' && user.tokenVersion === decoded.tokenVersion) {
      req.user = user;
    }
    // If invalid for any reason, we just continue without setting req.user (since it's optional auth)
    // Wait, API_Contracts usually requires 401 if token is present but invalid. Let's make it strict if present.
    if (!user) {
      throw new ApiError(401, 'User associated with token no longer exists');
    }
    if (user.accountState === 'banned') {
      throw new ApiError(401, 'Account is banned');
    }
    if (user.tokenVersion !== decoded.tokenVersion) {
      throw new ApiError(401, 'Session is invalid or expired');
    }

    next();
  } catch (error: any) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(401, 'Invalid or expired token');
  }
});

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ApiError(401, 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      // API_Contracts §1.6: 403 is not used. Forbidden access returns 404.
      throw new ApiError(404, 'Resource not found');
    }

    next();
  };
};

export const requireEmailVerified = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw new ApiError(401, 'Authentication required');
  }

  if (!req.user.emailVerified) {
    throw new ApiError(400, 'Email verification required to perform this action');
  }

  next();
};

/**
 * Helper to check ownership. Throws 404 if the user is not the owner (and not an admin).
 * Call this inside controllers after fetching the resource.
 */
export const requireOwnership = (req: Request, resourceUserId: mongoose.Types.ObjectId | string) => {
  if (!req.user) {
    throw new ApiError(401, 'Authentication required');
  }

  if (req.user.role !== 'admin' && req.user._id.toString() !== resourceUserId.toString()) {
    throw new ApiError(404, 'Resource not found');
  }
};

/**
 * Helper to check enrollment. Throws 404 if the user is not enrolled (and not an admin/instructor).
 * Call this inside controllers.
 */
export const requireEnrollment = async (req: Request, courseId: mongoose.Types.ObjectId | string) => {
  if (!req.user) {
    throw new ApiError(401, 'Authentication required');
  }

  if (req.user.role === 'admin' || req.user.role === 'instructor') {
    return;
  }

  // TODO: Actual DB check against Enrollment model once implemented
  // If not enrolled:
  // throw new ApiError(404, 'Resource not found');
};
