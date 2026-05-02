import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env';
import routes from './routes';
import { notFoundHandler, errorHandler } from './middlewares/error.middleware';
import { globalLimiter } from './middlewares/rateLimit';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));
app.use(cookieParser());
app.use(mongoSanitize());

// Routes
app.use('/api/v1', globalLimiter, routes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
