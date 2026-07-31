import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";

export function PortalLayout() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between border-b border-border pb-6">
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
        <p className="mt-10 text-muted-foreground">
          Live traffic and change-request tools are coming here next.
        </p>
      </div>
    </div>
  );
}
