# The Creative Current Office — Build Plan

My interpretation of the brief, the decisions I made where it was silent, the
questions I need answered, and the order I'm building in.

---

## 1. What this is

A private, single-user (Taine) web app that runs a team of 9 AI "employees" for
The Creative Current. The home screen is a virtual office: each bot is a
character at a desk, visibly working, with a live activity feed. Bots run on
schedules, do real work (scrape, qualify, draft, send), and anything with money
or a promise attached stops at an Approvals inbox.

It is **not** part of the existing marketing site. That site is React 19 + Vite +
Supabase + Vercel; this is Next.js + Convex + Cloudflare Pages. They share a
brand and a domain, nothing else.

### Where it lives

`office/` — a self-contained sub-project in the `thecreativecurrent` repo, on
branch `claude/creative-current-office-8llrhz`. Its own `package.json`, own
lockfile, own deploy. It does not touch the existing `src/`, `api/` or `sql/`.

Assumption, flagged because the brief didn't say: one repo, two projects. If you
want it as its own GitHub repo, the whole `office/` folder moves across
untouched — nothing in it imports from the parent.

---

## 2. Non-negotiables, and how each is enforced in code

| Constraint | Enforcement |
|---|---|
| Zero running cost | No paid SDK, no card-on-file service. Anything that can't be done free is a stub that renders a **"Needs a paid service"** chip in the UI (`<PaidStub>`), never a silent downgrade. |
| Free stack | Next.js 15 (App Router, TS) + Tailwind 4 · Convex free tier · Gemini free tier → Groq free fallback · Resend free tier · Cloudflare Pages + Convex cloud · Playwright/Cheerio in a local worker · Pollinations.ai for images. |
| Rate-limit aware | One `llm` module. Every call goes through a **DB-backed token bucket** (15 rpm Gemini), a **per-bot daily request budget**, exponential backoff + jitter on 429, automatic Groq failover. Every call logged: bot, purpose, provider, model, tokens, latency, outcome. |
| Data caution | `pseudonymise()` runs on every prompt payload before it leaves the process. Names → `«PERSON_1»`, emails → `«EMAIL_1»`, phones → `«PHONE_1»`. `restore()` maps back after. Quotes, invoices and contract bodies are **never** sent to an LLM at all — a hard deny-list, not just masking. |
| Windows dev | Every command in SETUP.md is PowerShell. pnpm. No bash-isms, no `&&` chains, no `rm -rf`. |

### The Gemini free tier, honestly

Free tier on `gemini-2.5-flash` is roughly **15 requests/minute, ~1,500/day**.
Nine bots sharing that is the real design constraint, so budgets are explicit and
visible:

| Bot | Daily LLM budget |
|---|---|
| Orchestrator | 120 |
| Strategy | 100 |
| Lead-gen | 250 (bulk qualification → `flash-lite`) |
| Outreach | 300 (the revenue loop gets the biggest share) |
| Proposal | 60 |
| Content | 200 |
| SEO/Ads | 120 |
| Design | 80 |
| Client Success | 80 |
| **Total** | **1,310** — leaves ~190/day headroom under the 1,500 ceiling |

Budgets are editable in Settings. When a bot's budget is spent it goes `blocked`
with a visible reason, it does not silently stop.

---

## 3. Decisions I made where the brief was silent

These are judgment calls, not questions — noting them so you can overrule any of
them cheaply.

1. **Access control.** The brief never mentions logging in, but this app holds
   lead contact details and can send email, so it can't be a public URL. I'm
   building a **single passcode gate**: you set `OFFICE_PASSCODE` in Convex env,
   a Convex action verifies it and issues an HMAC-signed 30-day token held in
   `localStorage`. No user table, no password reset, no third-party auth, no
   cost. If you'd rather have real accounts later, this swaps out for Convex Auth
   without touching any bot code.

2. **Static export.** Next.js with `output: 'export'`. All data comes from Convex
   over websockets, so there's nothing for a Next server to do — and static
   output deploys free to Cloudflare Pages *or* GitHub Pages with no adapter and
   no cold starts. (`next-on-pages` would also be free but adds a build step and
   a runtime for no gain here.)

3. **`prompt.md` files are real, and also the seed.** Convex's bundler can't
   import markdown, so `pnpm prompts:build` compiles the nine `prompt.md` files
   into one generated TS module. The file is the source of truth on disk; the DB
   copy is what actually runs, so your in-app edits win and survive redeploys.
   Re-seeding never overwrites an edited prompt.

4. **Timezone.** Convex crons are UTC. SAST is UTC+2 year-round with no DST, so
   every schedule is written as a literal UTC time with the SAST time in a
   comment. 07:00 SAST = 05:00 UTC.

