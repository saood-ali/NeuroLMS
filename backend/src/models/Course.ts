import mongoose, { Schema, Document } from 'mongoose';

export type CourseLevel = 'beginner' | 'intermediate' | 'advanced';
export type CoursePricing = 'free' | 'paid';
export type CourseState = 'draft' | 'published' | 'takendown';

export interface ICourse extends Document {
  title: string;
  description: string;
  instructorId: mongoose.Types.ObjectId;
  categoryId: mongoose.Types.ObjectId;
  level: CourseLevel;
  pricing: CoursePricing;
  priceAmount?: number; // In paise, required if pricing is 'paid'
  state: CourseState;
  publishedAt?: Date;
  takenDownAt?: Date;
  takenDownBy?: mongoose.Types.ObjectId;
  isFeatured: boolean;
  featuredAt?: Date;
  featuredBy?: mongoose.Types.ObjectId;
  lectureCount: number;
  enrollmentCount: number;
  reviewCount: number;
  averageRating: number;
  createdAt: Date;
  updatedAt: Date;
}

const CourseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    instructorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      required: true,
    },
    pricing: {
      type: String,
      enum: ['free', 'paid'],
      required: true,
    },
    priceAmount: {
      type: Number,
      validate: {
        validator: function (this: ICourse, v: number | undefined) {
          if (this.pricing === 'paid' && (v === undefined || v <= 0)) return false;
          return true;
        },
        message: 'priceAmount is required and must be greater than 0 when pricing is "paid"',
      },
    },
    state: {
      type: String,
      enum: ['draft', 'published', 'takendown'],
      default: 'draft',
      required: true,
    },
    publishedAt: { type: Date },
    takenDownAt: { type: Date },
    takenDownBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isFeatured: { type: Boolean, default: false, required: true },
    featuredAt: { type: Date },
    featuredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    lectureCount: { type: Number, default: 0, required: true },
    enrollmentCount: { type: Number, default: 0, required: true },
    reviewCount: { type: Number, default: 0, required: true },
    averageRating: { type: Number, default: 0, min: 0, max: 5, required: true },
  },
  {
    timestamps: true,
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

// Indexes
CourseSchema.index({ instructorId: 1 });
CourseSchema.index({ categoryId: 1 });
CourseSchema.index({ state: 1 });
CourseSchema.index({ pricing: 1 });
CourseSchema.index({ level: 1 });
CourseSchema.index({ isFeatured: 1, state: 1 });
CourseSchema.index({ averageRating: -1 });
CourseSchema.index({ priceAmount: 1 });
CourseSchema.index({ title: 'text', description: 'text' });

export const Course = mongoose.model<ICourse>('Course', CourseSchema);
