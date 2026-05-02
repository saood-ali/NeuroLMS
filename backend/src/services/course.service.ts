import mongoose from 'mongoose';
import { Course, ICourse, CoursePricing, CourseLevel } from '../models/Course';
import { Category } from '../models/Category';
import { ApiError } from '../utils/ApiError';

interface CreateCourseData {
  title: string;
  description: string;
  categoryId: string;
  level: CourseLevel;
  pricing: CoursePricing;
  priceAmount?: number;
}

interface UpdateCourseData {
  title?: string;
  description?: string;
  categoryId?: string;
  level?: CourseLevel;
  pricing?: CoursePricing;
  priceAmount?: number;
}

export class CourseService {
  static async createCourse(instructorId: string, data: CreateCourseData): Promise<ICourse> {
    if (!data.title || !data.description || !data.categoryId || !data.level || !data.pricing) {
      throw new ApiError(400, 'Missing required fields: title, description, categoryId, level, pricing');
    }

    if (data.pricing === 'paid' && (!data.priceAmount || data.priceAmount <= 0)) {
      throw new ApiError(400, 'priceAmount is required and must be greater than 0 for paid courses');
    }

    // Validate category exists
    const category = await Category.findById(data.categoryId);
    if (!category) {
      throw new ApiError(400, 'Invalid categoryId');
    }

    const course = new Course({
      title: data.title,
      description: data.description,
      instructorId: new mongoose.Types.ObjectId(instructorId),
      categoryId: new mongoose.Types.ObjectId(data.categoryId),
      level: data.level,
      pricing: data.pricing,
      priceAmount: data.pricing === 'paid' ? data.priceAmount : undefined,
      state: 'draft',
    });

    await course.save();
    return course;
  }

  static async updateCourse(instructorId: string, courseId: string, data: UpdateCourseData): Promise<ICourse> {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (course.instructorId.toString() !== instructorId) {
      throw new ApiError(403, 'You do not have permission to update this course');
    }

    // FR-205: Lock pricing designation if there are active enrollments
    if (course.enrollmentCount > 0 && data.pricing && data.pricing !== course.pricing) {
      throw new ApiError(400, 'Cannot change pricing designation (Free/Paid) after course has active enrollments');
    }

    // Validate category if changing
    if (data.categoryId && data.categoryId !== course.categoryId.toString()) {
      const category = await Category.findById(data.categoryId);
      if (!category) {
        throw new ApiError(400, 'Invalid categoryId');
      }
      course.categoryId = new mongoose.Types.ObjectId(data.categoryId);
    }

    if (data.title) course.title = data.title;
    if (data.description) course.description = data.description;
    if (data.level) course.level = data.level;

    const newPricing = data.pricing || course.pricing;
    if (data.pricing) course.pricing = data.pricing;

    if (newPricing === 'paid') {
      if (data.priceAmount !== undefined) {
        if (data.priceAmount <= 0) throw new ApiError(400, 'priceAmount must be greater than 0');
        course.priceAmount = data.priceAmount;
      } else if (!course.priceAmount) {
         throw new ApiError(400, 'priceAmount is required when changing to paid');
      }
    } else {
      course.priceAmount = undefined;
    }

    await course.save();
    return course;
  }
}
