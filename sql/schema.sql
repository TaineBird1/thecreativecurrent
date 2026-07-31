CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL CHECK (source IN ('home','pricing','contact')),
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
