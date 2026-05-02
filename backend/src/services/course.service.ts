import mongoose from 'mongoose';
import { Course, ICourse, CoursePricing, CourseLevel } from '../models/Course';
import { Category } from '../models/Category';
import { AuditLog } from '../models/AuditLog';
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

  static async publishCourse(instructorId: string, courseId: string): Promise<ICourse> {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (course.instructorId.toString() !== instructorId) {
      throw new ApiError(403, 'You do not have permission to publish this course');
    }

    if (course.state === 'published') {
      return course;
    }

    if (course.lectureCount < 1) {
      throw new ApiError(400, 'Course must have at least 1 lecture to be published');
    }

    if (course.pricing === 'paid') {
      const User = mongoose.model('User');
      const instructor: any = await User.findById(instructorId);
      if (!instructor?.payoutDetails || instructor.payoutDetails.status !== 'valid') {
        throw new ApiError(400, 'Instructor must have valid payout details to publish a paid course');
      }
    }

    course.state = 'published';
    course.publishedAt = new Date();
    await course.save();

    return course;
  }

  static async unpublishCourse(instructorId: string, courseId: string): Promise<ICourse> {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (course.instructorId.toString() !== instructorId) {
      throw new ApiError(403, 'You do not have permission to unpublish this course');
    }

    if (course.state !== 'published') {
      throw new ApiError(400, 'Course is not published');
    }

    course.state = 'draft';
    await course.save();

    return course;
  }

  static async deleteCourse(instructorId: string, courseId: string): Promise<void> {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (course.instructorId.toString() !== instructorId) {
      throw new ApiError(403, 'You do not have permission to delete this course');
    }

    if (course.state === 'published') {
      throw new ApiError(400, 'Cannot delete a published course. Unpublish it first.');
    }

    if (course.enrollmentCount > 0) {
      throw new ApiError(400, 'Cannot delete a course with active enrollments.');
    }

    const db = mongoose.connection.db;
    if (!db) {
      throw new ApiError(500, 'Database connection not established');
    }

    const cid = new mongoose.Types.ObjectId(courseId);

    // Cascading deletions
    await Promise.all([
      db.collection('lectures').deleteMany({ courseId: cid }),
      db.collection('lectureChunks').deleteMany({ courseId: cid }),
      db.collection('qaHistory').deleteMany({ courseId: cid }),
      db.collection('enrollments').deleteMany({ courseId: cid }),
      db.collection('reviews').deleteMany({ courseId: cid }),
      db.collection('wishlists').updateMany({}, { $pull: { courseIds: cid } } as any),
      db.collection('lectureProgress').deleteMany({ courseId: cid }),
      db.collection('liveClasses').deleteMany({ courseId: cid }),
      db.collection('courseViewHistory').deleteMany({ courseId: cid }),
    ]);

    await Course.findByIdAndDelete(courseId);
  }

  // ─── Admin Moderation ───────────────────────────────────────────────────────

  static async takedownCourse(adminId: string, courseId: string): Promise<ICourse> {
    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, 'Course not found');

    if (course.state === 'takendown') return course;

    course.state = 'takendown';
    course.takenDownAt = new Date();
    course.takenDownBy = new mongoose.Types.ObjectId(adminId);
    await course.save();

    await AuditLog.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      actionType: 'course_takedown',
      targetType: 'course',
      targetId: new mongoose.Types.ObjectId(courseId),
      metadata: { title: course.title },
    });

    return course;
  }

  static async adminDeleteCourse(adminId: string, courseId: string): Promise<void> {
    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, 'Course not found');

    const db = mongoose.connection.db;
    if (!db) throw new ApiError(500, 'Database connection not established');

    const cid = new mongoose.Types.ObjectId(courseId);

    // Cascading deletions — same as instructor delete but bypasses enrollment check
    await Promise.all([
      db.collection('lectures').deleteMany({ courseId: cid }),
      db.collection('lectureChunks').deleteMany({ courseId: cid }),
      db.collection('qaHistory').deleteMany({ courseId: cid }),
      db.collection('enrollments').deleteMany({ courseId: cid }),
      db.collection('reviews').deleteMany({ courseId: cid }),
      db.collection('wishlists').updateMany({}, { $pull: { courseIds: cid } } as any),
      db.collection('lectureProgress').deleteMany({ courseId: cid }),
      db.collection('liveClasses').deleteMany({ courseId: cid }),
      db.collection('courseViewHistory').deleteMany({ courseId: cid }),
    ]);

    await AuditLog.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      actionType: 'course_remove',
      targetType: 'course',
      targetId: cid,
      metadata: { title: course.title },
    });

    await Course.findByIdAndDelete(courseId);
  }

  static async featureCourse(adminId: string, courseId: string): Promise<ICourse> {
    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, 'Course not found');

    if (course.state !== 'published') {
      throw new ApiError(400, 'Only published courses can be featured');
    }

    course.isFeatured = true;
    course.featuredAt = new Date();
    course.featuredBy = new mongoose.Types.ObjectId(adminId);
    await course.save();

    await AuditLog.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      actionType: 'course_feature',
      targetType: 'course',
      targetId: new mongoose.Types.ObjectId(courseId),
      metadata: { title: course.title },
    });

    return course;
  }

  static async unfeatureCourse(adminId: string, courseId: string): Promise<ICourse> {
    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, 'Course not found');

    course.isFeatured = false;
    await course.save();

    await AuditLog.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      actionType: 'course_unfeature',
      targetType: 'course',
      targetId: new mongoose.Types.ObjectId(courseId),
      metadata: { title: course.title },
    });

    return course;
  }

  static async listAllCourses(page: number = 1, limit: number = 10): Promise<{ items: ICourse[], total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Course.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('instructorId', 'name email'),
      Course.countDocuments(),
    ]);
    return { items, total };
  }

  static async listInstructorCourses(instructorId: string, page: number = 1, limit: number = 10, state?: string): Promise<{ items: ICourse[], total: number }> {
    const query: any = { instructorId: new mongoose.Types.ObjectId(instructorId) };
    if (state) query.state = state;

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Course.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Course.countDocuments(query),
    ]);
    return { items, total };
  }
}
