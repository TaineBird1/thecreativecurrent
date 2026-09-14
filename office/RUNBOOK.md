# Runbook — how to change things, and what breaks when

Day-to-day operation. SETUP.md is the one-off; this is everything after.

---

## The two switches, and which one to reach for

| | **Pause sending** | **STOP** |
|---|---|---|
| Where | Header, left of the red button | Header, the red button |
| Stops | Emails leaving | Everything outbound: emails, sequences, scrapers |
| Bots | Keep working and drafting | All set `off_shift` |
| Takes effect | Next send attempt | Within seconds — checked at the top of every action *and* again immediately before each individual send |
| Survives a restart | Yes | Yes — it's a row in the database, not memory |
| To lift | One click | Type `resume`, then click Lift |

Reach for **pause** when you want to read what they're writing before it goes.
Reach for **STOP** when something is wrong and you'll work out what afterwards.

STOP also drains the queue: anything already queued to send is marked blocked
with the reason, and queued scrape jobs are dropped. Nothing is lost — every
blocked email keeps its full text and shows up on the lead.

Lifting the STOP does **not** automatically put bots back on shift. That's a
second, deliberate click, so nine bots never come back online by a misclick.

---

## Adding a tenth bot

Five files. Twenty minutes.

**1. Write the prompt** — `packages/agents/newbot/prompt.md`

Copy the shape of an existing one. It must contain `{{CONTEXT}}` on its own
line — that's where the shared business context gets injected, and the build
refuses to run without it. End with the exact JSON shape you want back.

**2. Add it to the roster** — `packages/agents/registry.ts`

```ts
{
  key: "newbot",
  name: "Themba",
  role: "Whatever they do",
  department: "revenue",           // decides which zone they sit in
  blurb: "One line for the desk drawer.",
  avatar: "🛠",
  desk: { zone: "revenue", x: 60, y: 70 },  // % within the zone
  tools: ["fetch_page", "draft_thing"],
  scheduleCron: "0 8 * * 1-5",     // UTC! 10:00 SAST
  scheduleLabel: "Weekdays 10:00 SAST",
  scheduleEnabled: true,
  dailyBudget: 80,                 // see the budget note below
}
```

Also add `"newbot"` to `BOT_KEYS` in `scripts/build-prompts.mjs`.

**3. Write the runner** — `convex/agents/newbot.ts`

```ts
"use node";
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { internal } from "./../_generated/api";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";

export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "newbot", trigger: trigger ?? "cron", bubble: "Doing the thing" },
      async (handle) => {
        const { text } = await think(ctx, {
          botKey: "newbot",
          purpose: "do_the_thing",
          user: "...",
          runId: handle.runId,
        });
        const parsed = parseJson<{ result: string }>(text);
        return `Did it: ${parsed.result}`;
      },
    );
    return outcome.summary;
  },
});

export const runNow = action({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.newbot.run, { trigger: "manual" }),
});
```

`withRun` handles the kill-switch check, the run record, the desk status, the
speech bubble, and turning "out of budget" and "stopped mid-run" into states you
can read on the office floor. Don't reimplement any of that.

**The `"use node"` trap.** A bot runner needs `"use node"` at the top, and a
Convex module marked that way may export **only actions**. Put a query or a
mutation in one and the WHOLE deploy fails — not just that file — with
*"Only actions can be defined in Node.js"*. It fails at `npx convex dev`, long
after every local check has passed.

This bit the first deploy: `convex/auth.ts` needed `node:crypto` for HMAC
signing, so it was `"use node"`, and its two session functions took the whole
push down with them. The fix was to split the database work into
`convex/authStore.ts`. `pnpm check:refs` now catches this before you deploy —
if you need a query or mutation alongside Node code, it goes in its own file.

**4. Schedule it** — `convex/crons.ts`. Write the cron in **UTC** and put the
SAST time in the comment. SAST is UTC+2 all year.

**5. Wire the Run-now button** — add it to `useRunNow` in
`app/components/DeskDrawer.tsx`.

Then:

```powershell
pnpm prompts:build
pnpm seed          # picks up the new bot; won't touch your edited prompts
pnpm verify
```

**Budget note:** the office shares ~1,500 Gemini requests a day. Adding a bot
with a budget of 80 means taking 80 from somewhere or running closer to the
ceiling. The Logs screen shows the running total against 1,500.

---

## Changing a schedule

Two places, and they mean different things:

- **`convex/crons.ts`** — when it actually fires. UTC. Changing this needs a
  redeploy (`npx convex dev` picks it up on save).
- **`registry.ts` → `scheduleLabel`** — what the desk drawer says. Cosmetic, but
  keep it truthful or you'll mislead yourself in three months.

To stop a bot running on its schedule without touching code: open its desk →
**Turn off**. It goes off shift and stays there.

Cron reference, SAST → UTC: subtract 2 hours. `07:00 SAST` = `0 5 * * *`. If
subtracting crosses midnight, shift the day fields too — weekdays at 08:00 SAST
is `0 6 * * 1-5`, but weekdays at 01:00 SAST would be `0 23 * * 0-4`.

---

## Changing a prompt

Two routes, and the difference matters:

- **In the app** (open a desk → Prompt tab) — takes effect on the next run,
  survives re-seeding permanently. This is the one to use while tuning.
- **In `packages/agents/<bot>/prompt.md`** — the source of truth on disk. Only
  reaches a bot that has *never* been edited in the app.

