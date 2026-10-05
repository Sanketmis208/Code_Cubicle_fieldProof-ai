import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BrainCircuit,
  Grid2X2,
  List,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { assetsApi, type AssetFilters } from "@/api/assets";
import { projectsApi } from "@/api/projects";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { UploadDialog } from "@/components/upload-dialog";
import { useAuth } from "@/contexts/auth-context";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { EvidenceCard } from "@/components/evidence-card";
import type { Asset } from "@/types";

export function MediaLibraryPage() {
  const [params, setParams] = useSearchParams();
  const initialSearch = params.get("q") || "";
  const [filters, setFilters] = useState<AssetFilters>({
    page: 1,
    limit: 24,
    search: initialSearch,
    sort: "newest",
  });
  const [search, setSearch] = useState(initialSearch);
  const [uploadOpen, setUploadOpen] = useState(false);
  const { can } = useAuth();
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"grid" | "list">("grid");
  const [bulkPending, setBulkPending] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    const q = params.get("q") || "";
    setSearch(q);
    setFilters((f) => ({ ...f, search: q || undefined, page: 1 }));
  }, [params]);
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: projectsApi.list,
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => assetsApi.list(filters),
  });
  const aiSearch = useMutation({
    mutationFn: ({ query, page = 1 }: { query: string; page?: number }) =>
      assetsApi.naturalSearch(query, page),
    onError: (error) => toast.error(error.message),
  });
  const favorite = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      assetsApi.favorite(id, value),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["assets"] }),
    onError: (e) => toast.error(e.message),
  });
  const activeFilters = useMemo(
    () =>
      [
        [
          "Project",
          filters.projectId &&
            projects?.projects.find((p) => p.id === filters.projectId)?.name,
        ],
        ["Type", filters.resourceType?.toLowerCase()],
        ["Favorites", filters.favorite ? "Only favorites" : undefined],
        ["From", filters.from],
        ["To", filters.to],
      ].filter(([, value]) => value) as Array<[string, string]>,
    [filters, projects],
  );
  const clearFilters = () => {
    setFilters({ page: 1, limit: 24, sort: "newest" });
    setSearch("");
    setParams({});
    setSelectedIds(new Set());
    aiSearch.reset();
  };
  const applySearch = (event: FormEvent) => {
    event.preventDefault();
    setFilters((f) => ({ ...f, search: search || undefined, page: 1 }));
    setParams(search ? { q: search } : {});
    aiSearch.reset();
  };
  const askFieldProof = () => {
    if (search.trim().length < 3)
      return toast.error("Ask a question using at least three characters");
    setSelectedIds(new Set());
    aiSearch.mutate({ query: search.trim() });
  };
  const toggle = (id: string) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  const bulkAnalyze = async () => {
    const eligible = (aiSearch.data?.assets || data?.assets || []).filter(
      (asset) => selectedIds.has(asset.id) && asset.resourceType !== "RAW",
    );
    if (!eligible.length) return toast.error("Select at least one image or video");
    setBulkPending(true);
    let completed = 0;
    for (const asset of eligible) {
      try {
        await assetsApi.analyze(asset.id);
        completed++;
      } catch {
        /* individual status is saved by API */
      }
    }
    await qc.invalidateQueries({ queryKey: ["assets"] });
    await qc.invalidateQueries({ queryKey: ["summary"] });
    setBulkPending(false);
    setSelectedIds(new Set());
    if (completed === eligible.length) {
      toast.success(
        `${completed} ${completed === 1 ? "image" : "images"} analyzed`,
      );
    } else {
      toast.error(`${completed} of ${eligible.length} analyses completed`);
    }
  };
  const displayed = aiSearch.data ?? data;
  const assets = displayed?.assets || [];
  const busy = isLoading || aiSearch.isPending;
  const hasError = isError || aiSearch.isError;
  const hasFilters = Boolean(filters.search || activeFilters.length || aiSearch.data);
  return (
    <>
      <PageHeading
        eyebrow="Visual archive"
        title="Evidence Library"
        description="Search, curate, and analyze traceable field media across every project."
        action={
          can("evidence.upload") ? (
            <Button onClick={() => setUploadOpen(true)}>
              <Plus size={17} />
              Upload evidence
            </Button>
          ) : undefined
        }
      />
      <section className="card mb-5 p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <form className="relative flex-1" onSubmit={applySearch}>
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone"
            />
            <input
              aria-label="Search evidence"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field pl-10 pr-44"
              placeholder="Ask “Find tree planting in Jaipur” or search keywords…"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
              <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs font-bold hover:bg-fog">Search</button>
              <button type="button" onClick={askFieldProof} disabled={aiSearch.isPending} className="inline-flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-60">
                {aiSearch.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Ask AI
              </button>
            </div>
          </form>
          <select
            aria-label="Filter by project"
            className="field xl:w-56"
            value={filters.projectId || ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                projectId: e.target.value || undefined,
                page: 1,
              }))
            }
          >
            <option value="">All projects</option>
            {projects?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by media type"
            className="field xl:w-40"
            value={filters.resourceType || ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                resourceType: e.target.value || undefined,
                page: 1,
              }))
            }
          >
            <option value="">All media</option>
            <option value="IMAGE">Images</option>
            <option value="VIDEO">Videos</option>
          </select>
          <select
            aria-label="Sort evidence"
            className="field xl:w-40"
            value={filters.sort || "newest"}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                sort: e.target.value as AssetFilters["sort"],
                page: 1,
              }))
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="filename">Filename A–Z</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={15} className="text-stone" />
          <input
            type="date"
            aria-label="From date"
            className="field w-auto py-2"
            value={filters.from || ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                from: e.target.value || undefined,
                page: 1,
              }))
            }
          />
          <span className="text-xs text-stone">to</span>
          <input
            type="date"
            aria-label="To date"
            className="field w-auto py-2"
            value={filters.to || ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                to: e.target.value || undefined,
                page: 1,
              }))
            }
          />
          <button
            onClick={() =>
              setFilters((f) => ({
                ...f,
                favorite: f.favorite ? undefined : true,
                page: 1,
              }))
            }
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold ${filters.favorite ? "border-amber-300 bg-amber-50 text-amber-700" : "border-black/10 bg-white"}`}
          >
            <Star
              size={14}
              className={filters.favorite ? "fill-amber-400" : ""}
            />
            Favorites
          </button>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-stone hover:text-ink"
            >
              <X size={14} />
              Clear all
            </button>
          )}
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-black/[.05] pt-3">
            {activeFilters.map(([label, value]) => (
              <span
                key={label}
                className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800"
              >
                {label}: {value}
              </span>
            ))}
          </div>
        )}
        {aiSearch.data && (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.12em] text-violet-700">Interpreted evidence query</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {aiSearch.data.explanation.length ? aiSearch.data.explanation.map((item) => <span key={item} className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-violet-800">{item}</span>) : <span className="text-xs text-violet-800">Broad semantic match across stored evidence metadata</span>}
                </div>
              </div>
              <button onClick={() => aiSearch.reset()} className="rounded-lg p-1 text-violet-700 hover:bg-white" aria-label="Close interpreted search"><X size={16} /></button>
            </div>
          </div>
        )}
      </section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone">
          {busy
            ? "Loading evidence…"
            : `${displayed?.pagination.total || 0} ${(displayed?.pagination.total || 0) === 1 ? "result" : "results"}`}
        </p>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <span className="mr-1 text-xs font-bold text-emerald-700">
                {selectedIds.size} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={bulkAnalyze}
                disabled={bulkPending}
              >
                {bulkPending ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <BrainCircuit size={15} />
                )}
                Analyze selected
              </Button>
              <button
                aria-label="Clear selection"
                className="p-2"
                onClick={() => setSelectedIds(new Set())}
              >
                <X size={17} />
              </button>
            </>
          )}
          <div className="flex rounded-xl border border-black/10 bg-white p-1">
            <button
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className={`rounded-lg p-2 ${view === "grid" ? "bg-ink text-white" : ""}`}
            >
              <Grid2X2 size={16} />
            </button>
            <button
              aria-label="List view"
              onClick={() => setView("list")}
              className={`rounded-lg p-2 ${view === "list" ? "bg-ink text-white" : ""}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>
      {busy ? (
        <div
          className={`grid gap-4 ${view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : ""}`}
        >
          {Array.from({ length: view === "grid" ? 8 : 5 }, (_, i) => (
            <div
              key={i}
              className={`card animate-pulse bg-black/[.04] ${view === "grid" ? "aspect-[4/3]" : "h-20"}`}
            />
          ))}
        </div>
      ) : hasError ? (
        <div className="card p-10 text-center">
          <p className="font-semibold text-red-700">
            The evidence library could not be loaded.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              // A failed AI search otherwise keeps the whole library in the error state.
              aiSearch.reset();
              void qc.invalidateQueries({ queryKey: ["assets"] });
            }}
          >
            Try again
          </Button>
        </div>
      ) : !assets.length ? (
        <EmptyState
          icon={hasFilters ? Search : UploadCloud}
          title={
            hasFilters
              ? "No evidence matches these filters"
              : "Your evidence library is empty"
          }
          description={
            hasFilters
              ? "Try removing a filter or searching for a broader activity, location, or filename."
              : "Upload field images or videos to create a searchable and traceable visual record."
          }
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : can("evidence.upload") ? (
              <Button onClick={() => setUploadOpen(true)}>
                <Plus size={16} />
                Upload first evidence
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div
            className={
              view === "grid"
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
                : "space-y-3"
            }
          >
            {assets.map((asset) => (
              <EvidenceCard
                key={asset.id}
                asset={asset}
                view={view}
                selected={selectedIds.has(asset.id)}
                selectionMode={selectedIds.size > 0}
                onOpen={() => setSelectedAsset(asset)}
                onToggle={() => toggle(asset.id)}
                onFavorite={can("evidence.curate") ? () =>
                  favorite.mutate({ id: asset.id, value: !asset.favorite })
                : undefined}
              />
            ))}
          </div>
          {displayed && displayed.pagination.pages > 1 && (
            <div className="mt-7 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={displayed.pagination.page <= 1}
                onClick={() => aiSearch.data ? aiSearch.mutate({ query: aiSearch.variables?.query ?? search, page: displayed.pagination.page - 1 }) : setFilters((f) => ({ ...f, page: (f.page || 1) - 1 }))}
              >
                Previous
              </Button>
              <span className="text-xs font-semibold text-stone">
                Page {displayed.pagination.page} of {displayed.pagination.pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={displayed.pagination.page >= displayed.pagination.pages}
                onClick={() => aiSearch.data ? aiSearch.mutate({ query: aiSearch.variables?.query ?? search, page: displayed.pagination.page + 1 }) : setFilters((f) => ({ ...f, page: (f.page || 1) + 1 }))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-emerald-900/10 bg-emerald-50/60 p-4 text-xs text-emerald-900">
        <Sparkles size={16} />
        <span>
          <strong>Tip:</strong> Ask a natural-language question or select
          multiple images and videos for persisted, individually traceable analysis.
        </span>
      </div>
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      <AssetDetailDialog
        asset={selectedAsset}
        onClose={() => setSelectedAsset(null)}
      />
    </>
  );
}
