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

export interface SearchCourseParams {
  q?: string;
  categoryId?: string;
  level?: string;
  pricing?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sortBy?: 'createdAt' | 'averageRating' | 'priceAmount';
  sortDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
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

  static async searchCourses(params: SearchCourseParams, userId?: string): Promise<{ items: any[], total: number }> {
    const query: any = { state: 'published' };

    if (params.q) {
      query.$text = { $search: params.q };
    }
    if (params.categoryId) {
      query.categoryId = new mongoose.Types.ObjectId(params.categoryId);
    }
    if (params.level) {
      query.level = params.level;
    }
    if (params.pricing) {
      query.pricing = params.pricing;
    }
    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      query.priceAmount = {};
      if (params.minPrice !== undefined) query.priceAmount.$gte = params.minPrice;
      if (params.maxPrice !== undefined) query.priceAmount.$lte = params.maxPrice;
    }
    if (params.minRating !== undefined) {
      query.averageRating = { $gte: params.minRating };
    }

    let sort: any = {};
    if (params.q) {
      // If text search, sort by score first, then user's sort if any
      sort = { score: { $meta: 'textScore' } };
    }

    if (params.sortBy) {
      sort[params.sortBy] = params.sortDir === 'desc' ? -1 : 1;
    } else if (!params.q) {
      sort.createdAt = -1; // Default sort if no text search
    }

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const findOptions = params.q ? { score: { $meta: 'textScore' } } : {};

    const [courses, total] = await Promise.all([
      Course.find(query, findOptions)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('instructorId', 'name email')
        .populate('categoryId', 'name')
        .lean(),
      Course.countDocuments(query),
    ]);

    const items = courses.map(c => {
      const { _id, __v, ...rest } = c as any;
      return { id: _id.toString(), ...rest, isEnrolled: false };
    });

    if (userId && items.length > 0) {
      const db = mongoose.connection.db;
      if (db) {
        const courseIds = items.map(c => new mongoose.Types.ObjectId(c.id));
        const enrollments = await db.collection('enrollments')
          .find({ userId: new mongoose.Types.ObjectId(userId), courseId: { $in: courseIds } })
          .toArray();

        const enrolledSet = new Set(enrollments.map(e => e.courseId.toString()));
        for (const item of items) {
          item.isEnrolled = enrolledSet.has(item.id);
        }
      }
    }

