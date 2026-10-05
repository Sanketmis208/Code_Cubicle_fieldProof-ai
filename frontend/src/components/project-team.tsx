import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserMinus, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { orgsApi } from "@/api/orgs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_INFO } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { OrgRole } from "@/types";

const ORG_WIDE: OrgRole[] = ["OWNER", "ADMIN", "VIEWER"];

function Person({ name, email, role }: { name: string; email?: string; role: OrgRole | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[11px] font-bold text-lime">
        {name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-stone">{role ? ROLE_INFO[role].label : "No longer a member"}{email ? ` · ${email}` : ""}</p>
      </div>
    </div>
  );
}

/** Who can see this project: assigned people plus roles that see every project. */
export function ProjectTeam({ projectId }: { projectId: string }) {
  const { membership, can } = useAuth();
  const qc = useQueryClient();
  const manage = can("project.members.manage");
  const orgId = membership!.organization.id;
  const team = useQuery({ queryKey: ["project-team", projectId], queryFn: () => orgsApi.projectTeam(projectId) });
  const members = useQuery({ queryKey: ["org-members", orgId], queryFn: () => orgsApi.members(orgId), enabled: manage && can("org.members.view") });
  const [pick, setPick] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["project-team", projectId] });
  const assign = useMutation({
    mutationFn: (userId: string) => orgsApi.assign(projectId, userId),
    onSuccess: () => { toast.success("Assigned to the project"); setPick(""); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  const unassign = useMutation({
    mutationFn: (userId: string) => orgsApi.unassign(projectId, userId),
    onSuccess: () => { toast.success("Removed from the project"); refresh(); },
    onError: (error) => toast.error(error.message),
  });
  if (team.isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-stone" /></div>;
  if (team.isError || !team.data) return <div className="card p-8 text-center text-sm text-red-600">The project team could not be loaded.</div>;
  const assignedIds = new Set(team.data.assigned.map((entry) => entry.user.id));
  const candidates = (members.data?.members ?? []).filter((member) => !ORG_WIDE.includes(member.role) && !assignedIds.has(member.user.id));
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
      <section className="card p-6">
        <div className="flex items-center gap-2"><Users size={18} /><h2 className="font-display text-lg font-bold">Assigned team</h2></div>
        <p className="mt-1 text-sm text-stone">Program managers, verifiers and field workers see this project only while assigned.</p>
        {manage && (
          <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (pick) assign.mutate(pick); }}>
            <select aria-label="Member to assign" className="field flex-1" value={pick} onChange={(event) => setPick(event.target.value)} disabled={!candidates.length}>
              <option value="">{candidates.length ? "Choose a member…" : "Everyone eligible is already assigned"}</option>
              {candidates.map((member) => <option key={member.user.id} value={member.user.id}>{member.user.name} · {ROLE_INFO[member.role].label}</option>)}
            </select>
            <Button disabled={!pick || assign.isPending}>{assign.isPending ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}Assign</Button>
          </form>
        )}
        <ul className="mt-5 divide-y divide-black/[.05]">
          {!team.data.assigned.length && <li className="py-6 text-center text-sm text-stone">Nobody is assigned yet.</li>}
          {team.data.assigned.map((entry) => (
            <li key={entry.user.id} className="flex items-center justify-between gap-3 py-3">
              <Person name={entry.user.name} email={entry.user.email} role={entry.role} />
              {manage && (
                <Button size="sm" variant="ghost" className="text-red-600" disabled={unassign.isPending} onClick={() => unassign.mutate(entry.user.id)}>
                  <UserMinus size={14} />Unassign
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Also has access</h2>
        <p className="mt-1 text-sm text-stone">Owners, admins and viewers see every project in the organization.</p>
        <ul className="mt-5 space-y-3">
          {team.data.orgWide.map((entry) => (
            <li key={entry.user.id} className={cn("rounded-xl bg-fog/70 p-3")}>
              <Person name={entry.user.name} email={entry.user.email} role={entry.role} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
