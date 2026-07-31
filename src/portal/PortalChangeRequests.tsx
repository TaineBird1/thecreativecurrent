import { useState } from "react";
import { useAuth } from "../lib/auth";
import { ChangeRequestForm } from "./components/ChangeRequestForm";
import { ChangeRequestList } from "../components/ChangeRequestList";

export function PortalChangeRequests() {
  const { profile } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);

  if (!profile?.customer_id) {
    return <p className="text-sm text-muted-foreground">No site is linked to your account yet.</p>;
  }

  return (
    <div className="space-y-8">
      <ChangeRequestForm customerId={profile.customer_id} onSubmitted={() => setRefreshKey((k) => k + 1)} />
      <div>
        <h2 className="mb-4 font-sans text-lg font-semibold">Your Requests</h2>
        <ChangeRequestList customerId={profile.customer_id} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
