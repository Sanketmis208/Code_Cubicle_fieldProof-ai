import { ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { useAuth } from "@/contexts/auth-context";

export function SettingsPage() {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl">
      <PageHeading eyebrow="Workspace" title="Profile settings" description="Your authenticated account and organization identity." />
      <div className="card p-6 md:p-8">
        <div className="flex items-center gap-4 border-b border-black/[.06] pb-6">
          <span className="grid size-14 place-items-center rounded-2xl bg-ink font-display text-lg font-bold text-lime">{user?.name.slice(0, 2).toUpperCase()}</span>
          <div><h2 className="font-display text-xl font-bold">{user?.name}</h2><p className="text-sm text-stone">{user?.email}</p></div>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <div><p className="label">Organization</p><p className="rounded-xl bg-fog px-4 py-3 text-sm">{user?.organizationName || "Not provided"}</p></div>
          <div><p className="label">Role</p><p className="rounded-xl bg-fog px-4 py-3 text-sm">{user?.role || "Workspace owner"}</p></div>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><p>Authentication uses a signed, HTTP-only session cookie. Media and AI provider credentials remain server-side.</p></div>
      </div>
    </div>
  );
}
