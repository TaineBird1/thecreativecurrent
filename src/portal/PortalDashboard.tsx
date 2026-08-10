import { useAuth } from "../lib/auth";
import { LiveVisitorCount } from "../components/LiveVisitorCount";
import { TrafficChart } from "../components/TrafficChart";
import { RevenueTracker } from "../components/RevenueTracker";

export function PortalDashboard() {
  const { profile } = useAuth();

  if (!profile?.customer_id) {
    return <p className="text-sm text-muted-foreground">No site is linked to your account yet.</p>;
  }

  return (
    <div className="space-y-6">
      <RevenueTracker customerId={profile.customer_id} />
      <LiveVisitorCount customerId={profile.customer_id} />
      <TrafficChart customerId={profile.customer_id} />
    </div>
  );
}
