CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('home','pricing','contact','appointment')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  service_type TEXT,
  message TEXT,
  description TEXT,
  project_details TEXT,
  start_date DATE,
  preferred_date DATE,
  company_name TEXT,
  newsletter_opt_in BOOLEAN,
  raw_payload JSONB NOT NULL
);

-- 'appointment' source: added when the Appointment Booking page got its own
-- copy of the Inquiry form, so leads from it aren't misattributed as 'contact'.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN ('home','pricing','contact','appointment'));

-- Client portal: customers, auth role mapping, analytics, change requests

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT NOT NULL,
  website_url TEXT,
  tracking_site_key UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  lead_id BIGINT REFERENCES leads(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 'internal' status: reserved for The Creative Current's own site, tracked
-- via the same analytics_events infrastructure as real clients but excluded
-- from the admin's customer-facing list (see AdminCustomers.tsx's query).
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_status_check;
ALTER TABLE customers ADD CONSTRAINT customers_status_check CHECK (status IN ('active','inactive','internal'));

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','customer')),
  customer_id BIGINT REFERENCES customers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 'owner': a superset of 'admin' added for staff management -- the one or
-- two people who run the agency, versus 'admin' staff they invite who get
-- full day-to-day access (leads, customers, outreach) but can't invite or
-- remove other admins. is_admin() deliberately treats owner as admin too so
-- every existing admin-only policy/endpoint keeps working unchanged; only
-- the owner-only actions check is_owner() specifically.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('owner','admin','customer'));

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION is_owner() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'owner');
$$;

CREATE OR REPLACE FUNCTION my_customer_id() RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT customer_id FROM profiles WHERE id = auth.uid();
$$;

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  visitor_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('pageview','heartbeat')),
  page_path TEXT,
  referrer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_customer_created_idx ON analytics_events (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_customer_visitor_created_idx ON analytics_events (customer_id, visitor_id, created_at DESC);
-- No INSERT policy needed: api/track.ts writes via the privileged direct
-- Postgres connection (api/_lib/db.ts), which bypasses RLS entirely.

-- 'conversion': revenue the customer's own site earns them (a completed
-- sale, a booking, a paid quote) -- not what they pay the agency, which is
-- a separate concern this project doesn't track. Reported the same way a
-- pageview is, via track.js, except a real integration (e-commerce
-- checkout success page, booking confirmation, etc.) has to actually call
-- it -- nothing infers a sale from browsing alone.
ALTER TABLE analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;
ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_type_check
  CHECK (event_type IN ('pageview','heartbeat','conversion'));
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS value NUMERIC(12,2);
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS label TEXT;

-- SECURITY INVOKER (the default), same reasoning as live_visitor_count:
-- RLS still applies, an unauthorized caller just gets 0.
CREATE OR REPLACE FUNCTION customer_revenue(customer_id_param BIGINT, days_param INTEGER DEFAULT 30) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(value), 0) FROM analytics_events
  WHERE customer_id = customer_id_param
    AND event_type = 'conversion'
    AND created_at > now() - (days_param || ' days')::interval;
$$;

-- SECURITY INVOKER (the default -- no modifier needed): runs as the calling
-- user, so the analytics_select RLS policy still applies underneath this
-- count. An unauthorized caller just gets 0, not an error.
CREATE OR REPLACE FUNCTION live_visitor_count(customer_id_param BIGINT) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT visitor_id)::integer FROM analytics_events
  WHERE customer_id = customer_id_param AND created_at > now() - interval '90 seconds';
$$;

CREATE TABLE IF NOT EXISTS change_requests (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  description TEXT NOT NULL,
  screenshot_paths TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','in_progress','done')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_requests ENABLE ROW LEVEL SECURITY;

-- leads previously had no RLS policy at all, which (combined with Supabase's
-- default anon/authenticated grants on public-schema tables) meant anyone
-- with the public anon key could read every lead via the REST API. Only a
-- risk once the anon key started shipping client-side for the portal, but
-- fixed now regardless: admin-only reads, no client insert (api/leads.ts
-- writes via the privileged direct Postgres connection, bypassing RLS).
DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS customers_select ON customers;
CREATE POLICY customers_select ON customers FOR SELECT USING (is_admin() OR id = my_customer_id());

DROP POLICY IF EXISTS analytics_select ON analytics_events;
CREATE POLICY analytics_select ON analytics_events FOR SELECT USING (is_admin() OR customer_id = my_customer_id());

DROP POLICY IF EXISTS change_requests_select ON change_requests;
CREATE POLICY change_requests_select ON change_requests FOR SELECT USING (is_admin() OR customer_id = my_customer_id());

DROP POLICY IF EXISTS change_requests_insert ON change_requests;
CREATE POLICY change_requests_insert ON change_requests FOR INSERT WITH CHECK (is_admin() OR customer_id = my_customer_id());

DROP POLICY IF EXISTS change_requests_update ON change_requests;
CREATE POLICY change_requests_update ON change_requests FOR UPDATE USING (is_admin());

-- Storage: change-request-screenshots bucket (private), path convention
-- {customer_id}/{uuid}/{filename} so the customer_id segment can be policy-checked.
DROP POLICY IF EXISTS change_request_screenshots_insert ON storage.objects;
CREATE POLICY change_request_screenshots_insert ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'change-request-screenshots'
  AND (storage.foldername(name))[1] = my_customer_id()::text
);

