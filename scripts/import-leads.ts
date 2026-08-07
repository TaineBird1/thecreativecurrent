// One-off seed import: manually-researched prospect CSVs -> `prospects` table.
//
// These rows did NOT come from the Places API and cannot be reproduced by it.
// Google Places returns phone/address/website but never an email, and it has
// no concept of "this domain no longer resolves". The CSVs carry 45 verified
// emails and a written, human-checked defect note per business -- both of
// which the automated daily run structurally cannot produce. That is the
// whole reason this import exists rather than just widening a saved search.
//
// Safe to re-run: dedupes on (lower(business_name), digits-of-phone) because
// these rows have no place_id to key on, unlike everything from places_api.
//
// Usage:
//   npx tsx scripts/import-leads.ts                      # dry run, prints a plan
//   npx tsx scripts/import-leads.ts --commit             # actually writes
//   npx tsx scripts/import-leads.ts --commit file1.csv file2.csv
//
// Requires POSTGRES_URL_NON_POOLING in the environment, same as run-schema.mjs.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { buildOutreachDraft } from "../src/lib/outreachTemplate.js";

const DEFAULT_DIR = "C:\\Users\\taine\\Documents\\leads";
const DEFAULT_FILES = ["durban.csv", "capetown-leads-batch1-v2-CORRECTED.csv"];

type Row = Record<string, string>;

/**
 * Minimal RFC-4180 parser: handles quoted fields, embedded commas/newlines,
 * and "" escapes. Written out rather than pulling a dependency in for a
 * one-off script.
 */
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;

  const src = text.replace(/^\uFEFF/, ""); // strip BOM if Excel wrote one

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n") {
      record.push(field);
      rows.push(record);
      record = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (!header) return [];
  return body.map((cells) => {
    const row: Row = {};
    header.forEach((key, idx) => {
      row[key.trim()] = (cells[idx] ?? "").trim();
    });
    return row;
  });
}

/** Phone strings in the CSVs are verbatim from source pages, so formatting varies wildly. */
function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

