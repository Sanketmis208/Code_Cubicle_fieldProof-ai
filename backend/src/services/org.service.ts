import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { OrgRole, OrgType, Prisma } from '@prisma/client';
import { ORG_WIDE_ROLES, ROLE_PERMISSIONS } from '../authz/permissions.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/app-error.js';
import { auditService } from './audit.service.js';

type Tx = Prisma.TransactionClient;

// No 0/O, 1/I/L or U: codes get read aloud and typed on cheap phones.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';

export function normalizeInviteCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashInviteCode(code: string) {
  return createHash('sha256').update(normalizeInviteCode(code)).digest('hex');
}

export function generateInviteCode() {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'org'}-${randomBytes(3).toString('hex')}`;
}

export const organizationSelect = {
  id: true, name: true, slug: true, type: true, logoUrl: true, personal: true, createdAt: true,
} as const;

export function membershipView(membership: {
  role: OrgRole;
  organization: Prisma.OrganizationGetPayload<{ select: typeof organizationSelect }>;
}) {
  return {
    organization: membership.organization,
    role: membership.role,
    permissions: ROLE_PERMISSIONS[membership.role],
    allProjects: ORG_WIDE_ROLES.has(membership.role),
  };
}

export async function membershipsFor(userId: string) {
  const rows = await prisma.membership.findMany({
    where: { userId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { role: true, organization: { select: organizationSelect } },
  });
  return rows.map(membershipView);
}

export async function createOrganizationTx(
  tx: Tx,
  input: { name: string; type?: OrgType; personal?: boolean; ownerId: string },
) {
  const organization = await tx.organization.create({
    data: {
      name: input.name,
      slug: slugify(input.name),
      type: input.type ?? 'NGO',
      personal: input.personal ?? false,
      createdById: input.ownerId,
      memberships: { create: { userId: input.ownerId, role: 'OWNER' } },
    },
    select: organizationSelect,
  });
  await auditService.recordTx(tx, {
    organizationId: organization.id, actorId: input.ownerId, action: 'org.created',
    entityType: 'Organization', entityId: organization.id, metadata: { name: organization.name },
  });
  return organization;
}

/** Fails fast (no side effects) so sign-up can reject a bad code before creating the user. */
export async function assertInviteUsable(code: string, email: string) {
  const invite = await prisma.invite.findUnique({ where: { codeHash: hashInviteCode(code) } });
  checkInvite(invite, email);
  return invite!;
}

function checkInvite(
  invite: { revokedAt: Date | null; expiresAt: Date; email: string | null; usedCount: number; maxUses: number } | null,
  email: string,
) {
  // Unknown and revoked look the same, so a revoked code reveals nothing.
  if (!invite || invite.revokedAt) throw new AppError(404, 'This invite code is not valid', undefined, 'INVITE_INVALID');
  if (invite.expiresAt.getTime() <= Date.now()) throw new AppError(410, 'This invite code has expired', undefined, 'INVITE_EXPIRED');
  if (invite.usedCount >= invite.maxUses) throw new AppError(410, 'This invite code has already been used', undefined, 'INVITE_USED');
  if (invite.email && invite.email.toLowerCase() !== email.toLowerCase())
    throw new AppError(403, 'This invite was issued for a different email address', undefined, 'INVITE_EMAIL_MISMATCH');
}

/** Redeems an invite for `user` inside `tx`. Safe against two people racing for the last use. */
export async function redeemInviteTx(tx: Tx, code: string, user: { id: string; email: string }) {
  const invite = await tx.invite.findUnique({
    where: { codeHash: hashInviteCode(code) },
    include: { organization: { select: organizationSelect } },
  });
  checkInvite(invite, user.email);
  const existing = await tx.membership.findUnique({
    where: { organizationId_userId: { organizationId: invite!.organizationId, userId: user.id } },
  });
  if (existing) throw new AppError(409, `You are already a member of ${invite!.organization.name}`, undefined, 'ALREADY_MEMBER');
  const claimed = await tx.invite.updateMany({
    where: { id: invite!.id, revokedAt: null, usedCount: { lt: invite!.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  if (!claimed.count) throw new AppError(410, 'This invite code has already been used', undefined, 'INVITE_USED');
  await tx.membership.create({ data: { organizationId: invite!.organizationId, userId: user.id, role: invite!.role } });
  await auditService.recordTx(tx, {
    organizationId: invite!.organizationId, actorId: user.id, action: 'member.joined',
    entityType: 'Membership', entityId: user.id, metadata: { role: invite!.role, inviteId: invite!.id },
  });
  return { organization: invite!.organization, role: invite!.role };
}
