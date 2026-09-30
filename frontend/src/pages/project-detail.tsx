import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Edit3,
  FileImage,
  FileText,
  GitCompareArrows,
  MapPin,
  Loader2,
  MoreHorizontal,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { useState, type ReactNode } from "react";
import { projectsApi } from "@/api/projects";
import { assetsApi } from "@/api/assets";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/loading-screen";
import { StatusBadge } from "@/components/status-badge";
import { UploadDialog } from "@/components/upload-dialog";
import { EvidenceCard } from "@/components/evidence-card";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import type { Asset } from "@/types";
import { cn } from "@/lib/utils";

type Tab = "overview" | "evidence" | "timeline" | "comparisons" | "reports";
const tabs: [Tab, string][] = [
  ["overview", "Overview"],
  ["evidence", "Evidence"],
  ["timeline", "Timeline"],
  ["comparisons", "Comparisons"],
  ["reports", "Reports"],
];

export function ProjectDetailPage() {
  const { id } = useParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [timelineGroup, setTimelineGroup] = useState<"month" | "activity" | "location">("month");
  const [selected, setSelected] = useState<Asset | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["project", id],
    queryFn: () => projectsApi.get(id!),
  });
  const remove = useMutation({
    mutationFn: () => projectsApi.remove(id!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      toast.success("Project deleted");
      navigate("/app/projects");
    },
    onError: (e) => toast.error(e.message),
  });
  const archive = useMutation({
    mutationFn: () => projectsApi.update(id!, { status: "ARCHIVED" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["project", id] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project archived");
    },
    onError: (e) => toast.error(e.message),
  });
  const generateInsight = useMutation({
    mutationFn: () => projectsApi.generateSummary(id!),
    onSuccess: () => {
      toast.success("Evidence-grounded project summary updated");
      void qc.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (error) => toast.error(error.message),
  });
  if (isLoading) return <LoadingScreen />;
  if (isError || !data)
    return <div className="card p-10 text-center">Project not found.</div>;
  const p = data.project;
  const evidence = p.recentAssets || [];
  const analyzed =
    p.workspaceMetrics?.statusGroups.find(
      (group) => group.aiStatus === "COMPLETED",
    )?._count || 0;
  const coverage = p._count.assets
    ? Math.round((analyzed / p._count.assets) * 100)
    : 0;
  const images =
    p.workspaceMetrics?.typeGroups.find(
      (group) => group.resourceType === "IMAGE",
    )?._count || 0;
  const videos =
    p.workspaceMetrics?.typeGroups.find(
      (group) => group.resourceType === "VIDEO",
    )?._count || 0;
  const timeline = (() => {
    const groups = new Map<string, Asset[]>();
    evidence.forEach((asset) => {
      const key = timelineGroup === "activity"
        ? asset.activity || asset.analysis?.activity || "Activity not identified"
        : timelineGroup === "location"
          ? asset.locationName || asset.analysis?.locationType || "Location not provided"
          : format(new Date(asset.capturedAt || asset.createdAt), "MMMM yyyy");
      groups.set(key, [...(groups.get(key) || []), asset]);
    });
    return [...groups.entries()];
  })();
  const del = () => {
    if (
      window.confirm(
        `Delete “${p.name}” and all of its evidence? This cannot be undone.`,
      )
    )
      remove.mutate();
  };
  return (
    <>
      <Link
        to="/app/projects"
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-stone hover:text-ink"
      >
        <ArrowLeft size={16} />
        All projects
      </Link>
      <section className="relative overflow-hidden rounded-[28px] bg-ink p-6 text-white md:p-9">
        {p.coverImage && (
          <>
            <img
              src={p.coverImage}
              alt=""
              className="absolute inset-0 size-full object-cover opacity-25"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/90 to-ink/35" />
          </>
        )}
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-3">
            <StatusBadge status={p.status} />
            <span className="text-xs font-bold uppercase tracking-[.15em] text-lime">
              {p.category || "Impact project"}
            </span>
          </div>
          <h1 className="mt-5 font-display text-3xl font-bold tracking-tight md:text-4xl">
            {p.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">
            {p.description ||
              "Add a project description to give your evidence more context."}
          </p>
          <div className="mt-7 flex flex-wrap gap-5 text-sm text-white/70">
            <span className="flex items-center gap-2">
              <MapPin size={16} className="text-lime" />
              {p.location || "Location not set"}
            </span>
            <span className="flex items-center gap-2">
              <CalendarDays size={16} className="text-lime" />
              {format(new Date(p.startDate), "MMM d, yyyy")}{" "}
              {p.endDate
                ? `– ${format(new Date(p.endDate), "MMM d, yyyy")}`
                : "– Ongoing"}
            </span>
          </div>
        </div>
        <div className="absolute right-5 top-5 flex gap-2">
          <Link to={`/app/projects/${p.id}/edit`}>
            <Button
              variant="outline"
              size="sm"
              className="border-white/15 bg-white/10 text-white hover:bg-white/15"
            >
              <Edit3 size={15} />
              Edit
            </Button>
          </Link>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button
                aria-label="Project actions"
                variant="outline"
                size="icon"
                className="size-9 border-white/15 bg-white/10 text-white hover:bg-white/15"
              >
                <MoreHorizontal size={17} />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                className="z-50 min-w-44 rounded-xl bg-white p-1.5 shadow-soft"
              >
                {p.status !== "ARCHIVED" && (
                  <DropdownMenu.Item
                    onSelect={() => archive.mutate()}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-fog"
                  >
                    <Archive size={15} />
                    Archive project
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  onSelect={del}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                >
                  <Trash2 size={15} />
                  Delete project
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </section>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [p._count.assets, "Evidence assets", FileImage],
          [`${coverage}%`, "AI coverage", BarChart3],
          [p._count.comparisons, "Comparisons", GitCompareArrows],
          [p._count.reports, "Reports", FileText],
        ].map(([value, label, Icon]) => {
          const I = Icon as typeof FileImage;
          return (
            <div
              className="card flex items-center gap-4 p-5"
              key={String(label)}
            >
              <span className="grid size-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <I size={20} />
              </span>
              <div>
                <p className="font-display text-2xl font-bold">
                  {String(value)}
                </p>
                <p className="text-xs text-stone">{String(label)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 overflow-x-auto border-b border-black/10">
        <div className="flex min-w-max gap-1">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "border-b-2 px-4 py-3 text-sm font-semibold transition",
                activeTab === key
                  ? "border-ink text-ink"
                  : "border-transparent text-stone hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6">
        {activeTab === "overview" && (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
            <section className="card p-6">
              <h2 className="font-display text-lg font-bold">
                Project profile
              </h2>
              <p className="mt-4 text-sm leading-7 text-stone">
                {p.description || "No project description has been added."}
              </p>
              <dl className="mt-6 grid gap-5 border-t border-black/[.06] pt-6 sm:grid-cols-2">
                <div>
                  <dt className="label">Location</dt>
                  <dd className="text-sm font-semibold">
                    {p.location || "Not provided"}
                  </dd>
                </div>
                <div>
                  <dt className="label">Focus area</dt>
                  <dd className="text-sm font-semibold">
                    {p.category || "Not categorized"}
                  </dd>
                </div>
                <div>
                  <dt className="label">Project period</dt>
                  <dd className="text-sm font-semibold">
                    {format(new Date(p.startDate), "PP")} —{" "}
                    {p.endDate ? format(new Date(p.endDate), "PP") : "Ongoing"}
                  </dd>
                </div>
                <div>
                  <dt className="label">Status</dt>
                  <dd>
                    <StatusBadge status={p.status} />
                  </dd>
                </div>
              </dl>
            </section>
            <section className="card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">
                  Evidence coverage
                </h2>
                <span className="font-display text-2xl font-bold">
                  {coverage}%
                </span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-fog">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${coverage}%` }}
                />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  [images, "Images"],
                  [videos, "Videos"],
                  [analyzed, "Analyzed"],
                ].map(([v, l]) => (
                  <div
                    key={String(l)}
                    className="rounded-xl bg-fog p-3 text-center"
                  >
                    <p className="font-display text-xl font-bold">{v}</p>
                    <p className="mt-1 text-[11px] text-stone">{l}</p>
                  </div>
                ))}
              </div>
              {p.workspaceMetrics?.coverage && (
                <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-black/[.06] pt-5 text-sm">
                  <div><dt className="text-xs text-stone">Locations represented</dt><dd className="mt-1 font-display text-xl font-bold">{p.workspaceMetrics.coverage.locationsRepresented}</dd></div>
                  <div><dt className="text-xs text-stone">Dates represented</dt><dd className="mt-1 font-display text-xl font-bold">{p.workspaceMetrics.coverage.datesRepresented}</dd></div>
                  <div><dt className="text-xs text-stone">Before/after candidates</dt><dd className="mt-1 font-display text-xl font-bold">{p.workspaceMetrics.coverage.beforeAfterCandidates}</dd></div>
                  <div><dt className="text-xs text-stone">Quality flags</dt><dd className="mt-1 font-display text-xl font-bold">{p.workspaceMetrics.coverage.qualityFlags}</dd></div>
                </dl>
              )}
              <Button
                className="mt-6 w-full"
                variant="outline"
                onClick={() => setUploadOpen(true)}
              >
                <Plus size={16} />
                Add evidence
              </Button>
            </section>
            <section className="card p-6 xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-violet-700">Evidence intelligence</p>
                  <h2 className="mt-1 font-display text-lg font-bold">AI project overview</h2>
                  <p className="mt-1 text-xs text-stone">Generated only from stored project metadata and persisted media analyses.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => generateInsight.mutate()} disabled={generateInsight.isPending || !evidence.length}>
                  {generateInsight.isPending ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {p.insight ? "Refresh summary" : "Generate summary"}
                </Button>
              </div>
              {p.insight ? (
                <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
                  <div>
                    <p className="text-sm leading-7 text-ink/80">{p.insight.summary}</p>
                    <p className="mt-4 label">Recurring visual observations</p>
                    <ul className="space-y-2 text-sm text-stone">{p.insight.recurringObservations.map((item) => <li key={item}>• {item}</li>)}</ul>
                  </div>
                  <div className="rounded-2xl bg-fog p-4">
                    <p className="label">Known from evidence</p>
                    <p className="text-sm font-semibold">{p.insight.timeSpan}</p>
                    <p className="mt-4 label">Documented activities</p>
                    <div className="flex flex-wrap gap-1.5">{p.insight.documentedActivities.map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs">{item}</span>)}</div>
                    <p className="mt-4 label">Evidence gaps</p>
                    <ul className="space-y-1 text-xs leading-5 text-stone">{p.insight.evidenceGaps.map((item) => <li key={item}>• {item}</li>)}</ul>
                    {p.insight.uncertaintyNotes.length > 0 && <><p className="mt-4 label text-amber-700">Uncertainty notes</p><ul className="space-y-1 text-xs leading-5 text-amber-800">{p.insight.uncertaintyNotes.map((item) => <li key={item}>• {item}</li>)}</ul></>}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-black/10 p-6 text-center text-sm text-stone">Generate an overview after analyzing evidence. No environmental KPI will be inferred.</div>
              )}
            </section>
          </div>
        )}
        {activeTab === "evidence" &&
          (evidence.length ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-stone">
                  Showing {evidence.length} recent assets
                </p>
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Plus size={15} />
                  Upload
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {evidence.map((asset) => (
                  <EvidenceCard
                    key={asset.id}
                    asset={asset}
                    onOpen={() => setSelected(asset)}
                    onToggle={() => setSelected(asset)}
                    onFavorite={async () => {
                      await assetsApi.favorite(asset.id, !asset.favorite);
                      void qc.invalidateQueries({ queryKey: ["project", id] });
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyProjectSection
              icon={FileImage}
              title="No evidence collected"
              text="Upload images or videos to begin a traceable project record."
              action={
                <Button onClick={() => setUploadOpen(true)}>
                  <Plus size={16} />
                  Upload evidence
                </Button>
              }
            />
          ))}
        {activeTab === "timeline" &&
          (timeline.length ? (
            <div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-display text-lg font-bold">Evidence progression</h2><p className="text-xs text-stone">Uses capture time when available, otherwise upload time.</p></div>
                <div className="flex rounded-xl border border-black/10 bg-white p-1">
                  {(["month", "activity", "location"] as const).map((mode) => <button key={mode} onClick={() => setTimelineGroup(mode)} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold capitalize", timelineGroup === mode ? "bg-ink text-white" : "text-stone")}>{mode}</button>)}
                </div>
              </div>
              <div className="space-y-8">
              {timeline.map(([month, items]) => (
                <section
                  key={month}
                  className="relative border-l border-black/10 pl-7"
                >
                  <span className="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-fog bg-emerald-600" />
                  <h3 className="font-display text-lg font-bold">{month}</h3>
                  <p className="mt-1 text-xs text-stone">
                    {items.length} evidence{" "}
                    {items.length === 1 ? "record" : "records"}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((asset) => (
                      <EvidenceCard
                        key={asset.id}
                        asset={asset}
                        onOpen={() => setSelected(asset)}
                        onToggle={() => setSelected(asset)}
                        onFavorite={() => undefined}
                      />
                    ))}
                  </div>
                </section>
              ))}
              </div>
            </div>
          ) : (
            <EmptyProjectSection
              icon={CalendarDays}
              title="Timeline awaiting evidence"
              text="Captured and uploaded dates will organize project evidence chronologically."
            />
          ))}
        {activeTab === "comparisons" && (
          <EmptyProjectSection
            icon={GitCompareArrows}
            title={p._count.comparisons ? `${p._count.comparisons} saved comparison${p._count.comparisons === 1 ? "" : "s"}` : "No comparisons yet"}
            text={p._count.comparisons ? "Open the comparison workspace to review visible changes, uncertainty, and linked source evidence." : "Select two dated evidence records to generate a conservative visible-change analysis."}
            action={<Link to={`/app/comparisons?projectId=${p.id}`}><Button><GitCompareArrows size={16} />{p._count.comparisons ? "View comparisons" : "Create comparison"}</Button></Link>}
          />
        )}
        {activeTab === "reports" && (
          <EmptyProjectSection
            icon={FileText}
            title={p._count.reports ? `${p._count.reports} evidence report${p._count.reports === 1 ? "" : "s"}` : "No reports generated"}
            text={p._count.reports ? "Open the reporting workspace to read reports and trace every narrative back to source evidence." : "Generate a stakeholder-ready report from stored project evidence and saved comparisons."}
            action={<Link to={`/app/reports?projectId=${p.id}`}><Button><FileText size={16} />{p._count.reports ? "View reports" : "Generate report"}</Button></Link>}
          />
        )}
      </div>
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        defaultProjectId={p.id}
      />
      <AssetDetailDialog asset={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function EmptyProjectSection({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: typeof FileImage;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="card border-dashed p-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-fog text-stone">
        <Icon />
      </span>
      <h3 className="mt-4 font-display font-bold">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
