import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";
import { useState } from "react";
import toast from "react-hot-toast";
import { reportsApi } from "@/api/intelligence";
import { projectsApi } from "@/api/projects";
import { PageHeading } from "@/components/page-heading";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { ReportType } from "@/types";

const reportTypes: Array<[ReportType, string]> = [
  ["IMPACT_SUMMARY", "Impact summary"],
  ["PROJECT_UPDATE", "Project update"],
  ["DONOR_REPORT", "Donor report"],
  ["CAMPAIGN_BRIEF", "Campaign brief"],
  ["CUSTOM", "Custom evidence report"],
];

export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get("projectId") || "";
  const selectedId = params.get("reportId") || "";
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState<ReportType>("IMPACT_SUMMARY");
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const reports = useQuery({ queryKey: ["reports", projectId], queryFn: () => reportsApi.list(projectId || undefined) });
  const detail = useQuery({ queryKey: ["report", selectedId], queryFn: () => reportsApi.get(selectedId), enabled: Boolean(selectedId) });
  const create = useMutation({
    mutationFn: reportsApi.create,
    onSuccess: ({ report }) => {
      toast.success("Evidence-backed report generated");
      setComposerOpen(false);
      setTitle("");
      setParams({ reportId: report.id, ...(projectId && { projectId }) });
      void qc.invalidateQueries({ queryKey: ["reports"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: reportsApi.remove,
    onSuccess: () => {
      toast.success("Report deleted");
      setParams(projectId ? { projectId } : {});
      void qc.invalidateQueries({ queryKey: ["reports"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["project"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (selectedId) {
    if (detail.isLoading) return <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-stone" /></div>;
    if (!detail.data) return <EmptyState icon={FileText} title="Report unavailable" description="This report could not be loaded or is no longer available." />;
    const report = detail.data.report;
    const content = report.content;
    return <>
      <button onClick={() => setParams(projectId ? { projectId } : {})} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-stone hover:text-ink"><ArrowLeft size={16} />All reports</button>
      <article className="card overflow-hidden">
        <header className="bg-ink p-6 text-white md:p-9"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-lime">{report.reportType.replaceAll("_", " ")}</p><h1 className="mt-3 font-display text-3xl font-bold">{report.title}</h1><p className="mt-2 text-sm text-white/60">{report.project.name} · Generated {format(new Date(report.createdAt), "PPp")}</p></div><button aria-label="Delete report" onClick={() => window.confirm("Delete this generated report?") && remove.mutate(report.id)} className="rounded-xl border border-white/15 p-2.5 text-white/70 hover:bg-white/10"><Trash2 size={17} /></button></div></header>
        <div className="space-y-8 p-6 md:p-9">
          <ReportSection title="Executive summary" text={content.executiveSummary} />
          <div className="grid gap-6 lg:grid-cols-2"><ReportList title="Documented activities" items={content.documentedActivities} /><ReportList title="Visible observations" items={content.visibleObservations} /><ReportList title="Comparison findings" items={content.comparisonFindings} /><ReportList title="Evidence gaps" items={content.evidenceGaps} caution /></div>
          <section className="rounded-2xl bg-fog p-5"><h2 className="font-display text-lg font-bold">Methodology</h2><p className="mt-3 text-sm leading-7 text-stone">{content.methodologyNote}</p><p className="mt-4 flex items-start gap-2 text-xs leading-5 text-amber-800"><ShieldCheck size={15} className="mt-0.5 shrink-0" />{content.disclaimer}</p></section>
          <section><h2 className="font-display text-lg font-bold">Source evidence</h2><p className="mt-1 text-sm text-stone">Every report statement remains connected to its original Cloudinary-backed record.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{report.evidence?.map((asset) => <Link key={asset.id} to={`/app/library?q=${encodeURIComponent(asset.originalFilename)}`} className="rounded-xl border border-black/[.07] p-4 transition hover:border-emerald-600/30 hover:bg-emerald-50/40"><p className="truncate text-sm font-bold">{asset.originalFilename}</p><p className="mt-1 text-xs text-stone">{format(new Date(asset.capturedAt || asset.createdAt), "PP")} · {asset.resourceType.toLowerCase()}</p><p className="mt-3 text-xs font-bold text-emerald-700">Open traceable evidence →</p></Link>)}</div></section>
        </div>
      </article>
    </>;
  }
  return <>
    <PageHeading eyebrow="Communicate evidence" title="Reports" description="Generate stakeholder-ready narratives that remain traceable to source evidence and clearly state uncertainty." action={<Button onClick={() => setComposerOpen((value) => !value)}><Plus size={16} />Generate report</Button>} />
    {composerOpen && <section className="card mb-6 p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-lg font-bold">Generate evidence report</h2><p className="mt-1 text-sm text-stone">The model receives stored metadata and analyses—not unsupported external claims.</p></div><button onClick={() => setComposerOpen(false)} className="text-sm font-semibold text-stone">Close</button></div><div className="mt-5 grid gap-4 md:grid-cols-3"><div><label className="label" htmlFor="report-project">Project</label><select id="report-project" className="field" value={projectId} onChange={(event) => setParams(event.target.value ? { projectId: event.target.value } : {})}><option value="">Choose a project</option>{projects.data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div><label className="label" htmlFor="report-type">Report type</label><select id="report-type" className="field" value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>{reportTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label className="label" htmlFor="report-title">Title</label><input id="report-title" className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="September field update" maxLength={160} /></div></div><div className="mt-5 flex justify-end"><Button disabled={!projectId || title.trim().length < 3 || create.isPending} onClick={() => create.mutate({ projectId, title: title.trim(), reportType })}>{create.isPending ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}Generate from evidence</Button></div></section>}
    {reports.isLoading ? <div className="grid h-56 place-items-center"><Loader2 className="animate-spin text-stone" /></div> : reports.isError ? <div className="card p-8 text-center text-sm text-red-700">Reports could not be loaded. Please retry.</div> : !reports.data?.reports.length ? <EmptyState icon={FileText} title="No reports yet" description="Generate a report after uploading evidence. Reports stay linked to their source assets." action={<Button onClick={() => setComposerOpen(true)}><Plus size={16} />Generate first report</Button>} /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{reports.data.reports.map((report) => <button key={report.id} onClick={() => setParams({ reportId: report.id, ...(projectId && { projectId }) })} className="card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-soft"><span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><FileText size={19} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-emerald-700">{report.reportType.replaceAll("_", " ")}</p><h2 className="mt-2 font-display text-xl font-bold">{report.title}</h2><p className="mt-2 text-sm text-stone">{report.project.name}</p><div className="mt-5 border-t border-black/[.06] pt-4 text-xs text-stone">Updated {format(new Date(report.updatedAt), "PP")}</div></button>)}</div>}
  </>;
}

function ReportSection({ title, text }: { title: string; text: string }) { return <section><h2 className="font-display text-xl font-bold">{title}</h2><p className="mt-3 text-sm leading-7 text-ink/80">{text}</p></section>; }
function ReportList({ title, items, caution = false }: { title: string; items: string[]; caution?: boolean }) { return <section className={`rounded-2xl p-5 ${caution ? "bg-amber-50" : "bg-fog"}`}><h2 className="font-display text-lg font-bold">{title}</h2>{items.length ? <ul className="mt-3 space-y-2 text-sm leading-6 text-stone">{items.map((item) => <li key={item}>• {item}</li>)}</ul> : <p className="mt-3 text-sm text-stone">None documented.</p>}</section>; }
