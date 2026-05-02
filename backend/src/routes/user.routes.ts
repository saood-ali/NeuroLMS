import { Router } from 'express';
import {
  changePassword,
  getProfile,
  updateProfile,
  initiateEmailChange,
  confirmEmailChange,
} from '../controllers/user.controller';
import { authenticate, requireEmailVerified } from '../middlewares/auth.middleware';

const router = Router();

// All /users/me/* routes require authentication
router.get('/me', authenticate, getProfile);
router.patch('/me', authenticate, updateProfile);
router.post('/me/password', authenticate, requireEmailVerified, changePassword);
router.post('/me/email-change', authenticate, requireEmailVerified, initiateEmailChange);
router.post('/me/email-change/confirm', authenticate, confirmEmailChange);

export default router;
