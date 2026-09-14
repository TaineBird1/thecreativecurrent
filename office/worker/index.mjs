/**
 * The local worker.
 *
 * Convex actions have no browser and a time ceiling, so anything that needs a
 * real page render runs here instead — on Taine's own PC, for free, with no
 * per-page cost and no rate limit but politeness.
 *
 * It leases jobs from the `scrapeJobs` table, does the work, writes the result
 * back, and heartbeats so the office floor can show it as online. Leaving it
 * closed is fine: Lead-gen carries on with the directory sources and says
 * plainly that the best two are unavailable.
 *
 * Run:  pnpm worker      (leave it running)
 * Stop: Ctrl+C
 */
import { ConvexHttpClient } from "convex/browser";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Read .env.local by hand — no dotenv dependency for one file.
function loadEnv() {
  try {
    for (const line of readFileSync(join(root, ".env.local"), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local is fine if the vars are already exported */
  }
}
loadEnv();

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error(
    "\n  NEXT_PUBLIC_CONVEX_URL isn't set.\n  Run `npx convex dev` once — it writes it into .env.local.\n",
  );
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);
const WORKER_ID = `${process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "pc"}-${process.pid}`;

const POLL_MS = 15_000;
const HEARTBEAT_MS = 60_000;
const NAV_TIMEOUT = 25_000;

let browser;
let stopping = false;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: true });
  }
  return browser;
}

/**
 * Audit one site in a real browser: measure the load, screenshot desktop and
 * mobile, and check the two things HTML alone genuinely cannot tell you —
 * whether the page actually overflows a phone screen, and whether its links go
 * anywhere.
 */
async function auditSite(payload) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "TheCreativeCurrentOffice/1.0 (+https://www.thecreativecurrent.co.za; site audit for a prospective client)",
    viewport: { width: 1440, height: 900 },
  });

  try {
    const page = await context.newPage();
    const started = Date.now();
    const response = await page.goto(payload.url, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const seconds = (Date.now() - started) / 1000;

    const desktop = await page.screenshot({ type: "jpeg", quality: 62, fullPage: false });

    // Mobile: the one measurement worth having a browser for. A page whose
    // content is wider than the viewport is the "doesn't work on a phone"
    // complaint, stated as a number.
    const mobile = await context.newPage();
    await mobile.setViewportSize({ width: 390, height: 844 });
    await mobile.goto(payload.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const overflow = await mobile.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    const mobileShot = await mobile.screenshot({ type: "jpeg", quality: 62 });

    // Check a handful of internal links rather than the whole site — enough to
    // say "some links are broken" honestly, cheap enough not to hammer them.
    const hrefs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href]"))
        .map((a) => a.href)
        .filter((h) => h.startsWith(location.origin))
        .slice(0, 12),
    );
    const brokenLinks = [];
    for (const href of [...new Set(hrefs)].slice(0, 8)) {
      try {
        const res = await context.request.get(href, { timeout: 8000 });
        if (res.status() >= 400) brokenLinks.push(href);
      } catch {
        brokenLinks.push(href);
      }
    }

    const [desktopId, mobileId] = await Promise.all([
      upload(desktop, "image/jpeg"),
      upload(mobileShot, "image/jpeg"),
    ]);

    return {
      seconds,
      status: response?.status() ?? 0,
      mobileOverflowPx: overflow,
      brokenLinks,
      screenshotDesktop: desktopId,
      screenshotMobile: mobileId,
      faults: buildFaults({ seconds, overflow, brokenLinks }),
    };
  } finally {
    await context.close();
  }
}

/**
 * Only the faults a browser actually established. The HTML-level checks already
 * ran in Convex; duplicating them here with different wording would give the
 * same site two contradictory audits.
 */
