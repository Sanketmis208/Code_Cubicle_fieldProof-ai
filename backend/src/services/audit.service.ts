import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  organizationId: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/** JSON with sorted keys, so a hash survives JSONB reordering keys on the way back. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as object)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(',')}}`;
}

function entryHash(entry: {
  organizationId: string; actorId: string | null; action: string; entityType: string;
  entityId: string | null; metadata: unknown; createdAt: Date; prevHash: string | null;
}) {
  return createHash('sha256')
    .update(stableStringify({ ...entry, createdAt: entry.createdAt.toISOString() }))
    .digest('hex');
}

async function append(tx: Tx, entry: AuditEntry) {
  // Serialize writers per organization so two concurrent entries cannot both
  // link to the same predecessor and fork the chain.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entry.organizationId}))`;
  const previous = await tx.auditLog.findFirst({
    where: { organizationId: entry.organizationId },
    orderBy: { seq: 'desc' },
    select: { hash: true },
  });
  const record = {
    organizationId: entry.organizationId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: (entry.metadata ?? null) as Prisma.InputJsonValue | null,
    createdAt: new Date(),
    prevHash: previous?.hash ?? null,
  };
  await tx.auditLog.create({
    data: { ...record, metadata: record.metadata ?? undefined, hash: entryHash(record) },
  });
}

export const auditService = {
  /** Append inside an existing transaction (keeps the entry atomic with the change). */
  recordTx: append,

  /** Append on its own. Audit failure must never undo the user's action, so it only logs. */
  async record(entry: AuditEntry) {
    await prisma.$transaction((tx) => append(tx, entry)).catch((error: unknown) =>
      console.error('Audit log write failed:', error instanceof Error ? error.message : error),
    );
  },

  /** Recomputes the chain; returns the first broken entry, if any. */
  async verify(organizationId: string) {
    const entries = await prisma.auditLog.findMany({ where: { organizationId }, orderBy: { seq: 'asc' } });
    let prevHash: string | null = null;
    for (const entry of entries) {
      const expected = entryHash({
        organizationId: entry.organizationId, actorId: entry.actorId, action: entry.action,
        entityType: entry.entityType, entityId: entry.entityId, metadata: entry.metadata,
        createdAt: entry.createdAt, prevHash,
      });
      if (entry.prevHash !== prevHash || entry.hash !== expected)
        return { valid: false as const, entries: entries.length, brokenAt: entry.seq };
      prevHash = entry.hash;
    }
    return { valid: true as const, entries: entries.length, brokenAt: null };
  },
};
