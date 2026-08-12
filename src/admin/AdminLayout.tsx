import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import { WvcLogo } from "../components/WvcLogo";
import {
  IconTrendingUp,
  IconInbox,
  IconGitBranch,
  IconReceipt,
  IconUsers,
  IconClipboardList,
  IconActivity,
  IconShield,
  IconLogOut,
} from "./components/icons";
import { useSEO } from "../lib/seo";

// Overview doubles as the income dashboard (MRR, invoiced/paid/outstanding)
// rather than a separate "Income" page -- that's the literal "overview of
// income for the business" ask. Pipeline keeps the /admin/outreach route
// (renaming it would break every existing link/bookmark) but reads as its
// own section in the nav, same as Leads now folds in what used to be a
// separate Abandoned Inquiries page.
const navItems = [
  { label: "Overview", to: "/admin", icon: IconTrendingUp, end: true },
  { label: "Leads", to: "/admin/leads", icon: IconInbox },
  { label: "Pipeline", to: "/admin/outreach", icon: IconGitBranch },
  { label: "Invoicing", to: "/admin/invoicing", icon: IconReceipt },
  { label: "Customers", to: "/admin/customers", icon: IconUsers },
  { label: "Change Requests", to: "/admin/change-requests", icon: IconClipboardList },
  { label: "Activity", to: "/admin/activity", icon: IconActivity },
];

// Owner-only, appended separately rather than living in navItems -- it's
// the one link that must never show up for an invited admin.
const ownerNavItem = { label: "Staff", to: "/admin/staff", icon: IconShield, end: false };

export function AdminLayout() {
  useSEO({ title: "Admin | The Creative Current", description: "Admin dashboard.", noindex: true });

  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="admin-theme flex min-h-screen items-center justify-center bg-background text-foreground">
        Loading…
      </div>
    );
  }
  if (!session || !profile) return <Navigate to="/login" replace />;
  // 'owner' is a superset of 'admin' -- see sql/schema.sql's is_admin().
  if (profile.role !== "admin" && profile.role !== "owner") return <Navigate to="/portal" replace />;

  const items = profile.role === "owner" ? [...navItems, ownerNavItem] : navItems;

  return (
    <div className="admin-theme flex min-h-screen bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-6 py-6">
          <WvcLogo className="h-8 w-8 rounded-full" />
          <div>
            <p className="font-sans text-sm font-bold leading-tight">The Creative Current</p>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Admin</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`
              }
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <p className="truncate px-2 text-xs text-muted-foreground">{profile?.email}</p>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            <IconLogOut className="size-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
