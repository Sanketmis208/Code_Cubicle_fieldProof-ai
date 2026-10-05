import { ProjectStatus } from '@prisma/client';
import { z } from 'zod';

// No `.default()` here: Zod 4 still applies defaults inside `.partial()`, so a
// default on this shared shape would silently reset fields on every PATCH.
const projectFields = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  status: z.nativeEnum(ProjectStatus),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  coverImage: z.url().optional().nullable().or(z.literal('')),
});

export const createProjectSchema = z.object({ body: projectFields.extend({ status: projectFields.shape.status.default(ProjectStatus.PLANNING) }).refine((data) => !data.endDate || data.endDate >= data.startDate, {
  message: 'End date cannot be before start date', path: ['endDate'],
}) });
export const updateProjectSchema = z.object({ body: projectFields.partial().refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
  message: 'End date cannot be before start date', path: ['endDate'],
}) });
export const projectIdSchema = z.object({ params: z.object({ id: z.string().cuid() }) });
