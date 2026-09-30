import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-black/15 bg-white/60 px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-ink text-lime"><Icon size={22}/></span><h3 className="mt-5 font-display text-lg font-bold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone">{description}</p>{action&&<div className="mt-6">{action}</div>}</div>;
}
