"use client";

import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState, type ReactNode } from "react";

const KEY = "tcc-office-token";

/**
 * The passcode gate.
 *
 * This app holds prospect contact details and can send email, so it cannot sit
 * on a public URL. One passcode, one signed token, no user table — see
 * convex/auth.ts for what this does and does not protect against.
 */
export function Gate({ children }: { children: ReactNode }) {
  const login = useAction(api.auth.login);
  const check = useAction(api.auth.check);

  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(KEY);
    if (!token) {
      setState("locked");
      return;
    }
    check({ token })
      .then((r) => setState(r.ok ? "open" : "locked"))
      .catch(() => setState("locked"));
  }, [check]);

  if (state === "checking") {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-faint">
        <span className="thinking-dots">Opening up</span>
      </div>
    );
  }

  if (state === "open") return <>{children}</>;

  return (
    <div className="grid min-h-screen place-items-center px-6">
      <form
        className="w-full max-w-sm rounded-2xl border border-edge bg-panel p-7 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await login({ passcode });
            if (result.ok && result.token) {
              localStorage.setItem(KEY, result.token);
              setState("open");
            } else {
              setError(result.error ?? "That's not the passcode.");
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="mb-1 text-2xl">🌙</div>
        <h1 className="text-lg font-semibold">The Creative Current</h1>
        <p className="mb-6 text-sm text-faint">The office is locked.</p>

        <input
          type="password"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Passcode"
          className="w-full rounded-lg border border-edge bg-ink px-3 py-2.5 text-sm outline-none focus:border-lamp"
        />
        {error && <p className="mt-3 text-xs leading-relaxed text-rust">{error}</p>}
        <button
          type="submit"
          disabled={busy || !passcode}
          className="mt-4 w-full rounded-lg bg-lamp px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-40"
        >
          {busy ? "Checking…" : "Come in"}
        </button>
      </form>
    </div>
  );
}
