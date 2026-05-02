import mongoose, { Schema, Document } from 'mongoose';

export interface ICourseViewHistory extends Document {
  userId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  viewedAt: Date;
}

const CourseViewHistorySchema = new Schema<ICourseViewHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    viewedAt: { type: Date, default: Date.now, required: true },
  },
  {
    timestamps: false,
    toJSON: {
      transform: function (doc, ret: any) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Indexes per Data Model §17
CourseViewHistorySchema.index({ userId: 1, viewedAt: -1 });
CourseViewHistorySchema.index({ userId: 1, categoryId: 1 });
CourseViewHistorySchema.index({ courseId: 1 });

export const CourseViewHistory = mongoose.model<ICourseViewHistory>('CourseViewHistory', CourseViewHistorySchema);
