/**
 * Builds a one-page demo site per prospect, from demo/businesses.json.
 *
 * What this is for: a call. "I've already put one together for you — I'll send
 * the link while we're talking" is a different conversation from describing
 * what a website could look like, particularly with the half of the call list
 * whose entire web presence is a Facebook page.
 *
 * The design follows Champagne Holidays, which is Taine's own build and
 * therefore the standard worth hitting: red on white with a deep navy, a
 * display serif against a clean sans, a full-bleed hero photograph under a
 * navy tint with an angled lower edge, white cards with the image on top and a
 * red "Learn more" beneath, and an enquiry card outlined in red.
 *
 * The first version of this had no photography at all and looked like a
 * wireframe. That was a bad trade — "guaranteed to render on a weak signal"
 * bought at the price of the one job the page has, which is to look like
 * something worth paying for. Images are now generated at build time and saved
 * to disk, so the page is fast AND has photographs, and nothing is fetched
 * while a prospect is looking at it.
 *
 * Four rules, because a page carrying somebody else's business name is easy to
 * get wrong and the mistakes land on them, not on us:
 *
 *   1. It never pretends to be live. A banner says so above everything, the
 *      footer says so again, every page is noindex + nofollow, and robots.txt
 *      refuses the folder. A demo that Google indexes can outrank or confuse a
 *      business whose only real presence is a Facebook page — exactly who
 *      these are built for.
 *   2. Nothing of theirs is used. No scraped photos, no logo. The imagery is
 *      generated from the trade and the setting.
 *   3. Nothing collects anything. The enquiry card is presentation only: the
 *      fields are disabled and the button opens WhatsApp to their own number,
 *      so a real enquiry reaches them and not us.
 *   4. No claims, no prices. Nothing about rankings, traffic or cost.
 *
 * Run: pnpm demos:build (runs automatically as part of pnpm build)
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "public", "demo");
const cacheRoot = join(root, "demo", "images");

/* ── Palette, read off the Champagne Holidays screenshots ─────────────────── */
const RED = "#c8102e";
const NAVY = "#1b2559";
const INK = "#16233f";
const WASH = "#f2f6fb";
const BODY = "#5a6577";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const digits = (phone) => String(phone).replace(/\D/g, "");

/**
 * Photography, generated once and then committed.
 *
 * Pollinations is free, keyless and needs no account — the same source Naledi
 * uses, for the same reason. Fetched only when the file is not already on
 * disk, so a Cloudflare build copies rather than waits: twelve images at
 * twenty seconds each would be four minutes added to every deploy.
 *
 * A failure here is never fatal. The page falls back to a navy wash, which is
 * worse-looking and still a page; a build that dies because an image service
 * was busy would be worse than both.
 */
