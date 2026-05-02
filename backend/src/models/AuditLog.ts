import mongoose, { Schema, Document } from 'mongoose';

export type AuditActionType =
  | 'course_takedown'
  | 'course_remove'
  | 'user_ban'
  | 'user_unban'
  | 'user_role_change'
  | 'review_hide'
  | 'review_unhide'
  | 'review_delete'
  | 'manual_enroll'
  | 'category_create'
  | 'category_update'
  | 'category_delete'
  | 'course_feature'
  | 'course_unfeature';

export type AuditTargetType =
  | 'user'
  | 'course'
  | 'lecture'
  | 'review'
  | 'enrollment'
  | 'category';

export interface IAuditLog extends Document {
  adminId: mongoose.Types.ObjectId;
  actionType: AuditActionType;
  targetType: AuditTargetType;
  targetId: mongoose.Types.ObjectId;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    adminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actionType: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Audit logs are immutable, no updatedAt needed
  }
);

// Indexes for typical admin query patterns
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ actionType: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
