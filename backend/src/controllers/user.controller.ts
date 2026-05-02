import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthService } from '../services/auth.service';
import { UserService } from '../services/user.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { clearAuthCookies } from '../utils/cookies';

// ─── Password ─────────────────────────────────────────────────────────────────

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Missing required fields');

  await AuthService.changePassword(user._id.toString(), currentPassword, newPassword);
  clearAuthCookies(res);
  res.status(200).json(new ApiResponse(null, 'Password changed'));
});

// ─── Profile ──────────────────────────────────────────────────────────────────

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const profile = await UserService.getProfile(user._id.toString());
  res.status(200).json(new ApiResponse(profile, 'Success'));
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { name } = req.body;
  const updated = await UserService.updateProfile(user._id.toString(), { name });
  res.status(200).json(new ApiResponse(updated, 'Profile updated'));
});

export const getInstructorProfile = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params['id'] as string;
  const profile = await UserService.getInstructorProfile(id);
  res.status(200).json(new ApiResponse(profile, 'Success'));
});

// ─── Email Change ─────────────────────────────────────────────────────────────

export const initiateEmailChange = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { newEmail } = req.body;
  if (!newEmail) throw new ApiError(400, 'newEmail is required');

  await UserService.initiateEmailChange(user._id.toString(), newEmail);
  res.status(200).json(new ApiResponse(null, 'OTP sent to new email'));
});

export const confirmEmailChange = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { otp } = req.body;
  if (!otp) throw new ApiError(400, 'OTP is required');

  const updated = await UserService.confirmEmailChange(user._id.toString(), otp);
  res.status(200).json(new ApiResponse(updated, 'Email updated successfully'));
});
