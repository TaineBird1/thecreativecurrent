import { ChangeRequestList } from "../components/ChangeRequestList";

export function AdminChangeRequests() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-sans text-2xl font-bold">Change Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every client's requested changes, in one checklist.</p>
      </div>
      <ChangeRequestList canUpdateStatus showBusinessName />
    </div>
  );
}
