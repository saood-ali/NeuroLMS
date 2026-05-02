import { Router } from 'express';
import { authenticate, requireRole, requireEmailVerified, optionalAuthenticate } from '../middlewares/auth.middleware';
import { 
  createCourse, updateCourse, publishCourse, unpublishCourse, deleteCourse, 
  getInstructorCourses, searchCourses,
  getFeaturedCourses, getTrendingCourses, getRecommendedCourses 
} from '../controllers/course.controller';

const router = Router();

// Public course routes
router.get('/', optionalAuthenticate, searchCourses);
router.get('/featured', optionalAuthenticate, getFeaturedCourses);
router.get('/trending', optionalAuthenticate, getTrendingCourses);

// Authenticated student routes (or general authenticated for recommendations)
router.get('/recommendations', authenticate, getRecommendedCourses);

// Instructor protected routes
router.use(authenticate, requireEmailVerified, requireRole('instructor'));

router.get('/me', getInstructorCourses);
router.post('/', createCourse);
router.patch('/:id', updateCourse);
router.post('/:id/publish', publishCourse);
router.post('/:id/unpublish', unpublishCourse);
router.delete('/:id', deleteCourse);

export default router;
