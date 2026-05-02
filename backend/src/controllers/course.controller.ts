import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { CourseService } from '../services/course.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

export const createCourse = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== 'instructor') {
    throw new ApiError(403, 'Only instructors can create courses');
  }

  const course = await CourseService.createCourse(user._id.toString(), req.body);
  res.status(201).json(new ApiResponse(course, 'Course created'));
});

export const updateCourse = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== 'instructor') {
    throw new ApiError(403, 'Only instructors can update courses');
  }

  const id = req.params['id'] as string;
  const course = await CourseService.updateCourse(user._id.toString(), id, req.body);
  res.status(200).json(new ApiResponse(course, 'Course updated'));
});

export const publishCourse = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== 'instructor') {
    throw new ApiError(403, 'Only instructors can publish courses');
  }

  const id = req.params['id'] as string;
  const course = await CourseService.publishCourse(user._id.toString(), id);
  res.status(200).json(new ApiResponse(course, 'Course published'));
});

export const unpublishCourse = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== 'instructor') {
    throw new ApiError(403, 'Only instructors can unpublish courses');
  }

  const id = req.params['id'] as string;
  const course = await CourseService.unpublishCourse(user._id.toString(), id);
  res.status(200).json(new ApiResponse(course, 'Course unpublished'));
});

export const deleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user || user.role !== 'instructor') {
    throw new ApiError(403, 'Only instructors can delete courses');
  }

  const id = req.params['id'] as string;
  await CourseService.deleteCourse(user._id.toString(), id);
  res.status(200).json(new ApiResponse(null, 'Course deleted'));
});

export const getInstructorCourses = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const state = req.query.state as string;

  const result = await CourseService.listInstructorCourses(user._id.toString(), page, limit, state);
  res.status(200).json(new ApiResponse(result, 'Instructor courses fetched'));
});

export const searchCourses = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id?.toString();
  const params: any = {
    q: req.query.q as string,
    categoryId: req.query.categoryId as string,
    level: req.query.level as string,
    pricing: req.query.pricing as string,
    sortBy: req.query.sortBy as string,
    sortDir: req.query.sortDir as string,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 20,
  };

  if (req.query.minPrice) params.minPrice = parseInt(req.query.minPrice as string);
  if (req.query.maxPrice) params.maxPrice = parseInt(req.query.maxPrice as string);
  if (req.query.minRating) params.minRating = parseFloat(req.query.minRating as string);

  const result = await CourseService.searchCourses(params, userId);
  res.status(200).json(new ApiResponse(result, 'Courses fetched'));
});

// ─── Discovery Endpoints (T-026) ─────────────────────────────────────────────

export const getFeaturedCourses = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await CourseService.getFeaturedCourses(page, limit);
  res.status(200).json(new ApiResponse(result, 'Featured courses fetched'));
});

export const getTrendingCourses = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await CourseService.getTrendingCourses(page, limit);
  res.status(200).json(new ApiResponse(result, 'Trending courses fetched'));
});

export const getRecommendedCourses = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!._id.toString();
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await CourseService.getRecommendedCourses(userId, page, limit);
  res.status(200).json(new ApiResponse(result, 'Recommended courses fetched'));
});

// ─── Detail & Enrollments (T-027) ────────────────────────────────────────────

export const getCourseDetail = asyncHandler(async (req: Request, res: Response) => {
  const courseId = req.params.id as string;
  const userId = req.user?._id?.toString();
  const userRole = req.user?.role;

  const result = await CourseService.getCourseDetail(courseId, userId, userRole);
  res.status(200).json(new ApiResponse(result, 'Course details fetched'));
});

export const getCourseEnrollments = asyncHandler(async (req: Request, res: Response) => {
  const courseId = req.params.id as string;
  const userId = req.user!._id.toString();
  const userRole = req.user!.role;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const path = req.query.path as string | undefined;

  const result = await CourseService.getCourseEnrollments(courseId, userId, userRole, page, limit, path);
  res.status(200).json(new ApiResponse(result, 'Course enrollments fetched'));
});


