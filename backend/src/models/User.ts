import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcrypt';

export type UserRole = 'admin' | 'instructor' | 'student';
export type AccountState = 'active' | 'banned';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  role: UserRole;
  accountState: AccountState;
  emailVerified: boolean;
  tokenVersion: number;
  refreshTokenHash?: string;
  refreshTokenExpiresAt?: Date;
  pendingEmailChange?: {
    newEmail: string;
    otpHash: string;
    otpExpiresAt: Date;
  };
  profile?: {
    bio?: string;
    avatarUrl?: string;
  };
  bannedAt?: Date;
  bannedBy?: mongoose.Types.ObjectId;
  payoutDetails?: {
    razorpayContactId?: string;
    razorpayFundAccountId?: string;
    status?: 'pending' | 'valid' | 'invalid';
    updatedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String },
    googleId: { type: String },
    role: { type: String, required: true, enum: ['admin', 'instructor', 'student'], default: 'student' },
    accountState: { type: String, required: true, enum: ['active', 'banned'], default: 'active' },
    emailVerified: { type: Boolean, required: true, default: false },
    tokenVersion: { type: Number, required: true, default: 0 },
    refreshTokenHash: { type: String },
    refreshTokenExpiresAt: { type: Date },
    pendingEmailChange: {
      newEmail: String,
      otpHash: String,
      otpExpiresAt: Date,
    },
    profile: {
      bio: String,
      avatarUrl: String,
    },
    bannedAt: { type: Date },
    bannedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    payoutDetails: {
      razorpayContactId: String,
      razorpayFundAccountId: String,
      status: { type: String, enum: ['pending', 'valid', 'invalid'] },
      updatedAt: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret: any) {
        delete ret.passwordHash;
        delete ret.refreshTokenHash;
        delete ret.tokenVersion;
        if (ret.pendingEmailChange) {
          delete ret.pendingEmailChange.otpHash;
        }
        return ret;
      },
    },
  }
);

UserSchema.index({ email: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
UserSchema.index({ googleId: 1 }, { unique: true, sparse: true });
UserSchema.index({ role: 1 });
UserSchema.index({ accountState: 1 });

UserSchema.pre('save', async function () {
  const user = this as IUser;

  if (!user.isModified('passwordHash') || !user.passwordHash) {
    return;
  }

  // If already a bcrypt hash, don't double hash
  if (user.passwordHash.startsWith('$2b$') || user.passwordHash.startsWith('$2a$')) {
    return;
  }

  const salt = await bcrypt.genSalt(12);
  user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
});

UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

export const User = mongoose.model<IUser>('User', UserSchema);
