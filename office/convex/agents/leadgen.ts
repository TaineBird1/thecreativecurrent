"use node";
/**
 * Sipho — Lead Generation.
 *
 * The split of labour here is deliberate and is the answer to the data-caution
 * rule:
 *
 *   Contact details are extracted DETERMINISTICALLY (regex, in contacts.ts).
 *   Judgement is made by the LLM, on PSEUDONYMISED text.
 *
 * Doing it the other way round — asking the model to "pull out the phone number"
 * — would mean posting a real person's mobile to a free tier that may train on
 * it, and would also invent numbers when it could not find one. Regex cannot
 * hallucinate a phone number, and the model never needs to see one.
 */
import { v } from "convex/values";
import { action, internalAction } from "./../_generated/server";
import { authedAction } from "../lib/authed";
import { api, internal } from "./../_generated/api";
import { machineArgs } from "../lib/machine";
import { withRun, think } from "../lib/run";
import { parseJson } from "../../packages/shared/llm/router";
import { fetchPage, stripTags, title as pageTitle, emails as findEmails, links } from "../../packages/shared/tools/html";
import {
  NOT_FOUND,
  addressFromCard,
  contactPageUrl,
  dedupeKey as makeDedupeKey,
  extractDomain,
  findNumbers,
  isReachable,
  pickEmail,
  splitNumbers,
} from "../../packages/shared/tools/contacts";
import { auditSite, scoreLead, type Fault } from "../../packages/shared/tools/faults";
import { splitRunBudget } from "../../packages/shared/tools/runBudget";
import { prepareForLlm } from "../../packages/shared/guards/pii";
import { TIER_CATEGORIES, LOCATIONS, sourcesForTier } from "../../packages/shared/tools/sources";

/**
 * Read the one page on their site most likely to carry contact details.
 *
 * Only called when the homepage published nothing, so the cost is one extra
 * fetch on exactly the leads that would otherwise arrive with a guessed
 * address and wait for a person to go and look the same page up by hand.
 *
 * Deterministic throughout — the model is not involved and never sees any of
 * it. Returns null on anything at all going wrong, because a slow contact page
 * must not be the reason a lead fails to be created.
 */
async function readContactPage(
  siteLinks: string[],
  websiteUrl: string,
): Promise<{ email: ReturnType<typeof pickEmail>; mobile: string; landline: string } | null> {
  const url = contactPageUrl(siteLinks, websiteUrl);
  if (!url) return null;

  const page = await fetchPage(url);
  if (!page.html) return null;

  const email = pickEmail(findEmails(page.html), websiteUrl);
  const { mobile, landline } = splitNumbers(findNumbers(stripTags(page.html)));
  return { email, mobile, landline };
}

/**
 * Why a lead was dropped for having no contact method.
 *
 * Spelling out the guessed-address case rather than saying "no email": the row
 * does carry an address, it is just one we invented from the domain and will
 * never write to. Read on the Leads screen, "no email" would be plainly untrue
 * and would send whoever read it off to check a thing that is not the problem.
 */
function unreachableReason(lead: { email: string; emailStatus: string; hasWebsite: boolean }): string {
  if (lead.emailStatus === "inferred") {
    return (
      `No reachable contact method — no mobile, landline or Facebook page, and nothing ` +
      `published on their site. ${lead.email} is a guess from the domain, so it does not count.`
    );
  }
  return "No reachable contact method — no mobile, landline, email or Facebook page.";
}

/** Below this, Outreach's time is better spent elsewhere. */
const QUALIFY_FLOOR = 40;
/** Per run. Keeps well inside the daily LLM budget and inside politeness. */
const MAX_CANDIDATES_PER_RUN = 12;
/**
 * The share of a run held for directory listings when both have work waiting.
 *
 * Half. The worker had been taking the whole budget — eleven of twelve slots in
 * the run where Snupit first came back to life, with twenty-one of its
 * twenty-two listings thrown away unread — and the directory leads are the ones
 * that arrive carrying an email, which is the only kind Outreach can use.
 */
const DIRECTORY_FLOOR = Math.floor(MAX_CANDIDATES_PER_RUN / 2);

interface Judgement {
  tier: 1 | 2 | 3;
  qualified: boolean;
  score: number;
  discardReason: string | null;
  category: string;
  contactName: string;
  faults: Fault[];
  facebookActivity: string | null;
  reasoning: string;
}

