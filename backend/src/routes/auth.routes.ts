import { Router } from 'express';
import { generateCsrfToken } from '../middlewares/csrf.middleware';
import { ApiResponse } from '../utils/ApiResponse';

const router = Router();

router.get('/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.status(200).json(new ApiResponse({ csrfToken: token }, 'CSRF token generated'));
});

export default router;
