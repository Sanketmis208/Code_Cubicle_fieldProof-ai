import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8).max(72).regex(/[A-Z]/, 'Include an uppercase letter').regex(/[0-9]/, 'Include a number');

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email,
    password,
    organizationName: z.string().trim().max(120).optional().or(z.literal('')),
  }),
});

export const loginSchema = z.object({ body: z.object({ email, password: z.string().min(1).max(72) }) });

export const setupTokenSchema = z.object({ params: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }) });
export const completeSetupSchema = z.object({
  params: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }),
  body: z.object({ password }),
});
export const forgotPasswordSchema = z.object({ body: z.object({ email }) });
