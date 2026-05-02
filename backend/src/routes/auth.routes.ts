import { Router } from 'express';
import { generateCsrfToken } from '../middlewares/csrf.middleware';
import { authenticate } from '../middlewares/auth.middleware';
import { registerUser, loginUser, refreshSession, logoutUser } from '../controllers/auth.controller';
import { ApiResponse } from '../utils/ApiResponse';

const router = Router();

router.get('/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.status(200).json(new ApiResponse({ csrfToken: token }, 'CSRF token generated'));
});

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', refreshSession);
router.post('/logout', authenticate, logoutUser);

export default router;
