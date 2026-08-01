import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { useSEO } from "../lib/seo";

function SetPasswordForm() {
  const { clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }
    clearPasswordRecovery();
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8"
      >
        <div>
          <h1 className="font-sans text-2xl font-bold">Set Your Password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a password for your account.</p>
        </div>

        <div className="grid gap-2">
          <label htmlFor="new-password" className="text-sm text-muted-foreground">
            New Password
          </label>
          <input
            id="new-password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="confirm-password" className="text-sm text-muted-foreground">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Set Password"}
        </button>
      </form>
    </section>
  );
}

export function PortalLogin() {
  useSEO({ title: "Sign In | The Creative Current", description: "Sign in to your portal.", noindex: true });

  const { session, profile, loading, passwordRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (passwordRecovery) {
    return <SetPasswordForm />;
  }

  if (!loading && session && profile) {
    return <Navigate to={profile.role === "admin" ? "/admin" : "/portal"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8"
      >
        <div>
          <h1 className="font-sans text-2xl font-bold">Portal Login</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your account.</p>
        </div>

        <div className="grid gap-2">
          <label htmlFor="login-email" className="text-sm text-muted-foreground">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="login-password" className="text-sm text-muted-foreground">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-black px-4 text-foreground outline-none focus:border-primary"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </section>
  );
}
