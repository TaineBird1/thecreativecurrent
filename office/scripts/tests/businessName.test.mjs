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

const { isOwnWebsite, isSocialHost } = await loadTs("packages/shared/tools/sources.ts");

test("a Facebook page is not a website", () => {
  // Verbatim from the P4plumbing lead: Maps returned this in the website box,
  // and the site audit then reported that "the site" has no contact form, no
  // physical address and no photos of the work. All true of facebook.com.
  assert.equal(isOwnWebsite("https://www.facebook.com/P4plumbing"), false);
  for (const url of [
    "https://instagram.com/someplumber",
    "https://www.tiktok.com/@someplumber",
    "https://linktr.ee/someplumber",
    "https://wa.me/27821234567",
    "https://m.me/someplumber",
  ]) {
    assert.equal(isOwnWebsite(url), false, url);
  }
});

test("a directory listing is not a website either", () => {
  assert.equal(isOwnWebsite("https://www.snupit.co.za/durban/plumbers"), false);
  assert.equal(isOwnWebsite("https://www.yellowpages.co.za/search?what=plumber"), false);
});

test("their own site is their own site", () => {
  for (const url of [
    "https://p4plumbing.co.za",
    "http://www.hitecplumbing.co.za/",
    "daveplumbing.co.za",
  ]) {
    assert.equal(isOwnWebsite(url), true, url);
  }
});

test("nothing is not a website", () => {
  for (const value of ["", "not_found", null, undefined, "localhost", "just some words"]) {
    assert.equal(isOwnWebsite(value), false, JSON.stringify(value));
  }
});

test("a business is not social for having the word in its domain", () => {
  assert.equal(isSocialHost("facebookmarketing.co.za"), false);
  assert.equal(isSocialHost("notfacebook.com"), false);
  // But a subdomain of the real thing is.
  assert.equal(isSocialHost("business.facebook.com"), true);
});
