import { Router } from 'express';
import { authenticate, requireRole, requireEmailVerified } from '../middlewares/auth.middleware';
import { createCourse, updateCourse } from '../controllers/course.controller';

const router = Router();

// Instructor protected routes
router.use(authenticate, requireEmailVerified, requireRole('instructor'));

router.post('/', createCourse);
router.patch('/:id', updateCourse);

export default router;
