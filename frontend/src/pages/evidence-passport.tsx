import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Copy, ExternalLink, Globe, Loader2, Lock, ScrollText } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useParams } from "react-router-dom";
import { passportApi } from "@/api/trust";
import { PageHeading } from "@/components/page-heading";
import { QrCode } from "@/components/qr-code";
import { ProvenanceFacts, TrustChecks } from "@/components/trust-panel";
import { ReviewBadge } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { cloudinaryDisplay, cloudinaryThumbnail } from "@/lib/cloudinary";

/** Everything needed to stand behind one piece of evidence, on one page. */
export function EvidencePassportPage() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["passport", id], queryFn: () => passportApi.get(id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["passport", id] });
  const share = useMutation({ mutationFn: () => passportApi.share(id), onSuccess: () => { toast.success("Public passport link created"); refresh(); }, onError: (e) => toast.error(e.message) });
  const unshare = useMutation({ mutationFn: () => passportApi.unshare(id), onSuccess: () => { toast.success("Public link withdrawn"); refresh(); }, onError: (e) => toast.error(e.message) });
  if (isLoading) return <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-stone" /></div>;
  if (isError || !data) return <div className="card p-10 text-center">This evidence could not be found.</div>;
  const { asset, reviewer, derived, related, delivery, publicPath } = data.passport;
  const publicUrl = publicPath ? `${window.location.origin}${publicPath}` : null;
  return (
    <div className="max-w-6xl">
      <Link to={`/app/projects/${asset.project.id}`} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-stone hover:text-ink"><ArrowLeft size={16} />{asset.project.name}</Link>
      <PageHeading eyebrow="Evidence passport" title={asset.originalFilename} description="Fingerprint, capture facts, every trust check, the human decision, and every file made from this evidence." />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-[26px] bg-ink">
            {asset.resourceType === "VIDEO"
              ? <video controls src={asset.secureUrl} className="max-h-[520px] w-full" />
              : <img src={cloudinaryDisplay(asset.secureUrl)} alt={asset.description || asset.originalFilename} className="max-h-[520px] w-full object-contain" />}
          </div>
          <section className="card p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Trust checks</h2>
              <ReviewBadge status={asset.reviewStatus} />
            </div>
            <TrustChecks checks={asset.trustChecks} />
            <p className="mt-4 text-xs text-stone">
              {(asset.reviewStatus ?? "PENDING") === "PENDING" ? "No reviewer has decided on this evidence yet." : `${reviewer ?? "A reviewer"} marked it ${(asset.reviewStatus ?? "").toLowerCase().replace("_", " ")}${asset.reviewedAt ? ` on ${format(new Date(asset.reviewedAt), "d MMM yyyy")}` : ""}.`}
              {asset.reviewNote ? ` Note: “${asset.reviewNote}”` : ""}
            </p>
          </section>
          {related.length > 0 && (
            <section className="card p-6">
              <h2 className="font-display text-xl font-bold">Earlier evidence this resembles</h2>
              <p className="mt-1 text-sm text-stone">Shown side by side so a reviewer can decide in seconds.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <figure><img src={cloudinaryThumbnail(asset.secureUrl, 600, 450)} alt="This upload" className="aspect-[4/3] w-full rounded-xl object-cover" /><figcaption className="mt-2 text-xs text-stone">This upload · {format(new Date(asset.createdAt), "d MMM yyyy")}</figcaption></figure>
                {related.map((item) => (
                  <Link key={item.id} to={`/app/evidence/${item.id}`}>
                    <figure><img src={cloudinaryThumbnail(item.secureUrl, 600, 450, item.resourceType === "VIDEO")} alt={item.originalFilename} className="aspect-[4/3] w-full rounded-xl object-cover ring-2 ring-amber-400" /><figcaption className="mt-2 text-xs text-stone">{item.project.name} · {format(new Date(item.capturedAt ?? item.createdAt), "d MMM yyyy")}</figcaption></figure>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
        <div className="space-y-6">
          <section className="card p-6"><h2 className="mb-4 font-display text-xl font-bold">Provenance</h2><ProvenanceFacts asset={asset} /></section>
          <section className="card p-6">
            <div className="flex items-center gap-2">{publicUrl ? <Globe size={18} className="text-emerald-700" /> : <Lock size={18} />}<h2 className="font-display text-xl font-bold">Public passport</h2></div>
            {publicUrl ? (
              <>
                <p className="mt-2 text-sm text-stone">Anyone with this link sees the evidence with faces blurred, the location rounded to about 1 km, and no names or emails.</p>
                <div className="mt-4 flex items-center gap-4">
                  <QrCode value={publicUrl} size={120} className="rounded-xl border border-black/10" />
                  <div className="min-w-0 space-y-2">
                    <code className="block break-all text-xs text-stone">{publicUrl}</code>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(publicUrl).then(() => toast.success("Link copied"))}><Copy size={14} />Copy</Button>
                      <a href={publicUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink size={14} />Open</Button></a>
                      {can("evidence.curate") && <Button size="sm" variant="ghost" className="text-red-600" disabled={unshare.isPending} onClick={() => unshare.mutate()}>Withdraw</Button>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-stone">Private to your organization. Publishing creates a link (and QR code) a funder or the public can use to verify this evidence.</p>
                {can("evidence.curate") && <Button className="mt-4" size="sm" disabled={share.isPending} onClick={() => share.mutate()}>{share.isPending ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}Publish passport</Button>}
              </>
            )}
          </section>
          <section className="card p-6">
            <div className="flex items-center gap-2"><ScrollText size={18} /><h2 className="font-display text-xl font-bold">Transformation ledger</h2></div>
            <p className="mt-1 text-sm text-stone">Every rendition and campaign file is a Cloudinary transformation of the original. Re-running the string reproduces the file exactly.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {[...derived.map((item) => ({ key: item.id, label: `${item.kind.replace("_", " ").toLowerCase()} · ${format(new Date(item.createdAt), "d MMM")}`, transformation: item.transformation, url: item.url })),
                ...delivery.map((item) => ({ key: item.purpose, label: item.purpose, transformation: item.transformation, url: item.url }))].map((item) => (
                <li key={item.key} className="rounded-xl border border-black/[.07] p-3">
                  <div className="flex items-center justify-between gap-3"><p className="font-semibold capitalize">{item.label}</p><a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-700">Open</a></div>
                  <code className="mt-1 block max-h-20 overflow-y-auto break-all text-[11px] text-stone">{item.transformation}</code>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
