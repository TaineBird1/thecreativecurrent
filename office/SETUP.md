# Setup — PowerShell, start to finish

Everything here is free. No card on file anywhere. If a step ever asks for card
details, you've taken a wrong turn — stop and check against this page.

You need Node 20+, Git and pnpm. You have Node and Git already.

```powershell
# Check what you've got
node --version
git --version

# pnpm, if you haven't got it
npm install -g pnpm
pnpm --version
```

---

## 1. Get the code running

```powershell
cd C:\path\to\thecreativecurrent\office
pnpm install
```

Playwright needs a browser binary. This is a one-off download (~150MB), free:

```powershell
pnpm exec playwright install chromium
```

---

## 2. Four free accounts

Do these in order. It's about fifteen minutes.

### Gemini — the main brain

1. Go to **https://aistudio.google.com/apikey**
2. Sign in with a Google account. **Create API key.**
3. Copy it. It starts with `AIza`.

No card, no billing account. The free tier is roughly 15 requests a minute and
about 1,500 a day on Flash — which is why the office has budgets per bot. If you
are ever shown a billing page, back out; you do not need it.

### Groq — the fallback

1. Go to **https://console.groq.com/keys**
2. Sign in, **Create API Key**, copy it. It starts with `gsk_`.

This is what catches Gemini's 429s. Without it, a rate-limited moment means a bot
does nothing; with it, the work carries on and the Logs screen shows "fell back".

### Convex — database, crons, real-time

```powershell
cd C:\path\to\thecreativecurrent\office
npx convex dev
```

First run opens a browser to log in (GitHub or Google), then asks:

- **a new project** → yes
- **project name** → `tcc-office`
- **team** → your personal team

It writes `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL` into `.env.local` for
you, generates `convex/_generated/`, and pushes the schema.

**Leave `npx convex dev` running while you work.** It watches the `convex/`
folder and redeploys on save.

> Until this has run once, `convex/_generated/` doesn't exist, so
> `pnpm build` and `pnpm typecheck` will fail with "cannot find module
> @/convex/_generated/api". That's expected — it's not a broken checkout.
> `pnpm verify` works without it (see step 7).

### Resend — sending email

1. **https://resend.com/signup** — free tier, 3,000 emails a month, no card.
2. **Domains → Add Domain.** Use a subdomain:
   `office.thecreativecurrent.co.za`.
3. Resend shows you DNS records (MX, SPF, DKIM). Add them wherever
   `thecreativecurrent.co.za` is managed. Verification takes minutes to an hour.
4. **API Keys → Create** → copy it. It starts with `re_`.

Why a subdomain and not the root: your existing `leads@thecreativecurrent.co.za`
has a sending reputation. Cold outreach is riskier mail. Keeping it on
`office.` means that if bot sending ever gets flagged, your real transactional
email is untouched.

---

## 3. Put the keys into Convex

Keys live in Convex's environment. Never in the repo, never in the browser
bundle, and they can't be read back out of the Settings screen.

```powershell
npx convex env set GEMINI_API_KEY "AIza...your-key"
npx convex env set GROQ_API_KEY "gsk_...your-key"
npx convex env set RESEND_API_KEY "re_...your-key"

# The passcode that opens the office, and the secret that signs its session
# tokens. Pick a real passcode; generate the secret.
npx convex env set OFFICE_PASSCODE "something-only-you-know"
npx convex env set OFFICE_TOKEN_SECRET "$([guid]::NewGuid().ToString() + [guid]::NewGuid().ToString())"

# Check what's there (values are hidden)
npx convex env list
```

---

## 4. Hire the bots

```powershell
pnpm prompts:build
pnpm seed
```

That creates the nine employees, your pricing rules, three sample leads and one
sample client, so the office isn't an empty room on first run.

`pnpm seed` is safe to re-run. It will **never** overwrite a system prompt you
have edited in the app — an edited prompt is yours permanently.

---

## 5. Open the office

Two terminals.

```powershell
# Terminal 1 — the backend, watching for changes
npx convex dev
```

```powershell
# Terminal 2 — the front end
pnpm dev:next
```

Go to **http://localhost:3000**, enter your passcode.

Or run both at once:

```powershell
pnpm dev
```

---

## 6. The local worker

Screenshots, Google Maps and Facebook need a real browser. Convex has no
browser, so that work runs on your PC.

```powershell
# Terminal 3 — leave it running
pnpm worker
```

The office floor shows **Local worker online** when it's up. Closing it is fine
— Lead-gen carries on with the directory sources and tells you the best two
sources are unavailable rather than quietly finding less.

---

## 7. Check it all works

```powershell
pnpm verify
```

