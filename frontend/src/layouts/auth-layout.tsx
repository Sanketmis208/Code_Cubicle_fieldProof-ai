import { Outlet, Link } from "react-router-dom";
import { ArrowLeft, Check, FileCheck2, ScanLine, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";

export function AuthLayout() {
  return (
    <div className="relative grid min-h-screen overflow-hidden bg-[#f2f0e8] lg:grid-cols-[1.08fr_.92fr]">
      <div className="grain pointer-events-none fixed inset-0 z-50 opacity-30" />
      <section className="relative hidden min-h-screen overflow-hidden bg-ink p-8 text-white lg:flex lg:flex-col xl:p-12">
        <div className="grid-glow absolute inset-0 opacity-50" />
        <div className="absolute -left-32 top-1/3 size-[520px] rounded-full bg-emerald-400/15 blur-[110px]" />
        <div className="absolute -bottom-48 -right-36 size-[600px] rounded-full bg-lime/10 blur-[100px]" />
        <div className="relative z-10 flex items-center justify-between">
          <Brand light />
          <span className="eyebrow text-white/35">Evidence system / 2026</span>
        </div>
        <div className="relative z-10 my-auto grid items-center gap-8 xl:grid-cols-[1fr_.78fr]">
          <div>
            <span className="eyebrow inline-flex items-center gap-2 text-lime"><Sparkles size={14} />Source-aware intelligence</span>
            <h1 className="mt-6 max-w-2xl font-display text-[clamp(3.4rem,6vw,6.7rem)] font-extrabold uppercase leading-[.84] tracking-[-.07em]">Evidence<br/><span className="text-lime">you can</span><br/>stand behind.</h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-white/50">Organize every frame, surface visible change, and preserve the source behind every generated story.</p>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/65">
              {["Private by default", "Traceable outputs", "Conservative AI"].map((item) => <span key={item} className="flex items-center gap-2"><Check size={14} className="text-lime" />{item}</span>)}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-xs">
            <div className="orbit-slow absolute -inset-9 rounded-full border border-dashed border-white/15"><span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6b35]" /></div>
            <div className="float-slow relative aspect-[.72] rotate-2 rounded-[32px] border border-white/10 bg-white/[.07] p-4 shadow-2xl backdrop-blur">
              <div className="relative h-[62%] overflow-hidden rounded-[23px] bg-[linear-gradient(145deg,#a4c983_0%,#397a5e_48%,#12382f_100%)]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(200,255,79,.3),transparent_35%)]"/><span className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-[9px] font-bold uppercase tracking-wider">Field evidence</span><ScanLine className="absolute bottom-4 right-4 text-lime" /></div>
              <div className="mt-4 rounded-2xl bg-lime p-4 text-ink"><p className="eyebrow opacity-55">Observation</p><p className="mt-2 text-sm font-bold">Visible vegetation and restored boundary markers.</p></div>
              <div className="mt-3 flex items-center gap-2 text-[10px] text-white/45"><FileCheck2 size={13} className="text-lime" />Linked to original source record</div>
            </div>
          </div>
        </div>
        <div className="relative z-10 flex items-center justify-between text-[10px] uppercase tracking-[.18em] text-white/30"><span>FieldProof AI</span><span>Observe · Organize · Report</span></div>
      </section>
      <section className="relative flex min-h-screen flex-col px-5 py-6 sm:px-8 md:px-12 lg:px-14 xl:px-20">
        <div className="map-grid absolute inset-0 opacity-35 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/60 px-4 py-2 text-xs font-bold uppercase tracking-[.12em] transition hover:bg-white"><ArrowLeft size={14}/>Home</Link>
          <div className="lg:hidden"><Brand /></div>
          <span className="eyebrow hidden text-stone sm:block">Secure workspace access</span>
        </div>
        <div className="route-enter relative m-auto w-full max-w-md py-12"><Outlet /></div>
        <p className="relative text-center text-[10px] font-bold uppercase tracking-[.18em] text-stone/70">Encrypted session · Your evidence stays yours</p>
      </section>
    </div>
  );
}
