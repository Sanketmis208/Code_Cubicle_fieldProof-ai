import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Copy, Download, EyeOff, ImagePlus, Loader2, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { assetsApi } from "@/api/assets";
import { projectsApi } from "@/api/projects";
import { storyApi } from "@/api/trust";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { ReviewBadge, TrustBadge } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { cloudinaryThumbnail } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";
import type { DerivedAsset, StoryKind } from "@/types";

const KINDS: Array<{ kind: StoryKind; label: string; detail: string; photos: number }> = [
  { kind: "SQUARE_CARD", label: "Instagram card", detail: "1080 × 1080", photos: 1 },
  { kind: "STORY", label: "Story / status", detail: "1080 × 1920", photos: 1 },
  { kind: "BEFORE_AFTER", label: "Before / after poster", detail: "1600 × 900, two photos", photos: 2 },
];

/**
 * Campaign assets made only from Cloudinary transformations of approved
 * evidence: faces blurred by default, a QR to the public passport on every
 * file, and the exact transformation recorded so it can be reproduced.
 */
export function StoryStudioPage() {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const [projectId, setProjectId] = useState("");
  const [kind, setKind] = useState<StoryKind>("SQUARE_CARD");
  const [selected, setSelected] = useState<string[]>([]);
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [blurFaces, setBlurFaces] = useState(true);
  const [result, setResult] = useState<{ derived: DerivedAsset; passportUrl: string } | null>(null);
  const activeProject = projectId || projects.data?.projects[0]?.id || "";
  const evidence = useQuery({
    queryKey: ["assets", "story", activeProject],
    queryFn: () => assetsApi.list({ projectId: activeProject, resourceType: "IMAGE", reviewStatus: "APPROVED", limit: 48 }),
    enabled: Boolean(activeProject),
  });
  const gallery = useQuery({ queryKey: ["stories", activeProject], queryFn: () => storyApi.list(activeProject || undefined), enabled: Boolean(activeProject) });
  const needed = KINDS.find((entry) => entry.kind === kind)!.photos;
  const compose = useMutation({
    mutationFn: () => storyApi.compose({ kind, assetIds: selected, headline: headline.trim(), subline: subline.trim() || undefined, blurFaces }),
    onSuccess: (data) => { setResult(data); void qc.invalidateQueries({ queryKey: ["stories"] }); toast.success("Campaign asset ready"); },
    onError: (error) => toast.error(error.message),
  });
  const toggle = (id: string) =>
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(-needed));
  const ready = selected.length === needed && headline.trim().length >= 3;
  return (
    <>
      <PageHeading eyebrow="Campaign-ready content" title="Story Studio" description="Turn reviewer-approved evidence into cards, stories and before/after posters. Every file is a Cloudinary transformation of the original, carries a QR to its evidence passport, and blurs faces unless you say otherwise." />
      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="card space-y-5 p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="story-project">Project</label>
              <select id="story-project" className="field" value={activeProject} onChange={(event) => { setProjectId(event.target.value); setSelected([]); }}>
                {projects.data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </div>
            <div>
              <p className="label">Format</p>
              <div className="grid grid-cols-3 gap-2">
                {KINDS.map((entry) => (
                  <button key={entry.kind} type="button" onClick={() => { setKind(entry.kind); setSelected((current) => current.slice(0, entry.photos)); }}
                    className={cn("rounded-xl border px-2 py-2 text-left text-xs transition", kind === entry.kind ? "border-ink bg-ink text-white" : "border-black/10 hover:bg-fog")}>
                    <span className="block font-bold">{entry.label}</span><span className="opacity-70">{entry.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div>
            <p className="label">{needed === 2 ? "Pick the before photo, then the after photo" : "Pick a photo"} <span className="normal-case tracking-normal text-stone/70">(approved evidence only)</span></p>
            {evidence.isLoading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-stone" /></div>
              : !evidence.data?.assets.length ? <EmptyState icon={ImagePlus} title="No approved photos yet" description="A reviewer has to approve evidence before it can be published. Open Review to clear the queue." />
                : (
                  <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                    {evidence.data.assets.map((asset) => {
                      const position = selected.indexOf(asset.id);
                      return (
                        <button key={asset.id} type="button" onClick={() => toggle(asset.id)} className={cn("relative overflow-hidden rounded-xl ring-offset-2 transition", position >= 0 ? "ring-2 ring-emerald-600" : "hover:opacity-90")}>
                          <img src={cloudinaryThumbnail(asset.secureUrl, 240, 180)} alt={asset.originalFilename} className="aspect-[4/3] w-full object-cover" />
                          <span className="absolute bottom-1 left-1"><TrustBadge status={asset.trustStatus} score={asset.trustScore} compact /></span>
                          {position >= 0 && <span className="absolute right-1 top-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{needed === 2 ? (position === 0 ? "BEFORE" : "AFTER") : "✓"}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div><label className="label" htmlFor="story-headline">Headline</label><input id="story-headline" className="field" value={headline} maxLength={90} onChange={(event) => setHeadline(event.target.value)} placeholder="1,200 saplings planted in Bassi" /></div>
            <div><label className="label" htmlFor="story-subline">Line under it <span className="normal-case tracking-normal text-stone/60">(optional)</span></label><input id="story-subline" className="field" value={subline} maxLength={120} onChange={(event) => setSubline(event.target.value)} placeholder="Green Roots Foundation · Feb 2026" disabled={kind === "BEFORE_AFTER"} /></div>
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-fog p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={blurFaces} onChange={(event) => setBlurFaces(event.target.checked)} />
            <span><span className="flex items-center gap-1.5 font-semibold"><EyeOff size={15} />Blur faces</span><span className="text-stone">On by default for anything leaving the organization. Turn off only with consent from everyone pictured (and a guardian for children).</span></span>
          </label>
          <Button className="w-full" size="lg" disabled={!ready || compose.isPending} onClick={() => compose.mutate()}>
            {compose.isPending ? <Loader2 size={17} className="animate-spin" /> : <Wand2 size={17} />}Generate {KINDS.find((entry) => entry.kind === kind)!.label.toLowerCase()}
          </Button>
        </section>
        <section className="space-y-6">
          {result ? (
            <div className="card overflow-hidden">
              <img src={result.derived.url} alt="Generated campaign asset" className="w-full bg-ink" />
              <div className="space-y-3 p-5 text-sm">
                <div className="flex flex-wrap gap-2">
                  <a href={result.derived.url} target="_blank" rel="noreferrer"><Button size="sm"><Download size={14} />Open full size</Button></a>
                  <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(result.derived.url).then(() => toast.success("URL copied"))}><Copy size={14} />Copy URL</Button>
                </div>
                <p className="text-xs text-stone">The QR on the image opens <a className="font-semibold text-emerald-700" href={result.passportUrl} target="_blank" rel="noreferrer">this evidence passport</a>.</p>
                <details className="rounded-xl bg-ink p-3 text-white">
                  <summary className="cursor-pointer text-xs font-bold text-lime">Powered by Cloudinary · the transformation</summary>
                  <code className="mt-2 block break-all text-[11px] text-white/70">{result.derived.transformation}</code>
                </details>
              </div>
            </div>
          ) : (
            <div className="card grid min-h-64 place-items-center p-8 text-center text-sm text-stone"><div><Sparkles className="mx-auto mb-3 text-emerald-700" />Your campaign asset appears here.</div></div>
          )}
          <div className="card p-5">
            <h2 className="font-display text-lg font-bold">Published from this project</h2>
            {!gallery.data?.derived.length ? <p className="mt-2 text-sm text-stone">Nothing yet.</p> : (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {gallery.data.derived.map((item) => (
                  <a key={item.id} href={item.url} target="_blank" rel="noreferrer" title={`${item.kind} · ${format(new Date(item.createdAt), "d MMM")}`} className="overflow-hidden rounded-lg bg-ink">
                    <img src={item.url.replace("/upload/", "/upload/c_limit,w_300/")} alt={item.kind} className="aspect-square w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <p className="flex items-center gap-2 text-xs text-stone"><ReviewBadge status="APPROVED" /> Only approved evidence is offered, so nothing unreviewed reaches donors.</p>
        </section>
      </div>
    </>
  );
}
