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
│                           # Current (CTA), Contact (intake form), Calendarbooking, FeaturedServices
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
- `src/lib/authGuard.tsx` — `<RequireAdmin>`, `<RequireCustomer>` route guards.
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
- `/portal` (customer, `RequireCustomer`) — `PortalDashboard` (live count + 7-day traffic chart), `/portal/requests` (`PortalChangeRequests` — submit form + own request list).
- `/admin` (`RequireAdmin`) — `/admin/customers` (list + invite form), `/admin/customers/:id` (per-customer analytics + requests), `/admin/change-requests` (cross-customer checklist with mark-done, business-name joined in), `/admin/leads` (existing leads table + "convert to customer" prefill).
- `/privacy`, `/terms` — static legal pages (`src/pages/Privacy`, `src/pages/Terms`), sharing a `LegalLayout`/`LegalSection` component (`src/components/LegalLayout.tsx`). Linked from `Footer.tsx`. Privacy Policy content is POPIA-oriented (South Africa's data protection law).

**Shared components** (used by both admin and portal — moved to `src/components/` mid-build once that became clear): `LiveVisitorCount.tsx`, `TrafficChart.tsx` (dependency-free CSS bar chart), `ChangeRequestList.tsx` (takes optional `customerId`/`canUpdateStatus`/`showBusinessName` props to serve both the customer's own list and the admin's cross-customer checklist).

**Only 2 serverless functions exist for the portal** (everything else is direct `supabase-js` from the browser, authorized by RLS):
- `api/invite-customer.ts` — admin-only (checked via `profiles.role`), uses `SUPABASE_SERVICE_ROLE_KEY` to create the auth user + customer + profile rows. Service role key can never reach the browser, so this can't be done client-side.
- `api/track.ts` — see above.

**`tsconfig.api.json` gotcha** (bit the project twice): `module: nodenext` requires explicit `.js` extensions on relative imports in `api/*.ts` files, even though the source is `.ts` (e.g. `from "./_lib/db.js"`).

## Known limitations / not yet done

- No real client has been invited yet — the full customer-side portal experience (their own live traffic, their own change requests) hasn't been exercised with a genuine client account, only with disposable test accounts created/torn down via the service-role key during development.
- Resend is still on the unverified `onboarding@resend.dev` sender. Once needed, switch to a verified `@thecreativecurrent.co.za` sender (DNS + env var change).
- Supabase's free-tier auth email rate limit is low (a handful per hour) — heavy testing of the invite flow can trip it; real customer invites should be fine under normal usage.
- No automated test suite. Every backend piece (leads API, tracking, RLS policies, storage policies, invite flow, admin checklist) was verified via one-off Node scripts run directly against the real Supabase project and, for critical paths, the deployed production API — not via a persisted test framework.
- Main JS bundle is ~570KB (Supabase SDK pulled the whole app over the 500KB warning threshold). Not yet code-split; `/portal` and `/admin` could be lazy-loaded since marketing-site visitors don't need that code.