/** The daily run. Rotates category and location so it doesn't re-scrape one page forever. */
export const run = internalAction({
  args: { trigger: v.optional(v.union(v.literal("cron"), v.literal("manual"))) },
  handler: async (ctx, { trigger }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "leadgen", trigger: trigger ?? "cron", bubble: "Looking for new leads" },
      async (handle) => {
        // Hand him a link and he looks at that business. Anything else and he
        // takes it as a steer on where to search. Shrugging at a URL and doing
        // the day's rotation instead is technically obedient and practically
        // useless — a link is not ambiguous.
        const link = handle.task ? /https?:\/\/\S+/.exec(handle.task.detail)?.[0] : undefined;
        if (link) {
          await handle.say(`Checking ${hostOf(link)}`);
          const verdict = await processCandidate(ctx, {
            url: link,
            sourceId: "manual",
            tierHint: 1,
            categoryHint: "",
            location: "",
            runId: handle.runId,
          });
          return verdict === "added"
            ? `Checked ${hostOf(link)} — enriched, audited, and on the list.`
            : verdict === "discarded"
              ? `Checked ${hostOf(link)} and discarded it. The reason is on the lead.`
              : `${hostOf(link)} is already on the list — nothing to add.`;
        }

        // What Taine typed beats the rotation. "Focus on roofers in Pinetown"
        // has to change where Sipho actually looks, not just sit in a list.
        const steer = handle.task ? await readInstruction(ctx, handle.task.detail, handle.runId) : null;
        const fallback = rotation();
        const tier = steer?.tier ?? fallback.tier;
        const category = steer?.category ?? fallback.category;
        const location = steer?.location ?? fallback.location;

        await handle.say(
          steer ? `On it: ${category} in ${location}` : `Searching ${category} in ${location}`,
        );

        const workerOnline = await isWorkerOnline(ctx);
        const sources = sourcesForTier(tier, workerOnline);
        if (!workerOnline) {
          // Say so rather than quietly finding less. The two best sources
          // (Maps, Facebook) both need the browser.
          await ctx.runMutation(internal.escalations.raise, {
            botKey: "leadgen",
            title: "The local worker isn't running",
            detail:
              "Google Maps and Facebook Pages both need a real browser, which runs on your PC. Start it with `pnpm worker` in the office folder. Directory sources still work without it, but they find fewer and worse leads.",
            severity: "info",
          });
        }

        let candidates: { url: string; sourceId: string }[] = [];
        const tried: string[] = [];
        let queuedForWorker = 0;
        for (const source of sources) {
          if (await handle.stopped()) return "Stopped mid-run.";
          if (source.needsBrowser) {
            const queued = await ctx.runMutation(internal.scrapeJobs.enqueue, {
              type: source.id === "facebook_page" ? "facebook_page" : "directory",
              payload: { sourceId: source.id, url: source.search(category, location), category, location, tier },
              priority: 2,
            });
            if (queued) queuedForWorker++;
            continue;
          }
          const started = Date.now();
          const harvest = await harvestListingUrls(source.search(category, location), source.id);
          candidates.push(...harvest.found);
          tried.push(`${source.label}: ${harvest.found.length}`);

          // Every source records what it actually saw. When a directory
          // redesigns, this is the difference between "no leads today" and
          // knowing which source broke and what its URLs look like now.
          await ctx.runMutation(internal.logs.recordToolCall, {
            botKey: "leadgen",
            tool: `search:${source.id}`,
            args: `${category} in ${location}`,
            status: harvest.error ? "error" : harvest.found.length > 0 ? "ok" : "blocked",
            durationMs: Date.now() - started,
            result: harvest.error
              ? undefined
              : `${harvest.found.length} of ${harvest.sameHost} same-host links looked like businesses (${harvest.totalLinks} links on the page, HTTP ${harvest.status}). Paths seen: ${harvest.sample.join(" ") || "none"}`,
            error: harvest.error,
          });
        }

        // Anything the worker finished since the last run. Google Maps comes
        // back as whole businesses read off the rendered page; everything else
        // as candidate links.
        const fromWorker = await ctx.runQuery(api.scrapeJobs.completedResults, { ...machineArgs(),  limit: 40 });
        // Each item remembers which job it came from and where in that job it
        // sits, so a batch bigger than one run's appetite carries over instead
        // of being thrown away.
        const businesses: { biz: ScrapedBusiness; sourceId: string; jobId: string; index: number }[] = [];
        let waiting = 0;
        for (const job of fromWorker) {
          const sourceId = job.payload?.sourceId ?? "worker";
          const already = job.consumedCount ?? 0;
          const jobBusinesses = (job.result?.businesses ?? []) as ScrapedBusiness[];
          const jobUrls = (job.result?.urls ?? []) as string[];
          waiting += Math.max(0, jobBusinesses.length + jobUrls.length - already);

          jobBusinesses.forEach((biz, i) => {
            if (i >= already) businesses.push({ biz, sourceId, jobId: job._id, index: i });
          });
          jobUrls.forEach((url, i) => {
            if (i >= already) candidates.push({ url, sourceId });
          });
        }
        if (waiting > 0) tried.push(`worker: ${waiting} waiting`);

        // A directory returns the same page of listings every morning, and
        // processCandidate only discovers a duplicate after paying for the
        // fetch — and after it has cost a slot. Dropping the known ones here is
        // what stops the first few being re-fetched for ever while the ones
        // further down the page are never reached at all.
        const harvested = candidates.length;
        if (candidates.length > 0) {
          const known = new Set<string>(
            await ctx.runQuery(api.leads.knownSourceUrls, {
              ...machineArgs(),
              urls: candidates.map((c) => c.url),
            }),
          );
          candidates = candidates.filter((c) => !known.has(c.url));
        }

        if (candidates.length === 0 && businesses.length === 0) {
          return (
            `${steer ? "Looked where you asked. " : ""}Nothing found for ${category} in ${location}. ` +
            `${tried.join(", ") || "No sources ran"}. ` +
            (workerOnline
              ? `${queuedForWorker} browser job(s) queued — results land on the next run.`
              : "The local worker is offline, so Google Maps and Facebook were skipped — those are the two best sources.") +
            " Logs → Tools shows what each directory returned."
          );
        }

        let added = 0;
        let discarded = 0;
        let skipped = 0;

        // Split the run rather than letting the worker's backlog have all of
        // it. Google Maps results carry over between runs — each job remembers
        // how much of it has been consumed — while directory listings are
        // re-harvested from scratch and anything not taken is simply thrown
        // away. So the worker taking every slot does not delay its own leads;
        // it discards the directory ones, which are also the only leads that
        // arrive with an email address already on them.
        const budget = splitRunBudget({
          workerWaiting: businesses.length,
          directoryWaiting: candidates.length,
          total: MAX_CANDIDATES_PER_RUN,
          floor: DIRECTORY_FLOOR,
        });
        const directoryBudget = budget.directory;
        const takingNow = businesses.slice(0, budget.worker);
        const progress = new Map<string, number>();

        for (const { biz, sourceId, jobId, index } of takingNow) {
          if (await handle.stopped()) break;
          progress.set(jobId, Math.max(progress.get(jobId) ?? 0, index + 1));
          await handle.say(`Checking ${biz.name.slice(0, 26)}`);
          const result = await processBusiness(ctx, {
            biz,
            sourceId,
            tierHint: tier,
            categoryHint: category,
            location,
            runId: handle.runId,
          });
          if (result === "added") added++;
          else if (result === "discarded") discarded++;
          else skipped++;
        }

        if (progress.size > 0) {
          await ctx.runMutation(internal.scrapeJobs.recordConsumption, {
            progress: [...progress].map(([id, consumed]) => ({ id: id as never, consumed })),
          });
        }

        for (const candidate of candidates.slice(0, directoryBudget)) {
          if (await handle.stopped()) break;
          const result = await processCandidate(ctx, {
            url: candidate.url,
            sourceId: candidate.sourceId,
            tierHint: tier,
            categoryHint: category,
            location,
            runId: handle.runId,
          });
          if (result === "added") added++;
          else if (result === "discarded") discarded++;
          else skipped++;
        }

        const prefix = steer ? `You asked for ${category} in ${location}. ` : "";
        const worker = workerOnline
          ? queuedForWorker > 0
            ? `${queuedForWorker} browser job(s) queued — results land on the next run.`
            : "Nothing new to queue for the worker."
          : "Worker offline, so Google Maps and Facebook were skipped.";
        return (
          `${prefix}${added} new lead${added === 1 ? "" : "s"} in ${location}, ` +
          `${discarded} discarded off-niche, ${skipped} already known ` +
          `(${takingNow.length} of ${businesses.length} from the worker, ` +
          `${Math.min(candidates.length, directoryBudget)} of ${candidates.length} new from directories` +
          `${harvested > candidates.length ? `, ${harvested - candidates.length} already seen` : ""}). ` +
          `${businesses.length > takingNow.length ? `${businesses.length - takingNow.length} still waiting — run again for more. ` : ""}${worker}`
        );
      },
    );
    return outcome.summary;
  },
});

