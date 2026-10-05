import { type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const variants = cva('focus-ring inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-300 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0', {
  variants: {
    variant: { primary: 'bg-ink text-white shadow-[0_10px_24px_rgba(11,23,20,.12)] hover:bg-emerald-950', lime: 'bg-lime text-ink hover:bg-lime/90', outline: 'border border-black/10 bg-white/75 hover:bg-white', ghost: 'hover:bg-black/[.05]', danger: 'bg-red-600 text-white hover:bg-red-700' },
    size: { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-base', icon: 'size-10' },
  }, defaultVariants: { variant: 'primary', size: 'md' },
});

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof variants>;
export function Button({ className, variant, size, ...props }: Props) { return <button className={cn(variants({ variant, size }), className)} {...props} />; }