5. **Playwright runs locally, not in Convex.** Convex actions have no browser and
   a 10-minute ceiling. Screenshots and the site-fault audit run in `pnpm worker`
   — a Node process on your PC that leases jobs from a Convex `scrapeJobs` queue,
   does the work, uploads screenshots to Convex file storage, and writes results
   back. Free, unlimited, and the office UI shows Lead-gen as `blocked —
   worker offline` when it isn't running, rather than quietly finding nothing.

6. **Cheap scraping doesn't need the worker.** Plain `fetch` + Cheerio (directory
   listings, Google autocomplete, HTML fault checks) runs in Convex actions
   directly. Only real-browser work queues.

---

## 4. Safety architecture — the part that matters most

Four independent gates. Every outbound artefact passes all four; any one of them
can stop it.

```
bot output ──► moneyGuard ──► claimsGuard ──► sendLimiter ──► killSwitch ──► send
                   │              │               │               │
                   └──────────────┴───────────────┴───────────────┘
                                  all routes to Approvals / halt
```

**1. Money guard** (`guards/money.ts`) — scans any outbound text for currency
(`R9,500`, `ZAR`, `rands`), pricing words (quote, proposal, invoice, deposit,
discount, refund, retainer, ad spend) and contract language (agreement, terms,
signature, payable). Applied to **every bot's output**, not just Proposal's.
A hit → `approvals` row, status `pending`, nothing sends.

**2. Claims guard** (`guards/claims.ts`) — same mechanism, different vocabulary:
ranking promises (page one, #1, top of Google, first page), traffic promises
(double your enquiries, 3x leads, more traffic), guarantee words (guarantee,
promise, we'll get you), and timeframes bound to an outcome (within 30 days, in
3 months). These are promises you'd have to honour, so they're gated like money.
Deliberately over-eager — a false positive costs you one click in Approvals, a
false negative costs you a promise you can't keep.

**3. Send limiter** (`guards/sendLimiter.ts`) — max 20 outreach emails/day,
one-to-one only. A template-similarity check (trigram Jaccard against the last
50 sends) rejects anything >0.82 similar to a recent send, so a "personalised"
email that's really a template can't slip through. Plus the global pause switch.

**4. Kill switch** (`guards/killSwitch.ts`) — `assertNotHalted(ctx)` is the first
line of **every** action, not a schedule-time check. State lives in the
`settings` table, so it survives restarts and deploys. Tripping it sets all bots
`off_shift` and drains the send queue. Lifting it needs an explicit typed
confirm.

Plus two standing rules with no switch: **no auto-posting anywhere** (bots draft,
you post — the social integration point exists and is clearly marked inert), and
**no deletes** — every table has `deletedAt`, every query filters on it.

---

## 5. Convex schema (first deliverable after this plan)

18 tables. Every one carries `createdAt`, `updatedAt`, `deletedAt`.

| Table | Purpose |
|---|---|
| `bots` | The 9 employees: name, role, desk position, status, prompt, enabled tools, schedule, daily budget. |
| `goals` | Goals you type in. |
| `tasks` | Orchestrator-created work, Kanban state, owner bot, retries, parent goal. |
| `runs` | One row per bot execution: trigger, started/finished, outcome, error. |
| `llmCalls` | Every LLM call: bot, purpose, provider, model, tokens, latency, fallback flag. |
| `toolCalls` | Every tool call: bot, tool, args digest, outcome, duration. |
| `leads` | Prospects + full contact enrichment + tier + score + faults + discard reason. |
| `leadEvents` | Timeline per lead. |
| `emails` | Every send and reply, full text, direction, classification. |
| `sequences` | 3-step outreach state machine per lead, stops on reply. |
| `clients` | Existing clients: care tier, site URL, uptime. |
| `changeRequests` | From the client intake form. |
| `approvals` | The gate. Artefact, reason, guard that caught it, decision, note. |
| `escalations` | Bot → boss. Red badge. |
| `contentDrafts` | Blog/social/newsletter/scripts. |
| `mediaAssets` | Generated images + storyboards, tagged. |
| `kpiSnapshots` | Daily/weekly rollups for the header and Strategy reports. |
| `settings` | Singleton: kill switch, pause-sending, budgets, sender, pricing. |
| `scrapeJobs` | Queue the local Playwright worker leases from. |

I'll show you the schema file before building anything on top of it.

---

## 6. Build order

1. ✅ **PLAN.md** (this) + questions.
2. **Convex schema + seed** — 9 bots, pricing rules, 3 sample leads, 1 sample
   client, so the office is alive on first run. *Shown to you before step 3.*
3. **LLM router** — token bucket, budgets, backoff, Gemini→Groq failover,
   logging. Plus `pnpm test:llm`, a script that **forces a 429 from a fake Gemini
   and proves the Groq fallback fires**, printing the provider actually used.
4. **Guards** — money, claims, PII, send limiter, kill switch. Unit-tested with
   a fixture file of things that must and must not trip each one.
5. **Revenue loop end to end** — Orchestrator + Lead-gen + Outreach, with
   Approvals and the money guard in the path. This is the first thing that earns.
6. **The virtual office UI** — isometric CSS/SVG office, live Convex
   subscriptions, speech bubbles, activity feed, desk drawers, header KPIs, pause
   switch, STOP control.
7. **Remaining six bots** — Strategy, Proposal, Content, SEO/Ads, Design, Client
   Success.
8. **Other screens** — Boss inbox, Goals/Kanban, Leads, Clients, Library, Logs,
   Settings.
9. **SETUP.md + RUNBOOK.md.**

---

## 7. What will be a clearly-marked stub

Being explicit up front so none of these is a surprise later:

- **Video rendering** — no reliable free option. Design bot ships scripts,
  storyboards, thumbnails and static assets. Marked, not hidden.
- **Social auto-posting** — deliberately absent (brief says so), integration
  point present and inert.
- **Google Ads monitoring** — reports "not connected" unless a read-only
  connection exists.
- **Search Console** — same; needs your OAuth if you want it.
- **Email verification** — inferred addresses are marked `inferred`, never
  `verified`. Real verification is a paid API.
- **Facebook Pages search** — no free API since the Graph API locked down. The
  worker scrapes public page HTML, which is brittle and rate-limited by Meta;
  it degrades to "found nothing" rather than pretending. Directory sources
  (Snupit, Yellow Pages SA, MBA KZN, SA-Venues, LekkeSlaap) carry the real load.
- **PageSpeed timings** — measured from the worker's own Playwright run, not
  Google's PSI API (which is free but keyed and rate-limited; it's wired as an
  optional enhancement if you add a key).