/**
 * Enrich and audit one business URL. Exposed so Taine can paste a site or a
 * Facebook page in and get a full lead back immediately — which also makes the
 * bot useful on a day when every directory has changed its markup.
 */
export const addByUrl = authedAction({
  args: { url: v.string(), tierHint: v.optional(v.union(v.literal(1), v.literal(2), v.literal(3))) },
  handler: async (ctx, { url, tierHint }): Promise<string> => {
    const outcome = await withRun(
      ctx,
      { botKey: "leadgen", trigger: "manual", bubble: "Checking a business you sent" },
      async (handle) => {
        const result = await processCandidate(ctx, {
          url,
          sourceId: "manual",
          tierHint: tierHint ?? 1,
          categoryHint: "",
          location: "",
          runId: handle.runId,
        });
        return result === "added"
          ? "Added and audited."
          : result === "discarded"
            ? "Looked at it and discarded it — see the lead for the reason."
            : "Already on the list.";
      },
    );
    return outcome.summary;
  },
});

/** One business as the worker read it off a rendered results page. */
export interface ScrapedBusiness {
  name: string;
  website: string | null;
  mapsUrl?: string;
  /** The result card's raw text — the address and phone live in here. */
  cardText?: string;
}

/**
 * Turn a business the worker actually read into a lead.
 *
 * Separate from processCandidate because there is nothing to fetch first: the
 * name, and often the website, are already known. Only the business's OWN site
 * is fetched, and only to audit it. Refetching the Maps page server-side is
 * what made every result collapse into one duplicate — Maps needs JavaScript,
 * so the fetch returned an empty shell and every business ended up with the
 * same derived name.
 *
 * A business with no website is not a failure here. It is the strongest signal
 * in the brief: trading, reachable, and invisible online.
 */
