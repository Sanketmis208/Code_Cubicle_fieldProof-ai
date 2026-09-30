import type { ProjectStatus } from '@/types';
import { cn } from '@/lib/utils';
const styles: Record<ProjectStatus,string> = { PLANNING:'bg-amber-50 text-amber-700',ACTIVE:'bg-emerald-50 text-emerald-700',COMPLETED:'bg-blue-50 text-blue-700',ARCHIVED:'bg-slate-100 text-slate-600' };
export function StatusBadge({ status }: { status: ProjectStatus }) { return <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold capitalize',styles[status])}>{status.toLowerCase()}</span>; }
