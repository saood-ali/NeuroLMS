import { Router } from 'express';

const router = Router();

// Health check endpoint
router.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