async function processBusiness(
  ctx: Parameters<typeof withRun>[0],
  args: {
    biz: ScrapedBusiness;
    sourceId: string;
    tierHint: 1 | 2 | 3;
    categoryHint: string;
    location: string;
    runId: string;
  },
): Promise<"added" | "discarded" | "skipped"> {
  const { biz } = args;
  const cardText = biz.cardText ?? "";
  const hasWebsite = Boolean(biz.website);
  const websiteUrl = biz.website ?? NOT_FOUND;

  const suburb = guessSuburb(cardText, args.location);
  const dedupe = makeDedupeKey(biz.name, suburb, websiteUrl);
  const existing = await ctx.runQuery(api.leads.findByDedupeKey, { ...machineArgs(),  dedupeKey: dedupe });
  if (existing) return "skipped";

  // Phone and address come off the card; anything else needs their own site.
  const { mobile: cardMobile, landline: cardLandline } = splitNumbers(findNumbers(cardText));
  let mobile = cardMobile;
  let landline = cardLandline;
  let emailGuess = pickEmail([], websiteUrl);
  let facebookUrl = NOT_FOUND;
  let faults: Fault[] = [];
  let loadSeconds: number | undefined;
  let siteText = "";

  if (hasWebsite) {
    const site = await fetchPage(websiteUrl);
    if (site.html) {
      siteText = stripTags(site.html);
      const numbers = splitNumbers(findNumbers(siteText));
      if (mobile === NOT_FOUND) mobile = numbers.mobile;
      if (landline === NOT_FOUND) landline = numbers.landline;
      emailGuess = pickEmail(findEmails(site.html), websiteUrl);
      const siteLinks = links(site.html, site.finalUrl);
      facebookUrl = siteLinks.find((l) => /facebook\.com\/[^/]+\/?$/.test(l)) ?? NOT_FOUND;

      // A small business puts its address on the contact page, not the front
      // page. Worth one more fetch before falling back to a guess a human then
      // has to go and check.
      if (emailGuess.status !== "published") {
        const contact = await readContactPage(siteLinks, websiteUrl);
        if (contact) {
          if (contact.email.status === "published") emailGuess = contact.email;
          if (mobile === NOT_FOUND) mobile = contact.mobile;
          if (landline === NOT_FOUND) landline = contact.landline;
        }
      }

      const audit = auditSite({
        url: websiteUrl,
        finalUrl: site.finalUrl,
        html: site.html,
        seconds: site.seconds,
        status: site.status,
      });
      faults = audit.faults;
      loadSeconds = site.seconds;
    }
  }

  const { safe, restoreOutput } = prepareForLlm(
    `${cardText}\n\n${siteText}`.slice(0, 6000),
    [biz.name],
  );
  const judgement = await judge(ctx, {
    businessName: biz.name,
    hasWebsite,
    faults,
    tierHint: args.tierHint,
    categoryHint: args.categoryHint,
    safeText: safe,
    runId: args.runId,
  });

  // The model only ever saw tokens, so anything it echoes back carries them.
  // A lead whose contact is called "«PERSON_1»" is the guard working and the
  // caller forgetting to finish the job.
  restoreJudgement(judgement, restoreOutput);

  // Only a published address counts. Counting the guess gave every business
  // with a website a free contact channel and a free five points, which is how
  // leads nobody could reach came to be scored as qualified.
  const reachableChannels = [
    mobile,
    landline,
    emailGuess.status === "published" ? emailGuess.email : NOT_FOUND,
    facebookUrl,
  ].filter((f) => f && f !== NOT_FOUND).length;

  const lead = {
    businessName: biz.name,
    contactName: judgement.contactName || NOT_FOUND,
    tier: judgement.tier,
    category: judgement.category || args.categoryHint || "unknown",
    mobile,
    landline,
    email: emailGuess.email,
    emailStatus: emailGuess.status,
    facebookUrl,
    websiteUrl,
    // The Maps card is line-separated, so it gets the card-aware reader; the
    // website is prose, so it gets the prose one.
    address:
      addressFromCard(cardText) !== NOT_FOUND ? addressFromCard(cardText) : guessAddress(siteText),
    suburb,
    hasWebsite,
    faults: faults.length > 0 ? faults : judgement.faults,
    loadSeconds,
    facebookActivity: judgement.facebookActivity ?? undefined,
    source: args.sourceId,
    sourceUrl: biz.mapsUrl ?? websiteUrl,
    dedupeKey: dedupe,
  };

  if (!isReachable(lead)) {
    await ctx.runMutation(internal.leads.create, {
      ...lead,
      score: 0,
      status: "discarded" as const,
      discardReason: unreachableReason(lead),
    });
    return "discarded";
  }

  if (!judgement.qualified) {
    await ctx.runMutation(internal.leads.create, {
      ...lead,
      score: judgement.score,
      status: "discarded" as const,
      discardReason: judgement.discardReason ?? "Off-niche.",
    });
    return "discarded";
  }

  const score = scoreLead({
    tier: judgement.tier,
    hasWebsite,
    faults: lead.faults,
    reachableChannels,
    facebookActive: Boolean(judgement.facebookActivity),
  });

  await ctx.runMutation(internal.leads.create, {
    ...lead,
    score,
    status: score >= QUALIFY_FLOOR ? ("qualified" as const) : ("discarded" as const),
    discardReason:
      score >= QUALIFY_FLOOR
        ? undefined
        : `Scored ${score}, under the ${QUALIFY_FLOOR} floor — not worth Outreach's time.`,
  });

  if (hasWebsite && score >= QUALIFY_FLOOR) {
    await ctx.runMutation(internal.scrapeJobs.enqueue, {
      type: "audit_site",
      payload: { url: websiteUrl, businessName: biz.name },
      priority: 1,
    });
  }

  return score >= QUALIFY_FLOOR ? "added" : "discarded";
}

