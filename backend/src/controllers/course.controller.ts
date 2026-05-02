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
