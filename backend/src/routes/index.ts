import { Router } from 'express';
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';
import userRoutes from './user.routes';

const router = Router();

// Health endpoints
router.use('/health', healthRoutes);

// Auth endpoints
router.use('/auth', authRoutes);

// User endpoints
router.use('/users', userRoutes);

export default router;
