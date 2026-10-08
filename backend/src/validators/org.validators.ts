import { OrgRole, OrgType } from '@prisma/client';
import { z } from 'zod';

const id = z.string().cuid();
const orgParams = z.object({ orgId: id });

export const createOrgSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120),
    type: z.nativeEnum(OrgType).optional(),
  }),
});

export const updateOrgSchema = z.object({
  params: orgParams,
  body: z
    .object({
      name: z.string().trim().min(2).max(120),
      type: z.nativeEnum(OrgType),
      logoUrl: z.url().max(500).nullable().or(z.literal('').transform(() => null)),
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'Nothing to update'),
});

export const orgIdSchema = z.object({ params: orgParams });

export const memberParamsSchema = z.object({ params: orgParams.extend({ userId: id }) });

export const updateMemberSchema = z.object({
  params: orgParams.extend({ userId: id }),
  body: z.object({ role: z.nativeEnum(OrgRole) }),
});

export const addMemberSchema = z.object({
  params: orgParams,
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().max(254),
    // Ownership is transferred by promoting an existing member.
    role: z.nativeEnum(OrgRole).refine((role) => role !== 'OWNER', 'Owners cannot be added directly; promote a member instead'),
  }),
});

export const projectMemberSchema = z.object({
  params: z.object({ id }),
  body: z.object({ userId: id }),
});

export const projectMemberParamsSchema = z.object({ params: z.object({ id, userId: id }) });
