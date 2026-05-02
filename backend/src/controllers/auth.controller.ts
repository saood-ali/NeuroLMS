import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthService } from '../services/auth.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies';

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    throw new ApiError(400, 'Missing required fields');
  }

  const { user, accessToken, refreshToken } = await AuthService.register({ name, email, password, role });
  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json(new ApiResponse({ user }, 'Registered successfully'));
});

export const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(400, 'Missing required fields');
  }

  const { user, accessToken, refreshToken } = await AuthService.login({ email, password });
  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json(new ApiResponse({ user }, 'Logged in successfully'));
});

export const refreshSession = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    throw new ApiError(401, 'No refresh token provided');
  }

  const { user, accessToken, refreshToken } = await AuthService.refresh(token);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json(new ApiResponse({ user }, 'Session refreshed'));
});

export const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.user) {
    await AuthService.logout(req.user._id.toString());
  }
  clearAuthCookies(res);
  res.status(200).json(new ApiResponse(null, 'Logged out'));
});

export const googleSignIn = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = req.body;
  if (!idToken) {
    throw new ApiError(400, 'Missing Google ID Token');
  }

  const { user, accessToken, refreshToken } = await AuthService.googleSignIn(idToken);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json(new ApiResponse({ user }, 'Logged in successfully'));
});

export const resendVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(401, 'Unauthorized');
  }

  if (user.emailVerified) {
    throw new ApiError(409, 'Email is already verified');
  }

  await AuthService.sendEmailVerificationOtp(user._id.toString(), user.email);

  res.status(200).json(new ApiResponse(null, 'Verification OTP sent'));
});

export const submitVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { otp } = req.body;
  if (!otp) {
    throw new ApiError(400, 'Missing OTP');
  }

  const updatedUser = await AuthService.verifyEmailOtp(user._id.toString(), otp);

  res.status(200).json(new ApiResponse({ emailVerified: updatedUser.emailVerified }, 'Email verified'));
});