    return { items, total };
  }

  // ─── Discovery Endpoints (T-026) ─────────────────────────────────────────────

  static async getFeaturedCourses(page: number = 1, limit: number = 10): Promise<{ items: any[], total: number }> {
    const skip = (page - 1) * limit;
    const query: any = { state: 'published', isFeatured: true };

    const [courses, total] = await Promise.all([
      Course.find(query)
        .sort({ featuredAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('instructorId', 'name email')
        .populate('categoryId', 'name')
        .lean(),
      Course.countDocuments(query),
    ]);

    const items = courses.map(c => {
      const { _id, __v, ...rest } = c as any;
      return { id: _id.toString(), ...rest, isEnrolled: false };
    });

    return { items, total };
  }

  static async getTrendingCourses(page: number = 1, limit: number = 10): Promise<{ items: any[], total: number }> {
    const skip = (page - 1) * limit;
    const db = mongoose.connection.db;
    let trendingCourseIds: string[] = [];

    if (db) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentEnrollments = await db.collection('enrollments').aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: "$courseId", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit + skip } // Fetch enough to paginate
      ]).toArray();

      trendingCourseIds = recentEnrollments.map(e => e._id.toString());
    }

    let query: any = { state: 'published' };
    let sort: any = { enrollmentCount: -1, averageRating: -1 };

    // If we have recent enrollments, prioritize them
    if (trendingCourseIds.length > 0) {
      query = { state: 'published', _id: { $in: trendingCourseIds.map(id => new mongoose.Types.ObjectId(id)) } };
    }

    let [courses, total] = await Promise.all([
      Course.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('instructorId', 'name email')
        .populate('categoryId', 'name')
        .lean(),
      Course.countDocuments(query),
    ]);

    // If no recent enrollments, fallback to all-time top
    if (courses.length === 0 && trendingCourseIds.length === 0) {
      query = { state: 'published' };
      [courses, total] = await Promise.all([
        Course.find(query)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .populate('instructorId', 'name email')
          .populate('categoryId', 'name')
          .lean(),
        Course.countDocuments(query),
      ]);
    }

    const items = courses.map(c => {
      const { _id, __v, ...rest } = c as any;
      return { id: _id.toString(), ...rest, isEnrolled: false };
    });

    return { items, total };
  }

  static async getRecommendedCourses(userId: string, page: number = 1, limit: number = 10): Promise<{ items: any[], total: number }> {
    const db = mongoose.connection.db;
    const uId = new mongoose.Types.ObjectId(userId);
    let preferredCategoryIds: mongoose.Types.ObjectId[] = [];
    let enrolledCourseIds: mongoose.Types.ObjectId[] = [];

    if (db) {
      const [enrollments, views] = await Promise.all([
        db.collection('enrollments').find({ userId: uId }).toArray(),
        db.collection('courseviewhistories').find({ userId: uId }).sort({ viewedAt: -1 }).limit(20).toArray()
      ]);

      enrolledCourseIds = enrollments.map(e => e.courseId);
      
      const cats = new Set<string>();
      enrollments.forEach(e => {
        // Need to join course to get category... wait, we can just fetch the courses
      });
      
      // Let's get categories of enrolled courses
      if (enrolledCourseIds.length > 0) {
        const enrolledCourses = await Course.find({ _id: { $in: enrolledCourseIds } }).select('categoryId');
        enrolledCourses.forEach(c => cats.add(c.categoryId.toString()));
      }

      views.forEach(v => cats.add(v.categoryId.toString()));
      
      preferredCategoryIds = Array.from(cats).map(id => new mongoose.Types.ObjectId(id));
    }

    const skip = (page - 1) * limit;

    if (preferredCategoryIds.length > 0) {
      const query: any = {
        state: 'published',
        categoryId: { $in: preferredCategoryIds },
        _id: { $nin: enrolledCourseIds } // Exclude already enrolled
      };

      const [courses, total] = await Promise.all([
        Course.find(query)
          .sort({ averageRating: -1, enrollmentCount: -1 })
          .skip(skip)
          .limit(limit)
          .populate('instructorId', 'name email')
          .populate('categoryId', 'name')
          .lean(),
        Course.countDocuments(query),
      ]);

      if (courses.length > 0) {
        const items = courses.map(c => {
          const { _id, __v, ...rest } = c as any;
          return { id: _id.toString(), ...rest, isEnrolled: false };
        });
        return { items, total };
      }
    }

    // Fallback to Trending if no history or no recommendations found
    return this.getTrendingCourses(page, limit);
  }

  // ─── Detail & Enrollments (T-027) ────────────────────────────────────────────

  static async getCourseDetail(courseId: string, userId?: string, userRole?: string): Promise<any> {
    const course = await Course.findById(courseId)
      .populate('instructorId', 'name email profile')
      .populate('categoryId', 'name')
      .lean();

    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    const isOwner = userId && course.instructorId && (course.instructorId as any)._id.toString() === userId;
    const isAdmin = userRole === 'admin';

    if (course.state !== 'published' && !isOwner && !isAdmin) {
      throw new ApiError(404, 'Course not found');
    }

    let isEnrolled = false;

    if (userId) {
      const db = mongoose.connection.db;
      if (db) {
        const enrollment = await db.collection('enrollments').findOne({
          userId: new mongoose.Types.ObjectId(userId),
          courseId: new mongoose.Types.ObjectId(courseId)
        });
        isEnrolled = !!enrollment;

        // Record view if user is a student (or general user). We can record for anyone who is auth'd.
        if (userRole === 'student') {
          // Fire and forget view tracking
          const catId = (course.categoryId as any)?._id || course.categoryId;
          db.collection('courseviewhistories').insertOne({
            userId: new mongoose.Types.ObjectId(userId),
            courseId: new mongoose.Types.ObjectId(courseId),
            categoryId: new mongoose.Types.ObjectId(catId),
            viewedAt: new Date()
          }).catch(err => console.error('Failed to log course view:', err));
        }
      }
    }

    const { _id, __v, ...rest } = course as any;
    
    // Lectures will be added in Phase 5 (T-029).
    return {
      id: _id.toString(),
      ...rest,
      isEnrolled,
      lectures: [] 
    };
  }

  static async getCourseEnrollments(courseId: string, instructorId: string, userRole: string, page: number = 1, limit: number = 10, path?: string): Promise<{ items: any[], total: number }> {
    const course = await Course.findById(courseId);
    if (!course) {
      throw new ApiError(404, 'Course not found');
    }

    if (userRole !== 'admin' && course.instructorId.toString() !== instructorId) {
      throw new ApiError(404, 'Course not found'); // Hide existence to unauthorized
    }

    const db = mongoose.connection.db;
    if (!db) throw new ApiError(500, 'Database connection error');

    const skip = (page - 1) * limit;
    const query: any = { courseId: new mongoose.Types.ObjectId(courseId) };
    if (path) {
      query.path = path;
    }

    const [enrollments, total] = await Promise.all([
      db.collection('enrollments').find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('enrollments').countDocuments(query)
    ]);

    // Populate user details manually since enrollments is a native collection without a Mongoose model yet
    const userIds = enrollments.map(e => e.userId);
    const users = await mongoose.model('User').find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map(u => [u._id.toString(), u]));

    const items = enrollments.map(e => ({
      id: e._id.toString(),
      student: userMap.get(e.userId.toString()) || { id: e.userId.toString(), name: 'Unknown', email: 'unknown' },
      path: e.path || 'unknown',
      createdAt: e.createdAt
    }));

    return { items, total };
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
