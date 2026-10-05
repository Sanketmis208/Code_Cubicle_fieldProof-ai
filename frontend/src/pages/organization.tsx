import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
  Ban, Building2, Check, Copy, KeyRound, Link2, Loader2, LogOut, ScrollText, ShieldAlert, ShieldCheck, UserMinus, Users,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { orgsApi } from "@/api/orgs";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { canManageRole, grantableRoles, ORG_TYPES, ROLE_INFO, ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AuditEntry, Invite, InviteStatus, OrgMember, OrgRole, OrgType } from "@/types";

type Tab = "members" | "invites" | "settings" | "audit";

export function RoleBadge({ role }: { role: OrgRole }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold", ROLE_INFO[role].tone)}>{ROLE_INFO[role].label}</span>;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function OrganizationPage() {
  const { membership, can } = useAuth();
  const orgId = membership?.organization.id ?? "";
  const details = useQuery({ queryKey: ["org", orgId], queryFn: () => orgsApi.get(orgId), enabled: Boolean(orgId) });
  const tabs: Array<{ key: Tab; label: string; visible: boolean }> = [
    { key: "members", label: "Members", visible: can("org.members.view") },
    { key: "invites", label: "Invites", visible: can("org.invites.manage") },
    { key: "settings", label: "Settings", visible: can("org.settings") },
    { key: "audit", label: "Audit log", visible: can("audit.view") },
  ];
  const visibleTabs = tabs.filter((tab) => tab.visible);
  const [tab, setTab] = useState<Tab | null>(null);
  const activeTab = tab && visibleTabs.some((item) => item.key === tab) ? tab : visibleTabs[0]?.key;
  if (!membership) return null;
  const org = details.data?.organization;
  const typeLabel = ORG_TYPES.find((type) => type.value === membership.organization.type)?.label;
  return (
    <div className="max-w-6xl">
      <PageHeading
        eyebrow="Organization"
        title={membership.organization.name}
        description={`${typeLabel ?? "Organization"}${membership.organization.personal ? " · personal workspace" : ""}${org ? ` · ${org._count.memberships} member${org._count.memberships === 1 ? "" : "s"} · ${org._count.projects} project${org._count.projects === 1 ? "" : "s"}` : ""}`}
      />
      <div className="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink text-lime"><ShieldCheck size={20} /></span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">Your role</p><RoleBadge role={membership.role} /></div>
          <p className="mt-1 text-sm text-stone">{ROLE_INFO[membership.role].description} {membership.allProjects ? "You see every project in this organization." : "You see only the projects you are assigned to."}</p>
        </div>
      </div>
      {!visibleTabs.length ? (
        <EmptyState icon={Users} title="Nothing to manage here" description="Your role does not include member or settings management. Ask an owner or admin if you need more access." />
      ) : (
        <>
          <div role="tablist" aria-label="Organization sections" className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl border border-black/[.08] bg-white/60 p-1">
            {visibleTabs.map((item) => (
              <button key={item.key} role="tab" aria-selected={activeTab === item.key} onClick={() => setTab(item.key)}
                className={cn("rounded-xl px-4 py-2 text-sm font-semibold transition", activeTab === item.key ? "bg-ink text-white" : "text-stone hover:text-ink")}>
                {item.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {activeTab === "members" && <MembersTab orgId={orgId} />}
            {activeTab === "invites" && <InvitesTab orgId={orgId} orgName={membership.organization.name} />}
            {activeTab === "settings" && <SettingsTab orgId={orgId} name={membership.organization.name} type={membership.organization.type} />}
            {activeTab === "audit" && <AuditTab orgId={orgId} />}
          </div>
        </>
      )}
    </div>
  );
}

function MembersTab({ orgId }: { orgId: string }) {
  const { user, membership, can, refreshSession } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["org-members", orgId], queryFn: () => orgsApi.members(orgId) });
  const myRole = membership!.role;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["org-members", orgId] });
  const setRole = useMutation({
    mutationFn: ({ member, role }: { member: OrgMember; role: OrgRole }) => orgsApi.setRole(orgId, member.user.id, role),
    onSuccess: (_result, { member, role }) => { toast.success(`${member.user.name} is now ${ROLE_INFO[role].label.toLowerCase()}`); refresh(); },
    onError: (error) => { toast.error(error.message); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (member: OrgMember) => orgsApi.removeMember(orgId, member.user.id),
    onSuccess: async (_result, member) => {
      if (member.user.id === user?.id) { toast.success("You left the organization"); await refreshSession(); return; }
      toast.success(`${member.user.name} was removed`);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  if (isLoading) return <div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-stone" /></div>;
  if (isError || !data) return <div className="card p-8 text-center text-sm text-red-600">Members could not be loaded.</div>;
  const manage = can("org.members.manage");
  return (
    <div className="card overflow-hidden">
      <div className="hidden grid-cols-[1.6fr_1fr_.7fr_.8fr_auto] gap-4 border-b border-black/[.06] px-5 py-3 text-[10px] font-bold uppercase tracking-[.18em] text-stone md:grid">
        <span>Member</span><span>Role</span><span>Projects</span><span>Joined</span><span className="w-24" />
      </div>
      <ul className="divide-y divide-black/[.05]">
        {data.members.map((member) => {
          const self = member.user.id === user?.id;
          const editable = manage && !self && canManageRole(myRole, member.role);
          const options = ROLES.filter((role) => role === member.role || canManageRole(myRole, member.role, role));
          return (
            <li key={member.user.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.6fr_1fr_.7fr_.8fr_auto] md:items-center md:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-lime">{initials(member.user.name)}</span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{member.user.name}{self && <span className="ml-2 text-xs font-normal text-stone">(you)</span>}</p>
                  <p className="truncate text-sm text-stone">{member.user.email}</p>
                </div>
              </div>
              <div>
                {editable ? (
                  <select aria-label={`Role for ${member.user.name}`} className="field py-2" value={member.role} disabled={setRole.isPending}
                    onChange={(event) => setRole.mutate({ member, role: event.target.value as OrgRole })}>
                    {options.map((role) => <option key={role} value={role}>{ROLE_INFO[role].label}</option>)}
                  </select>
                ) : <RoleBadge role={member.role} />}
              </div>
              <p className="text-sm text-stone">{["OWNER", "ADMIN", "VIEWER"].includes(member.role) ? "All projects" : `${member.assignedProjects} assigned`}</p>
              <p className="text-sm text-stone">{format(new Date(member.createdAt), "d MMM yyyy")}</p>
              <div className="w-24 md:text-right">
                {self ? (
                  <Button size="sm" variant="ghost" disabled={remove.isPending}
                    onClick={() => window.confirm("Leave this organization? You will lose access to its projects immediately.") && remove.mutate(member)}>
                    <LogOut size={15} />Leave
                  </Button>
                ) : editable ? (
                  <Button size="sm" variant="ghost" className="text-red-600" disabled={remove.isPending}
                    onClick={() => window.confirm(`Remove ${member.user.name}? They lose access immediately and are unassigned from every project.`) && remove.mutate(member)}>
                    <UserMinus size={15} />Remove
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const STATUS_STYLE: Record<InviteStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700", USED: "bg-slate-100 text-slate-600", EXPIRED: "bg-amber-50 text-amber-700", REVOKED: "bg-red-50 text-red-700",
};

function InvitesTab({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { membership } = useAuth();
  const qc = useQueryClient();
  const roles = grantableRoles(membership!.role).filter((role) => role !== "OWNER");
  const [role, setRole] = useState<OrgRole>(roles.includes("FIELD_WORKER") ? "FIELD_WORKER" : roles[0]!);
  const [email, setEmail] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [maxUses, setMaxUses] = useState(1);
  const [issued, setIssued] = useState<{ code: string; invite: Invite } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["org-invites", orgId], queryFn: () => orgsApi.invites(orgId) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
  const create = useMutation({
    mutationFn: () => orgsApi.createInvite(orgId, { role, email: email.trim() || undefined, expiresInDays, maxUses: email.trim() ? 1 : maxUses }),
    onSuccess: (result) => { setIssued(result); setEmail(""); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: (invite: Invite) => orgsApi.revokeInvite(orgId, invite.id),
    onSuccess: () => { toast.success("Invite revoked"); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const link = issued ? `${window.location.origin}/sign-up?invite=${encodeURIComponent(issued.code)}` : "";
  const copy = (text: string, label: string) => navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`), () => toast.error("Copy failed; select the text instead"));
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate(); };
  return (
    <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
      <div className="space-y-6">
        <form className="card space-y-4 p-6" onSubmit={submit}>
          <div className="flex items-center gap-2"><KeyRound size={18} /><h2 className="font-display text-lg font-bold">New invite code</h2></div>
          <div>
            <label className="label" htmlFor="invite-role">Role</label>
            <select id="invite-role" className="field" value={role} onChange={(event) => setRole(event.target.value as OrgRole)}>
              {roles.map((item) => <option key={item} value={item}>{ROLE_INFO[item].label}</option>)}
            </select>
            <p className="mt-1.5 text-xs text-stone">{ROLE_INFO[role].description}</p>
          </div>
          <div>
            <label className="label" htmlFor="invite-email">Restrict to email <span className="normal-case tracking-normal text-stone/60">(optional)</span></label>
            <input id="invite-email" type="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="volunteer@example.org" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="invite-expiry">Expires in</label>
              <select id="invite-expiry" className="field" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))}>
                {[1, 7, 14, 30].map((days) => <option key={days} value={days}>{days} day{days > 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="invite-uses">Uses</label>
              <select id="invite-uses" className="field" value={email.trim() ? 1 : maxUses} disabled={Boolean(email.trim())} onChange={(event) => setMaxUses(Number(event.target.value))}>
                {[1, 5, 25, 100].map((uses) => <option key={uses} value={uses}>{uses === 1 ? "Single use" : `Up to ${uses} people`}</option>)}
              </select>
            </div>
          </div>
          <Button className="w-full" disabled={create.isPending}>{create.isPending && <Loader2 size={16} className="animate-spin" />}Create invite code</Button>
        </form>
        {issued && (
          <div className="card border-emerald-200 bg-emerald-50/70 p-6" aria-live="polite">
            <p className="eyebrow text-emerald-800">Share this now — it is shown only once</p>
            <p className="mt-4 select-all text-center font-mono text-3xl font-bold tracking-[.25em]">{issued.code}</p>
            <p className="mt-3 text-center text-xs text-emerald-900/70">{ROLE_INFO[issued.invite.role].label} · expires {format(new Date(issued.invite.expiresAt), "d MMM yyyy")} · {issued.invite.maxUses === 1 ? "single use" : `${issued.invite.maxUses} uses`}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={() => copy(issued.code, "Code")}><Copy size={15} />Copy code</Button>
              <Button type="button" variant="outline" onClick={() => copy(`Join ${orgName} on FieldProof: ${link}`, "Invite link")}><Link2 size={15} />Copy invite link</Button>
            </div>
          </div>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-black/[.06] px-5 py-4"><h2 className="font-display text-lg font-bold">Issued invites</h2><p className="text-sm text-stone">Codes are stored hashed; only their last two characters are shown.</p></div>
        {isLoading ? <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-stone" /></div> : !data?.invites.length ? (
          <p className="px-5 py-10 text-center text-sm text-stone">No invites yet.</p>
        ) : (
          <ul className="divide-y divide-black/[.05]">
            {data.invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="font-mono text-sm text-stone">••••-••{invite.codeHint}</span>
                <RoleBadge role={invite.role} />
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", STATUS_STYLE[invite.status])}>{invite.status.toLowerCase()}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-stone">
                  {invite.email ? `${invite.email} · ` : ""}{invite.usedCount}/{invite.maxUses} used · {invite.status === "ACTIVE" ? `expires ${formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}` : `created ${format(new Date(invite.createdAt), "d MMM")}`}
                </span>
                {invite.status === "ACTIVE" && (
                  <Button size="sm" variant="ghost" className="text-red-600" disabled={revoke.isPending} onClick={() => revoke.mutate(invite)}><Ban size={14} />Revoke</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SettingsTab({ orgId, name, type }: { orgId: string; name: string; type: OrgType }) {
  const { refreshSession } = useAuth();
  const [draftName, setDraftName] = useState(name);
  const [draftType, setDraftType] = useState<OrgType>(type);
  const save = useMutation({
    mutationFn: () => orgsApi.update(orgId, { name: draftName.trim(), type: draftType }),
    onSuccess: async () => { toast.success("Organization updated"); await refreshSession(); },
    onError: (error) => toast.error(error.message),
  });
  const dirty = draftName.trim() !== name || draftType !== type;
  return (
    <form className="card max-w-xl space-y-4 p-6" onSubmit={(event) => { event.preventDefault(); if (dirty) save.mutate(); }}>
      <div className="flex items-center gap-2"><Building2 size={18} /><h2 className="font-display text-lg font-bold">Organization details</h2></div>
      <div><label className="label" htmlFor="settings-name">Name</label><input id="settings-name" className="field" value={draftName} maxLength={120} onChange={(event) => setDraftName(event.target.value)} /></div>
      <div>
        <label className="label" htmlFor="settings-type">Type</label>
        <select id="settings-type" className="field" value={draftType} onChange={(event) => setDraftType(event.target.value as OrgType)}>
          {ORG_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <Button disabled={!dirty || draftName.trim().length < 2 || save.isPending}>{save.isPending && <Loader2 size={16} className="animate-spin" />}Save changes</Button>
    </form>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "org.created": "created the organization", "org.updated": "updated organization details",
  "invite.created": "created an invite", "invite.revoked": "revoked an invite",
  "member.joined": "joined", "member.left": "left the organization", "member.removed": "removed a member",
  "member.role_changed": "changed a member's role",
  "project.created": "created a project", "project.updated": "updated a project", "project.deleted": "deleted a project",
  "project.member_added": "assigned someone to a project", "project.member_removed": "unassigned someone from a project",
  "evidence.uploaded": "uploaded evidence", "evidence.deleted": "deleted evidence",
  "comparison.created": "generated a comparison", "comparison.deleted": "deleted a comparison",
  "report.created": "generated a report", "report.deleted": "deleted a report",
  "evidence.reviewed": "reviewed evidence", "site.created": "added a site", "site.deleted": "removed a site",
  "story.created": "published a campaign asset", "passport.shared": "published an evidence passport",
  "passport.unshared": "withdrew an evidence passport", "capture.signature_failed": "sent a capture whose signature failed",
};

function auditDetail(entry: AuditEntry) {
  const meta = entry.metadata ?? {};
  const role = (value: unknown) => (typeof value === "string" && value in ROLE_INFO ? ROLE_INFO[value as OrgRole].label : null);
  if (entry.action === "member.role_changed") return `${role(meta.from) ?? meta.from} → ${role(meta.to) ?? meta.to}`;
  if (entry.action === "evidence.reviewed" && typeof meta.decision === "string")
    return `${meta.decision.toLowerCase().replace("_", " ")}${typeof meta.filename === "string" ? ` · ${meta.filename}` : ""}${meta.selfReviewed ? " · self-reviewed" : ""}`;
  if (entry.action === "story.created" && typeof meta.kind === "string") return meta.kind.toLowerCase().replace("_", " ");
  if (typeof meta.name === "string") return meta.name;
  if (typeof meta.title === "string") return meta.title;
  if (typeof meta.filename === "string") return meta.filename;
  if (typeof meta.count === "number") return `${meta.count} file${meta.count === 1 ? "" : "s"}`;
  if (role(meta.role)) return role(meta.role);
  return null;
}

function AuditTab({ orgId }: { orgId: string }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ["org-audit", orgId], queryFn: () => orgsApi.audit(orgId) });
  if (isLoading) return <div className="grid h-48 place-items-center"><Loader2 className="animate-spin text-stone" /></div>;
  if (isError || !data) return <div className="card p-8 text-center text-sm text-red-600">The audit log could not be loaded.</div>;
  const { integrity } = data;
  return (
    <div className="space-y-4">
      <div className={cn("flex items-start gap-3 rounded-2xl p-4 text-sm", integrity.valid ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900")}>
        {integrity.valid ? <ShieldCheck size={18} className="mt-0.5 shrink-0" /> : <ShieldAlert size={18} className="mt-0.5 shrink-0" />}
        <p>{integrity.valid
          ? <>History verified: all {integrity.entries} entries are intact. Each entry carries a hash of the one before it, so any later edit or deletion would show here.</>
          : <>History has been altered at entry #{integrity.brokenAt}. Entries from that point can no longer be trusted; treat this as a security incident.</>}</p>
      </div>
      <div className="card overflow-hidden">
        {!data.entries.length ? <EmptyState icon={ScrollText} title="No activity yet" description="Actions in this organization will be recorded here." /> : (
          <ul className="divide-y divide-black/[.05]">
            {data.entries.map((entry) => {
              const detail = auditDetail(entry);
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
                  <span className="w-36 shrink-0 text-xs text-stone">{format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}</span>
                  <span className="min-w-0 flex-1"><strong className="font-semibold">{entry.actorName ?? "System"}</strong> {ACTION_LABEL[entry.action] ?? entry.action}{detail && <span className="text-stone"> · {detail}</span>}</span>
                  <span title={entry.hash} className="font-mono text-[11px] text-stone/70"><Check size={11} className="mr-1 inline" />{entry.hash.slice(0, 10)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
