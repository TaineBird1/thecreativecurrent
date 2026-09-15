"use client";

import { useAuthedMutation, useAuthedQuery } from "@/app/lib/convexAuth";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Link from "next/link";
import { Nav, Button, rand } from "./ui";

/**
 * The header carries the two controls that stop things happening, so they are
 * visible from every screen — you should never have to navigate somewhere to
 * stop a bot.
 */
export function Header() {
  const kpis = useAuthedQuery(api.kpis.headline);
  const settings = useAuthedQuery(api.settings.get);
  const setPause = useAuthedMutation(api.settings.setPauseSending);

  const halted = settings?.killSwitch.active ?? false;
  const paused = settings?.pauseSending ?? false;

  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-ink/85 backdrop-blur-md">
      {halted && <HaltedBanner reason={settings?.killSwitch.reason} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-base">🌙</span>
          <span className="hidden sm:inline">The Creative Current</span>
        </Link>

        <Nav approvals={kpis?.approvals ?? 0} escalations={kpis?.escalations ?? 0} />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPause({ paused: !paused })}
            title={
              paused
                ? "Sending is paused. Bots keep working; nothing leaves the building."
                : "Pause all sending. Bots keep working; nothing leaves the building."
            }
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
              paused
                ? "border-lamp/40 bg-lamp/10 text-lamp"
                : "border-edge text-faint hover:text-cream"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${paused ? "bg-lamp" : "bg-lime"}`}
            />
            {paused ? "Sending paused" : "Sending on"}
          </button>

          <StopControl halted={halted} />
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto border-t border-edge/60 px-4 py-1.5 text-[11px] text-faint">
        <Kpi label="leads" value={kpis?.leads} />
        <Kpi label="qualified" value={kpis?.qualified} />
        <Kpi label="sent today" value={kpis?.sentToday} suffix="/20" />
        <Kpi label="replies" value={kpis?.replies} />
        <Kpi label="booked" value={kpis?.booked} />
        <Kpi label="proposals out" value={kpis?.proposalsOut} />
        <Kpi label="care plan MRR" value={kpis ? rand(kpis.mrr) : undefined} />
      </div>
    </header>
  );
}

function Kpi({
  label,
  value,
  suffix,
}: {
  label: string;
  value?: number | string;
  suffix?: string;
}) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono font-semibold text-cream">
        {value ?? "—"}
        {suffix && value !== undefined ? <span className="text-faint">{suffix}</span> : null}
      </span>{" "}
      {label}
    </span>
  );
}

function HaltedBanner({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-2 bg-rust px-4 py-1.5 text-xs font-semibold text-white">
      <span>■</span>
      <span>
        STOP is engaged — every bot is off shift and nothing can go out
        {reason ? `. ${reason}` : "."}
      </span>
    </div>
  );
}

/**
 * The kill switch.
 *
 * Engaging is one click, because in the moment you want to stop everything you
 * should not have to read a dialog. Lifting requires typing the word, because
 * bringing nine bots back online by misclicking is the failure that matters.
 */
function StopControl({ halted }: { halted: boolean }) {
  const setKill = useAuthedMutation(api.settings.setKillSwitch);
  const resume = useAuthedMutation(api.bots.resumeAll);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  if (!halted) {
    return (
      <Button
        tone="danger"
        onClick={() => setKill({ active: true, reason: "Stopped from the header" })}
        title="Halt every outbound action across all bots, immediately."
        className="px-4 py-1.5 text-xs"
      >
        ■ STOP
      </Button>
    );
  }

  if (!confirming) {
    return (
      <Button tone="default" onClick={() => setConfirming(true)}>
        Lift the STOP
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder='type "resume"'
        className="w-28 rounded-lg border border-edge bg-ink px-2 py-1.5 text-xs outline-none focus:border-lamp"
      />
      <Button
        tone="primary"
        disabled={typed.trim().toLowerCase() !== "resume"}
        onClick={async () => {
          await setKill({ active: false });
          await resume({});
          setConfirming(false);
          setTyped("");
        }}
      >
        Lift
      </Button>
      <Button
        tone="ghost"
        onClick={() => {
          setConfirming(false);
          setTyped("");
        }}
      >
        Cancel
      </Button>
    </div>
  );
}
