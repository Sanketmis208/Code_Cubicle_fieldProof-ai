import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { OrgRole, OrgType, Prisma } from '@prisma/client';
import { ORG_WIDE_ROLES, ROLE_LABEL, ROLE_PERMISSIONS } from '../authz/permissions.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/app-error.js';
import { auditService } from './audit.service.js';
import { accountSetupMail, addedToOrganizationMail, mailService } from './mail.service.js';

type Tx = Prisma.TransactionClient;

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


const SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const setupUrl = (token: string) => `${env.FRONTEND_URL.replace(/\/$/, '')}/setup/${token}`;

/** Issues a fresh one-time setup link for a user; older links keep working until they expire or are used. */
export async function issueSetupToken(tx: Tx, userId: string, createdById: string | null, ttlMs = SETUP_TTL_MS) {
  const token = randomBytes(24).toString('base64url');
  await tx.accountSetup.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs), createdById },
  });
  return token;
}

/**
 * Adds a member by email. A new person gets an account with no usable
 * password and an emailed setup link; an existing FieldProof user is simply
 * added and told. Returns the link too, so an admin can pass it on by hand
 * when email is not configured.
 */
export async function provisionMember(input: {
  organizationId: string; actorId: string; name: string; email: string; role: OrgRole;
}) {
  const [organization, actor, existing] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { name: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: input.actorId }, select: { name: true } }),
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true, name: true, passwordSetAt: true } }),
  ]);
  const result = await prisma.$transaction(async (tx) => {
    let userId = existing?.id;
    let created = false;
    if (!userId) {
      // A random password nobody knows; it is replaced through the setup link.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('base64url'), 12);
      const user = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash }, select: { id: true } });
      userId = user.id;
      created = true;
    }
    const membership = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: input.organizationId, userId } },
    });
    if (membership) throw new AppError(409, `${input.email} is already a member of this organization`, undefined, 'ALREADY_MEMBER');
    await tx.membership.create({ data: { organizationId: input.organizationId, userId, role: input.role } });
    // Someone added before they ever chose a password gets a fresh link too.
    const needsSetup = created || !existing?.passwordSetAt;
    const token = needsSetup ? await issueSetupToken(tx, userId, input.actorId) : null;
    await auditService.recordTx(tx, {
      organizationId: input.organizationId, actorId: input.actorId, action: 'member.added',
      entityType: 'Membership', entityId: userId, metadata: { role: input.role, email: input.email, newAccount: created },
    });
    return { userId, created, token };
  });
  const roleLabel = ROLE_LABEL[input.role];
  const name = existing?.name ?? input.name;
  const mail = result.token
    ? accountSetupMail({ to: input.email, name, organization: organization.name, role: roleLabel, url: setupUrl(result.token), invitedBy: actor.name })
    : addedToOrganizationMail({ to: input.email, name, organization: organization.name, role: roleLabel, url: env.FRONTEND_URL, invitedBy: actor.name });
  const { sent } = await mailService.send(mail);
  return {
    userId: result.userId,
    newAccount: result.created,
    emailSent: sent,
    // Only returned when the mail could not be sent, so the admin can hand it over.
    setupLink: result.token && !sent ? setupUrl(result.token) : null,
  };
}
