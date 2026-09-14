"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { Gate } from "@/app/components/Gate";

/**
 * One Convex client for the whole app. Every screen subscribes through it, so
 * "live, no refresh" is the default rather than something each page arranges.
 */
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!convex) {
    return (
      <div className="mx-auto max-w-lg p-10 text-sm leading-relaxed">
        <h1 className="mb-3 text-lg font-semibold text-cream">Not connected yet</h1>
        <p className="text-muted">
          <code className="text-lamp">NEXT_PUBLIC_CONVEX_URL</code> isn&apos;t set, so there is no
          backend to talk to. Run <code className="text-lamp">npx convex dev</code> once — it writes
          the URL into <code className="text-lamp">.env.local</code> for you. See{" "}
          <code className="text-lamp">SETUP.md</code>.
        </p>
      </div>
    );
  }

  // Convex's websocket and localStorage both belong to the browser. Rendering
  // nothing until mount keeps the static export from hydrating against a
  // different tree than it was built with.
  if (!mounted) return null;

  return (
    <ConvexProvider client={convex}>
      <Gate>{children}</Gate>
    </ConvexProvider>
  );
}
