import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge } from "../components/StatusBadge";
import type { InviteStaffApiResponse, RemoveStaffApiResponse, StaffMember } from "../lib/staff";

export function AdminStaff() {
  const { profile } = useAuth();

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadStaff() {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, email, role, created_at")
      .in("role", ["owner", "admin"])
      .order("created_at", { ascending: true });
    setStaff((data as StaffMember[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadStaff();
  }, []);

  // Route-guard in addition to the nav link being hidden -- someone with a
  // direct link and only 'admin' shouldn't reach this page at all.
  if (profile && profile.role !== "owner") return <Navigate to="/admin" replace />;

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Not authenticated.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "invite", email }),
      });
      const data: InviteStaffApiResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(!data.ok ? data.error : "Something went wrong.");
        return;
      }
      setSuccess(`Invited ${email} as an admin.`);
      setEmail("");
      await loadStaff();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(member: StaffMember) {
    if (!window.confirm(`Remove admin access for ${member.email}? They won't be able to sign in again.`)) {
      return;
    }
    setRemovingId(member.id);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "remove", id: member.id }),
      });
      const data: RemoveStaffApiResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(!data.ok ? data.error : "Something went wrong.");
        return;
      }
      await loadStaff();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-sans text-2xl font-bold">Staff</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invite admins to help run the back office, and revoke access when they no longer need it. Only owners can
          see this page.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">Invite an Admin</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-4 p-6">
          <div className="grid flex-1 gap-2">
            <label htmlFor="s-email" className="text-sm text-muted-foreground">
              Email
            </label>
            <input
              id="s-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="h-11 rounded-lg border border-border bg-background px-4 text-foreground outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="h-11 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
          >
            {submitting ? "Inviting..." : "Invite Admin"}
          </button>
        </form>
        {error && (
          <p role="alert" className="px-6 pb-6 text-sm text-destructive">
            {error}
          </p>
        )}
        {success && <p className="px-6 pb-6 text-sm text-primary">{success}</p>}
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-sans text-sm font-semibold">All Staff ({staff.length})</h2>
        </div>
        {loading ? (
          <p className="px-6 py-6 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Since</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staff.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-foreground/[0.03]">
                    <td className="px-6 py-4 text-foreground">{s.email}</td>
                    <td className="px-6 py-4">
                      <StatusBadge label={s.role} tone={s.role === "owner" ? "primary" : "neutral"} />
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {s.role === "admin" && (
                        <button
                          type="button"
                          onClick={() => handleRemove(s)}
                          disabled={removingId === s.id}
                          className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive hover:text-white disabled:opacity-50"
                        >
                          {removingId === s.id ? "Removing..." : "Remove access"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
