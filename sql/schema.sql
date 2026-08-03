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

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
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
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'no_website';
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_reason_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_reason_check CHECK (reason IN ('no_website','poor_website'));

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
