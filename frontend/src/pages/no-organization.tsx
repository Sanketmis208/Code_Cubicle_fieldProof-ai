import { Building2, KeyRound } from "lucide-react";
import { useState } from "react";
import { CreateOrgDialog, JoinOrgDialog } from "@/components/org-dialogs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";

/** Shown when the signed-in user belongs to no organization (e.g. they left their last one). */
export function NoOrganizationPage() {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="card p-8 text-center md:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-ink text-lime"><Building2 size={24} /></span>
        <h1 className="mt-6 font-display text-3xl font-extrabold tracking-[-.04em]">You are not in an organization yet</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone">
          {user?.name.split(" ")[0]}, every project and every piece of evidence lives inside an organization. Join your team with the code they sent you, or start a new one.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button size="lg" onClick={() => setDialog("join")}><KeyRound size={17} />Join with a code</Button>
          <Button size="lg" variant="outline" onClick={() => setDialog("create")}><Building2 size={17} />Create an organization</Button>
        </div>
      </div>
      <CreateOrgDialog open={dialog === "create"} onOpenChange={(open) => setDialog(open ? "create" : null)} />
      <JoinOrgDialog open={dialog === "join"} onOpenChange={(open) => setDialog(open ? "join" : null)} />
    </div>
  );
}
