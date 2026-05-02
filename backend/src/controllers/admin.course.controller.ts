import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { CourseService } from '../services/course.service';
import { ApiResponse } from '../utils/ApiResponse';

export const takedownCourse = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user!._id.toString();
  const course = await CourseService.takedownCourse(adminId, req.params.id as string);
  res.status(200).json(new ApiResponse(course, 'Course taken down'));
});

export const adminDeleteCourse = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user!._id.toString();
  await CourseService.adminDeleteCourse(adminId, req.params.id as string);
  res.status(200).json(new ApiResponse(null, 'Course removed'));
});

export const featureCourse = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user!._id.toString();
  const course = await CourseService.featureCourse(adminId, req.params.id as string);
  res.status(200).json(new ApiResponse(course, 'Course featured'));
});

export const unfeatureCourse = asyncHandler(async (req: Request, res: Response) => {
  const adminId = req.user!._id.toString();
  const course = await CourseService.unfeatureCourse(adminId, req.params.id as string);
  res.status(200).json(new ApiResponse(course, 'Course unfeatured'));
});

export const listAllCourses = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const result = await CourseService.listAllCourses(page, limit);
  res.status(200).json(new ApiResponse(result, 'All courses fetched'));
});

