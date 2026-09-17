/**
 * Builds a one-page demo site per prospect, from demo/businesses.json.
 *
 * What this is for: a call. "I've already put one together for you — I'll send
 * the link while we're talking" is a different conversation from describing
 * what a website could look like, particularly with the half of the call list
 * whose entire web presence is a Facebook page.
 *
 * Four rules, because a page carrying somebody else's business name is easy to
 * get wrong and the mistakes land on them, not on us:
 *
 *   1. It never pretends to be live. A banner says so at the top of every page,
 *      the footer says so again, and every page is noindex + nofollow with a
 *      robots.txt refusing the whole folder. A demo that Google indexes can
 *      outrank or confuse a business whose only real presence is a Facebook
 *      page — which is exactly who these are built for.
 *   2. Nothing of theirs is used. No scraped photos, no logo. The imagery is
 *      CSS, which also means it renders instantly on a phone on a bad signal,
 *      with nothing to go wrong mid-call.
 *   3. Nothing collects anything. The only live control is a WhatsApp link to
 *      their own number — theirs, so a real enquiry reaches them and not us.
 *   4. No claims. No traffic figures, no rankings, no prices. The copy
 *      describes the trade and nothing else, which is also what keeps it clear
 *      of the guards everything else here goes through.
 *
 * Run: pnpm demos:build (runs automatically as part of pnpm build)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "public", "demo");

/** Escaped everywhere it is interpolated — the data is hand-written, not trusted. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function whatsapp(phone) {
  return String(phone).replace(/[^\d]/g, "");
}

function page(biz) {
  const accent = esc(biz.accent || "#1d4ed8");
  const wa = whatsapp(biz.phone);
  const services = biz.services
    .map(
      (s) => `      <article class="card">
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.detail)}</p>
      </article>`,
    )
    .join("\n");
  const reasons = biz.reasons
    .map(
      (r) => `      <li>
        <strong>${esc(r.title)}</strong>
        <span>${esc(r.detail)}</span>
      </li>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en-ZA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Never indexed. This page carries somebody else's business name and is not
     their website; a search result for it would do them harm, not good. -->
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${esc(biz.name)} — ${esc(biz.trade)} in ${esc(biz.suburb)} (demo)</title>
<meta name="description" content="Demonstration website built by The Creative Current for ${esc(biz.name)}. Not a live business website.">
<style>
  :root { --accent: ${accent}; --ink: #16181d; --muted: #5b6270; --line: #e4e6eb; --bg: #fff; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .demo-bar {
    background: #111827; color: #f9fafb; padding: 9px 16px;
    font-size: 12.5px; line-height: 1.45; text-align: center;
  }
  .demo-bar a { color: #fbbf24; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 0 20px; }
  header.hero {
    background:
      radial-gradient(1200px 400px at 15% -10%, color-mix(in srgb, var(--accent) 34%, transparent), transparent),
      linear-gradient(160deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #0b1020));
    color: #fff; padding: 52px 0 46px;
  }
  header.hero .trade { text-transform: uppercase; letter-spacing: .12em; font-size: 12px; opacity: .9; }
  header.hero h1 { margin: 10px 0 6px; font-size: clamp(30px, 7vw, 46px); line-height: 1.12; }
  header.hero p.tagline { margin: 0 0 22px; font-size: clamp(17px, 3.6vw, 20px); opacity: .95; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
  .btn {
    display: inline-block; padding: 13px 20px; border-radius: 10px;
    font-weight: 600; text-decoration: none; font-size: 15px;
  }
  .btn-wa { background: #25d366; color: #05300f; }
  .btn-call { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.4); }
  section { padding: 44px 0; border-bottom: 1px solid var(--line); }
  section h2 { margin: 0 0 6px; font-size: clamp(21px, 4.4vw, 26px); }
  section .lead { margin: 0 0 24px; color: var(--muted); max-width: 60ch; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .card { border: 1px solid var(--line); border-radius: 12px; padding: 18px; }
  .card h3 { margin: 0 0 6px; font-size: 17px; }
  .card p { margin: 0; color: var(--muted); font-size: 14.5px; }
  ul.reasons { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
  ul.reasons li { display: grid; gap: 3px; }
  ul.reasons strong { font-size: 16px; }
  ul.reasons span { color: var(--muted); font-size: 14.5px; }
  .contact { display: grid; gap: 10px; }
  .contact a { color: var(--accent); font-weight: 600; text-decoration: none; font-size: 17px; }
  .contact .meta { color: var(--muted); font-size: 14.5px; }
  footer { padding: 30px 0 46px; color: var(--muted); font-size: 13px; }
  footer a { color: var(--accent); }
  .sticky {
    position: sticky; bottom: 0; background: #fff; border-top: 1px solid var(--line);
    padding: 10px 20px; display: flex; gap: 10px; justify-content: center;
  }
  @media (min-width: 720px) { .sticky { display: none; } }
</style>
</head>
<body>

<!-- Said at the top, before anything else, on every page. -->
<div class="demo-bar">
  <strong>Demonstration site.</strong> Built by
  <a href="https://www.thecreativecurrent.co.za" rel="noreferrer">The Creative Current</a>
  to show ${esc(biz.name)} what their website could look like. This is not their live website.
</div>

<header class="hero">
  <div class="wrap">
    <div class="trade">${esc(biz.trade)} · ${esc(biz.suburb)}</div>
    <h1>${esc(biz.name)}</h1>
    <p class="tagline">${esc(biz.tagline)}</p>
    <div class="actions">
      <a class="btn btn-wa" href="https://wa.me/${wa}">Get a quote on WhatsApp</a>
      <a class="btn btn-call" href="tel:${esc(biz.phone)}">Call ${esc(biz.phone)}</a>
    </div>
  </div>
</header>

<section>
  <div class="wrap">
    <h2>What we do</h2>
    <p class="lead">${esc(biz.intro)}</p>
    <div class="grid">
${services}
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Why people call us back</h2>
    <p class="lead">The things that actually decide who gets the next job.</p>
    <ul class="reasons">
${reasons}
    </ul>
  </div>
</section>

<section>
  <div class="wrap">
    <h2>Get hold of us</h2>
    <p class="lead">Serving ${esc(biz.area)}.</p>
    <div class="contact">
      <a href="https://wa.me/${wa}">WhatsApp ${esc(biz.phone)}</a>
      <a href="tel:${esc(biz.phone)}">Call ${esc(biz.phone)}</a>
      <span class="meta">Monday to Friday, 7am – 5pm. Saturdays by arrangement.</span>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    This page is a demonstration built by The Creative Current for ${esc(biz.name)}, and is not a
    live business website. Nothing on it is collected or stored. The WhatsApp and phone links go to
    ${esc(biz.name)}&rsquo;s own number.
    <br><br>
    <a href="https://www.thecreativecurrent.co.za" rel="noreferrer">thecreativecurrent.co.za</a>
  </div>
</footer>

<!-- The one control that matters on a phone, kept within thumb reach. -->
<div class="sticky">
  <a class="btn btn-wa" href="https://wa.me/${wa}">WhatsApp us</a>
  <a class="btn btn-call" style="background:var(--accent);border:0" href="tel:${esc(biz.phone)}">Call</a>
</div>

</body>
</html>
`;
}

const businesses = JSON.parse(readFileSync(join(root, "demo", "businesses.json"), "utf8"));

// Rebuilt from scratch every time, so removing a business from the JSON removes
// the page. A demo that outlives the conversation it was built for is a page
// with somebody's business name on it that nobody is watching.
if (existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const seen = new Set();
for (const biz of businesses) {
  for (const field of ["slug", "name", "trade", "suburb", "phone"]) {
    if (!biz[field]) throw new Error(`demo/businesses.json: "${biz.slug ?? "?"}" is missing ${field}`);
  }
  if (!/^\+?\d{9,15}$/.test(String(biz.phone).replace(/[\s-]/g, ""))) {
    throw new Error(`demo/businesses.json: "${biz.slug}" has a phone number that is not dialable: ${biz.phone}`);
  }
  if (seen.has(biz.slug)) throw new Error(`demo/businesses.json: two businesses share the slug "${biz.slug}"`);
  seen.add(biz.slug);

  mkdirSync(join(outRoot, biz.slug), { recursive: true });
  writeFileSync(join(outRoot, biz.slug, "index.html"), page(biz));
  console.log(`  /demo/${biz.slug}/  —  ${biz.name}`);
}

// Belt and braces alongside the per-page noindex: a crawler that ignores one
// has to ignore both.
writeFileSync(
  join(outRoot, "robots.txt"),
  "# Demonstration pages built for a specific business, at their request or\n" +
    "# ahead of a conversation with them. Never a live website, never indexed.\n" +
    "User-agent: *\nDisallow: /\n",
);

console.log(`\n${businesses.length} demo page(s) written to public/demo/.`);
