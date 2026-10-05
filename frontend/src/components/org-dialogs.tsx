import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { Building2, KeyRound, Loader2, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { orgsApi } from "@/api/orgs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { ORG_TYPES } from "@/lib/roles";
import type { OrgType } from "@/types";

function Shell({ open, onOpenChange, icon, title, description, children }: {
  open: boolean; onOpenChange: (open: boolean) => void; icon: ReactNode; title: string; description: string; children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-soft md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink text-lime">{icon}</span>
              <div>
                <Dialog.Title className="font-display text-xl font-bold">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-stone">{description}</Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-fog"><X size={18} /></button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Re-reads memberships, then makes the new organization the active one. */
function useEnterOrganization() {
  const { refreshSession, switchOrganization } = useAuth();
  const navigate = useNavigate();
  return async (organizationId: string) => {
    await refreshSession();
    switchOrganization(organizationId);
    navigate("/app");
  };
}

export function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("NGO");
  const enter = useEnterOrganization();
  const create = useMutation({
    mutationFn: () => orgsApi.create({ name: name.trim(), type }),
    onSuccess: async ({ organization }) => {
      toast.success(`${organization.name} is ready`);
      onOpenChange(false);
      setName("");
      await enter(organization.id);
    },
    onError: (error) => toast.error(error.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length >= 2) create.mutate();
  };
  return (
    <Shell open={open} onOpenChange={onOpenChange} icon={<Building2 size={18} />} title="Create an organization" description="You become its owner. Projects and evidence inside it are visible only to its members.">
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="org-name">Name</label>
          <input id="org-name" className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Green Roots Foundation" maxLength={120} autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="org-type">Type</label>
          <select id="org-type" className="field" value={type} onChange={(event) => setType(event.target.value as OrgType)}>
            {ORG_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <Button className="w-full" disabled={name.trim().length < 2 || create.isPending}>
          {create.isPending && <Loader2 className="animate-spin" size={16} />}Create organization
        </Button>
      </form>
    </Shell>
  );
}

export function JoinOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [code, setCode] = useState("");
  const enter = useEnterOrganization();
  const join = useMutation({
    mutationFn: () => orgsApi.join(code),
    onSuccess: async ({ organization }) => {
      toast.success(`You joined ${organization.name}`);
      onOpenChange(false);
      setCode("");
      await enter(organization.id);
    },
    onError: (error) => toast.error(error.message),
  });
  const ready = code.replace(/[^a-z0-9]/gi, "").length >= 8;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) join.mutate();
  };
  return (
    <Shell open={open} onOpenChange={onOpenChange} icon={<KeyRound size={18} />} title="Join with an invite code" description="Ask an owner or admin of the organization for a code. Codes are single-use unless they say otherwise.">
      <form className="mt-6 space-y-4" onSubmit={submit}>
        <div>
          <label className="label" htmlFor="invite-code">Invite code</label>
          <input id="invite-code" className="field text-center font-mono text-lg uppercase tracking-[.3em]" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABCD-2345" maxLength={20} autoComplete="off" spellCheck={false} autoFocus />
        </div>
        <Button className="w-full" disabled={!ready || join.isPending}>
          {join.isPending && <Loader2 className="animate-spin" size={16} />}Join organization
        </Button>
      </form>
    </Shell>
  );
}
