import { CheckCircle2, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';
import { CHECK_LABEL, FACT_SOURCE, SOURCE_INFO } from '@/lib/trust';
import { cn } from '@/lib/utils';
import type { Asset, TrustCheck } from '@/types';
import { TrustBadge } from './trust-badge';

const RESULT_STYLE: Record<TrustCheck['result'], { icon: typeof Info; tone: string }> = {
  PASS: { icon: CheckCircle2, tone: 'text-emerald-700' },
  INFO: { icon: Info, tone: 'text-sky-700' },
  WARN: { icon: TriangleAlert, tone: 'text-amber-700' },
  FAIL: { icon: OctagonAlert, tone: 'text-red-700' },
};

/** Every point of the Trust Score, readable in ten seconds. */
export function TrustChecks({ checks, linkRelated = true }: { checks: Array<Pick<TrustCheck, 'check' | 'result' | 'message' | 'hard'> & Partial<TrustCheck>>; linkRelated?: boolean }) {
  if (!checks.length) return <p className="text-sm text-stone">Trust has not been assessed for this item yet.</p>;
  return (
    <ul className="space-y-2">
      {checks.map((check, index) => {
        const { icon: Icon, tone } = RESULT_STYLE[check.result];
        return (
          <li key={`${check.check}-${index}`} className={cn('flex gap-3 rounded-xl border p-3 text-sm', check.hard ? 'border-red-200 bg-red-50/60' : 'border-black/[.06] bg-white/70')}>
            <Icon size={17} className={cn('mt-0.5 shrink-0', tone)} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-stone">{CHECK_LABEL[check.check] ?? check.check}{check.weight ? <span className="ml-2 tabular-nums">{check.weight > 0 ? '+' : ''}{check.weight}</span> : null}</p>
              <p className="mt-0.5 leading-5 text-ink/85">{check.message}</p>
              {linkRelated && check.relatedAssetId && <Link to={`/app/evidence/${check.relatedAssetId}`} className="mt-1 inline-block text-xs font-bold text-emerald-700 hover:underline">Open the earlier evidence →</Link>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Where each fact about the evidence came from; "declared" facts are labelled as such. */
export function ProvenanceFacts({ asset }: { asset: Asset }) {
  const source = SOURCE_INFO[asset.captureSource ?? 'WEB_UPLOAD'];
  const rows: Array<[string, string]> = [
    ['Source', source.detail],
    ['Captured', asset.capturedAt ? `${format(new Date(asset.capturedAt), 'd MMM yyyy, HH:mm')} · from ${FACT_SOURCE[asset.capturedAtSource ?? ''] ?? 'unknown'}` : 'Unknown — upload time is used'],
    ['Location', asset.latitude != null && asset.longitude != null ? `${asset.latitude.toFixed(5)}, ${asset.longitude.toFixed(5)} · from ${FACT_SOURCE[asset.locationSource ?? ''] ?? 'unknown'}${asset.gpsAccuracyM ? ` (±${Math.round(asset.gpsAccuracyM)} m)` : ''}` : 'No GPS'],
    ['Site', asset.site?.name ?? 'Not inside a defined site'],
    ['Camera', [asset.exif?.make, asset.exif?.model].filter(Boolean).join(' ') || 'No camera metadata'],
    ['Fingerprint', asset.sha256 ? `SHA-256 ${asset.sha256.slice(0, 16)}…` : 'Not recorded'],
    ...(asset.capturedByName ? [['Captured by', `${asset.capturedByName} (declared by uploader)`] as [string, string]] : []),
    ...(asset.eventCluster && asset.eventCluster.assetCount > 1 ? [["Event", `One of ${asset.eventCluster.assetCount} shots of the same moment`] as [string, string]] : []),
  ];
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><TrustBadge status={asset.trustStatus} score={asset.trustScore} /><span className="text-xs text-stone">{source.label}</span></div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[120px_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents"><dt className="text-xs font-bold uppercase tracking-[.12em] text-stone">{label}</dt><dd className="break-words text-ink/85">{value}</dd></div>
        ))}
      </dl>
    </div>
  );
}
