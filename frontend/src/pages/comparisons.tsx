import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, GitCompareArrows, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import { useId, useState } from "react";
import toast from "react-hot-toast";
import { comparisonsApi } from "@/api/intelligence";
import { projectsApi } from "@/api/projects";
import { assetsApi } from "@/api/assets";
import { PageHeading } from "@/components/page-heading";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cloudinaryThumbnail } from "@/lib/cloudinary";

export function ComparisonsPage() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("projectId") || "";
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const assets = useQuery({
    queryKey: ["comparison-assets", projectId],
    queryFn: () => assetsApi.list({ projectId, limit: 48, sort: "oldest" }),
    enabled: Boolean(projectId),
  });
  const comparisons = useQuery({
    queryKey: ["comparisons", projectId],
    queryFn: () => comparisonsApi.list(projectId || undefined),
  });
  const create = useMutation({
    mutationFn: comparisonsApi.create,
    onSuccess: ({ cached }) => {
      toast.success(cached ? "This comparison already exists" : "Visible-change analysis completed");
      setComposerOpen(false);
      setBeforeId("");
      setAfterId("");
      void qc.invalidateQueries({ queryKey: ["comparisons"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: comparisonsApi.remove,
    onSuccess: () => {
      toast.success("Comparison removed");
      void qc.invalidateQueries({ queryKey: ["comparisons"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const evidence = assets.data?.assets ?? [];
  const selectedProject = projects.data?.projects.find((project) => project.id === projectId);
  return (
    <>
      <PageHeading
        eyebrow="Measure visible change"
        title="Before & after"
        description="Compare two traceable evidence records without turning visual observations into unsupported impact claims."
        action={<Button onClick={() => setComposerOpen((value) => !value)}><Plus size={16} />New comparison</Button>}
      />
      {composerOpen && (
        <section className="card mb-6 p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><h2 className="font-display text-lg font-bold">Create visible-change analysis</h2><p className="mt-1 text-sm text-stone">Choose chronological evidence from the same project. Videos use a representative frame.</p></div>
            <button onClick={() => setComposerOpen(false)} className="text-sm font-semibold text-stone">Close</button>
          </div>
          <label className="label mt-5" htmlFor="comparison-project">Project</label>
          <select id="comparison-project" className="field" value={projectId} onChange={(event) => { setParams(event.target.value ? { projectId: event.target.value } : {}); setBeforeId(""); setAfterId(""); }}>
            <option value="">Choose a project</option>
            {projects.data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          {projectId && evidence.length < 2 && !assets.isLoading && (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This project needs at least two evidence assets. <Link className="font-bold underline" to={`/app/projects/${projectId}`}>Upload more evidence</Link>.</div>
          )}
          {evidence.length >= 2 && (
            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_auto_1fr] lg:items-end">
              <EvidenceSelect label="Before evidence" value={beforeId} onChange={setBeforeId} evidence={evidence} exclude={afterId} />
              <ArrowRight className="mx-auto mb-3 hidden text-stone lg:block" />
              <EvidenceSelect label="After evidence" value={afterId} onChange={setAfterId} evidence={evidence} exclude={beforeId} />
            </div>
          )}
          <div className="mt-5 flex items-center justify-between gap-4 border-t border-black/[.06] pt-5">
            <p className="flex items-center gap-2 text-xs text-stone"><ShieldCheck size={15} />AI reports visible differences and limitations, not scientific causation.</p>
            <Button disabled={!projectId || !beforeId || !afterId || create.isPending} onClick={() => create.mutate({ projectId, beforeAssetId: beforeId, afterAssetId: afterId })}>
              {create.isPending ? <Loader2 className="animate-spin" size={16} /> : <GitCompareArrows size={16} />}Analyze change
            </Button>
          </div>
        </section>
      )}
      {comparisons.isLoading ? <div className="grid h-56 place-items-center"><Loader2 className="animate-spin text-stone" /></div> : comparisons.isError ? <div className="card p-8 text-center text-sm text-red-700">Comparisons could not be loaded. Please retry.</div> : !comparisons.data?.comparisons.length ? (
        <EmptyState icon={GitCompareArrows} title="No comparisons yet" description="Create a project, collect at least two dated evidence records, and compare what is visibly different." action={<Button onClick={() => setComposerOpen(true)}><Plus size={16} />Create first comparison</Button>} />
      ) : (
        <div className="space-y-5">
          {selectedProject && <p className="text-sm text-stone">Showing comparisons for <strong>{selectedProject.name}</strong></p>}
          {comparisons.data.comparisons.map((comparison) => (
            <article key={comparison.id} className="card overflow-hidden">
              <div className="grid sm:grid-cols-2">
                {[comparison.beforeAsset, comparison.afterAsset].map((asset, index) => <Link key={asset.id} to={`/app/library?q=${encodeURIComponent(asset.originalFilename)}`} className="relative aspect-[16/8] overflow-hidden bg-ink"><img src={cloudinaryThumbnail(asset.secureUrl, 900, 450, asset.resourceType === "VIDEO")} alt={asset.description || asset.originalFilename} className="size-full object-cover opacity-90" /><span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">{index ? "After" : "Before"} · {format(new Date(asset.capturedAt || asset.createdAt), "MMM d, yyyy")}</span><span className="absolute bottom-3 left-3 max-w-[85%] truncate rounded-lg bg-white/90 px-2.5 py-1 text-xs font-semibold">{asset.originalFilename}</span></Link>)}
              </div>
              <div className="p-5 md:p-6">
                <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-emerald-700">{comparison.project.name}</p><h2 className="mt-2 font-display text-xl font-bold">Visible-change analysis</h2></div><div className="flex items-center gap-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{comparison.confidence != null ? `${Math.round(comparison.confidence * 100)}% confidence` : "Unscored"}</span><button aria-label="Delete comparison" onClick={() => window.confirm("Delete this comparison? The source evidence will remain.") && remove.mutate(comparison.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16} /></button></div></div>
                <p className="mt-4 text-sm leading-7 text-ink/80">{comparison.summary}</p>
                <div className="mt-5 grid gap-4 lg:grid-cols-2"><FindingList title="Visible changes" items={comparison.changes?.visibleChanges ?? []} /><FindingList title="Uncertainties & limitations" items={[...(comparison.changes?.uncertainties ?? []), ...(comparison.changes?.evidenceLimitations ?? [])]} caution /></div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function EvidenceSelect({ label, value, onChange, evidence, exclude }: { label: string; value: string; onChange: (value: string) => void; evidence: Awaited<ReturnType<typeof assetsApi.list>>['assets']; exclude: string }) {
  const id = useId();
  return <div><label className="label" htmlFor={id}>{label}</label><select id={id} className="field" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Select evidence</option>{evidence.filter((asset) => asset.id !== exclude).map((asset) => <option key={asset.id} value={asset.id}>{format(new Date(asset.capturedAt || asset.createdAt), "MMM d, yyyy")} · {asset.originalFilename}</option>)}</select></div>;
}

function FindingList({ title, items, caution = false }: { title: string; items: string[]; caution?: boolean }) {
  return <div className={`rounded-2xl p-4 ${caution ? "bg-amber-50" : "bg-fog"}`}><p className={`label ${caution ? "text-amber-800" : ""}`}>{title}</p>{items.length ? <ul className="space-y-2 text-sm text-stone">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="text-sm text-stone">None identified.</p>}</div>;
}
