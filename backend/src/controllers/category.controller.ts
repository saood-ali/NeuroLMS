import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { CategoryService } from '../services/category.service';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await CategoryService.getAllCategories();
  res.status(200).json(new ApiResponse({ items: categories }, 'Success'));
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const { name } = req.body;
  const category = await CategoryService.createCategory(user._id.toString(), name);
  res.status(201).json(new ApiResponse(category, 'Category created'));
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const id = req.params['id'] as string;
  const { name } = req.body;
  const category = await CategoryService.updateCategory(user._id.toString(), id, name);
  res.status(200).json(new ApiResponse(category, 'Category updated'));
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw new ApiError(401, 'Unauthorized');

  const id = req.params['id'] as string;
  await CategoryService.deleteCategory(user._id.toString(), id);
  res.status(200).json(new ApiResponse(null, 'Category deleted'));
});
