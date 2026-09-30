import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Cloud,
  FileText,
  Fingerprint,
  GitCompareArrows,
  Layers3,
  MapPin,
  Play,
  ScanSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";

gsap.registerPlugin(ScrollTrigger);

const capabilities = [
  [Cloud, "Ingest", "Secure originals", "Validated images and videos land in project-specific evidence streams."],
  [ScanSearch, "Understand", "Visual intelligence", "Conservative AI observations surface activities, signals, and uncertainty."],
  [Layers3, "Organize", "Evidence, in context", "Search by project, place, time, activity, and persisted analysis."],
  [GitCompareArrows, "Compare", "Visible change", "Before-and-after evidence remains connected to both source assets."],
  [FileText, "Report", "Grounded stories", "Stakeholder-ready narratives cite the records they were generated from."],
] as const;

const ticker = ["SOURCE TRACEABILITY", "VISUAL INTELLIGENCE", "PROJECT TIMELINES", "VISIBLE CHANGE", "GROUNDED REPORTS"];

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!root.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .from(".hero-nav", { y: -24, opacity: 0, duration: 0.7 })
        .from(".hero-kicker", { y: 18, opacity: 0, duration: 0.55 }, "-=.3")
        .from(".hero-line", { yPercent: 115, rotate: 2, duration: 1, stagger: 0.1 }, "-=.25")
        .from(".hero-copy", { y: 24, opacity: 0, duration: 0.65 }, "-=.45")
        .from(".hero-actions", { y: 20, opacity: 0, duration: 0.55 }, "-=.4")
        .from(".evidence-stage", { clipPath: "inset(50% 50% 50% 50% round 40px)", rotate: 5, duration: 1.2 }, "-=.9")
        .from(".stage-chip", { scale: 0.75, opacity: 0, stagger: 0.12, duration: 0.5 }, "-=.45");

      gsap.to(".stage-orbit", {
        rotate: 100,
        scrollTrigger: { trigger: ".hero-shell", start: "top top", end: "bottom top", scrub: 1.2 },
      });
      gsap.to(".evidence-stage", {
        yPercent: 14,
        scrollTrigger: { trigger: ".hero-shell", start: "top top", end: "bottom top", scrub: 1 },
      });
      gsap.utils.toArray<HTMLElement>(".scroll-reveal").forEach((element) => {
        gsap.from(element, {
          y: 52,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>(".capability-card").forEach((element, index) => {
        gsap.from(element, {
          y: 80,
          rotate: index % 2 ? 3 : -3,
          opacity: 0,
          duration: 0.8,
          delay: index * 0.05,
          scrollTrigger: { trigger: ".capability-grid", start: "top 82%", once: true },
        });
      });
      gsap.fromTo(
        ".manifesto-word",
        { color: "rgba(242,240,232,.12)" },
        {
          color: "#f2f0e8",
          stagger: 0.08,
          scrollTrigger: { trigger: ".manifesto", start: "top 70%", end: "bottom 65%", scrub: 1 },
        },
      );
    }, root);
    return () => context.revert();
  }, []);

  return (
    <div ref={root} className="overflow-hidden bg-[#f2f0e8] text-ink">
      <div className="grain pointer-events-none fixed inset-0 z-[90] opacity-30" />
      <header className="hero-nav absolute inset-x-0 top-0 z-50 px-4 py-4 md:px-8 md:py-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between rounded-full border border-black/10 bg-[#f2f0e8]/75 px-4 py-2.5 shadow-[0_12px_50px_rgba(11,23,20,.08)] backdrop-blur-xl md:px-6">
          <Brand />
          <nav className="hidden items-center gap-7 text-xs font-bold uppercase tracking-[.16em] lg:flex">
            <a className="transition hover:text-emerald-700" href="#system">System</a>
            <a className="transition hover:text-emerald-700" href="#workflow">Workflow</a>
            <a className="transition hover:text-emerald-700" href="#trust">Trust</a>
          </nav>
          <div className="flex items-center gap-1.5">
            <Link to="/sign-in" className="hidden rounded-full px-4 py-2 text-sm font-bold transition hover:bg-black/[.05] sm:block">Sign in</Link>
            <Link to="/sign-up" className="group inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-emerald-950 md:px-5">
              Start now <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-shell relative min-h-[960px] overflow-hidden px-5 pb-20 pt-32 md:px-8 md:pt-40 lg:min-h-screen">
          <div className="map-grid absolute inset-0 opacity-45 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]" />
          <div className="absolute -left-28 top-28 size-80 rounded-full bg-lime/35 blur-[90px]" />
          <div className="absolute -right-28 bottom-0 size-[420px] rounded-full bg-[#ff6b35]/15 blur-[110px]" />
          <div className="relative mx-auto grid max-w-[1500px] gap-14 lg:grid-cols-[1.12fr_.88fr] lg:items-center">
            <div className="relative z-10">
              <div className="hero-kicker eyebrow inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/60 px-4 py-2">
                <span className="relative flex size-2">
                  <span className="pulse-ring absolute inset-0 rounded-full bg-emerald-500" />
                  <span className="relative size-2 rounded-full bg-emerald-600" />
                </span>
                Evidence intelligence for the field
              </div>
              <h1 className="mt-7 font-display text-[clamp(3.9rem,8.2vw,9rem)] font-extrabold uppercase leading-[.82] tracking-[-.075em]">
                <span className="block overflow-hidden pb-[.08em]"><span className="hero-line block">Make every</span></span>
                <span className="block overflow-hidden pb-[.08em]"><span className="hero-line block text-emerald-700">frame count.</span></span>
              </h1>
              <div className="hero-copy mt-8 grid max-w-3xl gap-7 border-t border-black/15 pt-6 sm:grid-cols-[1fr_auto] sm:items-end">
                <p className="max-w-xl text-base leading-7 text-stone md:text-lg md:leading-8">
                  FieldProof turns scattered photos and videos into searchable, source-traceable evidence—without turning visual observations into unsupported claims.
                </p>
                <div className="hidden text-right sm:block">
                  <p className="font-display text-2xl font-extrabold">01—05</p>
                  <p className="eyebrow mt-1 text-stone">Capture to report</p>
                </div>
              </div>
              <div className="hero-actions mt-8 flex flex-wrap gap-3">
                <Link to="/sign-up" className="group inline-flex items-center gap-3 rounded-full bg-ink px-6 py-4 font-bold text-white shadow-[0_18px_45px_rgba(11,23,20,.18)] transition hover:-translate-y-1 hover:bg-emerald-950">
                  Build your evidence layer <ArrowRight size={18} className="transition group-hover:translate-x-1" />
                </Link>
                <a href="#system" className="inline-flex items-center gap-3 rounded-full border border-black/15 bg-white/65 px-6 py-4 font-bold transition hover:-translate-y-1 hover:bg-white">
                  <Play size={17} fill="currentColor" /> Explore the system
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[620px] lg:mx-0">
              <div className="stage-orbit absolute -inset-12 rounded-full border border-dashed border-black/15">
                <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff6b35]" />
                <span className="absolute bottom-[12%] right-[4%] size-2 rounded-full bg-emerald-700" />
              </div>
              <div className="evidence-stage relative aspect-[4/5] overflow-hidden rounded-[40px] bg-ink p-4 shadow-[0_45px_120px_rgba(11,23,20,.28)] md:p-6">
                <div className="grid-glow absolute inset-0 opacity-70" />
                <div className="absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(circle_at_70%_0%,rgba(200,255,79,.28),transparent_60%)]" />
                <div className="relative flex items-start justify-between text-white">
                  <div><p className="eyebrow text-white/40">Evidence workspace / 2026</p><h2 className="mt-2 font-display text-2xl font-bold">Riverbank renewal</h2></div>
                  <span className="rounded-full border border-lime/30 bg-lime/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-lime">Live record</span>
                </div>
                <div className="relative mt-8 grid h-[62%] grid-cols-2 gap-3">
                  <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(145deg,#90714e_0%,#526b52_48%,#193c31_100%)]">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_90%,rgba(238,203,148,.55),transparent_35%)]" />
                    <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white">Before / Jan</span>
                    <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-white/15 bg-black/30 p-3 text-white backdrop-blur-md"><p className="eyebrow text-white/45">Source</p><p className="mt-1 text-xs font-bold">Original verified</p></div>
                  </div>
                  <div className="relative translate-y-8 overflow-hidden rounded-[22px] bg-[linear-gradient(145deg,#b5dd88_0%,#338463_45%,#0a4436_100%)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_35%,rgba(200,255,79,.35),transparent_38%)]" />
                    <span className="absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-[9px] font-bold uppercase tracking-wider text-white">After / Aug</span>
                    <div className="absolute bottom-3 left-3 right-3 rounded-2xl bg-lime p-3 text-ink"><p className="eyebrow opacity-55">Observation</p><p className="mt-1 text-xs font-bold">Vegetation appears denser</p></div>
                  </div>
                </div>
                <div className="relative mt-12 grid grid-cols-3 gap-2 text-white">
                  {["Traceable", "Organized", "Analyzed"].map((label, index) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[.05] p-3"><p className="font-display text-lg font-extrabold text-lime">0{index + 1}</p><p className="mt-1 text-[10px] text-white/55">{label}</p></div>)}
                </div>
              </div>
              <div className="stage-chip float-slow absolute -left-5 top-[42%] rounded-2xl border border-black/10 bg-[#ff6b35] p-4 text-white shadow-2xl md:-left-12">
                <MapPin size={18} /><p className="mt-3 text-xs font-bold">Context preserved</p><p className="mt-1 text-[10px] text-white/65">Place · Time · Activity</p>
              </div>
              <div className="stage-chip absolute -bottom-7 right-4 rounded-2xl border border-black/10 bg-white p-4 shadow-2xl md:-right-10 md:bottom-14">
                <div className="flex items-center gap-2"><Sparkles size={17} className="text-emerald-700" /><span className="eyebrow">AI observation</span></div><p className="mt-2 max-w-44 text-xs leading-5 text-stone">Grounded in the media. Uncertainty stays visible.</p>
              </div>
            </div>
          </div>
          <a href="#system" aria-label="Scroll to product system" className="absolute bottom-8 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[9px] font-bold uppercase tracking-[.25em] text-stone xl:flex">Scroll <ArrowDown size={14} /></a>
        </section>

        <section className="overflow-hidden border-y border-black/10 bg-lime py-4 text-ink">
          <div className="marquee-track flex w-max items-center">
            {[...ticker, ...ticker].map((item, index) => <div key={`${item}-${index}`} className="flex items-center"><span className="px-7 font-display text-2xl font-extrabold uppercase tracking-[-.04em] md:text-4xl">{item}</span><span className="size-2 rounded-full bg-ink" /></div>)}
          </div>
        </section>

        <section id="system" className="relative bg-ink px-5 py-28 text-[#f2f0e8] md:px-8 md:py-40">
          <div className="grid-glow absolute inset-0 opacity-35" />
          <div className="relative mx-auto max-w-[1500px]">
            <div className="scroll-reveal grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
              <div><p className="eyebrow text-lime">One connected evidence system</p><p className="mt-4 max-w-sm text-sm leading-6 text-white/45">Built for teams that need clarity, speed, and a defensible path back to every original file.</p></div>
              <h2 className="font-display text-[clamp(3rem,6vw,7rem)] font-extrabold uppercase leading-[.88] tracking-[-.06em]">From raw capture<br/><span className="text-lime">to credible story.</span></h2>
            </div>
            <div className="capability-grid mt-20 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {capabilities.map(([Icon, number, title, description], index) => (
                <article key={number} className={`capability-card group min-h-[360px] rounded-[30px] border border-white/10 p-6 transition duration-500 hover:-translate-y-3 ${index === 1 ? "bg-[#ff6b35] text-white" : index === 3 ? "bg-lime text-ink" : "bg-white/[.055]"}`}>
                  <div className="flex items-center justify-between"><span className="eyebrow opacity-55">0{index + 1} / {number}</span><Icon size={22} /></div>
                  <div className="mt-28"><h3 className="font-display text-2xl font-extrabold leading-tight">{title}</h3><p className={`mt-4 text-sm leading-6 ${index === 3 ? "text-ink/65" : "text-white/55"}`}>{description}</p></div>
                  <div className="mt-8 h-px origin-left scale-x-0 bg-current opacity-20 transition duration-500 group-hover:scale-x-100" />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="manifesto relative overflow-hidden bg-[#ff6b35] px-5 py-28 text-ink md:px-8 md:py-40">
          <div className="absolute -right-20 top-1/2 size-96 -translate-y-1/2 rounded-full border border-black/15" /><div className="absolute -right-8 top-1/2 size-60 -translate-y-1/2 rounded-full border border-black/15" />
          <div className="relative mx-auto max-w-[1300px]">
            <p className="eyebrow mb-8">The FieldProof principle</p>
            <h2 className="max-w-6xl font-display text-[clamp(2.8rem,6.2vw,6.8rem)] font-extrabold uppercase leading-[.92] tracking-[-.065em]">
              {"Observe what is visible. Preserve what is original. Claim only what the evidence supports.".split(" ").map((word, index) => <span className="manifesto-word mr-[.2em] inline-block" key={`${word}-${index}`}>{word}</span>)}
            </h2>
          </div>
        </section>

        <section id="workflow" className="relative px-5 py-28 md:px-8 md:py-40">
          <div className="map-grid absolute inset-0 opacity-35" />
          <div className="relative mx-auto max-w-[1500px]">
            <div className="scroll-reveal flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
              <div><p className="eyebrow text-emerald-700">A workflow that keeps its receipts</p><h2 className="mt-5 max-w-4xl font-display text-5xl font-extrabold uppercase leading-[.9] tracking-[-.06em] md:text-7xl">Every insight has a way back.</h2></div>
              <p className="max-w-md text-base leading-7 text-stone">Media, metadata, analysis, comparisons, and reports remain connected—so reviewers can inspect the original evidence instead of trusting a detached summary.</p>
            </div>
            <div className="mt-16 grid gap-5 lg:grid-cols-[1.18fr_.82fr]">
              <article className="scroll-reveal relative min-h-[560px] overflow-hidden rounded-[36px] bg-ink p-7 text-white md:p-10">
                <div className="grid-glow absolute inset-0 opacity-50" /><div className="absolute -bottom-36 -right-24 size-[480px] rounded-full bg-emerald-400/20 blur-[90px]" />
                <div className="relative flex items-start justify-between"><div><p className="eyebrow text-lime">Traceability chain</p><h3 className="mt-3 font-display text-3xl font-extrabold">One source. Every output.</h3></div><Fingerprint className="text-lime" size={34} /></div>
                <div className="relative mt-20 space-y-3">
                  {["Cloudinary original", "Validated media record", "Structured AI observation", "Saved comparison", "Grounded report"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.055] p-4 backdrop-blur"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-lime font-display text-sm font-extrabold text-ink">{index + 1}</span><p className="font-semibold">{item}</p>{index < 4 && <span className="ml-auto text-xs text-white/30">CONNECTED</span>}</div>)}
                </div>
              </article>
              <div className="grid gap-5">
                <article className="scroll-reveal rounded-[36px] bg-lime p-7 md:p-9"><ShieldCheck size={32} /><h3 className="mt-16 font-display text-3xl font-extrabold">Conservative by design.</h3><p className="mt-4 leading-7 text-ink/65">Prompts reject fabricated percentages, causal claims, measurements, and locations that are not supported by the stored record.</p></article>
                <article className="scroll-reveal rounded-[36px] border border-black/10 bg-white/70 p-7 md:p-9"><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-600"/><span className="eyebrow">Operational truth</span></div><h3 className="mt-12 font-display text-3xl font-extrabold">Real data. Real states.</h3><p className="mt-4 leading-7 text-stone">Dashboards and workflows reflect PostgreSQL records—not decorative demo metrics.</p></article>
              </div>
            </div>
          </div>
        </section>

        <section id="trust" className="px-5 pb-8 md:px-8">
          <div className="scroll-reveal relative mx-auto max-w-[1500px] overflow-hidden rounded-[42px] bg-ink px-7 py-20 text-center text-white md:px-14 md:py-28">
            <div className="grid-glow absolute inset-0 opacity-40" /><div className="absolute left-1/2 top-1/2 size-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime/10 blur-[100px]" />
            <div className="relative"><p className="eyebrow text-lime">Evidence deserves better infrastructure</p><h2 className="mx-auto mt-6 max-w-5xl font-display text-[clamp(3rem,7vw,7.8rem)] font-extrabold uppercase leading-[.85] tracking-[-.07em]">Build the proof<br/>behind the story.</h2><div className="mt-10 flex flex-wrap justify-center gap-3"><Link to="/sign-up" className="group inline-flex items-center gap-3 rounded-full bg-lime px-7 py-4 font-bold text-ink transition hover:scale-[1.03]">Create your workspace <ArrowRight size={18} className="transition group-hover:translate-x-1" /></Link><Link to="/sign-in" className="rounded-full border border-white/15 px-7 py-4 font-bold transition hover:bg-white/10">Sign in</Link></div><div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/45">{["Private by default", "Source-linked outputs", "Human-reviewable AI"].map((item) => <span key={item} className="flex items-center gap-2"><Check size={14} className="text-lime" />{item}</span>)}</div></div>
          </div>
        </section>
      </main>

      <footer className="px-5 py-10 md:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-6 border-t border-black/10 pt-8 md:flex-row md:items-center md:justify-between"><Brand /><p className="text-sm text-stone">© 2026 FieldProof AI · Built for defensible impact stories.</p><div className="flex gap-5 text-xs font-bold uppercase tracking-[.15em]"><a href="#system">System</a><a href="#trust">Trust</a></div></div>
      </footer>
    </div>
  );
}
