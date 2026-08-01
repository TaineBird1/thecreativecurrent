import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import { useSEO } from "../lib/seo";

const tabs = [
  { label: "Dashboard", to: "/portal" },
  { label: "Change Requests", to: "/portal/requests" },
];

export function PortalLayout() {
  useSEO({ title: "Portal | The Creative Current", description: "Client portal.", noindex: true });

  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <h1 className="font-sans text-2xl font-bold">Your Portal</h1>
            <p className="mt-1 text-sm text-muted-foreground">Signed in as {profile?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            Sign Out
          </button>
        </div>
        <nav className="mx-auto mt-6 flex max-w-4xl gap-6">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/portal"}
              className={({ isActive }) =>
                `border-b-2 pb-2 text-sm font-medium transition-colors ${
                  isActive ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <Outlet />
      </div>
    </div>
  );
}
