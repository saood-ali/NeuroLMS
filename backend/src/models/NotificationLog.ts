import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType = 
  | 'email_verification_otp'
  | 'email_change_otp'
  | 'password_reset_otp'
  | 'password_change_confirmation'
  | 'password_reset_confirmation'
  | 'purchase_confirmation'
  | 'payment_failure';

export type NotificationStatus = 'sent' | 'failed';

export interface INotificationLog extends Document {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  status: NotificationStatus;
  createdAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { 
      type: String, 
      required: true,
      enum: [
        'email_verification_otp',
        'email_change_otp',
        'password_reset_otp',
        'password_change_confirmation',
        'password_reset_confirmation',
        'purchase_confirmation',
        'payment_failure'
      ]
    },
    status: { type: String, required: true, enum: ['sent', 'failed'] },
  },
  { 
    timestamps: { createdAt: true, updatedAt: false }
  }
);

NotificationLogSchema.index({ userId: 1, createdAt: -1 });
NotificationLogSchema.index({ type: 1, createdAt: -1 });
NotificationLogSchema.index({ status: 1, createdAt: -1 });

export const NotificationLog = mongoose.model<INotificationLog>('NotificationLog', NotificationLogSchema);
