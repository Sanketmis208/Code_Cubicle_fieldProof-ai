import { ProjectStatus } from '@prisma/client';
import { z } from 'zod';

const projectFields = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  location: z.string().trim().max(160).optional().nullable(),
  category: z.string().trim().max(80).optional().nullable(),
  status: z.nativeEnum(ProjectStatus).default(ProjectStatus.PLANNING),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  coverImage: z.url().optional().nullable().or(z.literal('')),
});

export const createProjectSchema = z.object({ body: projectFields.refine((data) => !data.endDate || data.endDate >= data.startDate, {
  message: 'End date cannot be before start date', path: ['endDate'],
}) });
export const updateProjectSchema = z.object({ body: projectFields.partial().refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
  message: 'End date cannot be before start date', path: ['endDate'],
}) });
export const projectIdSchema = z.object({ params: z.object({ id: z.string().cuid() }) });
