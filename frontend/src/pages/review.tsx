import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, Check, CheckCheck, ClipboardCheck, Loader2, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { projectsApi } from "@/api/projects";
import { reviewApi } from "@/api/trust";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { TrustChecks } from "@/components/trust-panel";
import { TrustBadge } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { cloudinaryThumbnail } from "@/lib/cloudinary";
import { CHECK_LABEL, SOURCE_INFO } from "@/lib/trust";
import { cn } from "@/lib/utils";
import type { ReviewItem, ReviewStatus } from "@/types";

type Decision = Exclude<ReviewStatus, "PENDING">;

/**
 * The verifier's desk: riskiest first, grouped by event so 40 burst shots are
 * one decision, every flag shown with its reason, and nobody reviews their own upload.
 */
export function ReviewPage() {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<ReviewStatus>("PENDING");
  const [expanded, setExpanded] = useState<string | null>(null);
  const projects = useQuery({ queryKey: ["projects"], queryFn: projectsApi.list });
  const queue = useQuery({ queryKey: ["review-queue", projectId, status], queryFn: () => reviewApi.queue({ projectId: projectId || undefined, status }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["review-queue"] });
    void qc.invalidateQueries({ queryKey: ["assets"] });
    void qc.invalidateQueries({ queryKey: ["project"] });
  };
  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: Decision; note?: string }) => reviewApi.decide(id, decision, note),
    onSuccess: (_r, { decision }) => { toast.success(decision === "APPROVED" ? "Approved" : decision === "REJECTED" ? "Rejected" : "Re-shoot requested"); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const decideEvent = useMutation({
    mutationFn: (clusterId: string) => reviewApi.decideEvent(clusterId, "APPROVED"),
    onSuccess: ({ reviewed, left }) => {
      toast.success(`${reviewed} approved${left.length ? ` · ${left.length} left for individual review` : ""}`);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const ask = (item: ReviewItem, decision: Decision) => {
    if (decision === "APPROVED") return decide.mutate({ id: item.id, decision });
    const note = window.prompt(decision === "REJECTED" ? "Why is this rejected? The field worker will see this." : "What should the re-shoot capture?");
    if (note && note.trim().length >= 3) decide.mutate({ id: item.id, decision, note: note.trim() });
    else if (note !== null) toast.error("Please give a short reason");
  };

  const items = queue.data?.assets ?? [];
  // Group by event, keeping the riskiest-first order of each group's first item.
  const groups: Array<{ key: string; clusterId: string | null; items: ReviewItem[] }> = [];
  for (const item of items) {
    const key = item.eventClusterId ?? item.id;
    const group = groups.find((entry) => entry.key === key);
    if (group) group.items.push(item);
    else groups.push({ key, clusterId: item.eventClusterId ?? null, items: [item] });
  }
  const counts = queue.data?.counts ?? {};
  return (
    <>
      <PageHeading eyebrow="Separation of duties" title="Review" description="Riskiest evidence first. Each flag says why. Approve a whole event in one click; nobody approves their own upload." />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select aria-label="Project" className="field max-w-xs py-2.5" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">All projects</option>
          {projects.data?.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <div role="tablist" className="inline-flex gap-1 rounded-2xl border border-black/[.08] bg-white/60 p-1">
          {(["PENDING", "RESHOOT_REQUESTED", "APPROVED", "REJECTED"] as ReviewStatus[]).map((value) => (
            <button key={value} role="tab" aria-selected={status === value} onClick={() => setStatus(value)}
              className={cn("rounded-xl px-3 py-2 text-xs font-bold transition", status === value ? "bg-ink text-white" : "text-stone hover:text-ink")}>
              {value === "PENDING" ? "To review" : value === "RESHOOT_REQUESTED" ? "Re-shoot" : value.charAt(0) + value.slice(1).toLowerCase()}
              <span className="ml-1.5 tabular-nums opacity-70">{counts[value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      {queue.isLoading ? <div className="grid h-72 place-items-center"><Loader2 className="animate-spin text-stone" /></div>
        : queue.isError ? <div className="card p-8 text-center text-sm text-red-600">{(queue.error as Error).message}</div>
          : !groups.length ? <EmptyState icon={ClipboardCheck} title={status === "PENDING" ? "Nothing waiting for review" : "Nothing here"} description="New uploads from the field appear here, riskiest first." />
            : (
              <div className="space-y-5">
                {groups.map((group) => {
                  const lead = group.items[0]!;
                  const event = group.items.length > 1 && group.clusterId;
                  return (
                    <section key={group.key} className="card overflow-hidden">
                      {event && (
                        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[.06] bg-fog/60 px-5 py-3">
                          <p className="text-sm"><strong>One event</strong> · {group.items.length} shots awaiting review · {format(new Date(lead.capturedAt ?? lead.createdAt), "d MMM yyyy, HH:mm")}</p>
                          {status === "PENDING" && <Button size="sm" disabled={decideEvent.isPending} onClick={() => decideEvent.mutate(group.clusterId!)}><CheckCheck size={15} />Approve whole event</Button>}
                        </header>
                      )}
                      <ul className="divide-y divide-black/[.05]">
                        {group.items.map((item) => {
                          const blocked = item.ownUpload && !queue.data?.selfReviewAllowed;
                          return (
                            <li key={item.id} className="grid gap-4 p-4 md:grid-cols-[160px_1fr_auto] md:items-start">
                              <Link to={`/app/evidence/${item.id}`} className="block overflow-hidden rounded-xl bg-ink">
                                <img src={cloudinaryThumbnail(item.secureUrl, 320, 240, item.resourceType === "VIDEO")} alt={item.originalFilename} className="aspect-[4/3] w-full object-cover" />
                              </Link>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <TrustBadge status={item.trustStatus} score={item.trustScore} />
                                  <span className="rounded-full bg-fog px-2 py-1 text-[11px] font-bold text-stone">{SOURCE_INFO[item.captureSource ?? "WEB_UPLOAD"].label}</span>
                                  {item.ownUpload && <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-bold text-violet-900">Your upload</span>}
                                </div>
                                <p className="mt-2 truncate font-semibold">{item.originalFilename}</p>
                                <p className="text-xs text-stone">{item.project.name} · by {item.uploadedBy?.name ?? "former member"}{item.capturedByName ? ` for ${item.capturedByName}` : ""} · {format(new Date(item.createdAt), "d MMM, HH:mm")}</p>
                                {item.flags.length > 0 ? (
                                  <div className="mt-3">
                                    {expanded === item.id ? <TrustChecks checks={item.flags} /> : (
                                      <button onClick={() => setExpanded(item.id)} className="text-left text-sm text-amber-900">
                                        {item.flags.slice(0, 2).map((flag) => <span key={flag.id} className="mr-2 inline-block rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold">{CHECK_LABEL[flag.check] ?? flag.check}</span>)}
                                        <span className="text-xs underline">why?</span>
                                      </button>
                                    )}
                                  </div>
                                ) : <p className="mt-3 text-xs text-emerald-800">No warnings.</p>}
                                {item.reviewNote && <p className="mt-2 text-xs text-stone">Note: {item.reviewNote}</p>}
                              </div>
                              {status === "PENDING" || status === "RESHOOT_REQUESTED" ? (
                                <div className="flex flex-wrap gap-2 md:w-36 md:flex-col" title={blocked ? "You uploaded this. Another reviewer must decide." : undefined}>
                                  <Button size="sm" disabled={blocked || decide.isPending} onClick={() => ask(item, "APPROVED")}><Check size={15} />Approve</Button>
                                  <Button size="sm" variant="outline" disabled={blocked || decide.isPending} onClick={() => ask(item, "RESHOOT_REQUESTED")}><Camera size={15} />Re-shoot</Button>
                                  <Button size="sm" variant="outline" className="text-red-600" disabled={blocked || decide.isPending} onClick={() => ask(item, "REJECTED")}><X size={15} />Reject</Button>
                                </div>
                              ) : (
                                <p className="text-xs text-stone md:w-36">{item.reviewedAt ? `Decided ${format(new Date(item.reviewedAt), "d MMM, HH:mm")}` : "Decided"}</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  );
                })}
              </div>
            )}
    </>
  );
}
