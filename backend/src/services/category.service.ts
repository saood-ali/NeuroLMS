import mongoose from 'mongoose';
import { Category, ICategory } from '../models/Category';
import { AuditLog } from '../models/AuditLog';
import { ApiError } from '../utils/ApiError';

export class CategoryService {
  static async getAllCategories() {
    return Category.find().sort({ name: 1 });
  }

  static async createCategory(adminId: string, name: string) {
    if (!name || !name.trim()) {
      throw new ApiError(400, 'Category name is required');
    }

    try {
      const category = await Category.create({ name: name.trim() });

      await AuditLog.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        actionType: 'category_create',
        targetType: 'category',
        targetId: category._id,
        metadata: { name: category.name },
      }).catch((err) => console.error('Failed to write AuditLog for category_create', err));

      return category;
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ApiError(409, 'Category with this name already exists');
      }
      throw error;
    }
  }

  static async updateCategory(adminId: string, id: string, name: string) {
    if (!name || !name.trim()) {
      throw new ApiError(400, 'Category name is required');
    }

    const category = await Category.findById(id);
    if (!category) {
      throw new ApiError(404, 'Category not found');
    }

    const oldName = category.name;
    category.name = name.trim();

    try {
      await category.save();

      await AuditLog.create({
        adminId: new mongoose.Types.ObjectId(adminId),
        actionType: 'category_update',
        targetType: 'category',
        targetId: category._id,
        metadata: { oldName, newName: category.name },
      }).catch((err) => console.error('Failed to write AuditLog for category_update', err));

      return category;
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ApiError(409, 'Category with this name already exists');
      }
      throw error;
    }
  }

  static async deleteCategory(adminId: string, id: string) {
    const category = await Category.findById(id);
    if (!category) {
      throw new ApiError(404, 'Category not found');
    }

    // Check references in courses
    const courseCount = await mongoose.connection.db?.collection('courses').countDocuments({ categoryId: new mongoose.Types.ObjectId(id) });
    if (courseCount && courseCount > 0) {
      throw new ApiError(409, 'Cannot delete category because it is referenced by one or more courses');
    }

    await Category.deleteOne({ _id: category._id });

    await AuditLog.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      actionType: 'category_delete',
      targetType: 'category',
      targetId: category._id,
      metadata: { name: category.name },
    }).catch((err) => console.error('Failed to write AuditLog for category_delete', err));
  }
}
