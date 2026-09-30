import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error.js';

export const validate = (schema: ZodType): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
  if (!result.success) return next(new AppError(422, 'Validation failed', result.error.flatten()));
  const data = result.data as { body?: unknown; params?: Record<string, string>; query?: Record<string, unknown> };
  if (data.body !== undefined) req.body = data.body;
  if (data.params) Object.assign(req.params, data.params);
  if (data.query) req.validatedQuery = data.query;
  next();
};
