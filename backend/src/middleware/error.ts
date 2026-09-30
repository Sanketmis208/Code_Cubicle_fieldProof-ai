import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/app-error.js';
import multer from 'multer';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 25 MB or smaller' : error.code === 'LIMIT_FILE_COUNT' ? 'Upload up to 10 files at a time' : 'The media upload could not be processed';
    res.status(422).json({ error: { message } });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: { message: error.message, details: error.details } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json({ error: { message: 'A record with this value already exists' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { message: 'Something went wrong' } });
};