DROP POLICY IF EXISTS change_request_screenshots_select ON storage.objects;
CREATE POLICY change_request_screenshots_select ON storage.objects
FOR SELECT USING (
  bucket_id = 'change-request-screenshots'
  AND ((storage.foldername(name))[1] = my_customer_id()::text OR is_admin())
);

-- Cold-outreach prospecting: distinct from `leads` (inbound, someone already
-- contacted you) -- these are outbound targets found via Google Places or
-- added manually. Admin-only end to end; nothing sends without an explicit
-- human approval (see api/prospects-send.ts).
CREATE TABLE IF NOT EXISTS prospects (
  id BIGSERIAL PRIMARY KEY,
  business_name TEXT NOT NULL,
  category TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  maps_url TEXT,
  place_id TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('places_api','manual')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','drafted','approved','sent','replied','won','lost')),
  draft_subject TEXT,
  draft_body TEXT,
  notes TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospects_select ON prospects;
CREATE POLICY prospects_select ON prospects FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS prospects_insert ON prospects;
CREATE POLICY prospects_insert ON prospects FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS prospects_update ON prospects;
CREATE POLICY prospects_update ON prospects FOR UPDATE USING (is_admin());
DROP POLICY IF EXISTS prospects_delete ON prospects;
CREATE POLICY prospects_delete ON prospects FOR DELETE USING (is_admin());

-- Poor-website detection: a business can also be a lead if it has a website
-- that scores poorly on Google PageSpeed, not just no website at all.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS page_speed_score INTEGER;
-- The specific, verifiable fault found on their site, already phrased for the
-- recipient (see api/_lib/websiteHealth.ts `emailDefect`). Stored rather than
-- recomputed so regenerating a draft from ProspectCard keeps the specific
-- opener instead of silently downgrading it to the generic one -- the draft is
-- written once at discovery time, but the button that rewrites it runs much
-- later, with no access to the original site check.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS email_defect TEXT;
-- Set when a single follow-up has been sent. Its presence is the guard that
-- stops a second one: cold outreach that did not get a reply earns one more
-- attempt, not an indefinite sequence. Under POPIA a follow-up to a
-- non-responding recipient is itself another unsolicited marketing message,
-- so the cap is deliberate rather than a matter of taste.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMPTZ;

-- Call-first leads. Google Places returns a phone for almost every business
-- but never an email, so the strongest prospects -- a lapsed domain has no
-- page left to scrape an address from -- can only be reached by calling.
-- These three columns are the whole of that workflow's state.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS call_notes TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_called_at TIMESTAMPTZ;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS call_attempts INTEGER NOT NULL DEFAULT 0;

-- 'no_answer' and 'callback' are the two states a call can leave a lead in
-- that are not an outcome. "Not interested" deliberately reuses the existing
-- 'lost' rather than adding a synonym, and a lead that turns into a real
-- conversation goes to 'won' like any other.
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_status_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_status_check
  CHECK (status IN ('new','drafted','approved','sent','replied','won','lost','no_answer','callback'));
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'no_website';
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_reason_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_reason_check CHECK (reason IN ('no_website','poor_website'));

-- Reply handling (api/check-replies.ts polls the admin's Gmail inbox via
-- IMAP -- same app password as sending -- and matches replies back to a
-- prospect by sender address). Only the latest reply is kept: this is a
-- detect-and-suggest-a-response workflow, not a full threaded conversation
-- history, so a second reply from the same prospect overwrites the first
-- rather than appending.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_body TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_received_at TIMESTAMPTZ;
-- The original message's RFC 822 Message-ID, so a sent reply can carry
-- proper In-Reply-To/References headers and thread correctly in the
-- recipient's inbox instead of arriving as an unrelated new message.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_message_id TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS ai_suggested_reply TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reply_sent_at TIMESTAMPTZ;

-- Pipeline board (AdminOutreach.tsx's kanban view, replacing the old flat
-- filtered list). `interested` is deliberately a separate tri-state flag
-- from `status` rather than folded into won/lost: status tracks where a
-- prospect sits in the outreach *process* (drafted, sent, replied, ...),
-- while interested is a quick yes/no/undecided triage call that can be made
-- at any stage, independent of how far contact has progressed. NULL = not
-- yet decided.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS interested BOOLEAN;
-- Google Places `photos[0].photo_reference` from the Details call, so the
-- board can show a real storefront/listing photo. Never rendered directly
-- with the API key attached -- api/prospects-search.ts's GET branch proxies
-- the actual image fetch server-side so the key never reaches the browser.
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS photo_reference TEXT;

-- Saved searches (category + location) power the daily automated discovery
-- job in api/outreach-run.ts -- nothing to run at 5am without these.
CREATE TABLE IF NOT EXISTS saved_searches (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (category, location)
);
ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_searches_select ON saved_searches;
CREATE POLICY saved_searches_select ON saved_searches FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS saved_searches_insert ON saved_searches;
CREATE POLICY saved_searches_insert ON saved_searches FOR INSERT WITH CHECK (is_admin());
DROP POLICY IF EXISTS saved_searches_delete ON saved_searches;
CREATE POLICY saved_searches_delete ON saved_searches FOR DELETE USING (is_admin());

-- Email activity log: every email api/_lib/email.ts sends (lead notifications
-- and cold outreach) gets a row here, success or failure, so a silent-failure
-- bug (like the earlier Resend {error} vs throw issue) is visible in-app
-- instead of only in Resend's own dashboard. Written via the privileged
-- service-role client inside the functions that already send these emails,
-- so no INSERT policy is needed -- same reasoning as analytics_events/leads.
CREATE TABLE IF NOT EXISTS email_log (
  id BIGSERIAL PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('outreach','lead_notification','other')),
  status TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error TEXT,
  prospect_id BIGINT REFERENCES prospects(id),
  lead_id BIGINT REFERENCES leads(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_log_select ON email_log;
CREATE POLICY email_log_select ON email_log FOR SELECT USING (is_admin());

-- Someone typed a real name, email, and phone into the Inquiry form (the
-- multi-step form shared by /contact and /appointment-booking) but left
-- before hitting the final Submit on the review step. Captured client-side
-- (Inquiry.tsx, a debounced background POST plus one on page-hide) rather
-- than waiting for a real submission -- that's the whole point, since a
-- completed submission already becomes a normal row in `leads`. Kept as its
-- own table rather than a status on `leads` because it is a fundamentally
-- different kind of record: inferred from partial, possibly-still-changing
-- input, not an explicit "send this" action. Written via the same privileged
-- direct-Postgres connection api/leads.ts already uses for `leads`, so no
-- INSERT policy is needed; UPDATE is needed so the admin page can mark one
-- contacted or add a note directly via supabase-js.
CREATE TABLE IF NOT EXISTS abandoned_leads (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'contact' CHECK (source IN ('home','pricing','contact','appointment')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  service_type TEXT,
  project_details TEXT,
  preferred_date TEXT,
  -- Which Inquiry.tsx step (0-indexed) they had reached when captured --
  -- 2 is "Tell us about you" (where the contact fields live), 3 is the
  -- final review step, so a 3 means they read their own submission back
  -- and still didn't send it.
  step_reached INTEGER NOT NULL DEFAULT 2,
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE abandoned_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS abandoned_leads_select ON abandoned_leads;
CREATE POLICY abandoned_leads_select ON abandoned_leads FOR SELECT USING (is_admin());
DROP POLICY IF EXISTS abandoned_leads_update ON abandoned_leads;
CREATE POLICY abandoned_leads_update ON abandoned_leads FOR UPDATE USING (is_admin());

-- A notification when a new abandoned entry is first captured needs its own
-- email_log type, distinct from a real lead notification.
ALTER TABLE email_log DROP CONSTRAINT IF EXISTS email_log_type_check;
ALTER TABLE email_log ADD CONSTRAINT email_log_type_check
  CHECK (type IN ('outreach','lead_notification','abandoned_lead_notification','other'));
