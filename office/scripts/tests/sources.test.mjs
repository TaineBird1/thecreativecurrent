/**
 * The Snupit URL, which is the whole reason that source had one lead.
 *
 * `/search?q=plumber&location=Durban` answered HTTP 410 Gone on every run for
 * as long as the logs went back, and nothing said so: the status was recorded
 * as "blocked", the sentence explaining it was never rendered, and the source
 * looked like a directory that simply had nothing in it. The live shape is
 * `/durban/plumbers`.
 *
 * Pinned by test because a wrong plural is invisible in exactly the same way —
 * a 404 and an empty result look alike from the outside.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { snupitUrl, SOURCES, TIER_CATEGORIES } = await loadTs("packages/shared/tools/sources.ts");

test("the shape Taine read off the live site", () => {
  assert.equal(snupitUrl("plumber", "Durban"), "https://www.snupit.co.za/durban/plumbers");
});

test("multi-word trades and places become hyphenated slugs", () => {
  assert.equal(
    snupitUrl("roofing contractor", "Richards Bay"),
    "https://www.snupit.co.za/richards-bay/roofing-contractors",
  );
});

test("a trade that is already plural does not get a second s", () => {
  // "retaining wallss" is a 404 that looks exactly like an empty result.
  assert.equal(
    snupitUrl("retaining walls", "Durban"),
    "https://www.snupit.co.za/durban/retaining-walls",
  );
  assert.equal(snupitUrl("renovations", "Kloof"), "https://www.snupit.co.za/kloof/renovations");
});

test("a gerund is a trade, not a countable thing", () => {
  assert.equal(
    snupitUrl("waterproofing", "Umhlanga"),
    "https://www.snupit.co.za/umhlanga/waterproofing",
  );
  assert.equal(
    snupitUrl("self catering", "Ballito"),
    "https://www.snupit.co.za/ballito/self-catering",
  );
});

test("every category we actually search produces a clean path", () => {
  // Not asserting the plurals are the ones Snupit uses — only we can find that
  // out by looking, and a wrong one shows up as a 404 in Logs. This catches
  // the mechanical failures: a double slash, a trailing hyphen, a stray space.
  for (const categories of Object.values(TIER_CATEGORIES)) {
    for (const category of categories) {
      const url = snupitUrl(category, "Pietermaritzburg");
      assert.match(url, /^https:\/\/www\.snupit\.co\.za\/[a-z0-9-]+\/[a-z0-9-]+$/, category);
      assert.ok(!url.includes("--"), `${category} produced a double hyphen`);
    }
  }
});

test("Yellow Pages is routed through the browser, not a plain fetch", () => {
  // It answers 200 with zero links on the page, so a fetch can only ever see
  // an empty shell. This is the assertion that stops it being quietly flipped
  // back to a fetch and going silently dead again.
  const yp = SOURCES.find((s) => s.id === "yellowpages_sa");
  assert.equal(yp.needsBrowser, true);
});

test("Snupit stays a plain fetch", () => {
  // The point of Snupit is that it is server-rendered and cheap. If it ever
  // needs the browser it has stopped being the source worth having.
  assert.equal(SOURCES.find((s) => s.id === "snupit").needsBrowser, false);
});
