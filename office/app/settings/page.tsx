"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, PaidStub, Pill } from "../components/ui";

/**
 * Settings.
 *
 * API keys are NOT here on purpose. They live in Convex's own environment
 * (`npx convex env set …`) so they never touch the repo, never reach the
 * browser bundle, and cannot be read back out of this screen. What you get here
 * is whether each one is present.
 */
export default function SettingsPage() {
  const settings = useQuery(api.settings.get);
  const wired = useQuery(api.settings.integrationStatus);
  const bots = useQuery(api.bots.list);
  const update = useMutation(api.settings.update);
  const sendTest = useAction(api.outbound.sendTest);
  const listModels = useAction(api.llm.listModels);

  const [form, setForm] = useState({
    senderEmail: "",
    senderName: "",
    replyToEmail: "",
    bookingUrl: "",
    dailySendCap: 20,
    holdForApproval: false,
  });
  const [budgets, setBudgets] = useState<Record<string, number>>({});
  const [pricing, setPricing] = useState("");
  const [saved, setSaved] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testResult, setTestResult] = useState("");
  const [models, setModels] = useState<
    { provider: string; available: string[]; configured: string[]; usable: string[]; error?: string }[] | null
  >(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setForm({
      senderEmail: settings.senderEmail,
      senderName: settings.senderName,
      replyToEmail: settings.replyToEmail,
      bookingUrl: settings.bookingUrl,
      dailySendCap: settings.dailySendCap,
      holdForApproval: settings.holdForApproval ?? false,
    });
    setBudgets((settings.budgets ?? {}) as Record<string, number>);
    setPricing(settings.pricingYaml);
  }, [settings?._id]);

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl space-y-4 p-4">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Sending</h2>
          <p className="mb-4 text-xs leading-relaxed text-faint">
            No sender address means nothing can be sent — not a silent no-op, the bots say so and
            the draft is kept. Set this once your Resend domain is verified. A subdomain like{" "}
            <code className="text-lamp">office.thecreativecurrent.co.za</code> keeps bot sending
            away from your existing leads@ reputation.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Sender address"
              value={form.senderEmail}
              onChange={(v) => setForm({ ...form, senderEmail: v })}
              placeholder="taine@office.thecreativecurrent.co.za"
            />
            <Field
              label="Sender name"
              value={form.senderName}
              onChange={(v) => setForm({ ...form, senderName: v })}
            />
            <Field
              label="Reply-to"
              value={form.replyToEmail}
              onChange={(v) => setForm({ ...form, replyToEmail: v })}
              placeholder="your normal inbox"
            />
            <Field
              label="Cal.com booking link"
              value={form.bookingUrl}
              onChange={(v) => setForm({ ...form, bookingUrl: v })}
              placeholder="https://cal.com/taine/discovery"
            />
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-edge bg-ink p-3">
            <input
              type="checkbox"
              checked={form.holdForApproval}
              onChange={(e) => setForm({ ...form, holdForApproval: e.target.checked })}
              className="mt-0.5"
            />
            <span className="text-xs leading-relaxed">
              <span className="font-semibold">Review every email before it sends</span>
              <span className="block text-faint">
                Bots write as normal, and every outbound email stops in Approvals for you to read
                instead of going out. Different from pausing: pausing stops Lerato writing at all,
                so you never get to see what she would have said.
              </span>
            </span>
          </label>

          <div className="mt-3">
            <label className="mb-1 block text-[11px] uppercase tracking-wider text-faint">
              Daily outreach cap (max 20 — this is a rail, not a dial)
            </label>
            <input
              type="number"
              min={0}
              max={20}
              value={form.dailySendCap}
              onChange={(e) => setForm({ ...form, dailySendCap: Number(e.target.value) })}
              className="w-24 rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-lamp"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              tone="primary"
              onClick={async () => {
                await update({ ...form, budgets });
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            >
              Save
            </Button>
            {saved && <span className="text-xs text-lime">Saved.</span>}

            <input
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="send a test to…"
              className="ml-auto w-52 rounded-lg border border-edge bg-ink px-3 py-1.5 text-xs outline-none focus:border-lamp"
            />
            <Button
              disabled={!testTo.includes("@")}
              onClick={async () => {
                try {
                  const r = await sendTest({ to: testTo });
                  setTestResult(r.reason);
                } catch (err) {
                  setTestResult(err instanceof Error ? err.message : String(err));
                }
              }}
            >
              Test
            </Button>
          </div>
          {testResult && <p className="mt-2 text-xs text-cream">{testResult}</p>}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Keys and connections</h2>
          <p className="mb-4 text-xs leading-relaxed text-faint">
            Keys live in Convex&apos;s environment, never in the repo and never in the browser
            bundle. Set them with{" "}
            <code className="text-lamp">npx convex env set GEMINI_API_KEY …</code> — see SETUP.md.
            This just shows what&apos;s present.
          </p>
          <div className="space-y-1.5">
            <Connection name="Gemini" on={wired?.gemini} note="gemini-3.5-flash, free tier" />
            <Connection name="Groq" on={wired?.groq} note="the automatic fallback when Gemini 429s" />
            <Connection
              name="Resend"
              on={wired?.resend}
              note={
                wired?.resend && !wired?.canSend
                  ? "key is set, but no sender address — nothing can send yet"
                  : "3,000 emails/month free"
              }
            />
            <Connection
              name="Google Search Console"
              on={wired?.searchConsole}
              note="your domain is verified — connecting the API gives Kagiso real query data"
            />
            <Connection
              name="Google Ads"
              on={wired?.googleAds}
              note="campaign monitoring reports nothing rather than guessing"
            />
          </div>
          <p className="mt-3 text-[11px] text-faint">
            Read live from Convex&apos;s environment each time this page loads. Presence only —
            never the values.
          </p>

          <div className="mt-4 border-t border-edge pt-4">
            <p className="mb-2 text-xs leading-relaxed text-faint">
              Providers retire model names without warning, and a retired name returns the same 404
              as a bad key. This asks each provider what it actually offers your key. Free — it
              lists models, it doesn&apos;t run any.
            </p>
            <Button
              disabled={probing}
              onClick={async () => {
                setProbing(true);
                setModels(null);
                try {
                  setModels(await listModels({}));
                } finally {
                  setProbing(false);
                }
              }}
            >
              {probing ? "Asking…" : "What models can I use?"}
            </Button>

            {models?.map((m) => (
              <div key={m.provider} className="mt-3 rounded-lg border border-edge bg-panel-2/40 p-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-xs font-semibold capitalize text-cream">{m.provider}</span>
                  {m.error ? (
                    <Pill tone="bad">couldn&apos;t ask</Pill>
                  ) : m.usable.length > 0 ? (
                    <Pill tone="good">
                      using {m.usable[0]}
                    </Pill>
                  ) : (
                    <Pill tone="bad">none of our names exist</Pill>
                  )}
                </div>

                {m.error && <p className="text-[11px] leading-relaxed text-rust">{m.error}</p>}

                {!m.error && m.usable.length === 0 && (
                  <p className="mb-2 text-[11px] leading-relaxed text-lamp">
                    Nothing in{" "}
                    <code className="text-cream">packages/shared/llm/models.ts</code> matches what
                    this provider offers. Pick from the list below and tell me which — that file
                    needs updating.
                  </p>
                )}

                {!m.error && (
                  <>
                    <p className="mb-1 text-[11px] text-faint">
                      {m.available.length} model{m.available.length === 1 ? "" : "s"} available to
                      your key:
                    </p>
                    <div className="thin-scroll max-h-44 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {m.available.map((name) => (
                          <code
                            key={name}
                            className={`rounded px-1.5 py-0.5 text-[10.5px] ${
                              m.configured.includes(name)
                                ? "bg-lime/15 text-lime"
                                : "bg-edge text-muted"
                            }`}
                          >
                            {name}
                          </code>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Daily LLM budgets</h2>
          <p className="mb-3 text-xs leading-relaxed text-faint">
            Nine bots share roughly 1,500 free Gemini requests a day. A bot that spends its budget
            goes <em>blocked</em> with a visible reason rather than quietly doing nothing.
          </p>
          <div className="space-y-1.5">
            {bots?.map((bot) => (
              <div key={bot.key} className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate text-muted">
                  {bot.avatar} {bot.name}
                </span>
                <input
                  type="number"
                  min={0}
                  value={budgets[bot.key] ?? bot.dailyBudget}
                  onChange={(e) => setBudgets({ ...budgets, [bot.key]: Number(e.target.value) })}
                  className="w-24 rounded-lg border border-edge bg-ink px-2 py-1 text-xs outline-none focus:border-lamp"
                />
                <span className="text-faint">used {bot.budgetUsed} today</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs">
            Total:{" "}
            <span className="font-mono text-cream">
              {Object.values(budgets).reduce((n, v) => n + (v || 0), 0) ||
                (bots ?? []).reduce((n, b) => n + b.dailyBudget, 0)}
            </span>{" "}
            <span className="text-faint">of ~1,500/day</span>
          </p>
          <Button
            tone="primary"
            className="mt-3"
            onClick={async () => {
              await update({ budgets });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            Save budgets
          </Button>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Pricing rules</h2>
          <p className="mb-3 text-xs leading-relaxed text-faint">
            What Anele works from. This copy is what runs;{" "}
            <code className="text-lamp">config/pricing.yaml</code> is what it was seeded from. No
            figure derived from this ever leaves the building without your approval.
          </p>
          <textarea
            value={pricing}
            onChange={(e) => setPricing(e.target.value)}
            rows={20}
            className="w-full rounded-lg border border-edge bg-ink p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-lamp"
          />
          <Button
            tone="primary"
            className="mt-2"
            onClick={async () => {
              await update({ pricingYaml: pricing });
              setSaved(true);
              setTimeout(() => setSaved(false), 2000);
            }}
          >
            Save pricing
          </Button>
        </Card>

        <PaidStub
          what="Email address verification"
          why="Inferred addresses (info@theirdomain.co.za) are marked inferred and never presented as verified. Actually verifying one needs a paid API — until then a bounce is the cost of a guess, which is why the guess is always labelled."
        />
        <PaidStub
          what="Google Maps and Facebook at scale"
          why="The Places API needs a billing card on file and Meta's Graph API is closed to this use. The local worker scrapes public pages instead — free, but low volume and it breaks when they redesign. Directory sources carry the real load."
        />
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-faint">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-lamp"
      />
    </label>
  );
}

function Connection({ name, on, note }: { name: string; on?: boolean; note: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-edge bg-panel-2/40 px-3 py-2">
      <Pill tone={on ? "good" : "neutral"}>{on ? "connected" : "not connected"}</Pill>
      <span className="text-xs font-medium text-cream">{name}</span>
      <span className="ml-auto text-right text-[11px] text-faint">{note}</span>
    </div>
  );
}
