import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
// Audit, membership and clustering writes serialize per organization or project
// with advisory locks, so a transaction may queue briefly behind another. The
// defaults (2 s to start, 5 s to finish) are too tight for bursts of uploads.
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 20_000 } });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
