import { Router } from 'express';
import { authenticate, requireRole, requireEmailVerified } from '../middlewares/auth.middleware';
import { createCategory, updateCategory, deleteCategory } from '../controllers/category.controller';
import { takedownCourse, adminDeleteCourse, featureCourse, unfeatureCourse, listAllCourses } from '../controllers/admin.course.controller';

const router = Router();

// All admin routes require authentication, verified email, and 'admin' role
router.use(authenticate, requireEmailVerified, requireRole('admin'));

// Categories
router.post('/categories', createCategory);
router.patch('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Course Moderation
router.get('/courses', listAllCourses);
router.post('/courses/:id/takedown', takedownCourse);
router.delete('/courses/:id', adminDeleteCourse);
router.post('/courses/:id/feature', featureCourse);
router.delete('/courses/:id/feature', unfeatureCourse);

export default router;
