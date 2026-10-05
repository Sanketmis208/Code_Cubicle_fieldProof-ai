import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REVIEW_INFO, TRUST_INFO } from '@/lib/trust';
import type { ReviewStatus, TrustStatus } from '@/types';

export function TrustBadge({ status = 'NOT_ASSESSED', score, compact = false, className }: { status?: TrustStatus; score?: number | null; compact?: boolean; className?: string }) {
  const info = TRUST_INFO[status];
  const Icon = status === 'NEEDS_SECOND_LOOK' ? ShieldAlert : status === 'NOT_ASSESSED' ? ShieldQuestion : ShieldCheck;
  return (
    <span title={`Trust: ${info.label}${score != null ? ` (${score}/100)` : ''}`} className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold', info.tone, className)}>
      <Icon size={12} />
      {score != null && <span className="tabular-nums">{score}</span>}
      {!compact && <span>{info.label}</span>}
    </span>
  );
}

export function ReviewBadge({ status = 'PENDING' }: { status?: ReviewStatus }) {
  const info = REVIEW_INFO[status];
  return <span className={cn('inline-flex rounded-full px-2 py-1 text-[11px] font-bold', info.tone)}>{info.label}</span>;
}