---

## 8. The three questions, answered

**1. Sender address — "decide later, make it a Settings field."**
Built that way. `senderEmail` is empty by default and an empty sender means
sending is **disabled entirely** — not a silent no-op. Every bot that tries to
send gets back "No sender address is configured, so nothing can be sent", the
draft is kept in full, and it shows in the activity feed. Fill it in on the
Settings screen once your Resend domain is verified. SETUP.md step 2 walks
through verifying `office.thecreativecurrent.co.za`.

**2. Booking — Cal.com free tier.**
`bookingUrl` is a Settings field. When Lerato classifies a reply as
*interested*, it proposes two specific times in the next five working days
(SAST office hours) and appends your Cal.com link if one is set. Until you paste
the link, the two proposed times go out on their own, which works fine — it is
the specific times that get the yes, the link just makes saying yes easier.

**3. Search Console yes, Google Ads no.**
Kagiso's keyword research runs from free sources regardless (Google's public
autocomplete endpoint, clustered by intent — and it never reports search volume,
because no free volume source exists and an invented one would drive real
decisions). The Search Console connection point is wired and waiting for your
OAuth credentials rather than stubbed out. Google Ads reports `not_connected`
and will not estimate campaign performance it cannot see.

Everything else in the brief I took as settled.

---

## 9. What actually got built, against the nine deliverables

| | Deliverable | State |
|---|---|---|
| 1 | PLAN.md | This file |
| 2 | Convex schema + seed | `convex/schema.ts` — 19 tables, soft-delete throughout. `pnpm seed` hires 9 bots, loads pricing, 3 sample leads, 1 sample client |
| 3 | LLM router + fallback proof | `packages/shared/llm/` · `pnpm test:llm` — 11 tests, fakes a 429 and asserts Groq answered |
| 4 | Revenue loop end to end | Orchestrator + Lead-gen + Outreach, with Approvals and both guards in the path |
| 5 | Virtual office UI | Isometric floor, live Convex subscriptions, speech bubbles, feed, desk drawers, header KPIs, pause + STOP |
| 6 | Remaining bots | Strategy, Proposal, Content, SEO/Ads, Design, Client Success |
| 7 | Other screens | Boss inbox, Goals/Kanban, Leads, Clients, Library, Logs, Settings |
| 8 | SETUP.md | PowerShell, four free accounts, keys into Convex env, deploy free |
| 9 | RUNBOOK.md | Adding a bot, changing a schedule, what happens when quotas run out |

### Two things I got wrong on the way, and changed

**The template check missed its own target case.** Measured on raw text, two
emails word-for-word identical apart from a swapped business name and suburb
score about **0.67** trigram similarity on a ~30-word email — comfortably under
any ceiling you would want to set. The guard as specified would have let the
exact thing it exists to catch straight through. Fixed by comparing *skeletons*:
each email with that prospect's own details stripped out first, at which point a
real template scores ~1.0 and a genuinely written email scores low. The fixture
that caught it is still in `scripts/tests/guards.test.mjs`, asserting the raw
score is under the ceiling — so the reason for the design can't be lost.

**The money guard flagged "WhatsApp quote button."** A quote *button* is a
feature we build into a site, not a price. Caught by the must-not-trip fixture
list, which is the half of that test file that actually matters — a guard that
trips on everything is a guard you learn to click through without reading.
