/**
 * The two defects found by reading mail that had actually been sent.
 *
 * Both were in the opening three lines, which is the part of a cold email that
 * decides whether the rest is read. Twenty-five emails had gone out and nothing
 * had replied, and neither of these was visible from inside the office — the
 * drafts looked fine in the approval card; the sent copies in the inbox did
 * not.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { personalName } = await loadTs("packages/shared/tools/contacts.ts", {
  "./sources": "packages/shared/tools/sources.ts",
});

test("the business is not a person, however it is spelled", () => {
  // Verbatim from the inbox: "Hi STEVEN WELLS PLUMBING SERVICES,"
  assert.equal(
    personalName("STEVEN WELLS PLUMBING SERVICES", "STEVEN WELLS PLUMBING SERVICES"),
    null,
  );
  assert.equal(personalName("Steven Wells Plumbing Services", "STEVEN WELLS PLUMBING SERVICES"), null);
  // A fragment of the business name is the business, not the owner.
  assert.equal(personalName("Hi-Tec Plumbing", "Hi-Tec Plumbing Durban"), null);
});

test("a registered company is never greeted by name", () => {
  assert.equal(personalName("Nkosiyam Building Contractors PTY/LTD", "Nkosiyam"), null);
  assert.equal(personalName("Dudley's Plumbers CC", "Someone Else"), null);
});

test("a real person still gets their name", () => {
  assert.equal(personalName("Dudley", "Dudley's Plumbers"), null); // contained: the business
  assert.equal(personalName("Thandi", "Hi-Tec Plumbing"), "Thandi");
  assert.equal(personalName("Thandi Mkhize", "Hi-Tec Plumbing"), "Thandi Mkhize");
});

test("a shouted name is not shouted back", () => {
  assert.equal(personalName("THANDI MKHIZE", "Hi-Tec Plumbing"), "Thandi Mkhize");
  // Only when it is entirely upper case — real capitalisation is left alone.
  assert.equal(personalName("van Niekerk", "Hi-Tec Plumbing"), "van Niekerk");
  assert.equal(personalName("McBride", "Hi-Tec Plumbing"), "McBride");
});

test("nothing, or something that is not a name, falls back to Hello", () => {
  for (const value of ["", "   ", "not_found", null, undefined]) {
    assert.equal(personalName(value, "Hi-Tec Plumbing"), null);
  }
  // A whole address picked up by mistake.
  assert.equal(personalName("23 Marine Drive, Bluff, Durban, 4052", "Hi-Tec Plumbing"), null);
});

const { dropRepeatedParagraphs } = await loadTs("packages/shared/tools/emailBody.ts");

// Verbatim, from the copy of the email that reached info@tjplumbers.co.za.
const SENT = `Hello,

I run a small web studio here in Durban. I had a look at your site this morning and the homepage takes 3.5 seconds to load.

The homepage takes 3.5 seconds to load.

Here's a site we built to show what this can look like: https://smit-kontrakteurs-site.vercel.app
It runs in English and Afrikaans, and the quote button goes straight to WhatsApp.

Would you be open to a short call this week to discuss a faster, mobile-friendly version?`;

test("the sentence said twice in a real email is said once", () => {
  const fixed = dropRepeatedParagraphs(SENT);
  assert.equal(
    (fixed.match(/homepage takes 3\.5 seconds to load/g) ?? []).length,
    1,
    "the measured fault should appear exactly once",
  );
  // And nothing else was lost with it.
  assert.ok(fixed.includes("small web studio here in Durban"));
  assert.ok(fixed.includes("https://smit-kontrakteurs-site.vercel.app"));
  assert.ok(fixed.includes("short call this week"));
  assert.ok(fixed.startsWith("Hello,"));
});

test("a paragraph that adds anything at all is kept", () => {
  const body = [
    "Your site takes 3.5 seconds to load.",
    "Your site takes 3.5 seconds to load on a phone, which is where most of your enquiries come from.",
  ].join("\n\n");
  assert.equal(dropRepeatedParagraphs(body), body);
});

test("short lines are never treated as repetition", () => {
  // "Regards," appearing near a word it shares letters with is not a repeat.
  const body = "Thanks for reading this, it is genuinely appreciated.\n\nThanks";
  assert.equal(dropRepeatedParagraphs(body), body);
});

test("an ordinary email is returned untouched", () => {
  const body = "Hello,\n\nOne thing.\n\nA different thing entirely.\n\nRegards";
  assert.equal(dropRepeatedParagraphs(body), body);
});

test("repetition is caught wherever it sits, not just next to itself", () => {
  const body = [
    "Hello,",
    "Your contact form has been broken since at least March, going by the page source.",
    "Here is a site we built recently to show what this looks like.",
    "Your contact form has been broken since at least March, going by the page source.",
  ].join("\n\n");
  const fixed = dropRepeatedParagraphs(body);
  assert.equal((fixed.match(/broken since at least March/g) ?? []).length, 1);
  assert.ok(fixed.includes("a site we built recently"));
});

test("two owners on one listing means writing to the first", () => {
  // Verbatim from the inbox: "Hi Luke / Sulli,"
  assert.equal(personalName("Luke / Sulli", "Oasis Plumbers"), "Luke");
  assert.equal(personalName("Luke and Sulli", "Oasis Plumbers"), "Luke");
  assert.equal(personalName("Luke & Sulli", "Oasis Plumbers"), "Luke");
  assert.equal(personalName("Luke, Sulli", "Oasis Plumbers"), "Luke");
  // And a name that merely contains those letters is not split.
  assert.equal(personalName("Alexander", "Oasis Plumbers"), "Alexander");
  assert.equal(personalName("Amanda", "Oasis Plumbers"), "Amanda");
});
