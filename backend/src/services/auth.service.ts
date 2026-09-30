import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

const publicUser = { id: true, name: true, email: true, organizationName: true, role: true, createdAt: true } as const;

export const authService = {
  async register(input: { name: string; email: string; password: string; organizationName?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new AppError(409, 'An account with this email already exists');
    const passwordHash = await bcrypt.hash(input.password, 12);
    return prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, organizationName: input.organizationName || null },
      select: publicUser,
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
};
