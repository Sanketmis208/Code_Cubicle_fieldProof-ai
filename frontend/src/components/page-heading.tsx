import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="relative mb-9 overflow-hidden rounded-[30px] border border-black/[.08] bg-white/50 px-5 py-7 shadow-[0_1px_0_white] backdrop-blur-sm sm:flex sm:items-end sm:justify-between sm:gap-6 md:px-7 md:py-8"><div className="map-grid pointer-events-none absolute inset-0 opacity-25"/><div className="relative">{eyebrow&&<p className="eyebrow mb-3 text-emerald-700">{eyebrow} / FieldProof</p>}<h1 className="font-display text-4xl font-extrabold uppercase leading-none tracking-[-.055em] md:text-5xl">{title}</h1>{description&&<p className="mt-3 max-w-2xl text-sm leading-6 text-stone">{description}</p>}</div>{action&&<div className="relative mt-5 shrink-0 sm:mt-0">{action}</div>}</div>;
}
