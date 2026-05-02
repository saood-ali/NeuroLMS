import { Router } from 'express';
import { getCategories } from '../controllers/category.controller';

const router = Router();

// Public route to list categories
router.get('/', getCategories);

export default router;