function buildFaults({ seconds, overflow, brokenLinks }) {
  const faults = [];
  if (seconds > 3) {
    faults.push({
      code: "slow_load",
      detail: `The homepage takes ${seconds.toFixed(1)} seconds to load.`,
      severity: seconds > 6 ? "high" : "medium",
    });
  }
  if (overflow > 20) {
    faults.push({
      code: "not_mobile_responsive",
      detail: `On a phone the page is about ${Math.round(overflow)}px wider than the screen, so it scrolls sideways.`,
      severity: "high",
    });
  }
  if (brokenLinks.length > 0) {
    faults.push({
      code: "broken_links",
      detail: `${brokenLinks.length} link${brokenLinks.length === 1 ? "" : "s"} on the site go${brokenLinks.length === 1 ? "es" : ""} to a page that doesn't exist.`,
      severity: "medium",
    });
  }
  return faults;
}

async function upload(buffer, contentType) {
  const url = await convex.mutation("scrapeJobs:uploadUrl", {});
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": contentType },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  const { storageId } = await res.json();
  return storageId;
}

/**
 * Directory and Facebook search pages. These are the sources Meta and Google
 * actively defend, so this returns whatever it can see and says nothing when it
 * sees nothing — it never pretends the area is exhausted.
 */
async function harvestUrls(payload) {
  const b = await getBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto(payload.url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForTimeout(2500); // let client-rendered results settle

    const urls = await page.evaluate(() => {
      const origin = location.origin;
      return Array.from(document.querySelectorAll("a[href]"))
        .map((a) => a.href)
        .filter((h) => h.startsWith("http"))
        .filter((h) => !h.startsWith(`${origin}/#`))
        .slice(0, 200);
    });

    // Business links, not navigation. Crude, and deliberately so — the
    // qualification step is what actually decides, not this filter.
    const interesting = [...new Set(urls)].filter(
      (u) =>
        /\/(listing|business|company|profile|member|accommodation|place|pages)\//i.test(u) ||
        /facebook\.com\/[A-Za-z0-9._-]+\/?$/.test(u),
    );

    return { urls: interesting.slice(0, 25), scanned: urls.length };
  } finally {
    await context.close();
  }
}

async function tick() {
  let jobs = [];
  try {
    jobs = await convex.mutation("scrapeJobs:lease", { workerId: WORKER_ID, max: 3 });
  } catch (err) {
    console.error(`  Couldn't reach Convex: ${err.message}`);
    return;
  }

  if (jobs.length === 0) return;
  console.log(`  Leased ${jobs.length} job(s).`);

  for (const job of jobs) {
    if (stopping) break;
    const label = `${job.type} ${job.payload?.url ?? ""}`.slice(0, 80);
    try {
      const result =
        job.type === "audit_site" ? await auditSite(job.payload) : await harvestUrls(job.payload);
      await convex.mutation("scrapeJobs:complete", { id: job.id, result });
      console.log(
        `  done  ${label}${result.urls ? ` — ${result.urls.length} of ${result.scanned} links looked like businesses` : ""}`,
      );
    } catch (err) {
      await convex.mutation("scrapeJobs:fail", { id: job.id, error: err.message });
      console.log(`  fail  ${label} — ${err.message}`);
    }
  }
}

async function heartbeat() {
  try {
    await convex.mutation("settings:workerHeartbeat", {});
  } catch {
    /* the office just shows the worker as offline; nothing else breaks */
  }
}

async function main() {
  console.log(`\n  The Creative Current — local worker`);
  console.log(`  Worker id: ${WORKER_ID}`);
  console.log(`  Convex:    ${CONVEX_URL}`);
  console.log(`  Leave this running. Ctrl+C to stop.\n`);

  await heartbeat();
  const beat = setInterval(heartbeat, HEARTBEAT_MS);

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\n  Stopping…");
    clearInterval(beat);
    if (browser) await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  for (;;) {
    if (stopping) break;
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  console.error(`\n  Worker crashed: ${err.message}\n`);
  process.exit(1);
});
