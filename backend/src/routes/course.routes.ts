import { Router } from 'express';
import { authenticate, requireRole, requireEmailVerified, optionalAuthenticate } from '../middlewares/auth.middleware';
import { createCourse, updateCourse, publishCourse, unpublishCourse, deleteCourse, getInstructorCourses, searchCourses } from '../controllers/course.controller';

const router = Router();

// Public course routes
router.get('/', optionalAuthenticate, searchCourses);

// Instructor protected routes
router.use(authenticate, requireEmailVerified, requireRole('instructor'));

router.get('/me', getInstructorCourses);
router.post('/', createCourse);
router.patch('/:id', updateCourse);
router.post('/:id/publish', publishCourse);
router.post('/:id/unpublish', unpublishCourse);
router.delete('/:id', deleteCourse);

export default router;
