import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreateOrgDialog } from "@/components/org-dialogs";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_INFO } from "@/lib/roles";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

/** Sidebar control showing the active organization and the user's role in it. */
export function OrgSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { memberships, membership, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"create" | null>(null);
  if (!membership) return null;
  const { organization, role } = membership;
  const itemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-fog";
  return (
    <>
      {/* Non-modal so opening a dialog from a menu item does not fight over focus. */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button className="focus-ring group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-2.5 text-left transition hover:bg-white/[.08]" aria-label="Switch organization">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-lime font-display text-xs font-extrabold text-ink">{initials(organization.name)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-white">{organization.name}</span>
              <span className="block text-[11px] text-white/45">{ROLE_INFO[role].label}{organization.personal ? " · personal" : ""}</span>
            </span>
            <ChevronsUpDown size={15} className="shrink-0 text-white/40 transition group-hover:text-white/70" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={8} className="z-50 w-[248px] rounded-xl border border-black/10 bg-white p-1.5 shadow-soft">
            <DropdownMenu.Label className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[.18em] text-stone">Your organizations</DropdownMenu.Label>
            {memberships.map((item) => {
              const active = item.organization.id === organization.id;
              return (
                <DropdownMenu.Item
                  key={item.organization.id}
                  onSelect={() => { switchOrganization(item.organization.id); navigate("/app"); onNavigate?.(); }}
                  className={cn(itemClass, active && "bg-fog")}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-ink text-[10px] font-bold text-lime">{initials(item.organization.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{item.organization.name}</span>
                    <span className="block text-xs text-stone">{ROLE_INFO[item.role].label}</span>
                  </span>
                  {active && <Check size={15} className="text-emerald-700" />}
                </DropdownMenu.Item>
              );
            })}
            <DropdownMenu.Separator className="my-1.5 h-px bg-black/[.07]" />
            <DropdownMenu.Item onSelect={() => { navigate("/app/organization"); onNavigate?.(); }} className={itemClass}>
              <Building2 size={16} /> Organization settings
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => setDialog("create")} className={itemClass}>
              <Plus size={16} /> Create organization
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <CreateOrgDialog open={dialog === "create"} onOpenChange={(open) => setDialog(open ? "create" : null)} />
    </>
  );
}
