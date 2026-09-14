# The Creative Current — Office

A virtual office where nine AI employees run the day-to-day of a Durban web
design and AI-systems studio. The home screen is the office floor: each bot is a
character at a desk, visibly working, with a live feed of what it's doing.

Built to run at **zero cost**. No paid API, no subscription, no card on file.

```powershell
pnpm install
npx convex dev          # once — creates the project, writes .env.local
pnpm seed               # hires the nine bots
pnpm dev                # office at http://localhost:3000
pnpm worker             # separate terminal — screenshots and browser scraping
```

Full instructions: **[SETUP.md](./SETUP.md)** · Day-to-day: **[RUNBOOK.md](./RUNBOOK.md)** ·
Design decisions: **[PLAN.md](./PLAN.md)**

---

## The staff

| | Who | Does | Runs |
|---|---|---|---|
| 🧭 | **Nomsa** — Orchestrator | Turns your goals into assigned tasks, re-plans failures, writes the morning stand-up | 07:00 daily |
| 📊 | **Thabo** — Strategy | Competitor research, weekly KPI report, the content calendar | Mondays 06:00 |
| 🔎 | **Sipho** — Lead-gen | Finds trade businesses that are invisible online, enriches every contact field, audits their site for nameable faults | Weekdays 08:00 |
| ✉️ | **Lerato** — Outreach | One personal email at a time, follow-ups on day 3 and 8, stops dead on a reply | Every 30 min, 08:00–17:00 |
| 📄 | **Anele** — Proposals | Your call notes → a proposal and contract. Always stops at Approvals | On demand |
| ✍️ | **Zanele** — Content | Blog, LinkedIn, Instagram, newsletter, video scripts | Mon & Wed 09:00 |
| 📈 | **Kagiso** — SEO/Ads | Keyword research from free sources, on-page audits, ad copy | Tuesdays 10:00 |
| 🎨 | **Naledi** — Design | Images, thumbnails, storyboards. No rendered video — no free option exists | Thursdays 11:00 |
| 🤝 | **Bongi** — Client Success | Uptime, monthly health checks, renewals, change-request triage | Uptime every 4h |

---

## What stops a bot doing something stupid

Four independent gates. Any one of them holds an artefact.

```
bot output ──► money guard ──► claims guard ──► send limiter ──► kill switch ──► sent
                    │               │                │                │
                    └───────────────┴────────────────┴────────────────┘
                              Approvals inbox / refused
```

**Money guard** — currency, pricing words, contract language. Applied to *every*
bot's output, not just the Proposal bot's: a price in a friendly check-in email
is exactly as binding as one in a formal quote.

**Claims guard** — rankings, traffic promises, guarantees, and timeframes
attached to an outcome. Gated like money, because they're promises you'd have to
honour. A timeframe on its own ("about 3 weeks to build") passes; a timeframe on
a result ("ranking in 4 weeks") doesn't.

**Send limiter** — 20 outreach emails a day, and a skeleton-similarity check
that rejects anything reading as a template. It compares emails with each
prospect's own details *stripped out*, because two emails identical apart from
the business name score low on raw text and would otherwise slip straight
through.

**Kill switch** — one red STOP in the header. Halts every outbound action,
drains the queue, sets all nine bots off shift. Checked at the top of every
action *and* again before each individual send, so a STOP mid-batch stops the
batch. Stored in the database, so it survives restarts. Lifting it requires
typing the word.

Plus two standing rules with no switch: **no auto-posting anywhere** (bots draft;
you post), and **no deletes** — every table has `deletedAt`.

---

## The stack, and why each piece

| | Free tier | Why this one |
|---|---|---|
| Next.js (static export) | — | No server to pay for. All data is live from Convex. |
| Convex | 1M calls/month | Database + crons + real-time subscriptions in one free tier. The office floor updates without a refresh because of this. |
| Gemini 2.5 Flash | ~1,500 req/day | The main brain. Flash-Lite for bulk work. |
| Groq (Llama 3.3 70B) | Generous | Automatic fallback the moment Gemini 429s. `pnpm test:llm` proves it. |
| Resend | 3,000/month | The 20/day cap means this is never the constraint. |
| Playwright (local) | Unlimited | Screenshots and browser scraping on your own PC. |
| Pollinations.ai | No account at all | Image generation with no key. |
| Cloudflare Pages | Unlimited | Hosting. Not Vercel — its Hobby terms prohibit commercial use. |

---

## Checks

```powershell
pnpm verify      # prompts build, syntax, Convex refs, guard tests, fallback test
pnpm test:llm    # proves Gemini→Groq fallback with a faked 429 — spends no quota
pnpm typecheck   # full types — only works after `npx convex dev` has run once
```

---

## What's deliberately stubbed

Each of these shows as a **needs a paid service** chip in the UI rather than
quietly doing less:

- **Rendered video** — every free generator is a trial, a watermark, or a queue
  that never finishes. Naledi writes shooting scripts instead.
- **Social auto-posting** — absent on purpose. Auto-posting is how a brand gets
  flagged as spam.
- **Email verification** — inferred addresses are marked `inferred`, never
  `verified`.
- **Google Maps / Facebook at scale** — Places needs a billing card, Meta's Graph
  API is closed to this. The local worker scrapes public pages instead: free, low
  volume, and it breaks when they redesign. Directories carry the real load.
- **Google Ads monitoring** — reports "not connected" rather than estimating
  performance it can't see.
- **Inbound email** — no free reply API. You paste replies in; Lerato does the
  rest.
