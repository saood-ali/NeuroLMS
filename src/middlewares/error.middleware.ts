import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { env } from '../config/env';

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  next(new ApiError(404, `Not Found - ${req.originalUrl}`));
};

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let errors: any[] = [];

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err.name === 'ValidationError') {
    // Mongoose validation error mapping ye
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors || {}).map((e: any) => ({
      field: e.path,
      code: 'validation_error',
      message: e.message,
    }));
  } else if (err.message) {
    message = err.message;
  }

  const response: any = {
    statusCode,
    message,
    errors,
  };

  if (env.NODE_ENV !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};
