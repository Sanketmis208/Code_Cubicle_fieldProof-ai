import {
  Bell,
  ChevronDown,
  GitCompareArrows,
  LayoutDashboard,
  Library,
  Menu,
  Search,
  Settings,
  X,
  FileText,
  FolderKanban,
  LogOut,
  Building2,
  ClipboardCheck,
  Wand2,
  SearchCheck,
  Camera,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import toast from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Brand } from "@/components/brand";
import { useAuth } from "@/contexts/auth-context";
import { authApi } from "@/api/auth";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/org-switcher";
import { NoOrganizationPage } from "@/pages/no-organization";
import { ROLE_INFO } from "@/lib/roles";
import type { Permission } from "@/types";

const nav: Array<{ to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; permission?: Permission }> = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/projects", label: "Projects", icon: FolderKanban },
  { to: "/app/library", label: "Evidence Library", icon: Library },
  { to: "/app/review", label: "Review", icon: ClipboardCheck, permission: "evidence.review" },
  { to: "/app/comparisons", label: "Comparisons", icon: GitCompareArrows },
  { to: "/app/reports", label: "Reports", icon: FileText },
  { to: "/app/story", label: "Story Studio", icon: Wand2, permission: "story.create" },
  { to: "/app/claims", label: "Claim checker", icon: SearchCheck },
  { to: "/app/organization", label: "Organization", icon: Building2 },
];

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const { user, setUser, membership, can } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const currentSection = location.pathname.includes("/projects/")
    ? "Projects / Workspace"
    : (nav.find((item) =>
        item.end
          ? location.pathname === item.to
          : location.pathname.startsWith(item.to),
      )?.label ?? "Workspace");
  const logout = async () => {
    // Sign out locally even when the server call fails (e.g. expired session).
    try {
      await authApi.logout();
    } catch {
      /* the local sign-out below is what matters */
    }
    queryClient.clear();
    setUser(null);
    navigate("/");
    toast.success("Signed out");
  };
  const sidebar = (
    <>
      <div className="px-6 py-8">
        <Brand light />
        <p className="mt-3 pl-12 text-[9px] font-bold uppercase tracking-[.22em] text-white/25">Evidence operating system</p>
        <div className="mt-6"><OrgSwitcher onNavigate={() => setMobileOpen(false)} /></div>
      </div>
      <nav className="flex-1 space-y-1.5 px-4">
        {nav.filter((item) => !item.permission || can(item.permission)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-sm font-semibold transition duration-300",
                isActive
                  ? "bg-lime text-ink shadow-[0_12px_32px_rgba(185,244,89,.15)]"
                  : "text-white/50 hover:translate-x-1 hover:bg-white/[.055] hover:text-white",
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      {can("evidence.upload") ? (
        <NavLink to="/capture" className="m-4 flex items-center gap-3 rounded-[24px] border border-lime/30 bg-lime/10 p-4 text-sm text-white transition hover:bg-lime/15">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lime text-ink"><Camera size={18} /></span>
          <span><span className="block font-semibold">Live capture</span><span className="text-xs text-white/50">Camera only · place and time recorded</span></span>
        </NavLink>
      ) : (
        <div className="m-4 rounded-[24px] border border-white/10 bg-white/[.045] p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-lime">
            <span className="size-2 rounded-full bg-lime" />
            System ready
          </div>
          <p className="text-xs leading-5 text-white/50">Evidence from your team appears in this workspace.</p>
        </div>
      )}
    </>
  );
  return (
    <div className="relative min-h-screen bg-[#f2f0e8]">
      <div className="map-grid pointer-events-none fixed inset-0 opacity-35" />
      <div className="grain pointer-events-none fixed inset-0 z-[60] opacity-20" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-hidden border-r border-white/5 bg-ink lg:flex">
        <div className="grid-glow pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative flex h-full flex-col">
        {sidebar}
        </div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-72 flex-col overflow-hidden bg-ink">
            <div className="grid-glow pointer-events-none absolute inset-0 opacity-35" />
            <div className="relative flex h-full flex-col">
            {sidebar}
            </div>
            <button
              aria-label="Close navigation"
              className="absolute right-4 top-7 text-white"
              onClick={() => setMobileOpen(false)}
            >
              <X />
            </button>
          </aside>
        </div>
      )}
      <div className="relative lg:pl-[280px]">
        <header className="sticky top-0 z-20 flex h-20 items-center gap-4 border-b border-black/[.07] bg-[#f2f0e8]/80 px-4 backdrop-blur-2xl md:px-8">
          <button aria-label="Open navigation" className="grid size-10 place-items-center rounded-full border border-black/10 bg-white/60 lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
          </button>
          <p className="eyebrow hidden text-stone xl:block">
            {currentSection}
          </p>
          <form
            className="relative hidden max-w-lg flex-1 md:block"
            onSubmit={(event) => {
              event.preventDefault();
              if (globalSearch.trim())
                navigate(
                  `/app/library?q=${encodeURIComponent(globalSearch.trim())}`,
                );
            }}
          >
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone"
              size={17}
            />
            <input
              aria-label="Search all evidence"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              className="w-full rounded-full border border-black/[.08] bg-white/65 py-3 pl-10 pr-4 text-sm shadow-[inset_0_1px_0_white] outline-none transition focus:border-black/20 focus:bg-white"
              placeholder="Search evidence, projects, locations…"
            />
          </form>
          <div className="ml-auto flex items-center gap-2">
            <button
              aria-label="Notifications"
              title="No new notifications"
              disabled
              className="relative grid size-10 place-items-center rounded-full border border-transparent hover:border-black/10 hover:bg-white/60"
            >
              <Bell size={19} />
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="focus-ring flex items-center gap-2 rounded-full border border-black/10 bg-white/55 p-1.5 pr-3 transition hover:bg-white">
                  <span className="grid size-8 place-items-center rounded-full bg-ink text-xs font-bold text-lime">
                    {user?.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-sm font-semibold leading-4">
                      {user?.name}
                    </span>
                    <span className="text-xs text-stone">
                      {membership ? `${ROLE_INFO[membership.role].label} · ${membership.organization.name}` : "No organization"}
                    </span>
                  </span>
                  <ChevronDown size={15} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 min-w-48 rounded-xl border border-black/10 bg-white p-1.5 shadow-soft"
                >
                  <DropdownMenu.Item
                    onSelect={() => navigate("/app/settings")}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none hover:bg-fog"
                  >
                    <Settings size={16} />
                    Profile settings
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={logout}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                  >
                    <LogOut size={16} />
                    Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <main className="relative p-4 md:p-8 lg:p-10">
          <div key={location.pathname} className="route-enter mx-auto max-w-[1560px]">
            {membership ? <Outlet /> : <NoOrganizationPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
