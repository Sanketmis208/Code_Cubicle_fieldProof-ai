import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/app-error.js';

const cookieOptions = {
  httpOnly: true,
  // SameSite=None is only accepted by browsers on Secure cookies.
  secure: env.NODE_ENV === 'production' || env.COOKIE_SAME_SITE === 'none',
  sameSite: env.COOKIE_SAME_SITE,
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

/**
 * Mobile clients cannot rely on cookies; they get the same signed session as a
 * bearer token and keep it in the platform's secure storage.
 */
export const token: RequestHandler = async (req, res) => {
  const user = await authService.login(req.body.email, req.body.password);
  const memberships = await authService.memberships(user.id);
  res.json({ token: authService.token(user.id), expiresInDays: 7, user, memberships });
};

export const me: RequestHandler = async (req, res) => {
  const user = await authService.getUser(req.userId!);
  if (!user) throw new AppError(401, 'User no longer exists');
  res.json({ user, memberships: await authService.memberships(user.id) });
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie('fieldproof_token', { ...cookieOptions, maxAge: undefined }).status(204).send();
};

export const setupPreview: RequestHandler = async (req, res) => {
  res.json({ setup: await authService.setupPreview(req.params.token as string) });
};

/** Choosing a password through an emailed link also signs the person in. */
export const completeSetup: RequestHandler = async (req, res) => {
  const user = await authService.completeSetup(req.params.token as string, req.body.password);
  const memberships = await authService.memberships(user.id);
  res.cookie('fieldproof_token', authService.token(user.id), cookieOptions).json({ user, memberships });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  res.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
};
