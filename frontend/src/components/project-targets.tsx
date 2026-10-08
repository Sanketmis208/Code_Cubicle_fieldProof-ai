import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Hash, Loader2, Plus, Target as TargetIcon, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { sitesApi, targetsApi } from "@/api/trust";
import { ReviewBadge } from "@/components/trust-badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import type { Target } from "@/types";

/**
 * "How many?" Photos show that planting happened; tallies record how many,
 * batch by batch, each tied to a site and the photos of that day, and
 * confirmed by a reviewer. The claim "500 saplings" is then a number with a
 * trail behind it, not a caption.
 */
export function ProjectTargets({ projectId }: { projectId: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const targets = useQuery({ queryKey: ["targets", projectId], queryFn: () => targetsApi.list(projectId) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["targets", projectId] });
    void qc.invalidateQueries({ queryKey: ["project", projectId] });
  };
  const remove = useMutation({
    mutationFn: (targetId: string) => targetsApi.remove(projectId, targetId),
    onSuccess: () => { toast.success("Target removed"); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  if (targets.isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-stone" /></div>;
  if (targets.isError) return <div className="card p-8 text-center text-sm text-red-600">Targets could not be loaded.</div>;
  return (
    <div className="space-y-6">
      {can("project.edit") && <NewTargetForm projectId={projectId} onCreated={refresh} />}
      {!targets.data?.targets.length ? (
        <div className="card border-dashed p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-fog text-stone"><TargetIcon /></span>
          <h3 className="mt-4 font-display font-bold">No targets yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone">A target is a number the project commits to, such as 500 saplings or 40 toilets. Field staff record each batch, a reviewer confirms it, and reports can state the count with evidence behind it.</p>
        </div>
      ) : targets.data.targets.map((target) => (
        <TargetCard key={target.id} target={target} projectId={projectId} onChange={refresh} onRemove={can("project.edit") ? () => window.confirm(`Remove “${target.label}” and its tallies?`) && remove.mutate(target.id) : undefined} />
      ))}
    </div>
  );
}

function NewTargetForm({ projectId, onCreated }: { projectId: string; onCreated: () => void }) {
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [count, setCount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const create = useMutation({
    mutationFn: () => targetsApi.create(projectId, { label: label.trim(), unit: unit.trim(), targetCount: Number(count), dueDate: dueDate || null }),
    onSuccess: () => { toast.success("Target set"); setLabel(""); setUnit(""); setCount(""); setDueDate(""); onCreated(); },
    onError: (error) => toast.error(error.message),
  });
  const valid = label.trim().length >= 2 && unit.trim().length >= 1 && Number(count) >= 1;
  return (
    <form className="card p-6" onSubmit={(event: FormEvent) => { event.preventDefault(); if (valid) create.mutate(); }}>
      <div className="flex items-center gap-2"><TargetIcon size={18} /><h2 className="font-display text-lg font-bold">Set a target</h2></div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_.8fr_.7fr_.9fr_auto] md:items-end">
        <div><label className="label" htmlFor="target-label">What</label><input id="target-label" className="field" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder="Saplings planted along the canal road" /></div>
        <div><label className="label" htmlFor="target-unit">Unit</label><input id="target-unit" className="field" value={unit} maxLength={40} onChange={(e) => setUnit(e.target.value)} placeholder="saplings" /></div>
        <div><label className="label" htmlFor="target-count">Target</label><input id="target-count" inputMode="numeric" className="field" value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="500" /></div>
        <div><label className="label" htmlFor="target-due">Due <span className="normal-case tracking-normal text-stone/60">(optional)</span></label><input id="target-due" type="date" className="field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <Button disabled={!valid || create.isPending}>{create.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}Add</Button>
      </div>
    </form>
  );
}

function TargetCard({ target, projectId, onChange, onRemove }: { target: Target; projectId: string; onChange: () => void; onRemove?: () => void }) {
  const { can, user } = useAuth();
  const [open, setOpen] = useState(false);
  const review = useMutation({
    mutationFn: ({ tallyId, decision }: { tallyId: string; decision: "APPROVED" | "REJECTED" }) => targetsApi.reviewTally(tallyId, decision),
    onSuccess: () => { toast.success("Count reviewed"); onChange(); },
    onError: (error) => toast.error(error.message),
  });
  const { progress } = target;
  const unconfirmed = progress.recorded - progress.confirmed;
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{target.label}</h2>
          <p className="mt-1 text-sm text-stone">Target {target.targetCount.toLocaleString()} {target.unit}{target.dueDate ? ` by ${format(new Date(target.dueDate), "d MMM yyyy")}` : ""} · {progress.batches} batch{progress.batches === 1 ? "" : "es"} recorded</p>
        </div>
        <div className="flex items-center gap-2">
          {can("evidence.upload") && <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}><Hash size={15} />Record a batch</Button>}
          {onRemove && <Button size="sm" variant="ghost" className="text-red-600" onClick={onRemove}><Trash2 size={15} /></Button>}
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-baseline justify-between text-sm">
          <p><strong className="font-display text-2xl">{progress.confirmed.toLocaleString()}</strong> <span className="text-stone">confirmed of {target.targetCount.toLocaleString()}</span></p>
          <p className="text-xs text-stone">{unconfirmed > 0 ? `${unconfirmed.toLocaleString()} recorded, awaiting review` : "all recorded counts reviewed"}</p>
        </div>
        <div className="relative mt-2 h-3 overflow-hidden rounded-full bg-fog" role="progressbar" aria-valuemin={0} aria-valuemax={target.targetCount} aria-valuenow={progress.confirmed} aria-label={`${target.label}: ${progress.confirmed} of ${target.targetCount} confirmed`}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-amber-300 transition-[width] duration-700" style={{ width: `${progress.recordedPercent}%` }} />
          <div className="absolute inset-y-0 left-0 rounded-full bg-emerald-600 transition-[width] duration-700" style={{ width: `${progress.confirmedPercent}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone">
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-600" />confirmed by a reviewer</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-amber-300" />recorded</span>
          <span>{progress.withEvidence.toLocaleString()} backed by photo events</span>
        </div>
      </div>
      {open && <TallyForm target={target} projectId={projectId} onDone={() => { setOpen(false); onChange(); }} />}
      {target.tallies.length > 0 && (
        <ul className="mt-5 divide-y divide-black/[.05] border-t border-black/[.06]">
          {target.tallies.map((tally) => {
            const own = tally.recordedById === user?.id;
            return (
              <li key={tally.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <span className="font-display text-lg font-bold tabular-nums">{tally.count.toLocaleString()}</span>
                <span className="text-stone">{format(new Date(tally.recordedAt), "d MMM yyyy")}{tally.site ? ` · ${tally.site.name}` : ""}</span>
                {tally.eventCluster ? (
                  <Link to={`/app/evidence/${tally.eventCluster.representativeIds[0] ?? ""}`} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100">{tally.eventCluster.assetCount} photo{tally.eventCluster.assetCount === 1 ? "" : "s"} →</Link>
                ) : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">no photos linked</span>}
                {tally.note && <span className="min-w-0 flex-1 truncate text-stone">“{tally.note}”</span>}
                <span className="ml-auto flex items-center gap-2">
                  <ReviewBadge status={tally.reviewStatus} />
                  {tally.reviewStatus === "PENDING" && can("evidence.review") && (
                    <span className={cn("flex gap-1", own && "opacity-50")} title={own ? "You recorded this count; another reviewer must confirm it" : undefined}>
                      <Button size="sm" variant="outline" disabled={own || review.isPending} onClick={() => review.mutate({ tallyId: tally.id, decision: "APPROVED" })}><Check size={14} />Confirm</Button>
                      <Button size="sm" variant="ghost" className="text-red-600" disabled={own || review.isPending} onClick={() => review.mutate({ tallyId: tally.id, decision: "REJECTED" })}><X size={14} /></Button>
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TallyForm({ target, projectId, onDone }: { target: Target; projectId: string; onDone: () => void }) {
  const sites = useQuery({ queryKey: ["sites", projectId], queryFn: () => sitesApi.list(projectId) });
  const events = useQuery({ queryKey: ["events", projectId], queryFn: () => targetsApi.events(projectId) });
  const [count, setCount] = useState("");
  const [recordedAt, setRecordedAt] = useState(new Date().toISOString().slice(0, 10));
  const [siteId, setSiteId] = useState("");
  const [eventClusterId, setEventClusterId] = useState("");
  const [note, setNote] = useState("");
  const add = useMutation({
    mutationFn: () => targetsApi.addTally(target.id, {
      count: Number(count), recordedAt: new Date(`${recordedAt}T12:00:00`).toISOString(),
      siteId: siteId || undefined, eventClusterId: eventClusterId || undefined, note: note.trim() || undefined,
    }),
    onSuccess: () => { toast.success(`${count} ${target.unit} recorded, awaiting review`); onDone(); },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form className="mt-5 grid gap-3 rounded-2xl bg-fog p-4 md:grid-cols-[.6fr_.9fr_1fr_1.2fr_1.2fr_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); if (Number(count) >= 1) add.mutate(); }}>
      <div><label className="label" htmlFor="tally-count">{target.unit}</label><input id="tally-count" inputMode="numeric" className="field" value={count} onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))} placeholder="120" autoFocus /></div>
      <div><label className="label" htmlFor="tally-date">Date</label><input id="tally-date" type="date" className="field" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} /></div>
      <div><label className="label" htmlFor="tally-site">Site</label><select id="tally-site" className="field" value={siteId} onChange={(e) => setSiteId(e.target.value)}><option value="">Not specified</option>{sites.data?.sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></div>
      <div>
        <label className="label" htmlFor="tally-event">Photos of this batch</label>
        <select id="tally-event" className="field" value={eventClusterId} onChange={(e) => setEventClusterId(e.target.value)}>
          <option value="">None yet</option>
          {events.data?.events.map((event) => <option key={event.id} value={event.id}>{format(new Date(event.startedAt), "d MMM, HH:mm")} · {event.assetCount} photo{event.assetCount === 1 ? "" : "s"}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="tally-note">Note</label><input id="tally-note" className="field" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Morning batch, canal road" /></div>
      <Button disabled={Number(count) < 1 || add.isPending}>{add.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}Record</Button>
    </form>
  );
}
