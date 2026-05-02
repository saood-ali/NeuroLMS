import { Router } from 'express';
import { authenticate, requireRole, requireEmailVerified } from '../middlewares/auth.middleware';
import { createCourse, updateCourse, publishCourse, unpublishCourse, deleteCourse, getInstructorCourses } from '../controllers/course.controller';

const router = Router();

// Instructor protected routes
router.use(authenticate, requireEmailVerified, requireRole('instructor'));

router.get('/me', getInstructorCourses);
router.post('/', createCourse);
router.patch('/:id', updateCourse);
router.post('/:id/publish', publishCourse);
router.post('/:id/unpublish', unpublishCourse);
router.delete('/:id', deleteCourse);

export default router;
