import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8).max(72).regex(/[A-Z]/, 'Include an uppercase letter').regex(/[0-9]/, 'Include a number');

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email,
    password,
    organizationName: z.string().trim().max(120).optional().or(z.literal('')),
    inviteCode: z.string().trim().min(8).max(20).optional().or(z.literal('').transform(() => undefined)),
  }),
});

export const loginSchema = z.object({ body: z.object({ email, password: z.string().min(1).max(72) }) });
