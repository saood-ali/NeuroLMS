import { Router } from 'express';
import authRoutes from './auth.routes';

const router = Router();

// Health check endpoint
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Auth endpoints
router.use('/auth', authRoutes);

export default router;
