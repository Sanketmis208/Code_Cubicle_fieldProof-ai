import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

// `memberships` lists every organization the user can act in, with the role
// and permission list the clients use to show or hide actions.
export const register: RequestHandler = async (req, res) => {
  const user = await authService.register(req.body);
  const memberships = await authService.memberships(user.id);
  res.cookie('fieldproof_token', authService.token(user.id), cookieOptions).status(201).json({ user, memberships });
};

export const login: RequestHandler = async (req, res) => {
  const user = await authService.login(req.body.email, req.body.password);
  const memberships = await authService.memberships(user.id);
  res.cookie('fieldproof_token', authService.token(user.id), cookieOptions).json({ user, memberships });
};

export const me: RequestHandler = async (req, res) => {
  const user = await authService.getUser(req.userId!);
  if (!user) throw new AppError(401, 'User no longer exists');
  res.json({ user, memberships: await authService.memberships(user.id) });
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie('fieldproof_token', { ...cookieOptions, maxAge: undefined }).status(204).send();
};
