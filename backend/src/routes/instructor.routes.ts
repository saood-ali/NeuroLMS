import { Router } from 'express';
import { getInstructorProfile } from '../controllers/user.controller';

const router = Router();

// Public instructor profile endpoint
router.get('/:id', getInstructorProfile);

export default router;