// The CSV notes are written in our own voice ("DEAD DOMAIN - coffeerock.co.za
// and www both fail DNS resolution"). This maps the recurring markers in that
// prose onto the same recipient-facing phrasing getWebsiteHealth produces for
// Places-discovered leads, so an imported prospect opens on the same specific,
// checkable fact rather than a generic "your site could work harder".
// Deliberately conservative: anything that does not match a known marker
// returns null and falls back to the generic opener, because a confidently
// wrong claim about someone's website is worse than a vague one.
// Ordered most-specific first.
const DEFECT_PATTERNS: { test: RegExp; defect: string }[] = [
  {
    test: /redirects? (off\s?shore|to .*which returns HTTP 404|OFFSHORE)|301-redirects off its own domain/i,
    defect: "your domain currently forwards somewhere else entirely rather than to your own site",
  },
  { test: /DEAD DOMAIN|fails? DNS resolution|ENOTFOUND|NXDOMAIN|domain does not resolve|no longer resolves/i,
    defect: "the domain it runs on no longer resolves, so anyone clicking through from Google or a directory listing lands on nothing at all" },
  { test: /HTTP 500|Internal Server Error/i,
    defect: "it's returning a server error instead of loading" },
  { test: /returns HTTP 404|business\.site|Google Business Profile site and Google shut/i,
    defect: "the web address still listed for you returns a 404, so visitors who click it hit a dead page" },
  { test: /SSL|certificate (does not|doesn't) (cover|match)|cert.*mismatch|security warning/i,
    defect: "its security certificate doesn't match the domain, so browsers block the page with a warning before anyone can see it" },
  { test: /REFUSES the connection|ECONNREFUSED|refuses connections/i,
    defect: "the server behind it isn't accepting connections, so the page never loads for anyone trying to visit" },
  { test: /suspended/i,
    defect: "the hosting account behind it has been suspended, so the site is currently offline" },
  { test: /Index of \/|auto-index|LiteSpeed .*directory|bare Apache/i,
    defect: "the domain is live but serves a bare file listing rather than an actual website" },
  { test: /holding page|to go live soon|coming soon|under construction|Hostinger default|no site is installed/i,
    defect: "the domain is live but still shows a placeholder page rather than an actual site" },
  { test: /free .*subdomain|wordpress\.com|yolasite|Google Sites|builder subdomain|wixsite/i,
    defect: "it's sitting on a free hosting subdomain rather than a domain of your own, which makes it harder to find and easier to forget" },
  { test: /NO (mobile )?viewport|no viewport meta tag|not (be )?render.*phone|desktop width/i,
    defect: "it isn't set up for mobile, so on a phone it loads at full desktop width and visitors have to pinch and zoom to read anything" },
  { test: /phone number is published as an IMAGE|tel_number\.png/i,
    defect: "your phone number is published as an image rather than text, so it can't be tapped to call and search engines can't read it" },
  { test: /\/contact returns 404|contact page.*404/i,
    defect: "the contact page returns a 404, so anyone trying to get hold of you through the site can't" },
  { test: /misspells its own business name/i,
    defect: "the site header misspells your own business name" },
];

function defectFromNote(note: string): string | null {
  for (const { test, defect } of DEFECT_PATTERNS) {
    if (test.test(note)) return defect;
  }
  return null;
}

type PlannedProspect = {
  business_name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  reason: "no_website" | "poor_website";
  source: "manual";
  status: "new" | "drafted";
  draft_subject: string | null;
  draft_body: string | null;
  notes: string;
  email_defect: string | null;
};

function toProspect(row: Row): PlannedProspect | null {
  const name = row["Business Name"];
  if (!name) return null;

  const hasWebsite = (row["Has Website?"] || "").toLowerCase();
  const email = row["Email"] || null;
  const phone = row["Phone"] || null;
  const category = row["Niche"] || null;

  // "No" -> genuinely no site. "Yes" -> a site exists but is broken or dated.
  // "UNVERIFIED" -> we could not confirm either way; treated as poor_website
  // so it is never pitched as "you have no website", and the caveat is
  // carried in the notes so nobody emails on an unproven premise.
  const reason: "no_website" | "poor_website" = hasWebsite === "no" ? "no_website" : "poor_website";

  const noteParts = [
    row["Website Quality Note"],
    hasWebsite === "unverified" ? "WEBSITE STATUS UNVERIFIED - confirm in a browser before contacting." : "",
    row["Source"] ? `Source: ${row["Source"]}` : "",
    row["Confidence"] ? `Research confidence: ${row["Confidence"]}` : "",
  ].filter(Boolean);

  // Only a prospect with an email can actually be sent to, so only those get
  // a draft and land in "drafted" (the status AdminOutreachReview lists).
  // Phone-only rows land in "new": visible in the prospects list for manual
  // work, but never surfaced as something ready to send.
  // Only a poor_website lead can have a site defect -- a no_website lead has
  // no site to find one on, and its opener is already specific by nature.
  const emailDefect = reason === "poor_website" ? defectFromNote(row["Website Quality Note"] || "") : null;
  const draft = email ? buildOutreachDraft(name, category, reason, emailDefect) : null;

  return {
    business_name: name,
    category,
    phone,
    email,
    address: row["City / Area"] || null,
    website: null, // the CSVs describe the site in prose; no clean URL column
    reason,
    source: "manual",
    status: draft ? "drafted" : "new",
    draft_subject: draft?.subject ?? null,
    draft_body: draft?.body ?? null,
    notes: noteParts.join(" | "),
    email_defect: emailDefect,
  };
}

const args = process.argv.slice(2);
const commit = args.includes("--commit");
// Rewrites draft_subject/draft_body/email_defect on rows that already exist,
// instead of inserting. Needed because the first import ran before the drafts
// could use a specific defect, so those rows carry the generic opener.
const redraft = args.includes("--redraft");
const fileArgs = args.filter((a) => !a.startsWith("--"));
const files = fileArgs.length > 0 ? fileArgs : DEFAULT_FILES.map((f) => path.join(DEFAULT_DIR, f));

const planned: PlannedProspect[] = [];
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`SKIPPED (not found): ${file}`);
    continue;
  }
  const parsed = parseCsv(readFileSync(file, "utf8"));
  const mapped = parsed.map(toProspect).filter((p): p is PlannedProspect => p !== null);
  console.log(`${path.basename(file)}: ${mapped.length} rows`);
  planned.push(...mapped);
}

