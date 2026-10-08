import { Router } from 'express';
import { completeSetup, forgotPassword, login, logout, me, register, setupPreview, token } from '../controllers/auth.controller.js';
import { setupLimiter } from '../middleware/rate-limits.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { completeSetupSchema, forgotPasswordSchema, loginSchema, registerSchema, setupTokenSchema } from '../validators/auth.validators.js';

export const authRouter = Router();
authRouter.post('/register', validate(registerSchema), asyncHandler(register));
authRouter.post('/login', validate(loginSchema), asyncHandler(login));
authRouter.post('/token', validate(loginSchema), asyncHandler(token));
// Logout must work with an expired or missing session, so it is not behind requireAuth.
authRouter.post('/logout', asyncHandler(logout));
authRouter.get('/me', requireAuth, asyncHandler(me));
authRouter.get('/setup/:token', setupLimiter, validate(setupTokenSchema), asyncHandler(setupPreview));
authRouter.post('/setup/:token', setupLimiter, validate(completeSetupSchema), asyncHandler(completeSetup));
authRouter.post('/forgot-password', setupLimiter, validate(forgotPasswordSchema), asyncHandler(forgotPassword));
