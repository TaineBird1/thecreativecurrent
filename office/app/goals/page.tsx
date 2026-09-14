"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { Header } from "../components/Header";
import { Button, Card, Empty, Pill, relativeTime } from "../components/ui";

const COLUMNS = [
  { id: "todo", label: "To do" },
  { id: "in_progress", label: "Doing" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
] as const;

export default function GoalsPage() {
  const board = useQuery(api.tasks.board);
  const bots = useQuery(api.bots.list);
  const addGoal = useMutation(api.tasks.addGoal);
  const move = useMutation(api.tasks.moveTask);
  const planNow = useAction(api.agents.orchestrator.planNow);

  const [text, setText] = useState("");
  const [planning, setPlanning] = useState(false);
  const [result, setResult] = useState("");

  const byKey = new Map((bots ?? []).map((b) => [b.key, b]));

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-[1500px] space-y-4 p-4">
        <Card className="p-4">
          <p className="mb-2 text-xs text-faint">
            Type a goal the way you&apos;d say it out loud. Nomsa breaks it into tasks and assigns
            them.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!text.trim()) return;
              await addGoal({ text: text.trim() });
              setText("");
              setResult("Added. Nomsa plans it at 07:00, or hit 'Plan it now'.");
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="get 5 solar-installer discovery calls booked this month"
              className="min-w-[280px] flex-1 rounded-lg border border-edge bg-ink px-3 py-2 text-sm outline-none focus:border-lamp"
            />
            <Button type="submit" tone="primary" disabled={!text.trim()}>
              Add goal
            </Button>
            <Button
              disabled={planning}
              onClick={async () => {
                setPlanning(true);
                setResult("");
                try {
                  setResult(await planNow({}));
                } catch (err) {
                  setResult(err instanceof Error ? err.message : String(err));
                } finally {
                  setPlanning(false);
                }
              }}
            >
              {planning ? "Planning…" : "Plan it now"}
            </Button>
          </form>
          {result && <p className="mt-2 text-xs text-cream">{result}</p>}
        </Card>

        {board?.goals.length === 0 && (
          <Empty>No goals yet. The bots keep their own schedules regardless — goals are for
            pointing them at something specific.</Empty>
        )}

        {board?.goals.map((goal) => {
          const tasks = board.tasks.filter((t) => t.goalId === goal._id);
          return (
            <Card key={goal._id} className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Pill tone={goal.status === "active" ? "info" : "neutral"}>{goal.status}</Pill>
                <span className="text-sm font-medium">{goal.text}</span>
                <span className="ml-auto text-[11px] text-faint">
                  {goal.plannedAt ? `planned ${relativeTime(goal.plannedAt)}` : "not planned yet"}
                </span>
              </div>
              <p className="text-xs text-faint">
                {tasks.length} task{tasks.length === 1 ? "" : "s"} ·{" "}
                {tasks.filter((t) => t.status === "done").length} done
              </p>
            </Card>
          );
        })}

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const tasks = board?.tasks.filter((t) => t.status === col.id) ?? [];
            return (
              <div key={col.id} className="rounded-2xl border border-edge bg-panel/50 p-2">
                <p className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-faint">
                  {col.label} <span className="text-cream">{tasks.length}</span>
                </p>
                <div className="space-y-2">
                  {tasks.map((task) => {
                    const bot = byKey.get(task.botKey);
                    return (
                      <div key={task._id} className="rounded-xl border border-edge bg-panel p-2.5">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-faint">
                          <span>{bot?.avatar ?? "•"}</span>
                          {bot?.name ?? task.botKey}
                          {task.retries > 0 && (
                            <span className="ml-auto text-rust">{task.retries} retries</span>
                          )}
                        </div>
                        <p className="text-xs leading-snug text-cream">{task.title}</p>
                        {task.error && (
                          <p className="mt-1 text-[11px] leading-snug text-rust">{task.error}</p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                            <button
                              key={c.id}
                              onClick={() => move({ id: task._id, status: c.id })}
                              className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-faint hover:text-cream"
                            >
                              → {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {tasks.length === 0 && (
                    <p className="px-2 py-3 text-center text-[11px] text-faint">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