async function processCandidate(
  ctx: Parameters<typeof withRun>[0],
  args: {
    url: string;
    sourceId: string;
    tierHint: 1 | 2 | 3;
    categoryHint: string;
    location: string;
    runId: string;
  },
): Promise<"added" | "discarded" | "skipped"> {
  const page = await fetchPage(args.url);
  if (!page.ok && !page.html) return "skipped";

  const text = stripTags(page.html);
  const businessName = guessBusinessName(page.html, args.url);
  const websiteUrl = guessOwnWebsite(page, args.url);
  const hasWebsite = websiteUrl !== NOT_FOUND;

  // ── Deterministic contact extraction. No model involved. ──────────────────
  let { mobile, landline } = splitNumbers(findNumbers(text));
  let emailGuess = pickEmail(findEmails(page.html), hasWebsite ? websiteUrl : args.url);
  const pageLinks = links(page.html, page.finalUrl);
  const facebookUrl = pageLinks.find((l) => /facebook\.com\/[^/]+\/?$/.test(l)) ?? NOT_FOUND;
  const suburb = guessSuburb(text, args.location);
  const address = guessAddress(text);

  const dedupe = makeDedupeKey(businessName, suburb, hasWebsite ? websiteUrl : args.url);
  const existing = await ctx.runQuery(api.leads.findByDedupeKey, { ...machineArgs(),  dedupeKey: dedupe });
  if (existing) return "skipped";

  // After the dedupe check, so a business we already have never costs a fetch.
  if (hasWebsite && emailGuess.status !== "published") {
    const contact = await readContactPage(pageLinks, websiteUrl);
    if (contact) {
      if (contact.email.status === "published") emailGuess = contact.email;
      if (mobile === NOT_FOUND) mobile = contact.mobile;
      if (landline === NOT_FOUND) landline = contact.landline;
    }
  }

  // ── Site fault audit ──────────────────────────────────────────────────────
  let faults: Fault[] = [];
  let loadSeconds: number | undefined;
  if (hasWebsite) {
    const site = websiteUrl === page.finalUrl ? page : await fetchPage(websiteUrl);
    if (site.html) {
      const audit = auditSite({
        url: websiteUrl,
        finalUrl: site.finalUrl,
        html: site.html,
        seconds: site.seconds,
        status: site.status,
      });
      faults = audit.faults;
      loadSeconds = site.seconds;
    }
  }

  // ── Judgement, on pseudonymised text ──────────────────────────────────────
  const { safe, restoreOutput } = prepareForLlm(text.slice(0, 6000), [businessName]);
  const judgement = await judge(ctx, {
    businessName,
    hasWebsite,
    faults,
    tierHint: args.tierHint,
    categoryHint: args.categoryHint,
    safeText: safe,
    runId: args.runId,
  });

  restoreJudgement(judgement, restoreOutput);

  // Only a published address counts. Counting the guess gave every business
  // with a website a free contact channel and a free five points, which is how
  // leads nobody could reach came to be scored as qualified.
  const reachableChannels = [
    mobile,
    landline,
    emailGuess.status === "published" ? emailGuess.email : NOT_FOUND,
    facebookUrl,
  ].filter((f) => f && f !== NOT_FOUND).length;

  const lead = {
    businessName,
    contactName: judgement.contactName || NOT_FOUND,
    tier: judgement.tier,
    category: judgement.category || args.categoryHint || "unknown",
    mobile,
    landline,
    email: emailGuess.email,
    emailStatus: emailGuess.status,
    facebookUrl,
    websiteUrl,
    address,
    suburb,
    hasWebsite,
    faults: faults.length > 0 ? faults : judgement.faults,
    loadSeconds,
    facebookActivity: judgement.facebookActivity ?? undefined,
    source: args.sourceId,
    sourceUrl: args.url,
    dedupeKey: dedupe,
  };

  // A lead with no way to reach them is not a lead. Logged, not silently dropped.
  if (!isReachable(lead)) {
    await ctx.runMutation(internal.leads.create, {
      ...lead,
      score: 0,
      status: "discarded" as const,
      discardReason: unreachableReason(lead),
    });
    return "discarded";
  }

  if (!judgement.qualified) {
    await ctx.runMutation(internal.leads.create, {
      ...lead,
      score: judgement.score,
      status: "discarded" as const,
      discardReason: judgement.discardReason ?? "Off-niche.",
    });
    return "discarded";
  }

  const score = scoreLead({
    tier: judgement.tier,
    hasWebsite,
    faults: lead.faults,
    reachableChannels,
    facebookActive: Boolean(judgement.facebookActivity),
  });

  await ctx.runMutation(internal.leads.create, {
    ...lead,
    score,
    status: score >= QUALIFY_FLOOR ? ("qualified" as const) : ("discarded" as const),
    discardReason:
      score >= QUALIFY_FLOOR
        ? undefined
        : `Scored ${score}, under the ${QUALIFY_FLOOR} floor — not worth Outreach's time.`,
  });

  // Screenshots need a real browser. Queue it; the worker picks it up.
  if (hasWebsite && score >= QUALIFY_FLOOR) {
    await ctx.runMutation(internal.scrapeJobs.enqueue, {
      type: "audit_site",
      payload: { url: websiteUrl, businessName },
      priority: 1,
    });
  }

  return score >= QUALIFY_FLOOR ? "added" : "discarded";
}

