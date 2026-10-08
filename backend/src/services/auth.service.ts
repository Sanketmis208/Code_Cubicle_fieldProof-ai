import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { createOrganizationTx, hashToken, issueSetupToken, membershipsFor, setupUrl } from './org.service.js';
import { mailService, passwordResetMail } from './mail.service.js';

const publicUser = { id: true, name: true, email: true, organizationName: true, role: true, createdAt: true } as const;

export const authService = {
  /** Public sign-up creates the person's own organization; team members are added by an admin instead. */
  async register(input: { name: string; email: string; password: string; organizationName?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new AppError(409, 'An account with this email already exists');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const organizationName = input.organizationName?.trim() || null;
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash, organizationName, passwordSetAt: new Date() },
        select: publicUser,
      });
      await createOrganizationTx(tx, {
        name: organizationName ?? `${input.name}'s workspace`,
        personal: !organizationName,
        ownerId: user.id,
      });
      return user;
    });
  },
  /** Looks up a setup/reset token without consuming it (for the "choose a password" page). */
  async setupPreview(token: string) {
    const setup = await prisma.accountSetup.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { select: { name: true, email: true, memberships: { where: { status: 'ACTIVE' }, select: { role: true, organization: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    if (!setup || setup.usedAt || setup.expiresAt.getTime() <= Date.now())
      throw new AppError(404, 'This link is not valid any more. Ask your admin to send a new one.', undefined, 'SETUP_INVALID');
    const membership = setup.user.memberships[0];
    return { name: setup.user.name, email: setup.user.email, organization: membership?.organization.name ?? null, role: membership?.role ?? null };
  },
  /** Consumes a setup/reset token and sets the password. Race-safe: one winner per token. */
  async completeSetup(token: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    return prisma.$transaction(async (tx) => {
      const setup = await tx.accountSetup.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!setup || setup.expiresAt.getTime() <= Date.now())
        throw new AppError(404, 'This link is not valid any more. Ask your admin to send a new one.', undefined, 'SETUP_INVALID');
      const claimed = await tx.accountSetup.updateMany({ where: { id: setup.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new AppError(410, 'This link has already been used', undefined, 'SETUP_USED');
      return tx.user.update({ where: { id: setup.userId }, data: { passwordHash, passwordSetAt: new Date() }, select: publicUser });
    });
  },
  /** Always answers the same, so the form cannot be used to find out which emails exist. */
  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!user) return { emailSent: false, setupLink: null };
    const token = await prisma.$transaction((tx) => issueSetupToken(tx, user.id, null, 2 * 60 * 60 * 1000));
    const { sent } = await mailService.send(passwordResetMail({ to: email, name: user.name, url: setupUrl(token) }));
    // Without email configured, the link is only logged on the server, never returned.
    return { emailSent: sent, setupLink: null };
  },
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'Invalid email or password');
    }
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  },
  token(userId: string) {
    return jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: '7d', issuer: 'fieldproof-api' });
  },
  getUser(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  },
  memberships: membershipsFor,
};
