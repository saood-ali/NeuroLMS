import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { redisClient } from '../db/redis';
import { sendEmail } from '../integrations/email';
import { emailTemplates } from '../utils/emailTemplates';
import crypto from 'crypto';

const hashOtp = (otp: string) => crypto.createHash('sha256').update(otp).digest('hex');

export class UserService {
  // ─── Profile ───────────────────────────────────────────────────────────────

  static async getProfile(userId: string) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');
    return user;
  }

  static async updateProfile(userId: string, data: { name?: string }) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    if (data.name !== undefined) {
      if (!data.name.trim()) throw new ApiError(400, 'Name cannot be empty');
      user.name = data.name.trim();
    }

    await user.save();
    return user;
  }

  static async getInstructorProfile(instructorId: string) {
    const user = await User.findById(instructorId);

    // Uniform 404 for: not found, not instructor, or banned
    if (!user || user.role !== 'instructor' || user.accountState === 'banned') {
      throw new ApiError(404, 'Instructor not found');
    }

    return {
      id: user._id,
      name: user.name,
      profile: {
        bio: user.profile?.bio ?? null,
        avatarUrl: user.profile?.avatarUrl ?? null,
      },
    };
  }

  // ─── Email Change ───────────────────────────────────────────────────────────

  static async initiateEmailChange(userId: string, newEmail: string) {
    newEmail = newEmail.toLowerCase().trim();

    // Check new email not already taken
    const existing = await User.findOne({ email: newEmail });
    if (existing) throw new ApiError(409, 'Email already in use');

    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = hashOtp(otp);
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    // Store pending change — invalidates any prior pending change
    user.pendingEmailChange = { newEmail, otpHash, otpExpiresAt };
    await user.save();

    // Email the OTP to the NEW address
    await sendEmail({
      to: newEmail,
      subject: 'Confirm Your New Email — NeuroLMS',
      html: emailTemplates.emailChangeOtp(otp),
      type: 'email_change_otp',
      userId,
    });
  }

  static async confirmEmailChange(userId: string, otp: string) {
    const user = await User.findById(userId);
    if (!user) throw new ApiError(404, 'User not found');

    const pending = user.pendingEmailChange;
    if (!pending?.otpHash || !pending?.otpExpiresAt || !pending?.newEmail) {
      throw new ApiError(400, 'No pending email change request');
    }

    // Check expiry
    if (new Date() > pending.otpExpiresAt) {
      user.pendingEmailChange = undefined;
      await user.save();
      throw new ApiError(410, 'OTP has expired');
    }

    // Verify OTP
    if (hashOtp(otp) !== pending.otpHash) {
      throw new ApiError(400, 'Invalid OTP');
    }

    // Race-condition guard: re-check new email uniqueness at finalization
    const conflict = await User.findOne({ email: pending.newEmail, _id: { $ne: userId } });
    if (conflict) {
      user.pendingEmailChange = undefined;
      await user.save();
      throw new ApiError(409, 'Email already in use');
    }

    // Finalize
    user.email = pending.newEmail;
    user.emailVerified = true;
    user.pendingEmailChange = undefined;
    await user.save();

    return user;
  }
}
