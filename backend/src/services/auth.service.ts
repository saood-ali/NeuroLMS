import { User, IUser } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import crypto from 'crypto';

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export class AuthService {
  static async register(data: any): Promise<{ user: IUser, accessToken: string, refreshToken: string }> {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      throw new ApiError(409, 'Email already registered');
    }

    const user = new User({
      name: data.name,
      email: data.email,
      passwordHash: data.password,
      role: data.role || 'student'
    });

    await user.save();

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });

    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    // TODO: Dispatch verification OTP (T-017 hook)

    return { user, accessToken, refreshToken };
  }

  static async login(data: any): Promise<{ user: IUser, accessToken: string, refreshToken: string }> {
    const user = await User.findOne({ email: data.email }).select('+passwordHash +accountState');
    
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    if (user.accountState === 'banned') {
      throw new ApiError(404, 'Account banned');
    }

    const isMatch = await user.comparePassword(data.password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid credentials');
    }

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });

    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    return { user, accessToken, refreshToken };
  }

  static async refresh(token: string): Promise<{ user: IUser, accessToken: string, refreshToken: string }> {
    const decoded = verifyRefreshToken(token);

    const user = await User.findById(decoded.userId).select('+refreshTokenHash +tokenVersion +accountState');
    if (!user) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    if (user.accountState === 'banned') {
      throw new ApiError(404, 'Account banned');
    }

    const hashedIncoming = hashToken(token);
    if (user.refreshTokenHash !== hashedIncoming) {
      throw new ApiError(401, 'Invalid or expired refresh token');
    }

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });
    const newRefreshToken = generateRefreshToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });

    user.refreshTokenHash = hashToken(newRefreshToken);
    await user.save();

    return { user, accessToken, refreshToken: newRefreshToken };
  }

  static async logout(userId: string): Promise<void> {
    const user = await User.findById(userId).select('+tokenVersion +refreshTokenHash');
    if (!user) return;

    user.refreshTokenHash = undefined;
    user.tokenVersion += 1;
    await user.save();
  }
}