Once you've edited in the app, the file no longer reaches that bot. That's
deliberate: a redeploy should never silently undo your tuning. To go back to the
file, you currently need to paste it in — the "reset to file" mutation exists
(`bots.resetPrompt`) but has no button yet.

---

## What happens when the free quotas run out

**Gemini hits its per-minute limit (15/min).** The token bucket has already
throttled to 12/min, so this mostly doesn't happen. If it does: the router waits
for a token up to 15 seconds, then hands over to Groq. You see `rate_limited` on
Gemini and `fell back` on the Groq call in Logs.

**Gemini hits its daily limit (~1,500).** Every call falls back to Groq for the
rest of the day. The office keeps running; Logs shows the fallback count
climbing. This is working as designed, not a fault.

**Groq is also out.** `AllProvidersFailedError`. The run is marked failed, the
bot goes `blocked` with the reason on its desk, and an escalation appears in the
Boss inbox. Nothing is retried in a loop.

**A bot spends its own daily budget.** It goes `blocked` with "Out of LLM budget
today" before making any network call at all — an over-budget bot costs nothing.
It clears at midnight SAST. Raise the budget in Settings if a bot legitimately
needs more, but check the total against 1,500 first.

**Resend's 3,000/month.** At 20 outreach emails a day you'd need five months.
Not a realistic ceiling.

**Convex's free tier.** 1M function calls a month. Nine bots on these schedules
use a tiny fraction.

---

## When Lead-gen stops finding anything

In likelihood order:

1. **The worker isn't running.** Google Maps and Facebook both need it. The
   office floor says "Local worker offline". Run `pnpm worker`.
2. **A directory changed its markup.** These are scraped, not APIed, and they
   redesign without warning. `harvestListingUrls` in
   `convex/agents/leadgen.ts` filters links by URL shape — if Snupit changes
   `/listing/` to `/pro/`, that filter stops matching. Fix the pattern in
   `packages/shared/tools/sources.ts`.
3. **Everything found was already known.** The dedupe is by domain, or by
   name+suburb when there's no site. Discarded leads keep their row on purpose,
   so the same off-niche business isn't re-researched every day. The run summary
   distinguishes "already known" from "found nothing".
4. **It's genuinely exhausted that category and suburb.** The rotation moves
   through `TIER_CATEGORIES` and `LOCATIONS` by day. Add more of either.

Meanwhile: paste any business URL into the box on the Leads screen. It gets the
full enrichment and audit immediately, and it works even when every scraper is
broken.

---

## When an email gets held instead of sent

The activity feed says which gate caught it. In rough order of frequency:

- **"Too close to a recent send"** — the template check. It compares *skeletons*
  (the email with this prospect's own details stripped out), because two emails
  identical apart from the business name score low on raw text and would slip
  through. Above 82% identical is a template, and a template is not what this
  office sends. Nothing to fix — Lerato writes a fresh one next run.
- **Money guard** — a price, a fee, a discount, contract language. Goes to
  Approvals. Edit and approve if the number's right.
- **Claims guard** — a ranking, traffic or timeframe promise. Same. Worth
  reading these rather than approving on reflex; that's the whole point of them.
- **Daily cap** — 20 sends. Waits for tomorrow.
- **"No sender address configured"** — Settings, step 8 of SETUP.md.

To see everything held, including the ones that never became approvals: the
lead's detail panel shows every email with its status and full text, sent or not.

---

## Replies

There is no free inbound email API, so nothing reads your inbox. Replies come to
whatever you set as reply-to. When one arrives, open the lead and paste it into
**They replied**. Lerato then:

1. Stops the sequence — before anything else, so even if the classification
   fails, the worst case is "we stopped emailing them".
2. Classifies it: interested / not now / no / question / auto-reply.
3. Drafts an answer, or escalates to you if it shouldn't answer.
4. For "interested", proposes two specific times and adds your Cal.com link.

A "no" stops the sequence permanently and marks the lead. It won't be contacted
again.

---

## Backups and data

Convex keeps your data; nothing here needs a backup job. Nothing is ever hard
deleted — every table has `deletedAt` and every query filters on it, so an
"archive" is recoverable from the Convex dashboard.

To export: Convex dashboard → your project → Data → export.

---

## Before you push

```powershell
pnpm verify
```

Four checks, no keys needed: prompts rebuild, every TypeScript file parses,
every `api.*`/`internal.*` reference resolves to a real function with the right
visibility, and the guard + fallback tests pass.

Once `npx convex dev` has run at least once, also:

```powershell
pnpm typecheck
```

That's the full type check, and it can only work after `convex/_generated/`
exists.

---

## Files worth knowing

| Path | What lives there |
|---|---|
| `convex/schema.ts` | Every table. Start here. |
| `convex/outbound.ts` | The only door out of the building. Every email, without exception. |
| `convex/lib/run.ts` | The wrapper every bot run goes through. |
| `convex/lib/killSwitch.ts` | STOP. Read the comment at the top. |
| `packages/shared/llm/router.ts` | Gemini→Groq, budgets, backoff. |
| `packages/shared/guards/` | Money, claims, PII, template detection. |
| `packages/agents/registry.ts` | Who exists, where they sit, when they run. |
| `packages/agents/<bot>/prompt.md` | What each one is told. |
| `config/pricing.yaml` | The pricing rules. Run `pnpm pricing:sync` after editing. |
| `worker/index.mjs` | The local browser worker. |
