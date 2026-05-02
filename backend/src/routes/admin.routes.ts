import { Router } from 'express';
import { authenticate, requireRole, requireEmailVerified } from '../middlewares/auth.middleware';
import { createCategory, updateCategory, deleteCategory } from '../controllers/category.controller';

const router = Router();

// All admin routes require authentication, verified email, and 'admin' role
router.use(authenticate, requireEmailVerified, requireRole('admin'));

// Categories
router.post('/categories', createCategory);
router.patch('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

export default router;
