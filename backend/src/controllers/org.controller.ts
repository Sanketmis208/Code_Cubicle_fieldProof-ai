import type { RequestHandler } from 'express';
import type { OrgRole, Prisma } from '@prisma/client';
import { actorForOrganization, requirePermission } from '../authz/actor.js';
import { canManageRole, ROLE_LABEL } from '../authz/permissions.js';
import { prisma } from '../lib/prisma.js';
import { auditService } from '../services/audit.service.js';
import {
  createOrganizationTx,
  generateInviteCode,
  hashInviteCode,
  membershipsFor,
  normalizeInviteCode,
  organizationSelect,
  redeemInviteTx,
} from '../services/org.service.js';
import { AppError } from '../utils/app-error.js';

type Tx = Prisma.TransactionClient;
const param = (value: unknown) => value as string;

/** Serializes membership changes per org so "last owner" checks cannot race. */
const lockOrg = (tx: Tx, organizationId: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;

async function assertNotLastOwner(tx: Tx, organizationId: string, target: { role: OrgRole }) {
  if (target.role !== 'OWNER') return;
  const owners = await tx.membership.count({ where: { organizationId, role: 'OWNER', status: 'ACTIVE' } });
  if (owners <= 1)
    throw new AppError(409, 'An organization needs at least one owner. Promote another member to owner first.', undefined, 'LAST_OWNER');
}

export const listMyOrganizations: RequestHandler = async (req, res) => {
  res.json({ memberships: await membershipsFor(req.userId!) });
};

export const createOrganization: RequestHandler = async (req, res) => {
  const organization = await prisma.$transaction((tx) =>
    createOrganizationTx(tx, { name: req.body.name, type: req.body.type, ownerId: req.userId! }),
  );
  res.status(201).json({ organization, role: 'OWNER' });
};

export const getOrganization: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId));
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { ...organizationSelect, _count: { select: { memberships: true, projects: true } } },
  });
  res.json({ organization, role: actor.role });
};

export const updateOrganization: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.settings');
  const organization = await prisma.organization.update({
    where: { id: actor.organizationId },
    data: req.body,
    select: organizationSelect,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: 'org.updated',
    entityType: 'Organization', entityId: actor.organizationId, metadata: { fields: Object.keys(req.body) },
  });
  res.json({ organization });
};

export const listMembers: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.members.view');
  const members = await prisma.membership.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      role: true, status: true, createdAt: true,
      user: {
        select: {
          id: true, name: true, email: true,
          _count: { select: { projectAssignments: { where: { project: { organizationId: actor.organizationId } } } } },
        },
      },
    },
  });
  res.json({
    members: members.map(({ user: { _count, ...user }, ...membership }) => ({
      ...membership, user, assignedProjects: _count.projectAssignments,
    })),
  });
};

export const updateMember: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.members.manage');
  const targetUserId = param(req.params.userId);
  const nextRole = req.body.role as OrgRole;
  if (targetUserId === actor.userId)
    throw new AppError(409, 'You cannot change your own role. Ask another owner or admin.', undefined, 'SELF_ROLE_CHANGE');
  const member = await prisma.$transaction(async (tx) => {
    await lockOrg(tx, actor.organizationId);
    const target = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: actor.organizationId, userId: targetUserId } },
    });
    if (!target) throw new AppError(404, 'Member not found');
    if (!canManageRole(actor.role, target.role, nextRole))
      throw new AppError(403, `A ${ROLE_LABEL[actor.role].toLowerCase()} cannot make this change`, undefined, 'FORBIDDEN');
    if (nextRole !== 'OWNER') await assertNotLastOwner(tx, actor.organizationId, target);
    const updated = await tx.membership.update({
      where: { id: target.id },
      data: { role: nextRole },
      select: { role: true, status: true, user: { select: { id: true, name: true, email: true } } },
    });
    await auditService.recordTx(tx, {
      organizationId: actor.organizationId, actorId: actor.userId, action: 'member.role_changed',
      entityType: 'Membership', entityId: targetUserId, metadata: { from: target.role, to: nextRole },
    });
    return updated;
  });
  res.json({ member });
};

