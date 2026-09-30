import * as Dialog from "@radix-ui/react-dialog";
import {
  BrainCircuit,
  Calendar,
  Download,
  ExternalLink,
  FileImage,
  Fingerprint,
  HardDrive,
  Loader2,
  MapPin,
  RotateCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { assetsApi } from "@/api/assets";
import type { Asset } from "@/types";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

const stateStyles = {
  NOT_REQUESTED: "bg-slate-100 text-slate-600",
  PENDING: "bg-amber-50 text-amber-700",
  PROCESSING: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
} as const;
export function AssetDetailDialog({
  asset,
  onClose,
}: {
  asset: Asset | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "analysis" | "source">(
    "overview",
  );
  const analyze = useMutation({
    mutationFn: () =>
      asset!.aiStatus === "FAILED"
        ? assetsApi.retry(asset!.id)
        : assetsApi.analyze(asset!.id, Boolean(asset!.analysis)),
    onSuccess: () => {
      toast.success("Evidence analysis completed");
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["project", asset?.projectId] });
      onClose();
    },
    onError: (e) => {
      toast.error(e.message);
      void qc.invalidateQueries({ queryKey: ["assets"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => assetsApi.remove(asset!.id),
    onSuccess: () => {
      toast.success("Evidence deleted from Cloudinary and FieldProof");
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const favorite = useMutation({
    mutationFn: () => assetsApi.favorite(asset!.id, !asset!.favorite),
    onSuccess: () => {
      toast.success(
        asset?.favorite ? "Removed from favorites" : "Added to favorites",
      );
      void qc.invalidateQueries({ queryKey: ["assets"] });
      void qc.invalidateQueries({ queryKey: ["project", asset?.projectId] });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!asset) return null;
  const deletion = () => {
    if (
      window.confirm(
        `Permanently delete “${asset.originalFilename}” from Cloudinary and this project?`,
      )
    )
      remove.mutate();
  };
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto bg-white shadow-soft">
          <Dialog.Title className="sr-only">Evidence details</Dialog.Title>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/[.06] bg-white/95 px-5 py-4 backdrop-blur">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-700">
                Evidence record
              </p>
              <p className="mt-1 max-w-md truncate font-display text-lg font-bold">
                {asset.originalFilename}
              </p>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-xl p-2 hover:bg-fog">
                <X />
              </button>
            </Dialog.Close>
          </div>
          <div className="p-5 md:p-7">
            <div className="overflow-hidden rounded-2xl bg-ink">
              {asset.resourceType === "VIDEO" ? (
                <video
                  controls
                  src={asset.secureUrl}
                  className="max-h-[420px] w-full"
                />
              ) : (
                <img
                  src={asset.secureUrl}
                  alt={asset.description || asset.originalFilename}
                  className="max-h-[420px] w-full object-contain"
                />
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-bold",
                  stateStyles[asset.aiStatus],
                )}
              >
                {asset.aiStatus === "NOT_REQUESTED"
                  ? "Uploaded"
                  : asset.aiStatus.replace("_", " ").toLowerCase()}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => favorite.mutate()}
                >
                  <Star
                    size={15}
                    className={
                      asset.favorite ? "fill-amber-400 text-amber-500" : ""
                    }
                  />
                  {asset.favorite ? "Favorited" : "Favorite"}
                </Button>
                {asset.resourceType !== "RAW" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => analyze.mutate()}
                    disabled={analyze.isPending}
                  >
                    {analyze.isPending ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : asset.aiStatus === "FAILED" ? (
                      <RotateCw size={15} />
                    ) : (
                      <BrainCircuit size={15} />
                    )}{" "}
                    {asset.analysis
                      ? "Re-analyze"
                      : asset.resourceType === "VIDEO"
                        ? "Analyze video"
                        : "Analyze image"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600"
                  onClick={deletion}
                  disabled={remove.isPending}
                >
                  <Trash2 size={15} />
                  Delete
                </Button>
              </div>
            </div>
            {asset.aiStatus === "FAILED" && asset.analysisError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <strong>Analysis failed:</strong> {asset.analysisError}
              </div>
            )}
            <div role="tablist" aria-label="Evidence details" className="mt-6 flex gap-1 border-b border-black/10">
              {(
                [
                  ["overview", "Overview"],
                  ["analysis", "AI Analysis"],
                  ["source", "Source / Traceability"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn(
                    "border-b-2 px-3 py-3 text-sm font-semibold",
                    tab === key
                      ? "border-ink text-ink"
                      : "border-transparent text-stone",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === "overview" && (
              <section className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-fog p-4">
                  <p className="label">Project</p>
                  <p className="text-sm font-semibold">{asset.project.name}</p>
                </div>
                <div className="rounded-2xl bg-fog p-4">
                  <p className="label">Activity</p>
                  <p className="text-sm font-semibold">
                    {asset.activity || "Not analyzed"}
                  </p>
                </div>
                <div className="rounded-2xl bg-fog p-4 sm:col-span-2">
                  <p className="label">Description</p>
                  <p className="text-sm leading-6 text-stone">
                    {asset.description ||
                      "No description is available yet. Analyze this image to generate evidence context."}
                  </p>
                </div>
                <div className="rounded-2xl bg-fog p-4">
                  <p className="label">Uploaded</p>
                  <p className="text-sm font-semibold">
                    {format(new Date(asset.createdAt), "PPp")}
                  </p>
                </div>
                <div className="rounded-2xl bg-fog p-4">
                  <p className="label">Location</p>
                  <p className="text-sm font-semibold">
                    {asset.locationName || "Not provided"}
                  </p>
                </div>
              </section>
            )}
            {tab === "analysis" && asset.analysis && (
              <section className="mt-6 rounded-2xl bg-[#edf5e9] p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-emerald-800">
                  <BrainCircuit size={16} />
                  AI evidence analysis
                </div>
                <p className="mt-4 text-sm leading-6 text-ink/80">
                  {asset.analysis.summary}
                </p>
                {asset.analysis.detailedDescription && (
                  <p className="mt-3 text-sm leading-6 text-stone">
                    {asset.analysis.detailedDescription}
                  </p>
                )}
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="label">Observed activity</p>
                    <p className="text-sm font-semibold">
                      {asset.analysis.activity}
                    </p>
                  </div>
                  <div>
                    <p className="label">Location type</p>
                    <p className="text-sm font-semibold">
                      {asset.analysis.locationType || "Unclear"}
                    </p>
                  </div>
                  <div>
                    <p className="label">Visual quality</p>
                    <p className="text-sm">{asset.analysis.visualQuality}</p>
                  </div>
                  <div>
                    <p className="label">Evidence usefulness</p>
                    <p className="text-sm">
                      {asset.analysis.evidenceUsefulness}
                    </p>
                  </div>
                  <div>
                    <p className="label">Evidence strength</p>
                    <p className="text-sm font-semibold capitalize">
                      {asset.analysis.evidenceStrength || "Not scored"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 border-t border-emerald-900/10 pt-5">
                  <div className="flex items-center justify-between"><p className="label mb-0">Overall confidence</p><span className="font-display text-lg font-bold">{asset.analysis.confidence != null ? `${Math.round(asset.analysis.confidence * 100)}%` : 'Not scored'}</span></div>
                  {asset.analysis.environmentalSignals.length > 0 && <div className="mt-5"><p className="label">Environmental signals</p><div className="space-y-2">{asset.analysis.environmentalSignals.map((signal,index)=><div key={`${signal.type}-${index}`} className="rounded-xl bg-white/70 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{signal.type}</p><span className="text-xs font-bold text-emerald-700">{Math.round(signal.confidence*100)}%</span></div><p className="mt-1 text-xs leading-5 text-stone">{signal.description}</p></div>)}</div></div>}
                  {asset.analysis.detectedObjects.length > 0 && <div className="mt-5"><p className="label">Detected objects</p><div className="flex flex-wrap gap-1.5">{asset.analysis.detectedObjects.map(object=><span key={object} className="rounded-full border border-emerald-900/10 bg-white/70 px-2.5 py-1 text-xs">{object}</span>)}</div></div>}
                  {Boolean(asset.analysis.infrastructureSignals?.length) && <div className="mt-5"><p className="label">Infrastructure signals</p><div className="space-y-2">{asset.analysis.infrastructureSignals?.map((signal,index)=><div key={`${signal.type}-${index}`} className="rounded-xl bg-white/70 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{signal.type}</p><span className="text-xs font-bold text-emerald-700">{Math.round(signal.confidence*100)}%</span></div><p className="mt-1 text-xs leading-5 text-stone">{signal.description}</p></div>)}</div></div>}
                  {Boolean(asset.analysis.visibleSubjects?.length) && <div className="mt-5"><p className="label">Visible subjects</p><div className="flex flex-wrap gap-1.5">{asset.analysis.visibleSubjects?.map(subject=><span key={subject} className="rounded-full bg-white/70 px-2.5 py-1 text-xs">{subject}</span>)}</div></div>}
                  {Boolean(asset.analysis.uncertainties?.length) && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/80 p-3"><p className="label text-amber-800">Uncertainties</p><ul className="space-y-1 text-xs leading-5 text-amber-900">{asset.analysis.uncertainties?.map(item=><li key={item}>• {item}</li>)}</ul></div>}
                </div>
                {Boolean(asset.analysis.representativeFrames?.length) && (
                  <div className="mt-5">
                    <p className="label">Representative video frames</p>
                    <div className="grid grid-cols-3 gap-2">
                      {asset.analysis.representativeFrames?.map((frame, index) => <img key={frame} src={frame} alt={`Representative video frame ${index + 1}`} className="aspect-video w-full rounded-lg object-cover" />)}
                    </div>
                    <p className="mt-2 text-xs text-stone">Sampled at three positions to keep video analysis reliable and cost-conscious.</p>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {asset.analysis.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}
            {tab === "analysis" && !asset.analysis && (
              <div className="mt-6 rounded-2xl border border-dashed border-black/15 p-8 text-center">
                <BrainCircuit className="mx-auto text-stone" />
                <p className="mt-3 font-semibold">No AI analysis yet</p>
                <p className="mt-1 text-sm text-stone">
                  Run analysis to extract activities, signals, objects, tags,
                  and confidence.
                </p>
              </div>
            )}
            {tab === "source" && (
              <section className="mt-7">
                <h3 className="font-display text-lg font-bold">
                  Source traceability
                </h3>
                <div className="mt-4 divide-y divide-black/[.06] rounded-2xl border border-black/[.07] px-4">
                  {[
                    [FileImage, "Project", asset.project.name],
                    [
                      Fingerprint,
                      "Cloudinary public ID",
                      asset.cloudinaryPublicId,
                    ],
                    [
                      Fingerprint,
                      "Cloudinary asset ID",
                      asset.cloudinaryAssetId || "Not returned",
                    ],
                    [
                      Calendar,
                      "Uploaded",
                      format(new Date(asset.createdAt), "PPp"),
                    ],
                    [
                      Calendar,
                      "Captured",
                      asset.capturedAt
                        ? format(new Date(asset.capturedAt), "PPp")
                        : "Unknown",
                    ],
                    [
                      HardDrive,
                      "Media",
                      `${asset.resourceType.toLowerCase()} · ${asset.format?.toUpperCase() || "unknown"} · ${asset.width && asset.height ? `${asset.width} × ${asset.height}` : "dimensions unavailable"} · ${asset.bytes ? `${(asset.bytes / 1024 / 1024).toFixed(2)} MB` : "size unavailable"}`,
                    ],
                    [MapPin, "Location", asset.locationName || "Not provided"],
                  ].map(([Icon, label, value]) => {
                    const I = Icon as typeof FileImage;
                    return (
                      <div className="flex gap-3 py-3.5" key={String(label)}>
                        <I size={16} className="mt-0.5 shrink-0 text-stone" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-stone">
                            {String(label)}
                          </p>
                          <p className="mt-1 break-all text-sm">
                            {String(value)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <a
                  href={asset.secureUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700"
                >
                  <Download size={15} /> Download or open original{" "}
                  <ExternalLink size={14} />
                </a>
              </section>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
