"use client";

import { useAuthedAction, useAuthedMutation, useAuthedQuery } from "@/app/lib/convexAuth";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, Empty, Pill, rand, relativeTime } from "../components/ui";

const TIERS = {
  essential: { label: "Essential", fee: 650 },
  growth: { label: "Growth", fee: 1100 },
  priority: { label: "Priority", fee: 1750 },
} as const;

export default function ClientsPage() {
  const clients = useAuthedQuery(api.clients.list);
  const requests = useAuthedQuery(api.clients.changeRequests);
  const sweep = useAuthedAction(api.agents.clientsuccess.sweepNow);
  const draftEmail = useAuthedAction(api.agents.clientsuccess.draftEmail);
  const setRequestStatus = useAuthedMutation(api.clients.setRequestStatus);
  const create = useAuthedMutation(api.clients.create);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [adding, setAdding] = useState(false);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setResult(await sweep({}));
              } catch (err) {
                setResult(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Checking…" : "Check all sites now"}
          </Button>
          <Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add a client"}</Button>
          <span className="ml-auto text-xs text-faint">
            Uptime is checked every 4 hours. Two failures in a row escalates to you.
          </span>
        </div>

        {result && <p className="text-xs text-cream">{result}</p>}

        {adding && (
          <Card className="p-4">
            <form
              className="grid gap-2 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const tier = f.get("carePlanTier") as keyof typeof TIERS;
                await create({
                  businessName: String(f.get("businessName")),
                  contactName: String(f.get("contactName")),
                  email: String(f.get("email")),
                  mobile: String(f.get("mobile")),
                  siteUrl: String(f.get("siteUrl")),
                  carePlanTier: tier,
                  monthlyFee: TIERS[tier].fee,
                });
                setAdding(false);
              }}
            >
              {["businessName", "contactName", "email", "mobile", "siteUrl"].map((name) => (
                <input
                  key={name}
                  name={name}
                  required
                  placeholder={name.replace(/([A-Z])/g, " $1").toLowerCase()}
                  className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-lamp"
                />
              ))}
              <select
                name="carePlanTier"
                className="rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none"
              >
                {Object.entries(TIERS).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.label} — {rand(t.fee)}/month
                  </option>
                ))}
              </select>
              <Button type="submit" tone="primary" className="sm:col-span-2">
                Add
              </Button>
            </form>
          </Card>
        )}

        {clients?.length === 0 && (
          <Empty>No clients yet. When a lead becomes one, add them here so Bongi can look after them.</Empty>
        )}

        {clients?.map((client) => (
          <Card key={client._id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{client.businessName}</span>
              <Pill tone="info">{TIERS[client.carePlanTier].label}</Pill>
              <span className="text-xs text-faint">{rand(client.monthlyFee)}/month</span>
              <span className="ml-auto flex items-center gap-1.5 text-xs">
                <span
                  className={`h-2 w-2 rounded-full ${
                    client.uptimePercent30d >= 99.5
                      ? "bg-lime"
                      : client.uptimePercent30d >= 97
                        ? "bg-lamp"
                        : "bg-rust"
                  }`}
                />
                {client.uptimePercent30d}% uptime
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
              <a href={client.siteUrl} target="_blank" rel="noreferrer" className="underline">
                {client.siteUrl}
              </a>
              <span>{client.contactName}</span>
              <span>
                last checked{" "}
                {client.lastCheckAt ? relativeTime(client.lastCheckAt) : "never"}
                {client.lastStatusCode ? ` (${client.lastStatusCode})` : ""}
              </span>
              {client.renewalDate && <span>renews {client.renewalDate}</span>}
              {client.openRequests > 0 && <Pill tone="warn">{client.openRequests} open request(s)</Pill>}
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setResult(await draftEmail({ clientId: client._id, kind: "checkin" }));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Draft a check-in
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setResult(await draftEmail({ clientId: client._id, kind: "renewal" }));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Draft a renewal reminder
              </Button>
            </div>
          </Card>
        ))}

        <h2 className="px-1 pt-4 text-xs uppercase tracking-wider text-faint">Change requests</h2>
        {requests?.length === 0 && <Empty>Nothing outstanding.</Empty>}
        {requests?.map((r) => (
          <Card key={r._id} className="flex flex-wrap items-center gap-2 p-3">
            <Pill
              tone={
                r.status === "done" ? "good" : r.status === "needs_approval" ? "warn" : "neutral"
              }
            >
              {r.status.replace(/_/g, " ")}
            </Pill>
            <span className="text-xs font-medium">{r.businessName}</span>
            <span className="min-w-0 flex-1 text-xs text-muted">{r.description}</span>
            {r.costFlagged && <Pill tone="warn">has a cost</Pill>}
            <span className="flex gap-1">
              {(["open", "in_progress", "done"] as const).map((s) => (
                <Button
                  key={s}
                  tone={r.status === s ? "primary" : "default"}
                  onClick={() => setRequestStatus({ id: r._id, status: s })}
                >
                  {s.replace(/_/g, " ")}
                </Button>
              ))}
            </span>
          </Card>
        ))}
      </main>
    </div>
  );
}
