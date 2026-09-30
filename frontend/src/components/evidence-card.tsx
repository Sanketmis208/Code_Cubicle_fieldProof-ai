import { Check, Download, Play, Star } from "lucide-react";
import { format } from "date-fns";
import type { Asset } from "@/types";
import { AnalysisStatusBadge } from "./analysis-status";
import { cloudinaryThumbnail } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

export function EvidenceCard({
  asset,
  view = "grid",
  selected = false,
  selectionMode = false,
  onOpen,
  onToggle,
  onFavorite,
}: {
  asset: Asset;
  view?: "grid" | "list";
  selected?: boolean;
  selectionMode?: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onFavorite: () => void;
}) {
  if (view === "list")
    return (
      <article
        className={cn(
          "card flex items-center gap-4 p-3 transition",
          selected && "ring-2 ring-emerald-600",
        )}
      >
        <button
          aria-label={selected ? "Deselect evidence" : "Select evidence"}
          onClick={onToggle}
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded border",
            selected
              ? "border-emerald-600 bg-emerald-600 text-white"
              : "border-black/20",
          )}
        >
          {selected && <Check size={13} />}
        </button>
        <button
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-ink">
            <img
              src={cloudinaryThumbnail(asset.secureUrl, 160, 160, asset.resourceType === "VIDEO")}
              alt=""
              className="size-full object-cover"
            />
            {asset.resourceType === "VIDEO" && (
              <Play
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white"
                size={18}
                fill="currentColor"
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {asset.originalFilename}
            </p>
            <p className="mt-1 truncate text-xs text-stone">
              {asset.project.name} ·{" "}
              {asset.activity || "No activity identified"}
            </p>
          </div>
          <span className="hidden text-xs text-stone sm:block">
            {format(new Date(asset.createdAt), "MMM d, yyyy")}
          </span>
          <AnalysisStatusBadge status={asset.aiStatus} />
        </button>
        <button
          aria-label={asset.favorite ? "Remove favorite" : "Add favorite"}
          title={asset.favorite ? "Remove favorite" : "Add favorite"}
          onClick={onFavorite}
          className="rounded-lg p-2 hover:bg-fog"
        >
          <Star
            size={17}
            className={
              asset.favorite ? "fill-amber-400 text-amber-500" : "text-stone"
            }
          />
        </button>
        <a
          href={asset.secureUrl}
          download
          target="_blank"
          rel="noreferrer"
          aria-label="Download original"
          title="Download original"
          className="rounded-lg p-2 hover:bg-fog"
        >
          <Download size={17} />
        </a>
      </article>
    );
  return (
    <article
      className={cn(
        "card group relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-soft",
        selected && "ring-2 ring-emerald-600",
      )}
    >
      <button
        onClick={selectionMode ? onToggle : onOpen}
        className="block w-full text-left"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-ink">
          <img
            src={cloudinaryThumbnail(asset.secureUrl, 800, 600, asset.resourceType === "VIDEO")}
            alt={asset.description || asset.originalFilename}
            loading="lazy"
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
          {asset.resourceType === "VIDEO" && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-11 place-items-center rounded-full bg-white/85">
                <Play size={18} fill="currentColor" />
              </span>
            </span>
          )}
          <span className="absolute bottom-3 left-3">
            <AnalysisStatusBadge status={asset.aiStatus} />
          </span>
        </div>
        <div className="p-4">
          <p className="truncate text-sm font-bold">{asset.originalFilename}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="max-w-[65%] truncate rounded-full bg-fog px-2.5 py-1 text-[11px] font-semibold text-stone">
              {asset.project.name}
            </span>
            <span className="text-[11px] text-stone">
              {format(new Date(asset.createdAt), "MMM d")}
            </span>
          </div>
          {asset.activity && (
            <p className="mt-3 truncate text-xs text-emerald-700">
              {asset.activity}
            </p>
          )}
        </div>
      </button>
      <button
        aria-label={selected ? "Deselect evidence" : "Select evidence"}
        onClick={onToggle}
        className={cn(
          "absolute left-3 top-3 grid size-7 place-items-center rounded-lg border backdrop-blur transition",
          selected
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-white/60 bg-black/30 text-white opacity-0 group-hover:opacity-100",
          selectionMode && "opacity-100",
        )}
      >
        {selected && <Check size={15} />}
      </button>
      <button
        aria-label={asset.favorite ? "Remove favorite" : "Add favorite"}
        title={asset.favorite ? "Remove favorite" : "Add favorite"}
        onClick={onFavorite}
        className="absolute right-3 top-3 rounded-lg bg-black/35 p-1.5 text-white backdrop-blur transition hover:bg-black/55"
      >
        <Star
          size={16}
          className={asset.favorite ? "fill-amber-400 text-amber-400" : ""}
        />
      </button>
    </article>
  );
}
