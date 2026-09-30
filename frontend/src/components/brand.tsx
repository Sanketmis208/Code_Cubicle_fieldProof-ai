import { Leaf } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return <Link to="/" className={cn('group inline-flex items-center gap-3 font-display font-extrabold tracking-[-.04em]', light ? 'text-white' : 'text-ink')}>
    <span className="grid size-10 place-items-center rounded-full bg-lime text-ink transition duration-500 group-hover:rotate-12 group-hover:scale-105"><Leaf size={18} strokeWidth={2.6}/></span>
    {!compact && <span className="text-lg">FIELDPROOF<span className={light ? "text-white/35" : "text-stone"}> / AI</span></span>}
  </Link>;
}