That runs four things: rebuilds the prompts, parses every TypeScript file,
checks every Convex function reference resolves, and runs the guard and
LLM-fallback tests. It needs no keys and no deployment — it's the check to run
before you push anything.

To prove the Gemini→Groq fallback specifically:

```powershell
pnpm test:llm
```

It fakes a 429 from Gemini and asserts Groq answered. No real quota is spent.

---

## 8. Turn sending on

Nothing can send until you do this, deliberately.

1. Open **Settings**.
2. **Sender address** → `taine@office.thecreativecurrent.co.za` (or whatever you
   verified in Resend).
3. **Reply-to** → your normal inbox, so replies come to you.
4. **Cal.com booking link** → paste it once you've made your free Cal.com page
   at https://cal.com. Until then Lerato proposes two specific times in the
   email text instead, which works fine.
5. **Save**, then send yourself a test with the box on the right.

---

## 9. Put it online (free)

```powershell
# Push the backend
npx convex deploy

# Build the front end as static files
pnpm build
```

That produces `out/`. Then either:

**Before you start:** `convex/_generated` must be committed. The build machine
has no Convex credentials, so it cannot produce those files itself — `npx convex
codegen` refuses without a configured deployment, and the local stub types every
`api.*` call as `any`, which `next build` rejects. Run `npx convex dev` once to
generate the real files, then commit them. `pnpm check:generated` fails if they
are missing or if the stub has been committed in their place.

**Cloudflare Pages** (recommended — better free tier, no commercial-use clause):

1. https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git
2. Pick the repo and the branch you want deployed
3. **Root directory: `office`** — this repo also holds the marketing site, and
   without this the build runs in the wrong place and finds no Next app
4. Build command: `pnpm build` · Output directory: `out`
5. Environment variable: `NEXT_PUBLIC_CONVEX_URL` — whichever deployment you
   want it talking to. Pointing at your dev deployment keeps the data you
   already have; `npx convex deploy` makes a production one, which starts empty
   with no API keys set

**GitHub Pages**: push `out/` to a `gh-pages` branch, or use the Pages action.

### The passcode is not an API lock — read this before going public

`Gate.tsx` keeps a stranger out of the UI and fails closed, so `OFFICE_PASSCODE`
is not optional. But it is a lock on the front door only.

`NEXT_PUBLIC_CONVEX_URL` ships inside the JavaScript bundle of a public page,
and the Convex functions do not check the session token themselves. Anyone who
can load the site can read that URL out of the bundle and then call functions
directly — every lead, every prospect email, the settings, even a send —
without ever seeing the passcode screen.

On localhost that does not matter. On a public URL it does. Two ways to close
it, and you want one of them:

- **Cloudflare Access** in front of the Pages project (free up to 50 users).
  Email one-time-PIN at the edge, so a stranger never receives the bundle and
  never learns the Convex URL. Ten minutes, and enough for a single-operator
  back office.
- **Per-function auth** — every query and mutation takes and verifies the
  session token. The real answer if this ever holds anything you would be
  embarrassed to leak.

Setting up Access: Cloudflare dashboard → Zero Trust → Access → Applications →
Add an application → Self-hosted → point it at the Pages domain → policy
"Allow" with Include → Emails → your address → Login method: One-time PIN.

---

## What each key actually costs

| Service | Free tier | What happens when you hit it |
|---|---|---|
| Gemini | ~15 req/min, ~1,500/day | Automatic fallback to Groq. Logged as "fell back". |
| Groq | Generous per-minute limits | Both providers failing throws, the run is marked failed, the bot is blocked with a readable reason. |
| Convex | 1M function calls, 0.5GB | Far more than nine bots use. |
| Resend | 3,000 emails/month | The 20/day cap means you'd need 150 days to get near it. |
| Cloudflare Pages | Unlimited requests | — |
| Pollinations.ai | No account at all | Occasionally slow. Images are URLs, not files. |

---

## If something's wrong

**"NEXT_PUBLIC_CONVEX_URL isn't set"** — `npx convex dev` hasn't run. Run it.

**"cannot find module @/convex/\_generated/api"** — same cause. The generated
types only exist after Convex has connected once.

**"OFFICE_PASSCODE and OFFICE_TOKEN_SECRET aren't set"** — step 3.

**Bots are all "off shift"** — the STOP is engaged. The header says so in red.
Lift it and type `resume`.

**A bot says "Out of LLM budget today"** — it spent its daily allowance. Raise
it in Settings, or leave it; it resets at midnight SAST.

**Nothing sends** — check, in order: is the STOP engaged, is the pause switch
off, is there a sender address in Settings, is `RESEND_API_KEY` set, is the
domain verified in Resend. Every one of those produces a specific message in the
activity feed rather than silence.

**`pnpm worker` won't start** — `pnpm exec playwright install chromium`.
