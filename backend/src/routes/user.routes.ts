import { Router } from 'express';
import { changePassword } from '../controllers/user.controller';
import { authenticate, requireEmailVerified } from '../middlewares/auth.middleware';

const router = Router();

router.post('/me/password', authenticate, requireEmailVerified, changePassword);

export default router;
