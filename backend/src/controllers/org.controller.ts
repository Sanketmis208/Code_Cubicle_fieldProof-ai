import type { RequestHandler } from 'express';
import type { OrgRole, Prisma } from '@prisma/client';
import { actorForOrganization, requirePermission } from '../authz/actor.js';
import { canManageRole, ROLE_LABEL } from '../authz/permissions.js';
import { prisma } from '../lib/prisma.js';
import { auditService } from '../services/audit.service.js';
import {
  createOrganizationTx,
  issueSetupToken,
  membershipsFor,
  organizationSelect,
  provisionMember,
  setupUrl,
} from '../services/org.service.js';
import { accountSetupMail, mailService } from '../services/mail.service.js';
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
          id: true, name: true, email: true, passwordSetAt: true,
          _count: { select: { projectAssignments: { where: { project: { organizationId: actor.organizationId } } } } },
        },
      },
    },
  });
  res.json({ members: members.map(({ user: { _count, ...user }, ...membership }) => memberView({ ...membership, user }, _count.projectAssignments)) });
};

function memberView(
  membership: { role: OrgRole; status: string; createdAt: Date; user: { id: string; name: string; email: string; passwordSetAt: Date | null } },
  assignedProjects: number,
) {
  const { passwordSetAt, ...user } = membership.user;
  return { ...membership, user, assignedProjects, pendingSetup: passwordSetAt === null };
}

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
    // Assignments go too, so adding the person again starts from a clean slate.
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

export const addMember: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.members.manage');
  const { name, email, role } = req.body as { name: string; email: string; role: OrgRole };
  if (!canManageRole(actor.role, role, role))
    throw new AppError(403, `A ${ROLE_LABEL[actor.role].toLowerCase()} cannot add a ${ROLE_LABEL[role].toLowerCase()}`, undefined, 'FORBIDDEN');
  const result = await provisionMember({ organizationId: actor.organizationId, actorId: actor.userId, name, email, role });
  const member = await prisma.membership.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: actor.organizationId, userId: result.userId } },
    select: { role: true, status: true, createdAt: true, user: { select: { id: true, name: true, email: true, passwordSetAt: true } } },
  });
  res.status(201).json({ member: memberView(member, 0), ...result });
};

/** A fresh setup link for someone who never chose a password (lost or expired email). */
export const resendSetup: RequestHandler = async (req, res) => {
  const actor = await actorForOrganization(req.userId!, param(req.params.orgId), 'org.members.manage');
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: actor.organizationId, userId: param(req.params.userId) } },
    include: { user: { select: { id: true, name: true, email: true, passwordSetAt: true } }, organization: { select: { name: true } } },
  });
  if (!membership) throw new AppError(404, 'Member not found');
  if (membership.user.passwordSetAt) throw new AppError(409, 'This member has already set a password; they can use "Forgot password" to reset it', undefined, 'ALREADY_ACTIVE');
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } });
  const token = await prisma.$transaction((tx) => issueSetupToken(tx, membership.user.id, actor.userId));
  const { sent } = await mailService.send(accountSetupMail({
    to: membership.user.email, name: membership.user.name, organization: membership.organization.name,
    role: ROLE_LABEL[membership.role], url: setupUrl(token), invitedBy: inviter.name,
  }));
  await auditService.record({
    organizationId: actor.organizationId, actorId: actor.userId, action: 'member.setup_resent',
    entityType: 'Membership', entityId: membership.user.id,
  });
  res.json({ emailSent: sent, setupLink: sent ? null : setupUrl(token) });
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
