import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  FRONTEND_URL: z.url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('qwen/qwen3.8-27b'),
  /** Token budget per minute for the AI provider; calls are paced to stay under it. */
  AI_TOKENS_PER_MINUTE: z.coerce.number().int().positive().default(7000),
  /** EXIF times carry no zone; this offset is assumed when the camera did not record one. */
  /**
   * lax (default) when the web app and API share a site (same domain, or /api
   * proxied). Use none only when they are on different domains; it forces Secure.
   */
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  // Outgoing email (member setup links, password resets). Optional: without it
  // the admin is shown the link to pass on by hand.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  EXIF_DEFAULT_UTC_OFFSET: z.string().regex(/^[+-]\d{2}:\d{2}$/).default('+05:30'),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'production') return;
  const requiredIntegrations = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'GROQ_API_KEY',
  ] as const;
  for (const key of requiredIntegrations) {
    if (!value[key])
      context.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required in production`,
      });
  }
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;