/** Put the real names back into whatever the model handed us. */
function restoreJudgement(j: Judgement, restore: (s: string) => string): void {
  j.contactName = restore(j.contactName);
  j.category = restore(j.category);
  j.discardReason = j.discardReason ? restore(j.discardReason) : null;
  j.facebookActivity = j.facebookActivity ? restore(j.facebookActivity) : null;
  j.faults = j.faults.map((f) => ({ ...f, detail: restore(f.detail) }));
}

async function judge(
  ctx: Parameters<typeof withRun>[0],
  args: {
    businessName: string;
    hasWebsite: boolean;
    faults: Fault[];
    tierHint: 1 | 2 | 3;
    categoryHint: string;
    safeText: string;
    runId: string;
  },
): Promise<Judgement> {
  const prompt = [
    `Business: ${args.businessName}`,
    `Has a website: ${args.hasWebsite ? "yes" : "no"}`,
    args.categoryHint ? `We were searching for: ${args.categoryHint}` : "",
    args.faults.length
      ? `Faults already measured on their site:\n${args.faults.map((f) => `- ${f.code}: ${f.detail}`).join("\n")}`
      : "No site faults measured.",
    "",
    "Page text (contact details have been replaced with tokens — leave them alone, you do not need them):",
    args.safeText,
    "",
    "Decide the tier, whether to qualify or discard, and why. Return the JSON shape from your instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  // Bulk judgement runs on the cheap model — this is exactly the "cheap/bulk
  // work" the tier split exists for.
  const { text } = await think(ctx, {
    botKey: "leadgen",
    purpose: "qualify_lead",
    user: prompt,
    runId: args.runId,
    tier: "cheap",
    temperature: 0.2,
    maxOutputTokens: 2000,
  });

  const raw = parseJson<Partial<Judgement>>(text);
  return {
    tier: (raw.tier === 1 || raw.tier === 2 || raw.tier === 3 ? raw.tier : args.tierHint),
    qualified: raw.qualified ?? false,
    score: typeof raw.score === "number" ? raw.score : 0,
    discardReason: raw.discardReason ?? null,
    category: raw.category ?? args.categoryHint,
    contactName: raw.contactName ?? NOT_FOUND,
    faults: Array.isArray(raw.faults) ? raw.faults : [],
    facebookActivity: raw.facebookActivity ?? null,
    reasoning: raw.reasoning ?? "",
  };
}

/**
 * Turn a sentence Taine typed into search terms.
 *
 * Deterministic first: if the instruction plainly names one of the categories
 * or locations we already know, take it and spend nothing. Only ask the model
 * when the words do not match, which is the case worth paying for.
 */
async function readInstruction(
  ctx: Parameters<typeof withRun>[0],
  instruction: string,
  runId: string,
): Promise<{ tier: 1 | 2 | 3; category: string; location: string } | null> {
  // Nothing to search for in a bare link, and the caller has already dealt
  // with those — don't spend a request establishing that.
  if (/https?:\/\//.test(instruction) && instruction.trim().split(/\s+/).length <= 2) return null;

  const text = instruction.toLowerCase();

  const location = LOCATIONS.find((l) => text.includes(l.toLowerCase()));
  let tier: 1 | 2 | 3 | undefined;
  let category: string | undefined;
  for (const t of [1, 2, 3] as const) {
    const hit = TIER_CATEGORIES[t].find((c) => text.includes(c.toLowerCase()));
    if (hit) {
      tier = t;
      category = hit;
      break;
    }
  }
  // "roofers" won't match the category "roofing contractor", so try the stem too.
  if (!category) {
    for (const t of [1, 2, 3] as const) {
      const hit = TIER_CATEGORIES[t].find((c) => {
        const head = c.split(" ")[0];
        return head.length > 4 && text.includes(head.slice(0, head.length - 1));
      });
      if (hit) {
        tier = t;
        category = hit;
        break;
      }
    }
  }

  if (category && location) return { tier: tier!, category, location };

  try {
    const { text: out } = await think(ctx, {
      botKey: "leadgen",
      purpose: "read_instruction",
      runId,
      tier: "cheap",
      temperature: 0,
      maxOutputTokens: 300,
      user: [
        `Taine told you: "${instruction}"`,
        "",
        `Pick the closest search term from this list: ${[...TIER_CATEGORIES[1], ...TIER_CATEGORIES[2], ...TIER_CATEGORIES[3]].join(", ")}`,
        `And the closest place from: ${LOCATIONS.join(", ")}`,
        "",
        'Return JSON only: {"tier":1,"category":"...","location":"...","understood":true}.',
        'If the instruction is not about searching for leads at all, return {"understood":false}.',
      ].join("\n"),
    });
    const parsed = parseJson<{
      tier?: number;
      category?: string;
      location?: string;
      understood?: boolean;
    }>(out);
    if (!parsed.understood || !parsed.category) return null;
    return {
      tier: (parsed.tier === 2 || parsed.tier === 3 ? parsed.tier : 1) as 1 | 2 | 3,
      category: parsed.category,
      location: parsed.location ?? LOCATIONS[0],
    };
  } catch {
    // A bot that cannot read the instruction still does its usual round rather
    // than doing nothing at all.
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Rotate through tier/category/location by day, so runs don't repeat themselves. */
function rotation(): { tier: 1 | 2 | 3; category: string; location: string } {
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  // Tier 1 is the priority niche, so it gets four days in five.
  const tier: 1 | 2 | 3 = dayNumber % 5 === 3 ? 2 : dayNumber % 5 === 4 ? 3 : 1;
  const categories = TIER_CATEGORIES[tier];
  return {
    tier,
    category: categories[dayNumber % categories.length],
    location: LOCATIONS[dayNumber % LOCATIONS.length],
  };
}

/** What a directory page actually gave us, so a miss can be diagnosed. */
interface Harvest {
  found: { url: string; sourceId: string }[];
  status: number;
  totalLinks: number;
  sameHost: number;
  /** A few paths we saw but rejected — the fix for a broken source starts here. */
  sample: string[];
  error?: string;
}

/**
 * Pull plausible listing URLs off a directory search page.
 *
 * Unavoidably heuristic: every directory has its own markup and redesigns
 * without telling anyone. Two passes, so a redesign degrades instead of
 * zeroing the source — first the URL shapes these sites are known to use, then,
 * if that finds nothing, anything that merely looks like a detail page. Junk
 * getting through the second pass is cheap: qualification discards it. Missing
 * every real business is not.
 */
function looksLikeDetailPage(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (path === "/" || path.length < 6) return false;
  // Navigation, not businesses.
  // "events" earns its place here: Master Builders KZN reports a healthy two
  // matches every run, and one of them is /events/event_list.asp — an events
  // calendar counted as a business, which is most of why a source that looks
  // green has produced a single lead.
  if (/\/(?:about|contact|privacy|terms|login|register|blog|news|events|help|faq|category|categories|search|tag|page)\b/i.test(path)) {
    return false;
  }
  if (/\.(?:jpg|png|svg|css|js|pdf|xml)$/i.test(path)) return false;
  const segments = path.split("/").filter(Boolean);
  // A business page is a slug: two or more words joined by hyphens.
  return segments.some((seg) => /[a-z0-9]+-[a-z0-9-]{3,}/i.test(seg)) || segments.length >= 2;
}

async function harvestListingUrls(searchUrl: string, sourceId: string): Promise<Harvest> {
  const page = await fetchPage(searchUrl);
  if (!page.html) {
    return {
      found: [],
      status: page.status,
      totalLinks: 0,
      sameHost: 0,
      sample: [],
      error: page.error ?? `no HTML (status ${page.status})`,
    };
  }

  const host = extractDomain(page.finalUrl);
  const all = links(page.html, page.finalUrl);
  const sameHost = all.filter((l) => extractDomain(l) === host && !/\?(?:page|sort|filter)=/i.test(l));

  const known = sameHost.filter((l) =>
    /\/(?:listing|listings|business|businesses|company|companies|profile|member|members|pro|accommodation|place)\//i.test(l),
  );
  const matched = known.length > 0 ? known : sameHost.filter(looksLikeDetailPage);

  return {
    found: matched.slice(0, 20).map((url) => ({ url, sourceId })),
    status: page.status,
    totalLinks: all.length,
    sameHost: sameHost.length,
    sample: [...new Set(sameHost.map((l) => { try { return new URL(l).pathname; } catch { return l; } }))].slice(0, 6),
  };
}

function guessBusinessName(html: string, url: string): string {
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  if (h1) {
    const cleaned = stripTags(h1).trim();
    if (cleaned.length > 2 && cleaned.length < 90) return cleaned;
  }
  const t = pageTitle(html);
  if (t) return t.split(/[|\-–—:]/)[0].trim().slice(0, 90);
  return extractDomain(url) ?? url;
}

/** The business's own site, as linked from a directory listing. */
function guessOwnWebsite(page: { html: string; finalUrl: string }, sourceUrl: string): string {
  const host = extractDomain(page.finalUrl);
  const candidates = links(page.html, page.finalUrl).filter((l) => {
    const d = extractDomain(l);
    return (
      d &&
      d !== host &&
      !/facebook|instagram|twitter|x\.com|linkedin|youtube|tiktok|whatsapp|google|maps|pinterest|apple/.test(d)
    );
  });
  // A directory listing that IS the business's own site (a manual add).
  if (candidates.length === 0) {
    return host && !/snupit|yellowpages|sa-venues|lekkeslaap|safarinow|nightsbridge|masterbuilders/.test(host)
      ? page.finalUrl
      : NOT_FOUND;
  }
  return candidates[0];
}

function hostOf(url: string): string {
  return extractDomain(url) ?? url;
}

function guessSuburb(text: string, fallback: string): string {
  for (const loc of LOCATIONS) {
    if (new RegExp(`\\b${loc}\\b`, "i").test(text)) return loc;
  }
  return fallback || NOT_FOUND;
}

function guessAddress(text: string): string {
  const m =
    /\b\d{1,4}[A-Za-z]?\s+[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,3}\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Crescent|Lane|Close|Way|Boulevard)\b[^.]{0,40}/.exec(
      text,
    );
  return m ? m[0].trim().replace(/\s+/g, " ") : NOT_FOUND;
}

async function isWorkerOnline(ctx: Parameters<typeof withRun>[0]): Promise<boolean> {
  const settings = await ctx.runQuery(api.settings.get, machineArgs());
  const last = settings?.workerLastSeenAt ?? 0;
  return Date.now() - last < 5 * 60_000;
}

/** The manual "Run now" button on the Leads screen. */
export const runNow = authedAction({
  args: {},
  handler: async (ctx): Promise<string> =>
    await ctx.runAction(internal.agents.leadgen.run, { trigger: "manual" }),
});
