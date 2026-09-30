import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

type TokenPayload = { sub: string };

export const requireAuth: RequestHandler = (req, _res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const token = req.cookies?.fieldproof_token ?? bearer;
  if (!token) return next(new AppError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { issuer: 'fieldproof-api' }) as TokenPayload;
    req.userId = payload.sub;
    next();
  } catch {
    next(new AppError(401, 'Your session is invalid or expired'));
  }
};
