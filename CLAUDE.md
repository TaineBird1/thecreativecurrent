# The Creative Current — Project Context (CLAUDE.md)

## Business

The Creative Current — a web design and management agency based in Durban, KZN, South Africa.

- Email: thecreativecurrent01@gmail.com
- Phone: +27 61 478 5459
- Location: Durban, KZN, South Africa
- Live site: https://www.thecreativecurrent.co.za/ (custom domain, pointed at Vercel via 10Web-managed DNS)

## Tech Stack

- Frontend: React 19 + TypeScript, Tailwind CSS 4 (CSS-first `@theme` config, no `tailwind.config.js`)
- Routing: react-router-dom (`BrowserRouter`)
- Backend: Vercel Serverless Functions (`api/*.ts`, Node runtime, `@vercel/node`) + **Supabase** (Postgres, Auth, Storage)
- Email: Resend (`api/_lib/email.ts`)
- Deployed on Vercel, auto-deploys on push to `master`. Repo: github.com/TaineBird1/thecreativecurrent

## How this project came to be

The original live site ran on WordPress + WooCommerce (via 10Web) with an AI-generated "digital lab" design system. This project is a from-scratch React+Tailwind rebuild matching that live site's actual content/copy/layout (inspected directly from the live DOM, not a spec doc), then extended with a real backend: a lead-capture API + database, and a client portal (analytics + change requests) for actual paying clients.

## Marketing Site

Sections composed per page (`src/pages/<Page>/sections/*.tsx`), `Header`/`Footer` shared from `src/reusable_sections/`. Real product photos in `src/assets/site/`.

```
src/pages/
├── Home/sections/          # Evolution (hero), Expertise (6 services), Process (6-step timeline),
│                           # Current (CTA), Contact (intake form), Calendarbooking
├── AppointmentBooking/sections/   # Appointment (hero), Booking (contact cards), Faq (7-item)
├── Pricing/sections/       # Pricing (real tiers: R6,000/R8,000/R15,000), Faq (11-item), Contact
├── Contact/sections/       # Hero, Inquiry (4-step form), SubmissionSuccessConfirmation
└── AboutUs/sections/        # AboutHero (letter reveal), Mission
```

**Design tokens** (`src/index.css`, Tailwind v4 `@theme`): background `#000`, foreground `hsl(0 0% 95%)`, primary `#00D9FF`, accent `#D946EF`, chart-1/3/4 (cyan/pink/orange gradient). Fonts: Inter (substituted for the live site's "Google Sans", which isn't a real servable font), Georgia, JetBrains Mono.

**Hard constraints**: Tailwind utilities only, no custom CSS classes/`*.module.css`, no `@apply`, no fonts outside Inter/Georgia/JetBrains Mono.

## Lead-Capture Backend

All 3 marketing-site forms (Home/Pricing/Contact) POST to a single `POST /api/leads` endpoint (`api/leads.ts`) — **not** `mailto:` links.

