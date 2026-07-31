import { ChangeRequestList } from "../components/ChangeRequestList";

export function AdminChangeRequests() {
  return (
    <div>
      <h2 className="mb-6 font-sans text-lg font-semibold">Change Request Checklist</h2>
      <ChangeRequestList canUpdateStatus showBusinessName />
    </div>
  );
}