if (planned.length === 0) {
  console.error("Nothing to import.");
  process.exit(1);
}

// Dedupe within the batch itself first -- the same business can legitimately
// appear in both files (none currently do, but a future city batch could).
const seen = new Set<string>();
const deduped = planned.filter((p) => {
  const key = `${p.business_name.toLowerCase()}|${phoneKey(p.phone ?? "")}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const connectionString = process.env.POSTGRES_URL_NON_POOLING;
if (!connectionString) {
  console.error("POSTGRES_URL_NON_POOLING is not set.");
  process.exit(1);
}
const sql = postgres(connectionString, { prepare: false });

try {
  const existing = await sql<{ business_name: string; phone: string | null }[]>`
    SELECT business_name, phone FROM prospects
  `;
  const existingKeys = new Set(existing.map((e) => `${e.business_name.toLowerCase()}|${phoneKey(e.phone ?? "")}`));

  if (redraft) {
    const withDefect = deduped.filter((p) => p.email_defect !== null);
    const sendable = withDefect.filter((p) => p.status === "drafted");
    console.log("");
    console.log(`Rows with a specific defect .. ${withDefect.length}`);
    console.log(`  of those, sendable ......... ${sendable.length} (have an email, so carry a draft)`);
    console.log(`Rows falling back to generic . ${deduped.length - withDefect.length}`);

    if (!commit) {
      console.log("");
      console.log("DRY RUN -- nothing written. Add --commit to apply.");
      console.log("Sample of the new opening lines:");
      for (const p of sendable.slice(0, 3)) {
        console.log(`\n  ${p.business_name}:\n    ${p.draft_body?.split("\n")[2] ?? ""}`);
      }
      await sql.end();
      process.exit(0);
    }

    let updated = 0;
    for (const p of deduped) {
      const res = await sql`
        UPDATE prospects
           SET email_defect = ${p.email_defect},
               draft_subject = COALESCE(${p.draft_subject}, draft_subject),
               draft_body = COALESCE(${p.draft_body}, draft_body)
         WHERE lower(business_name) = ${p.business_name.toLowerCase()}
           AND source = 'manual'
           AND status IN ('new','drafted')
      `;
      updated += res.count;
    }
    console.log("");
    console.log(`Updated ${updated} rows.`);
    console.log(`Note: only rows still in 'new' or 'drafted' were touched -- anything already`);
    console.log(`approved, sent or replied is left alone so history is never rewritten.`);
    await sql.end();
    process.exit(0);
  }

  const toInsert = deduped.filter(
    (p) => !existingKeys.has(`${p.business_name.toLowerCase()}|${phoneKey(p.phone ?? "")}`)
  );
  const skipped = deduped.length - toInsert.length;

  const drafted = toInsert.filter((p) => p.status === "drafted").length;
  const asNew = toInsert.length - drafted;
  const noWebsite = toInsert.filter((p) => p.reason === "no_website").length;

  console.log("");
  console.log(`Parsed ................. ${planned.length}`);
  console.log(`After in-batch dedupe .. ${deduped.length}`);
  console.log(`Already in prospects ... ${skipped} (skipped)`);
  console.log(`To insert .............. ${toInsert.length}`);
  console.log(`  status=drafted ....... ${drafted}  (has an email; WILL appear on /admin/outreach/review)`);
  console.log(`  status=new ........... ${asNew}  (phone only; not sendable, stays out of the review queue)`);
  console.log(`  reason=no_website .... ${noWebsite}`);

  if (!commit) {
    console.log("");
    console.log("DRY RUN -- nothing written. Re-run with --commit to insert.");
    if (drafted > 0) {
      console.log(
        `NOTE: ${drafted} rows would land in "drafted", which is what /admin/outreach/review lists as\n` +
          `pre-checked and one click from "Send selected". Review that page before sending.`
      );
    }
    process.exit(0);
  }

  let inserted = 0;
  for (const p of toInsert) {
    try {
      await sql`INSERT INTO prospects ${sql(p as unknown as Record<string, string | null>)}`;
      inserted++;
    } catch (e) {
      console.error(`  FAILED ${p.business_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log("");
  console.log(`Inserted ${inserted} of ${toInsert.length}.`);
} catch (err) {
  console.error("Failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
