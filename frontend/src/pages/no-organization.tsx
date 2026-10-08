import { Building2, Mail } from "lucide-react";
import { useState } from "react";
import { CreateOrgDialog } from "@/components/org-dialogs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

/** Shown when the signed-in user belongs to no organization (e.g. they left their last one). */
export function NoOrganizationPage() {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<"create" | null>(null);
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card p-8 text-center md:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink text-lime"><Building2 size={24} /></span>
        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-[-.04em]">You are not in an organization yet</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone">
          {user?.name.split(" ")[0]}, every project and every piece of evidence lives inside an organization. If your team uses FieldProof, ask an admin to add this email address; you will be notified. Or start your own organization.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-center gap-2 rounded-full border border-black/10 bg-fog px-4 text-sm text-stone"><Mail size={16} />Ask your admin to add {user?.email}</div>
          <Button size="lg" onClick={() => setDialog("create")}><Building2 size={17} />Create an organization</Button>
        </div>
      </div>
      <CreateOrgDialog open={dialog === "create"} onOpenChange={(open) => setDialog(open ? "create" : null)} />
    </div>
  );
}
