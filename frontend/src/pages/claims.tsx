import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, SearchCheck, XCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { projectsApi } from "@/api/projects";
import { claimsApi } from "@/api/trust";
import { EvidenceCard } from "@/components/evidence-card";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Asset, ClaimVerdict } from "@/types";

const VERDICT: Record<ClaimVerdict, { label: string; tone: string; icon: typeof CheckCircle2; line: string }> = {
  SUPPORTED: { label: "Supported", tone: "bg-emerald-50 text-emerald-900", icon: CheckCircle2, line: "Reviewer-approved, trustworthy evidence backs this claim." },
  PARTIAL: { label: "Partly supported", tone: "bg-amber-50 text-amber-900", icon: AlertTriangle, line: "Some evidence exists, but part of the claim is not yet backed." },
  UNSUPPORTED: { label: "Not supported", tone: "bg-red-50 text-red-900", icon: XCircle, line: "No evidence in your library backs this claim." },
};

/** Paste a sentence from a donor report; see the evidence behind it and what is missing. */
export function ClaimsPage() {
  const [claim, setClaim] = useState("");
  const [projectId, setProjectId] = useState("");
  const [open, setOpen] = useState<Asset | null>(null);
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const check = useMutation({ mutationFn: () => claimsApi.check(claim.trim(), projectId || undefined), onError: (error) => toast.error(error.message) });
  const submit = (event: FormEvent) => { event.preventDefault(); if (claim.trim().length >= 8) check.mutate(); };
  const result = check.data;
  const verdict = result && VERDICT[result.verdict];
  return (
    <>
      <PageHeading eyebrow="Before you send it" title="Claim checker" description="Paste a sentence from a donor report or a social post. FieldProof finds the evidence behind it, says how trustworthy it is, and names what is missing." />
      <form className="card space-y-4 p-6" onSubmit={submit}>
        <textarea aria-label="Claim to check" className="field min-h-28 text-base" value={claim} onChange={(event) => setClaim(event.target.value)} maxLength={600}
          placeholder="We planted 500 saplings in Bassi in August 2026." />
        <div className="flex flex-col gap-3 sm:flex-row">
          <select aria-label="Project" className="field sm:max-w-xs" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">All my projects</option>
            {projects.data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <Button disabled={claim.trim().length < 8 || check.isPending}>{check.isPending ? <Loader2 size={16} className="animate-spin" /> : <SearchCheck size={16} />}Check claim</Button>
        </div>
      </form>
      {result && verdict && (
        <div className="mt-6 space-y-6">
          <section className={cn("rounded-[26px] p-6", verdict.tone)}>
            <div className="flex items-center gap-3"><verdict.icon size={26} /><h2 className="font-display text-2xl font-bold">{verdict.label}</h2></div>
            <p className="mt-2 text-sm">{verdict.line}</p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              {([["Matching items", result.counts.matching], ["Events", result.counts.events], ["Approved", result.counts.approved], ["Strong or moderate", result.counts.trusted], ["Inside a site", result.counts.insideSite], ["Need a second look", result.counts.needsSecondLook]] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/70 p-3"><dt className="text-xs opacity-70">{label}</dt><dd className="font-display text-2xl font-bold">{value}</dd></div>
              ))}
            </dl>
          </section>
          {result.gaps.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-lg font-bold">What is missing</h2>
              <ul className="mt-3 space-y-2 text-sm">{result.gaps.map((gap) => <li key={gap} className="flex gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />{gap}</li>)}</ul>
            </section>
          )}
          <section>
            <h2 className="mb-3 font-display text-lg font-bold">Evidence behind it</h2>
            <p className="mb-4 text-xs text-stone">Understood as: {[...result.intent.activities, ...result.intent.locationTerms].join(", ") || "general terms"}{result.intent.dateFrom || result.intent.dateTo ? ` · ${result.intent.dateFrom ?? "…"} to ${result.intent.dateTo ?? "…"}` : ""}</p>
            {result.evidence.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {result.evidence.map((asset) => <EvidenceCard key={asset.id} asset={asset} onOpen={() => setOpen(asset)} onToggle={() => setOpen(asset)} />)}
              </div>
            ) : <p className="text-sm text-stone">Nothing matched.</p>}
          </section>
        </div>
      )}
      <AssetDetailDialog asset={open} onClose={() => setOpen(null)} />
    </>
  );
}
