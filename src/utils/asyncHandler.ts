import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler = (
  requestHandler: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(requestHandler(req, res, next)).catch((err) => next(err));
  };
};
