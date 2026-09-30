import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BrainCircuit,
  CircleDashed,
  FileImage,
  FileText,
  FolderKanban,
  GitCompareArrows,
  Plus,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { projectsApi } from "@/api/projects";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { StatusBadge } from "@/components/status-badge";
import { cloudinaryThumbnail } from "@/lib/cloudinary";

function SkeletonCard() {
  return (
    <div className="card animate-pulse p-5">
      <div className="size-10 rounded-xl bg-black/[.06]" />
      <div className="mt-5 h-8 w-16 rounded bg-black/[.06]" />
      <div className="mt-2 h-3 w-24 rounded bg-black/[.05]" />
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["summary"],
    queryFn: projectsApi.summary,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });
  const coverage = summary?.assets
    ? Math.round((summary.analyzed / summary.assets) * 100)
    : 0;
  const stats = [
    [
      summary?.projects ?? 0,
      "Projects",
      FolderKanban,
      "bg-emerald-50 text-emerald-700",
      "/app/projects",
    ],
    [
      summary?.assets ?? 0,
      "Media evidence",
      FileImage,
      "bg-violet-50 text-violet-700",
      "/app/library",
    ],
    [
      summary?.analyzed ?? 0,
      "AI analyzed",
      BrainCircuit,
      "bg-cyan-50 text-cyan-700",
      "/app/library",
    ],
    [
      summary?.pending ?? 0,
      "Awaiting analysis",
      CircleDashed,
      "bg-amber-50 text-amber-700",
      "/app/library",
    ],
    [
      summary?.comparisons ?? 0,
      "Comparisons",
      GitCompareArrows,
      "bg-orange-50 text-orange-700",
      "/app/comparisons",
    ],
    [
      summary?.reports ?? 0,
      "Reports",
      FileText,
      "bg-blue-50 text-blue-700",
      "/app/reports",
    ],
  ] as const;
  return (
    <>
      <div className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-[0_30px_80px_rgba(11,23,20,.15)] sm:flex sm:items-end sm:justify-between sm:gap-6 md:p-9">
        <div className="grid-glow pointer-events-none absolute inset-0 opacity-45" />
        <div className="absolute -right-24 -top-24 size-72 rounded-full bg-lime/15 blur-3xl" />
        <div className="relative">
          <p className="eyebrow text-lime">
            Good to see you, {user?.name.split(" ")[0]}
          </p>
          <h1 className="mt-4 font-display text-4xl font-extrabold uppercase leading-[.95] tracking-[-.055em] md:text-6xl">
            Your impact<br/><span className="text-lime">workspace.</span>
          </h1>
          <p className="mt-4 text-sm text-white/45">
            A live view of projects, evidence, and analysis coverage.
          </p>
        </div>
        <Link className="relative mt-6 sm:mt-0" to="/app/projects/new">
          <Button variant="lime">
            <Plus size={17} />
            New project
          </Button>
        </Link>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {summaryLoading
          ? Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} />)
          : stats.map(([value, label, Icon, color, to]) => (
              <Link
                to={to}
                className="card p-5 transition hover:-translate-y-0.5 hover:shadow-soft"
                key={label}
              >
                <span
                  className={`grid size-10 place-items-center rounded-xl ${color}`}
                >
                  <Icon size={19} />
                </span>
                <p className="mt-5 font-display text-3xl font-bold">{value}</p>
                <p className="mt-1 text-xs text-stone">{label}</p>
              </Link>
            ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="card p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold">
                Recently updated projects
              </h2>
              <p className="mt-1 text-xs text-stone">
                Current initiatives ordered by activity
              </p>
            </div>
            <Link
              className="flex items-center gap-1 text-sm font-bold"
              to="/app/projects"
            >
              View all <ArrowRight size={15} />
            </Link>
          </div>
          {isLoading ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl bg-black/[.04]"
                />
              ))}
            </div>
          ) : !data?.projects.length ? (
            <div className="mt-6 rounded-2xl bg-[#eef4ea] p-7 text-center">
              <FolderKanban className="mx-auto text-emerald-700" />
              <h3 className="mt-4 font-display font-bold">
                Start with a field project
              </h3>
              <p className="mt-2 text-sm text-stone">
                Create a project to organize evidence by place, purpose, and
                timeline.
              </p>
            </div>
          ) : (
            <div className="mt-5 divide-y divide-black/[.06]">
              {data.projects.slice(0, 5).map((p) => (
                <Link
                  to={`/app/projects/${p.id}`}
                  key={p.id}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-sm font-bold text-lime">
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="mt-1 truncate text-xs text-stone">
                      {p.location || "Location not set"} · {p._count.assets}{" "}
                      evidence ·{" "}
                      {formatDistanceToNow(new Date(p.updatedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </section>
        <aside className="card overflow-hidden">
          <div className="bg-ink p-6 text-white">
            <div className="flex items-center gap-2 text-lime">
              <Sparkles size={18} />
              <span className="text-xs font-bold uppercase tracking-[.16em]">
                Analysis coverage
              </span>
            </div>
            <div className="mt-5 flex items-end justify-between">
              <p className="font-display text-4xl font-bold">{coverage}%</p>
              <p className="text-xs text-white/40">
                {summary?.analyzed ?? 0} of {summary?.assets ?? 0} assets
              </p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-lime transition-all"
                style={{ width: `${coverage}%` }}
              />
            </div>
            {summary?.failed ? (
              <p className="mt-3 text-xs text-red-300">
                {summary.failed} analysis{" "}
                {summary.failed === 1 ? "needs" : "need"} attention
              </p>
            ) : (
              <p className="mt-3 text-xs text-white/40">No failed analyses</p>
            )}
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[.15em] text-stone">
                Recent uploads
              </p>
              <Link to="/app/library" className="text-xs font-bold">
                Library
              </Link>
            </div>
            {!summary?.recentAssets.length ? (
              <p className="mt-5 text-sm text-stone">
                Uploaded evidence will appear here.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {summary.recentAssets.slice(0, 4).map((asset) => (
                  <Link
                    to="/app/library"
                    key={asset.id}
                    className="flex items-center gap-3"
                  >
                    <img
                      src={cloudinaryThumbnail(asset.secureUrl, 96, 96)}
                      alt=""
                      className="size-10 rounded-lg bg-fog object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {asset.originalFilename}
                      </p>
                      <p className="truncate text-xs text-stone">
                        {asset.project.name} ·{" "}
                        {asset.activity || "Awaiting analysis"}
                      </p>
                    </div>
                    <span
                      className={`size-2 rounded-full ${asset.aiStatus === "COMPLETED" ? "bg-emerald-500" : asset.aiStatus === "FAILED" ? "bg-red-500" : "bg-amber-400"}`}
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
