"use client";
/**
 * Turns "not signed in" into a sign-in screen instead of a white page.
 *
 * Every public Convex function now throws when the session is missing, expired
 * or revoked. A React app subscribed to a dozen of those does not degrade
 * gracefully when they all start throwing: the tree unmounts and the browser
 * shows "Application error: a client-side exception has occurred", which tells
 * the person nothing and offers them nothing.
 *
 * That is not an edge case. Sessions expire on their own, so this is the normal
 * end of every session — and it also happens for a minute whenever the Convex
 * functions are deployed ahead of the site, which is exactly how it was found.
 *
 * A boundary rather than handling it at each call site: there are seventy-odd
 * of them, and the one that got missed would be the one someone hit.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

/** Matches convex/lib/session.ts. Convex prefixes the message on the way out. */
function isAuthError(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /NotAuthenticatedError|Not signed in to the office|session has expired/i.test(text);
}

interface Props {
  children: ReactNode;
  /** Clears the stored token and sends the person back to the passcode screen. */
  onSignOut: () => void;
}

interface State {
  failed: "auth" | "other" | null;
  /**
   * The message, shown on the card.
   *
   * The first version said "the details are in the browser console", which is
   * useless to the person actually looking at it — they are standing in front
   * of a broken screen, not a debugger, and getting the message out of DevTools
   * took several minutes and three wrong panels. If we know what went wrong,
   * say what went wrong.
   */
  detail: string;
}

export class SessionBoundary extends Component<Props, State> {
  state: State = { failed: null, detail: "" };

  static getDerivedStateFromError(error: unknown): State {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      failed: isAuthError(error) ? "auth" : "other",
      detail: detail.slice(0, 1500),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // Still log it. A boundary that swallows the detail makes the next one
    // harder to find than the white screen was.
    console.error("Office error boundary:", error, info.componentStack);
  }

  render() {
    if (this.state.failed === null) return this.props.children;

    const auth = this.state.failed === "auth";
    return (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="w-full max-w-xl rounded-2xl border border-edge bg-panel p-7 text-sm">
          <h1 className="mb-2 font-semibold text-cream">
            {auth ? "Signed out" : "Something broke"}
          </h1>
          <p className="mb-3 leading-relaxed text-muted">
            {auth
              ? "Your session has expired or was revoked. Sign in again to carry on — nothing was lost."
              : "The office hit an error it could not recover from."}
          </p>
          {!auth && this.state.detail && (
            <pre className="mb-5 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-edge bg-ink p-3 text-[11px] leading-relaxed text-muted">
              {this.state.detail}
            </pre>
          )}
          <button
            onClick={() => {
              if (auth) this.props.onSignOut();
              else window.location.reload();
            }}
            className="w-full rounded-lg bg-lamp px-4 py-2 font-medium text-ink transition hover:opacity-90"
          >
            {auth ? "Sign in again" : "Reload"}
          </button>
        </div>
      </div>
    );
  }
}
