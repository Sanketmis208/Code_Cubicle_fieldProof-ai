import { useState } from "react";
import { cloudinaryThumbnail } from "@/lib/cloudinary";
import type { ComparisonAsset } from "@/types";

/** Drag to wipe between before and after; both use the same smart crop so they line up. */
export function BeforeAfterSlider({ before, after }: { before: ComparisonAsset; after: ComparisonAsset }) {
  const [position, setPosition] = useState(50);
  const src = (asset: ComparisonAsset) => cloudinaryThumbnail(asset.secureUrl, 1200, 600, asset.resourceType === "VIDEO");
  return (
    <div className="relative aspect-[2/1] select-none overflow-hidden bg-ink">
      <img src={src(after)} alt={`After: ${after.originalFilename}`} className="absolute inset-0 size-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
        <img src={src(before)} alt={`Before: ${before.originalFilename}`} className="absolute inset-0 size-full object-cover" draggable={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${position}%` }} />
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">Before</span>
      <span className="absolute right-3 top-3 rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-ink">After</span>
      <input aria-label="Compare before and after" type="range" min={0} max={100} value={position} onChange={(event) => setPosition(Number(event.target.value))}
        className="absolute inset-x-0 bottom-3 mx-auto w-2/3 accent-lime" />
    </div>
  );
}
