import { User, IUser } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import crypto from 'crypto';
import { verifyGoogleToken } from '../utils/google';
import { redisClient } from '../db/redis';
import { sendEmail } from '../integrations/email';
import { emailTemplates } from '../utils/emailTemplates';

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

    await AuthService.sendEmailVerificationOtp(user._id.toString(), user.email);

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

  static async googleSignIn(idToken: string): Promise<{ user: IUser, accessToken: string, refreshToken: string }> {
    const payload = await verifyGoogleToken(idToken);
    
    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] }).select('+accountState');
    
    if (user) {
      if (user.accountState === 'banned') {
        throw new ApiError(404, 'Account banned');
      }
      if (!user.googleId) {
        user.googleId = payload.sub;
      }
      if (!user.emailVerified) {
        user.emailVerified = true;
      }
      if (!user.profile?.avatarUrl && payload.picture) {
        user.profile = { ...user.profile, avatarUrl: payload.picture };
      }
    } else {
      user = new User({
        name: payload.name,
        email: payload.email,
        googleId: payload.sub,
        role: 'student',
        emailVerified: true,
        profile: { avatarUrl: payload.picture }
      });
    }

    const accessToken = generateAccessToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });
    const refreshToken = generateRefreshToken({ userId: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion });

    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    return { user, accessToken, refreshToken };
  }

  static async sendEmailVerificationOtp(userId: string, email: string): Promise<void> {
    const otp = crypto.randomInt(100000, 999999).toString();
    const key = `otp:email-verify:${userId}`;
    
    await redisClient.setex(key, 900, otp); // 15 mins
    
    await sendEmail({
      to: email,
      subject: 'Verify your email address',
      html: emailTemplates.emailVerificationOtp(otp),
      type: 'email_verification_otp',
      userId
    });
  }

  static async verifyEmailOtp(userId: string, otp: string): Promise<IUser> {
    const key = `otp:email-verify:${userId}`;
    const storedOtp = await redisClient.get(key);
    
    if (!storedOtp) {
      throw new ApiError(410, 'OTP expired or not found');
    }
    
    if (storedOtp !== otp) {
      throw new ApiError(400, 'Invalid OTP');
    }
    
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    user.emailVerified = true;
    await user.save();
    
    await redisClient.del(key);
    
    return user;
  }
}
