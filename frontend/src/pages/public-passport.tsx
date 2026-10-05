import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Fingerprint, Loader2, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { useParams } from "react-router-dom";
import { passportApi } from "@/api/trust";
import { Brand } from "@/components/brand";
import { TrustChecks } from "@/components/trust-panel";
import { ReviewBadge, TrustBadge } from "@/components/trust-badge";
import { FACT_SOURCE, SOURCE_INFO } from "@/lib/trust";

/**
 * What a donor sees after scanning a campaign card's QR code: proof that the
 * picture is real evidence, without exposing the people in it.
 */
export function PublicPassportPage() {
  const { token = "" } = useParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ["public-passport", token], queryFn: () => passportApi.public(token), retry: false });
  return (
    <div className="min-h-screen bg-[#f2f0e8]">
      <header className="flex items-center justify-between border-b border-black/[.07] px-5 py-4 md:px-10"><Brand /><span className="eyebrow text-stone">Evidence passport</span></header>
      <main className="mx-auto max-w-4xl px-5 py-8 md:py-12">
        {isLoading ? <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-stone" /></div>
          : isError || !data ? (
            <div className="card p-10 text-center">
              <h1 className="font-display text-2xl font-bold">This evidence link is not available</h1>
              <p className="mt-2 text-sm text-stone">It may have been withdrawn by the organization that published it.</p>
            </div>
          ) : <Passport passport={data.passport} />}
      </main>
    </div>
  );
}

function Passport({ passport }: { passport: NonNullable<Awaited<ReturnType<typeof passportApi.public>>>["passport"] }) {
  const verified = passport.review.status === "APPROVED";
  return (
    <article className="space-y-6">
      <div>
        <p className="eyebrow text-emerald-700">{passport.organization} · {passport.project}</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-[-.04em] md:text-5xl">{verified ? "Verified field evidence" : "Field evidence"}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-2"><TrustBadge status={passport.trustStatus} score={passport.trustScore} /><ReviewBadge status={passport.review.status} /><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-stone">{SOURCE_INFO[passport.captureSource].label}</span></div>
      </div>
      {passport.previewUrl && <img src={passport.previewUrl} alt="Evidence with faces blurred for privacy" className="max-h-[560px] w-full rounded-[26px] bg-ink object-contain" />}
      <p className="text-xs text-stone">Faces are blurred and the location is rounded to about 1 km to protect the people in this picture.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-3 p-6 text-sm">
          <h2 className="font-display text-xl font-bold">Facts</h2>
          <p className="flex gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-700" />{SOURCE_INFO[passport.captureSource].detail}</p>
          <p className="flex gap-2"><Sparkles size={16} className="mt-0.5 shrink-0 text-emerald-700" />{passport.capturedAt ? `Captured ${format(new Date(passport.capturedAt), "d MMM yyyy, HH:mm")} (from ${FACT_SOURCE[passport.capturedAtSource ?? ""] ?? "unknown"})` : `Uploaded ${format(new Date(passport.uploadedAt), "d MMM yyyy")}; capture time unknown`}</p>
          <p className="flex gap-2"><MapPin size={16} className="mt-0.5 shrink-0 text-emerald-700" />{passport.site ? `Inside site “${passport.site}”` : passport.approximateLocation ? `Near ${passport.approximateLocation.latitude}, ${passport.approximateLocation.longitude}` : "No location recorded"}</p>
          {passport.sha256 && <p className="flex gap-2"><Fingerprint size={16} className="mt-0.5 shrink-0 text-emerald-700" /><span className="break-all font-mono text-xs">SHA-256 {passport.sha256}</span></p>}
          {passport.review.reviewedAt && <p className="text-xs text-stone">Reviewed by the organization on {format(new Date(passport.review.reviewedAt), "d MMM yyyy")}.</p>}
          {passport.observation && <p className="rounded-xl bg-fog p-3 text-stone"><strong className="text-ink">Observed:</strong> {passport.observation.summary}</p>}
        </section>
        <section className="card p-6"><h2 className="mb-4 font-display text-xl font-bold">Checks</h2><TrustChecks checks={passport.checks} linkRelated={false} /></section>
      </div>
      {passport.derived.length > 0 && (
        <section className="card p-6 text-sm">
          <h2 className="font-display text-xl font-bold">Published from this evidence</h2>
          <p className="mt-1 text-stone">Each file is a reproducible Cloudinary transformation of the original.</p>
          <ul className="mt-4 space-y-2">{passport.derived.map((item) => <li key={item.url} className="rounded-xl border border-black/[.07] p-3"><div className="flex justify-between gap-3"><span className="font-semibold capitalize">{item.kind.replace("_", " ").toLowerCase()}</span><a className="text-xs font-bold text-emerald-700" href={item.url} target="_blank" rel="noreferrer">Open</a></div><code className="mt-1 block max-h-16 overflow-y-auto break-all text-[11px] text-stone">{item.transformation}</code></li>)}</ul>
        </section>
      )}
      <p className="text-center text-[11px] text-stone">Verified with FieldProof AI · media powered by Cloudinary</p>
    </article>
  );
}
