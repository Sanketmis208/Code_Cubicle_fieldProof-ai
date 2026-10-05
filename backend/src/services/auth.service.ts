import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';
import { assertInviteUsable, createOrganizationTx, membershipsFor, redeemInviteTx } from './org.service.js';

const publicUser = { id: true, name: true, email: true, organizationName: true, role: true, createdAt: true } as const;

export const authService = {
  /**
   * Sign-up either joins an existing organization (invite code) or creates the
   * user's own. With an invite there is no personal workspace: a field worker
   * should land straight in their NGO.
   */
  async register(input: { name: string; email: string; password: string; organizationName?: string; inviteCode?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new AppError(409, 'An account with this email already exists');
    if (input.inviteCode) await assertInviteUsable(input.inviteCode, input.email);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const organizationName = input.organizationName?.trim() || null;
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash, organizationName },
        select: publicUser,
      });
      if (input.inviteCode) await redeemInviteTx(tx, input.inviteCode, user);
      else
        await createOrganizationTx(tx, {
          name: organizationName ?? `${input.name}'s workspace`,
          personal: !organizationName,
          ownerId: user.id,
        });
      return user;
    });
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
