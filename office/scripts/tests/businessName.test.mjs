/**
 * Telling a business apart from the page its name was read off.
 *
 * Every name here was a real row in the lead list. The name comes from an h1 or
 * a page title, and on a page that is not a business listing that produces a
 * lead called "Google Maps" — recorded, in earnest, as a tiling contractor in
 * Margate. Each was fetched, audited, judged by the model and written to the
 * database before anything noticed.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { looksLikeBusinessName } = await loadTs("packages/shared/tools/sources.ts");

test("the three that were actually in the lead list", () => {
  assert.equal(looksLikeBusinessName("Google Maps"), false);
  assert.equal(looksLikeBusinessName("Request a Quote"), false);
  assert.equal(looksLikeBusinessName("Master Builders KwaZulu-Natal"), false);
});

test("other page furniture that would read the same way", () => {
  for (const junk of [
    "Contact Us", "About", "Home", "Search Results", "Privacy Policy",
    "Page not found", "404", "Untitled Document", "  menu  ", "Snupit",
  ]) {
    assert.equal(looksLikeBusinessName(junk), false, junk);
  }
});

test("real businesses from the list are untouched", () => {
  for (const name of [
    "Hi-Tec Plumbing",
    "Royal Flush Plumbing and Maintenance",
    "New Found Plumbers (PTY) Ltd.",
    "Shawane construction",
    "Yamuna Plumbing and Civils Umhlanga",
    "STEVEN WELLS PLUMBING SERVICES",
    "P4plumbing",
    "Nkosiyam Building Contractors PTY/LTD",
    "Ballito Roofing & Waterproofing",
  ]) {
    assert.equal(looksLikeBusinessName(name), true, name);
  }
});

test("a business is not rejected for mentioning a directory", () => {
  // Anchored to the start, so this is about being named after one.
  assert.equal(looksLikeBusinessName("Plumbers listed on Snupit"), true);
  assert.equal(looksLikeBusinessName("Homegrown Builders"), true);
  // "contact" as a word, rather than as the whole name.
  assert.equal(looksLikeBusinessName("Contact Plumbing Solutions"), true);
});

test("nothing at all is not a business", () => {
  for (const value of ["", "  ", "a", "ab", "—"]) {
    assert.equal(looksLikeBusinessName(value), false, JSON.stringify(value));
  }
});