- `src/lib/leads.ts` — `leadPayloadSchema` (Zod), shared between the API handler and the 3 forms. Includes an honeypot field (`honeypot`) — non-empty submissions return `201 {ok:true}` but are silently dropped (no insert, no email).
- `api/_lib/db.ts` — singleton `postgres` npm package client, reads `POSTGRES_URL` (Supabase's pooled/pgbouncer connection, `prepare: false` for pgbouncer compat). This connection is privileged — it bypasses RLS entirely, which is why `leads` and `analytics_events` don't need INSERT policies.
- `api/_lib/email.ts` — wraps Resend, sends a notification to `LEADS_NOTIFICATION_EMAIL` on every valid submission (best-effort — a Resend failure is logged but doesn't fail the request, since the lead is already safely in the DB by that point).
- `src/hooks/useLeadSubmit.ts` — shared submit/loading/error/success state hook used by all 3 forms.
- `vercel.json` — SPA rewrite (`/(.*) → /index.html`) plus an explicit `/api/(.*) → /api/$1` pass-through so API routes aren't swallowed by the catch-all.

## Client Portal (Auth + Analytics + Change Requests)

Once a lead becomes a paying client, the admin invites them to a portal where they see live traffic for their own separately-hosted website and submit change requests with screenshots. Full plan/design rationale: see git history (`git log --all --oneline | grep -i portal`) — the short version:

**Auth**: Supabase Auth. A `profiles` table (keyed by `auth.users.id`) holds `role` (`admin`/`customer`) + `customer_id`. Two `SECURITY DEFINER` SQL functions — `is_admin()` and `my_customer_id()` — are used in every RLS policy instead of inlining checks, avoiding policy self-recursion on `profiles`.

- `src/lib/supabaseClient.ts` — browser Supabase client (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — **note the `VITE_` prefix**, not the `NEXT_PUBLIC_` ones the Vercel/Supabase integration originally injected; those are invisible to Vite and only the `VITE_*` copies were added manually).
- `src/lib/auth.tsx` — `AuthProvider`/`useAuth()`, tracks session + profile + a `passwordRecovery` flag (set on Supabase's `PASSWORD_RECOVERY` auth event, so invite/recovery links show a "set your password" form instead of silently logging in with no way to set one).
- Auth/role guarding is inlined directly into `AdminLayout.tsx`/`PortalLayout.tsx` (both already call `useAuth()` for their own UI) rather than a separate `<RequireAdmin>`/`<RequireCustomer>` wrapper — the old wrapper version is what originally shipped, but it's gone now (see the redirect-loop note below). Guard order matters: **check `!session || !profile` before checking `profile.role`** — a session can be valid (unexpired JWT) while its `profiles` row no longer exists (e.g. a deleted test/preview account), leaving `profile` permanently `null`. Checking role first (`profile?.role !== "admin"`) treats a null profile as "wrong role" and redirects to `/portal`, which redirects right back to `/admin` for the same reason — an infinite loop between the two layouts. Treating "no profile" as "not authenticated" (redirect to `/login`) avoids this for any orphaned-session case.
- Single admin (bootstrapped manually via `supabase.auth.admin.inviteUserByEmail` + a hand-inserted `profiles` row — there's no self-service "first admin" flow, and there shouldn't be for a single-admin system). Customers are **invite-only** — no public signup page exists.

**Data model** (`sql/schema.sql`, applied via `scripts/run-schema.mjs` against `POSTGRES_URL_NON_POOLING`):
- `customers` — business_name, contact info, `website_url`, `tracking_site_key` (UUID, used by the tracking snippet), optional `lead_id` link back to the leads table.
- `analytics_events` — pageview/heartbeat events per customer. No RLS INSERT policy (written via the privileged direct-Postgres connection in `api/track.ts`, same pattern as `api/leads.ts`).
- `change_requests` — description, `screenshot_paths` (array, Supabase Storage paths), status (`submitted`/`in_progress`/`done`).
- `live_visitor_count(customer_id)` SQL function — `SECURITY INVOKER` (the default), so RLS still gates it; an unauthorized caller just gets 0, not an error.
- **`leads` also got RLS added** during this work — it previously had none, meaning anyone with the (now-public, since it ships in the portal's bundle) anon key could read every lead via Supabase's REST API. Fixed: admin-only reads.

**Tracking snippet**: `public/track.js` (plain vanilla JS, not bundled — Vite serves `public/` as-is) is what the agency embeds on a *client's own, separately-hosted* website: `<script src=".../track.js" data-site="{tracking_site_key}" async>`. Fires a pageview on load + a heartbeat every ~20s (paused when the tab is hidden), always via `fetch(..., {keepalive:true})` (never `sendBeacon` — it silently fails to deliver cross-origin JSON POSTs, discovered via real embedded-snippet testing, not direct API calls). Posts to `api/track.ts` — the **only public, CORS-enabled** endpoint in the project (everything else is same-origin). Unknown/malformed payloads get a silent `204`, never an error, so the endpoint doesn't leak whether a site key is valid. "Live now" = distinct visitor IDs seen in the last 90 seconds.

**The Creative Current's own site is tracked the same way**: `index.html` embeds `track.js` pointed at a `customers` row (id 7) with `status = 'internal'` — a third status value (alongside `active`/`inactive`) that keeps this record out of the admin's customer-facing list (`AdminCustomers.tsx`, `AdminOverview.tsx`'s customer count both filter `status != 'internal'`) while still being a real trackable row. `api/track.ts`'s customer lookup accepts `status IN ('active', 'internal')` — it originally only accepted `active`, which silently dropped every event for the internal record until fixed. `AdminOverview.tsx` shows a "Your Website" section (live count + traffic chart) when an internal customer row exists.

**Screenshot uploads**: direct browser → Supabase Storage (bucket `change-request-screenshots`, private), no server proxy. Path convention `{customer_id}/{uuid}/{filename}`, RLS-checked via `storage.foldername(name)`. Rendered back via short-lived signed URLs.

**Routes** (`src/App.tsx`) — outside the marketing site's `Header`/`Footer`:
- `/login` — shared login; also renders the password-set form when `passwordRecovery` is true.
- `/portal` (customer) — `PortalDashboard` (live count + 7-day traffic chart), `/portal/requests` (`PortalChangeRequests` — submit form + own request list).
- `/admin` — `/admin/customers` (list + invite form), `/admin/customers/:id` (per-customer analytics + requests), `/admin/change-requests` (cross-customer checklist with mark-done, business-name joined in), `/admin/leads` (existing leads table + "convert to customer" prefill).
- `/privacy`, `/terms` — static legal pages (`src/pages/Privacy`, `src/pages/Terms`), sharing a `LegalLayout`/`LegalSection` component (`src/components/LegalLayout.tsx`). Linked from `Footer.tsx`. Privacy Policy content is POPIA-oriented (South Africa's data protection law).
- `*` (within the marketing site only) — `NotFound` (`src/pages/NotFound`), `noindex`'d via `useSEO`, so broken/typo'd URLs don't return a blank "soft 404" to Google.

**Code-splitting** (`src/App.tsx`): `/login`, `/portal/*`, and `/admin/*` sit behind a pathless `<Route element={<AuthLayout/>}>` layout route (`src/AuthApp.tsx` — just `<AuthProvider><Outlet/></AuthProvider>`), and every page/layout component under those paths is `React.lazy`-loaded individually. This matters because `AuthProvider` (and therefore the whole Supabase SDK) used to wrap the **entire app**, including the public marketing site, even though no marketing page calls `useAuth()` — every visitor was downloading ~570KB of JS they'd never use. Splitting it out dropped the marketing bundle to ~353KB with Supabase (~207KB) deferred to its own chunk that only loads on `/login`, `/portal`, or `/admin`. Gotcha hit while building this: a *second*, nested `<Routes>` mounted via a splat parent (`path="/admin/*"`) resolves its children against the **remaining** unmatched path segment, not the full URL — declaring absolute-looking child paths (`<Route path="/admin">`) inside it never matches anything and silently renders blank. Fixed by keeping one single top-level `<Routes>` tree (children-based nesting, as before) and only lazy-loading the `element` values.

**Shared components** (used by both admin and portal — moved to `src/components/` mid-build once that became clear): `LiveVisitorCount.tsx`, `TrafficChart.tsx` (dependency-free CSS bar chart), `ChangeRequestList.tsx` (takes optional `customerId`/`canUpdateStatus`/`showBusinessName` props to serve both the customer's own list and the admin's cross-customer checklist).

**6 serverless functions exist in total** (everything else is direct `supabase-js` from the browser, authorized by RLS):
- `api/invite-customer.ts` — admin-only, uses `SUPABASE_SERVICE_ROLE_KEY` to create the auth user + customer + profile rows. Service role key can never reach the browser, so this can't be done client-side.
- `api/track.ts` — see above.
- `api/prospects-search.ts`, `api/prospects-send.ts`, `api/outreach-run.ts`, `api/prospects-bulk-send.ts` — see Cold Outreach below.

All admin-only functions share **`api/_lib/requireAdmin.ts`**: pulls the `Bearer` token, calls `getSupabaseAdmin().auth.getUser(token)`, then checks `profiles.role === 'admin'`. Written inline three times before being factored out — reuse it for any new admin-only endpoint rather than re-copying the check.

**`tsconfig.api.json` gotcha** (bit the project twice): `module: nodenext` requires explicit `.js` extensions on relative imports in `api/*.ts` files, even though the source is `.ts` (e.g. `from "./_lib/db.js"`).

## Cold Outreach (Admin only, `/admin/outreach`)

Find local businesses whose website needs updating (poor PageSpeed score) and have a contactable email on file, draft a personalized email, and only send after an explicit human approval — ported from a prototype a separate Claude Desktop session built as a standalone Next.js app (never run/deployed; only this feature was worth pulling in, since the rest duplicated what's already live here). Targeting was originally broader (no-website leads counted as the best leads), but was deliberately narrowed to "poor website + valid email" only, applied consistently across both the automated and interactive/manual paths — a no-website business has no email Google can ever surface, so it no longer qualifies as a lead at all (see `AdminOutreach.tsx` below).

**Why it's built this way**: South Africa's POPIA requires opt-in consent for direct electronic marketing to people who aren't already customers. Cold outreach to new prospects sits in a legal gray area at best, so nothing sends without a human reviewing that exact draft first, volume stays low/personal rather than bulk, and every email includes an opt-out line. Not legal advice — POPIA section 69 (direct marketing) is worth an actual read before doing this at real scale.

- `prospects` table (`sql/schema.sql`) — deliberately a separate table from `leads`: `leads` is inbound (someone already contacted you), `prospects` is outbound targets. Admin-only RLS (`is_admin()`) on all four operations; list/create/update/delete all happen directly from the browser via `supabase-js`, same pattern as `AdminLeads.tsx` — no server round-trip needed for any of that. Also carries `reason` (`no_website` / `poor_website`), `website`, and `page_speed_score` — a business with a website that scores under 50 on Google PageSpeed (mobile) counts as a lead. `reason = 'no_website'` still exists as a valid enum value for old rows created before targeting was narrowed, but nothing creates new ones anymore — both `AdminOutreach.tsx` and `api/outreach-run.ts` only ever insert `'poor_website'` now.
- `api/_lib/placesDiscovery.ts` — shared `discoverPlaces(category, location, apiKey)`: Google Places Text Search, then a Details lookup per result (only Details returns whether a `website` is listed), then a PageSpeed check on any result that has one. Used by both `api/prospects-search.ts` (interactive) and `api/outreach-run.ts` (automated) so the Google API logic only lives in one place.
- `api/_lib/emailScraper.ts` — `scrapeEmailFromWebsite(url)`: for any result that has a website (i.e. a poor-website lead, never a no-website one — Google Places doesn't return emails, so there's nothing to scrape for those), fetches its homepage and looks for a `mailto:` link or an "@"-shaped string in the page text. Best-effort with the same 8s-timeout-and-return-null philosophy as `pagespeed.ts` — a slow/unresponsive site must not stall the search. Populates `prospects.email` automatically at insert time (both interactive add and the automated run); the existing "Email (add manually if not found automatically)" field on `ProspectCard.tsx` just shows up pre-filled when this succeeds, no UI changes needed.
- `api/prospects-search.ts` — admin-only, calls `discoverPlaces` using `GOOGLE_PLACES_API_KEY`, which can't reach the browser.
- `src/lib/outreachTemplate.ts` — `buildOutreachDraft(businessName, category, reason)`, a pure string template with a different opening line for `poor_website` vs `no_website`. Draft generation is entirely client-side (no API call) — the result is just saved back via a normal `supabase-js` update.
- `api/prospects-send.ts` — sends via `sendOutreachEmail` (`api/_lib/email.ts`). Sends through the admin's real Gmail account via `nodemailer`'s `gmail` SMTP service (`GMAIL_USER` / `GMAIL_APP_PASSWORD` env vars, an app password generated under the Google Account's 2-Step Verification settings — not the primary password) rather than Resend, at explicit request: recipients see a genuine personal address as sender and replies land straight in that inbox. This reverses an earlier deliberate choice to avoid Gmail SMTP for deliverability reasons (Resend's verified domain was considered less likely to be flagged as spam) — acceptable here because every send is a single, human-approved, personalized message rather than an automated bulk blast, but note Gmail SMTP has its own ~500-recipient/day sending cap, so this isn't the right transport if outreach volume grows much beyond the current one-at-a-time / small-daily-batch review flow. Refuses to send unless `status = 'approved'` and an email is on file, then flips `status` to `'sent'` in the same request.
- `saved_searches` table — a category+location pair to re-run automatically. Same admin-only RLS pattern as `prospects`, CRUD directly from the browser (no server endpoint needed).
- `api/outreach-run.ts` — runs every saved search via `discoverPlaces`, inserts any new QUALIFIED opportunity (`place_id` not already in `prospects`) with an auto-generated draft and `status = 'drafted'`. **Never sends anything.** Qualified = `isPoorWebsite && email !== null && isMiddleClassPriceLevel(priceLevel)` — a deliberate, explicit user choice: automated lead *generation* only creates a lead that already has a contactable email (so `no_website` leads, which never have one, can never come from this path), and isn't explicitly marked Expensive/Very Expensive by Google's `price_level` field (`api/_lib/placesDiscovery.ts`) — the closest available proxy for "middle class". `price_level` is only populated by Google for some categories (restaurants/cafes/retail) — confirmed via real search results that service trades (electricians, pre-schools) essentially never have it, so `isMiddleClassPriceLevel` deliberately treats unknown (`null`) as a **pass**, not a fail — otherwise this filter would have silently zeroed out those categories entirely. Only businesses Google explicitly tags Expensive/Very Expensive get excluded. `AdminOutreach.tsx`'s interactive search applies the same email-required, poor-website-only targeting policy (not the price-level part — that's automated-only) so both paths stay consistent: results split into "Websites that need updating" (poor website + email found, addable) as the only addable section, with three collapsed/informational-only groups underneath (poor-website-but-no-email, no-website-at-all, and good-website) so nothing found is hidden, it's just not presented as an actionable lead. Two entry points into the same `runAllSearches()`: `GET` (checked against `CRON_SECRET` — Vercel doesn't verify this header for you) called by the Vercel Cron job in `vercel.json` (`0 5 * * *`, i.e. 7am SA time), and `POST` (checked via `requireAdmin`) called by the "Run all saved searches now" button on `/admin/outreach/review`. Only the `GET`/cron path also sends `sendOutreachDigest` (`api/_lib/email.ts`) when it finds at least one new lead — a plain-text summary email to `LEADS_NOTIFICATION_EMAIL` listing what was found, so checking the review page can be a "when I get the email" habit instead of a daily manual check. The manual "Run now" button doesn't send it, since whoever clicked it already sees the result on screen.
- `sendOutreachEmail` (`api/_lib/email.ts`) no longer needs a BCC-to-self for record-keeping — since it sends through the admin's own Gmail account directly, Gmail auto-saves every outreach send to that account's Sent folder. `email_log` remains the queryable record either way (`/admin/activity`).
- `api/prospects-bulk-send.ts` — admin-only, body `{ ids }`. Unlike `prospects-send.ts`, does **not** require a prior `status = 'approved'` — on the review page, seeing the draft in the checklist and clicking "Send selected" *is* the human approval step, just reviewed as a daily batch instead of one at a time. Still refuses to send without an email and a draft on file.
- `src/admin/AdminOutreachReview.tsx` (`/admin/outreach/review`) — the daily batch-review UI: "Run all saved searches now" button, then every `status = 'drafted'` prospect as a pre-checked checklist item (editable email, collapsible draft preview) with a "Send selected" button. Reachable via a link from `/admin/outreach`, not a separate sidebar item.

### Email Activity Log (`/admin/activity`)

`email_log` table records every email `api/_lib/email.ts` sends — both `sendLeadNotification` and `sendOutreachEmail` log a row on success *and* failure (recipient, subject, type, status, error message, optional `prospect_id`/`lead_id`). Written via the service-role client inline in those functions, so no INSERT policy is needed. Exists because a Resend send returning `{ error }` instead of throwing previously failed silently (see `sendOutreachEmail`'s own comment) — this makes that kind of failure visible in-app instead of only in Resend's dashboard. `src/admin/AdminActivity.tsx` lists the most recent 200 rows with Total/Sent/Failed counts; hover a "Failed" badge to see the error.

## SEO

- `public/robots.txt` — allows crawling, disallows `/admin`, `/portal`, `/login`, points to the sitemap.
- `public/sitemap.xml` — static, lists the 7 public marketing/legal routes. Update by hand if a marketing page is added/removed (nothing generates this automatically).
- `src/lib/seo.ts` — `useSEO({title, description, noindex})` hook, called at the top of every page component. Imperatively sets `document.title`, `<meta name="description">`, `<meta name="robots">`, `<link rel="canonical">`, and `og:title`/`og:description`/`og:url`, on mount/route change. `/login`, `/portal`, `/admin` pass `noindex: true`.
- `index.html` — static fallback `og:*`/`twitter:*` tags (only ever reflect the homepage, since this is a client-rendered SPA with no SSR — a scraper that doesn't execute JS sees these for any URL) plus a `ProfessionalService` JSON-LD block (name/address/phone/areaServed) for local-business rich results.
- Hero images that are above-the-fold / likely LCP candidates (`Evolution.tsx` on Home, `Contact/sections/Hero.tsx`) use `loading="eager"` + `fetchPriority="high"`, not `loading="lazy"` — lazy-loading the LCP image delays paint and directly hurts Core Web Vitals.
- Google Search Console: verified (HTML meta tag in `index.html`, `<meta name="google-site-verification" content="...">`) and `sitemap.xml` submitted. Still needed, requires an actual Google account: a Google Business Profile listing for local search.

## Known limitations / not yet done

- No real client has been invited yet — the full customer-side portal experience (their own live traffic, their own change requests) hasn't been exercised with a genuine client account, only with disposable test accounts created/torn down via the service-role key during development.
- `LEADS_FROM_EMAIL` is now `leads@thecreativecurrent.co.za` — domain verified in Resend (MX/SPF/DKIM added to Cloudflare via Resend's Cloudflare auto-configure), no longer the shared `onboarding@resend.dev` sender. Project is linked to Vercel via CLI (`.vercel/` dir, gitignored) if env vars need updating again — `vercel env add/rm <name> <environment>`, one environment at a time; removing a var from one environment removes the whole record if it previously spanned multiple environments, so it has to be re-added to each of Development/Preview/Production individually.
- Supabase's free-tier auth email rate limit is low (a handful per hour) — heavy testing of the invite flow can trip it; real customer invites should be fine under normal usage.
- No automated test suite. Every backend piece (leads API, tracking, RLS policies, storage policies, invite flow, admin checklist) was verified via one-off Node scripts run directly against the real Supabase project and, for critical paths, the deployed production API — not via a persisted test framework.
- Google Business Profile setup still needs to be done manually (see SEO section above) — Search Console is already verified and the sitemap submitted.
- `og:image`/`twitter:image` reuse an existing 1254×1254 square hero photo rather than a purpose-made 1200×630 social-preview image.
- Google Places does not return email addresses — only phone/address/website. For no-website results (the actual leads), there's usually no public email in Google's data at all, so an email typically has to be found manually (search, Facebook page, or just call the number) and pasted into the prospect's card before it can be sent to.
