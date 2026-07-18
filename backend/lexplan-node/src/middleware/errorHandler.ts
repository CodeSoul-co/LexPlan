import type { NextFunction, Request, Response } from 'express';
import { ERROR_CODES, HTTP_STATUS } from '../constants';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = HTTP_STATUS.BAD_REQUEST,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    error: {
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      message: `Route not found: ${req.method} ${req.path}`,
    },
  });
}

export function errorHandler(err: Error | AppError, req: Request, res: Response, _next: NextFunction): void {
  logger.error('Request error', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    },
  });
}