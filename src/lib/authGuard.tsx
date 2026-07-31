import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth";

function PortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      Loading…
    </div>
  );
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <PortalLoading />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "admin") return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export function RequireCustomer({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <PortalLoading />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "customer") return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