async function ensureImage(slug, name, prompt) {
  const dir = join(cacheRoot, slug);
  const file = join(dir, `${name}.jpg`);
  if (existsSync(file) && statSync(file).size > 2048) return file;

  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=1280&height=800&nologo=true&model=flux&seed=${
      [...slug + name].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 100000, 7)
    }`;

  try {
    process.stdout.write(`    fetching ${slug}/${name}… `);
    const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2048) throw new Error(`only ${buf.length} bytes back`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, buf);
    console.log(`${Math.round(buf.length / 1024)}KB`);
    return file;
  } catch (err) {
    console.log(`failed (${err.message}) — falling back to a plain panel`);
    return null;
  }
}

function page(biz, images) {
  const wa = digits(biz.phone);
  const hero = images.hero ? `url('hero.jpg')` : `linear-gradient(160deg, ${NAVY}, #0d1326)`;

  const cards = biz.services
    .map(
      (s, i) => `        <article class="card">
          <div class="card-img"${
            images[`s${i + 1}`] ? ` style="background-image:url('s${i + 1}.jpg')"` : ""
          }></div>
          <div class="card-body">
            <h3>${esc(s.title)}</h3>
            <p>${esc(s.detail)}</p>
            <span class="more">Learn more <span aria-hidden="true">&rarr;</span></span>
          </div>
        </article>`,
    )
    .join("\n");

  const reasons = biz.reasons
    .map(
      (r) => `        <div class="reason">
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.detail)}</p>
        </div>`,
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --red: ${RED}; --navy: ${NAVY}; --ink: ${INK}; --wash: ${WASH}; --body: ${BODY};
    --serif: "Playfair Display", Georgia, "Times New Roman", serif;
    --sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: #fff; color: var(--ink); font: 16px/1.65 var(--sans); -webkit-text-size-adjust: 100%; }
  h1, h2, h3 { font-family: var(--serif); font-weight: 800; letter-spacing: -.01em; margin: 0; }
  .wrap { max-width: 1160px; margin: 0 auto; padding: 0 22px; }

  /* Said before anything else, on every page. */
  .demo-bar { background: #0d1326; color: #e8ecf6; font-size: 12.5px; line-height: 1.5; padding: 8px 18px; text-align: center; }
  .demo-bar a { color: #ffc94d; }

  header.nav { position: sticky; top: 0; z-index: 50; background: #fff; box-shadow: 0 1px 0 rgba(22,35,63,.08); }
  header.nav .inner { display: flex; align-items: center; gap: 18px; padding: 14px 22px; max-width: 1160px; margin: 0 auto; }
  .wordmark { font-family: var(--serif); font-size: 19px; font-weight: 800; color: var(--navy); line-height: 1.1; }
  .wordmark small { display: block; font-family: var(--sans); font-size: 10.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--red); }
  nav.links { display: none; gap: 24px; margin-left: auto; }
  nav.links a { color: var(--ink); text-decoration: none; font-size: 14.5px; font-weight: 500; }
  nav.links a:hover, nav.links a.on { color: var(--red); }
  .nav-phone { display: none; align-items: center; gap: 7px; color: var(--ink); font-weight: 600; font-size: 14.5px; text-decoration: none; }
  .pill { background: var(--red); color: #fff; border-radius: 999px; padding: 11px 22px; font-weight: 700; font-size: 14.5px; text-decoration: none; white-space: nowrap; }
  .pill:hover { filter: brightness(1.08); }
  header.nav .pill { margin-left: auto; }
  @media (min-width: 900px) {
    nav.links { display: flex; }
    .nav-phone { display: flex; }
    header.nav .pill { margin-left: 0; }
  }

  .hero { position: relative; color: #fff; text-align: center; background: ${hero} center/cover no-repeat; }
  .hero::before { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(20,32,74,.62), rgba(16,26,62,.72)); }
  .hero .inner { position: relative; padding: clamp(68px, 13vw, 132px) 22px clamp(92px, 15vw, 150px); max-width: 940px; margin: 0 auto; }
  .hero h1 { font-size: clamp(34px, 6.4vw, 62px); line-height: 1.08; text-shadow: 0 2px 26px rgba(8,14,36,.45); }
  .hero p { margin: 20px auto 30px; max-width: 620px; font-size: clamp(15.5px, 2.3vw, 18px); color: #e6ebf7; }
  .hero .cta { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .ghost { border: 1.5px solid rgba(255,255,255,.66); color: #fff; border-radius: 999px; padding: 11px 22px; font-weight: 600; font-size: 14.5px; text-decoration: none; }
  .ghost:hover { background: rgba(255,255,255,.12); }
  /* The angled edge the Champagne hero sits on. */
  .hero .slant { position: absolute; left: 0; right: 0; bottom: -1px; height: 64px; background: var(--wash); clip-path: polygon(0 62%, 100% 0, 100% 100%, 0 100%); }

  section { padding: clamp(52px, 8vw, 92px) 0; }
  .wash { background: var(--wash); }
  .eyebrow { text-align: center; color: var(--red); font-size: 12px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; margin-bottom: 12px; }
  .h2 { text-align: center; font-size: clamp(26px, 4.6vw, 42px); line-height: 1.16; }
  .sub { text-align: center; color: var(--body); max-width: 620px; margin: 14px auto 0; }

  .cards { display: grid; gap: 26px; margin-top: 46px; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); }
  .card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(22,35,63,.10); }
  .card-img { height: 190px; background: linear-gradient(150deg, #2b3a76, #16223f) center/cover no-repeat; }
  .card-body { padding: 24px 26px 28px; }
  .card h3 { font-size: 20px; margin-bottom: 9px; }
  .card p { margin: 0 0 16px; color: var(--body); font-size: 14.8px; }
  .more { color: var(--red); font-weight: 700; font-size: 14px; }

  .band { position: relative; background: var(--navy); color: #fff; }
  .band::before { content: ""; position: absolute; top: -52px; left: 0; right: 0; height: 54px; background: var(--navy); clip-path: polygon(0 100%, 100% 0, 100% 100%, 0 100%); }
  .band .eyebrow { color: #ff9aa8; }
  .band .sub { color: #c3cbe4; }
  .reasons { display: grid; gap: 34px; margin-top: 46px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
  .reason h3 { font-size: 19px; margin-bottom: 8px; }
  .reason p { margin: 0; color: #c3cbe4; font-size: 14.8px; }

  .quote { background: #fff; border: 1.5px solid var(--red); border-radius: 12px; padding: clamp(24px, 4vw, 40px); max-width: 720px; margin: 44px auto 0; }
  .quote h3 { font-size: 21px; margin-bottom: 18px; }
  .field { margin-bottom: 18px; }
  .field label { display: block; font-size: 13.5px; font-weight: 600; margin-bottom: 6px; }
  .field label span { color: #98a1b4; font-weight: 500; }
  .field input, .field textarea { width: 100%; border: 1px solid #d8dfea; border-radius: 7px; padding: 12px 14px; font: 15px var(--sans); color: var(--ink); background: #fff; }
  .field input:disabled, .field textarea:disabled { background: #fbfcfe; color: #9aa3b4; }
  .two { display: grid; gap: 18px; grid-template-columns: 1fr; }
  @media (min-width: 620px) { .two { grid-template-columns: 1fr 1fr; } }
  .quote .pill { display: inline-block; margin-top: 4px; }
  .quote .note { margin: 14px 0 0; font-size: 12.5px; color: #98a1b4; }

  footer { background: #0d1326; color: #aab3c9; font-size: 13.5px; padding: 46px 0 56px; }
  footer .cols { display: grid; gap: 26px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  footer h4 { font-family: var(--serif); color: #fff; font-size: 17px; margin: 0 0 10px; }
  footer a { color: #fff; text-decoration: none; }
  footer .fine { margin-top: 34px; padding-top: 22px; border-top: 1px solid rgba(255,255,255,.12); line-height: 1.7; }

  .sticky { position: sticky; bottom: 0; z-index: 40; display: flex; gap: 10px; justify-content: center; background: #fff; border-top: 1px solid #e3e8f1; padding: 10px 16px; }
  .sticky a { flex: 1; text-align: center; max-width: 220px; }
  .sticky .ghost { border-color: var(--navy); color: var(--navy); }
  @media (min-width: 900px) { .sticky { display: none; } }
</style>
</head>
<body>

<div class="demo-bar">
  <strong>Demonstration site.</strong> Built by
  <a href="https://www.thecreativecurrent.co.za" rel="noreferrer">The Creative Current</a>
  to show ${esc(biz.name)} what their website could look like. This is not their live website.
</div>

<header class="nav">
  <div class="inner">
    <div class="wordmark">${esc(biz.name)}<small>${esc(biz.trade)} · ${esc(biz.suburb)}</small></div>
    <nav class="links">
      <a href="#services" class="on">What we do</a>
      <a href="#why">Why us</a>
      <a href="#quote">Get a quote</a>
    </nav>
    <a class="nav-phone" href="tel:${esc(biz.phone)}">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${RED}" stroke-width="2.2" stroke-linecap="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>
      ${esc(biz.phone)}
    </a>
    <a class="pill" href="https://wa.me/${wa}">Get a quote</a>
  </div>
</header>

<section class="hero">
  <div class="inner">
    <h1>${esc(biz.headline)}</h1>
    <p>${esc(biz.intro)}</p>
    <div class="cta">
      <a class="pill" href="https://wa.me/${wa}">Get a quote on WhatsApp</a>
      <a class="ghost" href="tel:${esc(biz.phone)}">Call ${esc(biz.phone)}</a>
    </div>
  </div>
  <div class="slant"></div>
</section>

<section class="wash" id="services">
  <div class="wrap">
    <p class="eyebrow">What we do</p>
    <h2 class="h2">${esc(biz.servicesHeading)}</h2>
    <p class="sub">${esc(biz.servicesSub)}</p>
    <div class="cards">
${cards}
    </div>
  </div>
</section>

<section class="band" id="why">
  <div class="wrap">
    <p class="eyebrow">Why us</p>
    <h2 class="h2">Why people call us back</h2>
    <p class="sub">The things that actually decide who gets the next job.</p>
    <div class="reasons">
${reasons}
    </div>
  </div>
</section>

<section class="wash" id="quote">
  <div class="wrap">
    <p class="eyebrow">Get a quote</p>
    <h2 class="h2">Tell us what you need</h2>
    <p class="sub">Serving ${esc(biz.area)}. We answer WhatsApp during working hours.</p>

    <!-- Presentation only. The fields are disabled and nothing is submitted
         anywhere: the button opens WhatsApp to their own number, so a real
         enquiry from a curious prospect reaches them and not us. -->
    <div class="quote">
      <h3>Your job</h3>
      <div class="two">
        <div class="field"><label>Name</label><input disabled placeholder="Your name"></div>
        <div class="field"><label>Contact number</label><input disabled placeholder="e.g. 082 123 4567"></div>
      </div>
      <div class="field"><label>Where is the job? <span>(suburb)</span></label><input disabled placeholder="e.g. ${esc(biz.suburb)}"></div>
      <div class="field"><label>What needs doing?</label><textarea disabled rows="3" placeholder="A short description is enough — we will ask the rest."></textarea></div>
      <a class="pill" href="https://wa.me/${wa}">Send on WhatsApp</a>
      <p class="note">This is a demonstration. The form is not connected to anything — the button opens WhatsApp to ${esc(biz.name)}&rsquo;s own number.</p>
    </div>
  </div>
</section>

<footer>
  <div class="wrap">
    <div class="cols">
      <div>
        <h4>${esc(biz.name)}</h4>
        ${esc(biz.trade)} · ${esc(biz.suburb)}<br>
        Serving ${esc(biz.area)}
      </div>
      <div>
        <h4>Get hold of us</h4>
        <a href="tel:${esc(biz.phone)}">${esc(biz.phone)}</a><br>
        <a href="https://wa.me/${wa}">WhatsApp us</a>
      </div>
      <div>
        <h4>Hours</h4>
        Monday to Friday, 7am – 5pm<br>
        Saturdays by arrangement
      </div>
    </div>
    <p class="fine">
      This page is a demonstration built by The Creative Current for ${esc(biz.name)}, and is not a
      live business website. Nothing on it is collected or stored. The WhatsApp and phone links go
      to ${esc(biz.name)}&rsquo;s own number.
      <br>
      <a href="https://www.thecreativecurrent.co.za" rel="noreferrer">thecreativecurrent.co.za</a>
    </p>
  </div>
</footer>

<div class="sticky">
  <a class="pill" href="https://wa.me/${wa}">WhatsApp</a>
  <a class="ghost" href="tel:${esc(biz.phone)}">Call</a>
</div>

</body>
</html>
`;
}

/* ── Build ────────────────────────────────────────────────────────────────── */

const businesses = JSON.parse(readFileSync(join(root, "demo", "businesses.json"), "utf8"));

// Rebuilt from scratch every time, so removing a business removes its page. A
// demo that outlives the conversation it was built for is a page with
// somebody's business name on it that nobody is watching.
if (existsSync(outRoot)) rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const seen = new Set();
for (const biz of businesses) {
  for (const field of ["slug", "name", "trade", "suburb", "phone", "headline"]) {
    if (!biz[field]) throw new Error(`demo/businesses.json: "${biz.slug ?? "?"}" is missing ${field}`);
  }
  if (!/^\+?\d{9,15}$/.test(String(biz.phone).replace(/[\s-]/g, ""))) {
    throw new Error(`demo/businesses.json: "${biz.slug}" has a phone number that is not dialable: ${biz.phone}`);
  }
  if (seen.has(biz.slug)) throw new Error(`demo/businesses.json: two businesses share the slug "${biz.slug}"`);
  seen.add(biz.slug);

  console.log(`  ${biz.name}`);
  const dir = join(outRoot, biz.slug);
  mkdirSync(dir, { recursive: true });

  const images = {};
  const wanted = [["hero", biz.heroImage], ...biz.services.slice(0, 3).map((s, i) => [`s${i + 1}`, s.image])];
  for (const [name, prompt] of wanted) {
    if (!prompt) continue;
    const file = await ensureImage(biz.slug, name, prompt);
    if (file) {
      copyFileSync(file, join(dir, `${name}.jpg`));
      images[name] = true;
    }
  }

  writeFileSync(join(dir, "index.html"), page(biz, images));
}

// Belt and braces alongside the per-page noindex: a crawler that ignores one
// has to ignore both.
writeFileSync(
  join(outRoot, "robots.txt"),
  "# Demonstration pages built for a specific business, ahead of a conversation\n" +
    "# with them. Never a live website, never indexed.\n" +
    "User-agent: *\nDisallow: /\n",
);

console.log(`\n${businesses.length} demo page(s) written to public/demo/.`);