/** Removes a member, or lets a member leave (DELETE on yourself). */
export const removeMember: RequestHandler = async (req, res) => {
  const targetUserId = param(req.params.userId);
  const leaving = targetUserId === req.userId;
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), leaving ? undefined : 'org.members.manage');
  await prisma.$transaction(async (tx) => {
    await lockOrg(tx, actor.organizationId);
    const target = await tx.membership.findUnique({
      where: { organizationId_userId: { organizationId: actor.organizationId, userId: targetUserId } },
    });
    if (!target) throw new AppError(404, 'Member not found');
    if (!leaving && !canManageRole(actor.role, target.role))
      throw new AppError(403, `A ${ROLE_LABEL[actor.role].toLowerCase()} cannot remove this member`, undefined, 'FORBIDDEN');
    await assertNotLastOwner(tx, actor.organizationId, target);
    // Assignments go too, so a later re-invite starts from a clean slate.
    await tx.projectMember.deleteMany({ where: { userId: targetUserId, project: { organizationId: actor.organizationId } } });
    await tx.membership.delete({ where: { id: target.id } });
    await auditService.recordTx(tx, {
      organizationId: actor.organizationId, actorId: actor.userId,
      action: leaving ? 'member.left' : 'member.removed',
      entityType: 'Membership', entityId: targetUserId, metadata: { role: target.role },
    });
  });
  res.status(204).send();
};

export const createInvite: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.invites.manage');
  const { role, email, expiresInDays, maxUses } = req.body as { role: OrgRole; email?: string; expiresInDays: number; maxUses: number };
  if (!canManageRole(actor.role, role, role))
    throw new AppError(403, `A ${ROLE_LABEL[actor.role].toLowerCase()} cannot invite a ${ROLE_LABEL[role].toLowerCase()}`, undefined, 'FORBIDDEN');
  if (email && maxUses > 1)
    throw new AppError(422, 'An invite tied to one email address can only be used once');
  // A collision on 30^8 codes is practically impossible, but never reuse one.
  let code = generateInviteCode();
  while (await prisma.invite.findUnique({ where: { codeHash: hashInviteCode(code) }, select: { id: true } }))
    code = generateInviteCode();
  const invite = await prisma.invite.create({
    data: {
      organizationId: actor.organizationId, codeHash: hashInviteCode(code),
      codeHint: normalizeInviteCode(code).slice(-2), role, email: email ?? null, maxUses,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000), createdById: actor.userId,
    },
    select: inviteSelect,
  });
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: 'invite.created',
    entityType: 'Invite', entityId: invite.id, metadata: { role, email: email ?? null, maxUses },
  });
  // The plain code is returned exactly once; only its hash is stored.
  res.status(201).json({ invite: inviteView(invite), code });
};

const inviteSelect = {
  id: true, codeHint: true, role: true, email: true, expiresAt: true, maxUses: true,
  usedCount: true, revokedAt: true, createdAt: true,
} as const;

function inviteView(invite: Prisma.InviteGetPayload<{ select: typeof inviteSelect }>) {
  const status = invite.revokedAt
    ? 'REVOKED'
    : invite.usedCount >= invite.maxUses
      ? 'USED'
      : invite.expiresAt.getTime() <= Date.now()
        ? 'EXPIRED'
        : 'ACTIVE';
  return { ...invite, status };
}

export const listInvites: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.invites.manage');
  const invites = await prisma.invite.findMany({
    where: { organizationId: actor.organizationId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: inviteSelect,
  });
  res.json({ invites: invites.map(inviteView) });
};

export const revokeInvite: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.invites.manage');
  const result = await prisma.invite.updateMany({
    where: { id: param(req.params.inviteId), organizationId: actor.organizationId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) throw new AppError(404, 'Invite not found');
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: 'invite.revoked',
    entityType: 'Invite', entityId: param(req.params.inviteId),
  });
  res.status(204).send();
};

export const joinOrganization: RequestHandler = async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: { id: true, email: true } });
  const joined = await prisma.$transaction((tx) => redeemInviteTx(tx, req.body.code, user));
  res.status(201).json(joined);
};

export const listAuditLog: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId));
  requirePermission(actor, 'audit.view');
  const [entries, integrity] = await Promise.all([
    prisma.auditLog.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { seq: 'desc' },
      take: 200,
      select: { id: true, seq: true, actorId: true, action: true, entityType: true, entityId: true, metadata: true, hash: true, createdAt: true },
    }),
    auditService.verify(actor.organizationId),
  ]);
  const actorIds = [...new Set(entries.map((entry) => entry.actorId).filter((value): value is string => Boolean(value)))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const names = new Map(actors.map((user) => [user.id, user.name]));
  res.json({
    entries: entries.map((entry) => ({ ...entry, actorName: entry.actorId ? (names.get(entry.actorId) ?? 'Former member') : null })),
    integrity,
  });
};
