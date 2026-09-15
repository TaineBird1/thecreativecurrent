"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useState } from "react";
import { Button, Pill, relativeTime } from "./ui";

/**
 * Open a bot's door: what it is, what it's done, what it costs, its prompt,
 * its tools, and a box to tell it something directly.
 *
 * The prompt is editable here and an edit is permanent — re-seeding will not
 * overwrite it. "Reset to the file" is the way back.
 */
export function DeskDrawer({ botKey, onClose }: { botKey: string; onClose: () => void }) {
  const bot = useQuery(api.bots.byKey, { key: botKey });
  const runs = useQuery(api.runs.recentForBot, { botKey, limit: 50 });
  const llm = useQuery(api.logs.llm, { botKey, limit: 50 });
  const usage = useQuery(api.rate.usageToday);

  const updatePrompt = useMutation(api.bots.updatePrompt);
  const toggleTool = useMutation(api.bots.toggleTool);
  const setSchedule = useMutation(api.bots.setScheduleEnabled);
  const chat = useMutation(api.bots.chat);

  const waiting = useQuery(api.tasks.waitingFor, { botKey });
  const [tab, setTab] = useState<"today" | "prompt" | "tools" | "logs">("today");
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  const runNow = useRunNow(botKey);

  useEffect(() => {
    if (bot) setDraft(bot.systemPrompt);
  }, [bot?._id, bot?.systemPrompt]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (!bot) return null;

  const budget = usage?.perBot.find((b) => b.botKey === botKey);
  const pct = budget ? Math.min(100, (budget.used / Math.max(1, budget.limit)) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-xl flex-col border-l border-edge bg-panel shadow-2xl">
        <div className="flex items-start gap-3 border-b border-edge p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-edge-2 bg-ink text-xl">
            {bot.avatar}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{bot.name}</h2>
            <p className="text-xs text-muted">{bot.role}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-faint">{bot.blurb}</p>
          </div>
          <Button tone="ghost" onClick={onClose}>
            ✕
          </Button>
        </div>

        <div className="flex items-center gap-2 border-b border-edge px-4 py-2">
          {(["today", "prompt", "tools", "logs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2.5 py-1 text-xs capitalize transition ${
                tab === t ? "bg-panel-2 text-cream" : "text-faint hover:text-cream"
              }`}
            >
              {t}
            </button>
          ))}
          <div className="ml-auto">
            <Button
              tone="primary"
              disabled={running || !runNow}
              onClick={async () => {
                if (!runNow) return;
                setRunning(true);
                setResult("");
                try {
                  setResult(await runNow({}));
                } catch (err) {
                  setResult(err instanceof Error ? err.message : String(err));
                } finally {
                  setRunning(false);
                }
              }}
            >
              {running ? "Running…" : "Run now"}
            </Button>
          </div>
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto p-4">
          {result && (
            <p className="mb-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-cream">
              {result}
            </p>
          )}

          {tab === "today" && (
            <div className="space-y-4">
              <Row label="Right now">{bot.currentTask}</Row>
              <Row label="Status">
                <Pill
                  tone={
                    bot.status === "working"
                      ? "warn"
                      : bot.status === "blocked" || bot.status === "waiting_on_boss"
                        ? "bad"
                        : "neutral"
                  }
                >
                  {bot.status.replace(/_/g, " ")}
                </Pill>
              </Row>
              {bot.lastError && (
                <Row label={`Last problem — ${relativeTime(bot.updatedAt)}`}>
                  <span className="text-rust">{bot.lastError}</span>
                  <p className="mt-1 text-[11px] text-faint">
                    This clears itself as soon as {bot.name} finishes a run cleanly.
                  </p>
                </Row>
              )}
              <Row label="Schedule">
                <span className="flex items-center gap-2">
                  {bot.scheduleLabel}
                  <Button onClick={() => setSchedule({ key: botKey, enabled: !bot.scheduleEnabled })}>
                    {bot.scheduleEnabled ? "Turn off" : "Turn on"}
                  </Button>
                </span>
              </Row>

              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-faint">
                  LLM budget today
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-edge">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: pct >= 100 ? "#f0603c" : "#ffb547" }}
                  />
                </div>
                <p className="mt-1 text-xs text-faint">
                  {budget?.used ?? 0} of {budget?.limit ?? bot.dailyBudget} requests. Resets at
                  midnight SAST.
                </p>
              </div>

              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">
                  Tell {bot.name} what to do
                </p>
                <p className="mb-1.5 text-[11px] leading-relaxed text-faint">
                  They act on it straight away, and it takes priority over
                  whatever they were going to do on their own.
                </p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder={`e.g. "find me roofers in Pinetown"`}
                  className="w-full rounded-lg border border-edge bg-ink px-3 py-2 text-xs outline-none focus:border-lamp"
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    tone="primary"
                    disabled={!message.trim() || running}
                    onClick={async () => {
                      const text = message;
                      setMessage("");
                      setResult("");
                      await chat({ key: botKey, message: text });
                      // Queueing it and walking away is what made this feel
                      // broken: the instruction sat in a list nobody read. Set
                      // them going now, so telling a bot something makes it do
                      // something.
                      if (!runNow) {
                        setResult(
                          `Noted — ${bot.name} picks this up on their next scheduled run.`,
                        );
                        return;
                      }
                      setRunning(true);
                      try {
                        setResult(await runNow({}));
                      } catch (err) {
                        setResult(err instanceof Error ? err.message : String(err));
                      } finally {
                        setRunning(false);
                      }
                    }}
                  >
                    {running ? "On it…" : `Tell ${bot.name}`}
                  </Button>
                  {waiting ? (
                    <span className="text-[11px] text-faint">
                      {waiting} instruction{waiting === 1 ? "" : "s"} still waiting
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {tab === "prompt" && (
            <div>
              <p className="mb-2 text-xs leading-relaxed text-faint">
                This is what {bot.name} is told before every task. Editing it here is permanent —
                re-seeding won&apos;t overwrite your version.{" "}
                {bot.promptEditedAt ? (
                  <span className="text-lamp">
                    You edited this {relativeTime(bot.promptEditedAt)}.
                  </span>
                ) : (
                  <span>
                    Currently the version from{" "}
                    <code className="text-lamp">packages/agents/{botKey}/prompt.md</code>.
                  </span>
                )}
              </p>
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setSaved(false);
                }}
                rows={24}
                className="w-full rounded-lg border border-edge bg-ink p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-lamp"
              />
              <div className="mt-2 flex items-center gap-2">
                <Button
                  tone="primary"
                  disabled={draft === bot.systemPrompt}
                  onClick={async () => {
                    await updatePrompt({ key: botKey, systemPrompt: draft });
                    setSaved(true);
                  }}
                >
                  Save prompt
                </Button>
                {saved && <span className="text-xs text-lime">Saved.</span>}
              </div>
            </div>
          )}

          {tab === "tools" && (
            <div className="space-y-1.5">
              <p className="mb-3 text-xs leading-relaxed text-faint">
                Turning a tool off stops {bot.name} using it. The bot still runs; it just works
                without that capability and says so.
              </p>
              {bot.tools.map((tool) => {
                const on = !bot.toolsDisabled.includes(tool);
                return (
                  <label
                    key={tool}
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-edge bg-panel-2/50 px-3 py-2"
                  >
                    <code className="text-xs">{tool}</code>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleTool({ key: botKey, tool, enabled: !on })}
                      className="h-4 w-4 accent-[#ffb547]"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {tab === "logs" && (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-faint">Recent runs</p>
                {runs?.length === 0 && <p className="text-xs text-faint">No runs yet.</p>}
                {runs?.slice(0, 20).map((r) => (
                  <div key={r._id} className="border-b border-edge/50 py-1.5 text-xs last:border-0">
                    <span className="flex items-center gap-2">
                      <Pill tone={r.status === "ok" ? "good" : r.status === "error" ? "bad" : "warn"}>
                        {r.status}
                      </Pill>
                      <span className="text-faint">{relativeTime(r.startedAt)}</span>
                      <span className="text-faint">· {r.trigger}</span>
                    </span>
                    <span className="mt-0.5 block leading-snug text-muted">
                      {r.summary ?? r.error ?? "—"}
                    </span>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-faint">LLM calls</p>
                {llm?.slice(0, 25).map((c) => (
                  <div
                    key={c._id}
                    className="flex items-center gap-2 border-b border-edge/50 py-1 text-[11px] last:border-0"
                  >
                    <code className="w-36 shrink-0 truncate text-muted">{c.purpose}</code>
                    <Pill tone={c.provider === "gemini" ? "info" : "warn"}>{c.provider}</Pill>
                    {c.fellBack && <Pill tone="warn">fell back</Pill>}
                    <span className="ml-auto text-faint">
                      {c.totalTokens}t · {c.latencyMs}ms
                    </span>
                  </div>
                ))}
                {llm?.length === 0 && <p className="text-xs text-faint">No calls yet.</p>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">{label}</p>
      <div className="text-sm text-cream">{children}</div>
    </div>
  );
}

/** Each bot's manual trigger. Hooks must be unconditional, so all are bound. */
function useRunNow(botKey: string) {
  const actions = {
    orchestrator: useAction(api.agents.orchestrator.planNow),
    strategy: useAction(api.agents.strategy.runNow),
    leadgen: useAction(api.agents.leadgen.runNow),
    outreach: useAction(api.agents.outreach.runNow),
    content: useAction(api.agents.content.runNow),
    seo: useAction(api.agents.seo.runNow),
    design: useAction(api.agents.design.runNow),
    clientsuccess: useAction(api.agents.clientsuccess.runNow),
  } as Record<string, ((args: Record<string, never>) => Promise<string>) | undefined>;
  // Proposal is deliberately absent — it only runs from call notes you paste in.
  return actions[botKey];
}
