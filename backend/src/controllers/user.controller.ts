import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { clearAuthCookies } from '../utils/cookies';

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'Missing required fields');
  }

  await AuthService.changePassword(user._id.toString(), currentPassword, newPassword);

  // Clearing auth cookies since all sessions (including this one) are invalidated
  clearAuthCookies(res);

  res.status(200).json(new ApiResponse(null, 'Password changed'));
});
