import { Router } from 'express';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';
import userRoutes from './user.routes';
import instructorRoutes from './instructor.routes';
import categoryRoutes from './category.routes';
import adminRoutes from './admin.routes';
import courseRoutes from './course.routes';

const router = Router();

// Health endpoints
router.use('/health', healthRoutes);

// Auth endpoints
router.use('/auth', authRoutes);

// User endpoints
router.use('/users', userRoutes);

// Public instructor profiles
router.use('/instructors', instructorRoutes);

// Public category endpoints
router.use('/categories', categoryRoutes);

// Course endpoints (instructor-protected)
router.use('/courses', courseRoutes);

// Admin endpoints
router.use('/admin', adminRoutes);

export default router;
