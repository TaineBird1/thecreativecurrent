/**
 * Reachability, and finding a real address instead of guessing one.
 *
 * Both of these exist because of the same afternoon: six leads sat qualified
 * and permanently unwritable, and when their sites were checked by hand not one
 * published an email address. They had been scored as contactable on the
 * strength of an `info@theirdomain.co.za` that Lead-gen had made up itself.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { isReachable, contactPageUrl, pickEmail, NOT_FOUND } = await loadTs(
  "packages/shared/tools/contacts.ts",
);

const unreachable = {
  mobile: NOT_FOUND,
  landline: NOT_FOUND,
  email: NOT_FOUND,
  emailStatus: "not_found",
  facebookUrl: NOT_FOUND,
};

test("a guessed address is not a way to reach anyone", () => {
  // The bug, stated plainly. This returned true, the lead was scored as
  // contactable, and then the outreach queue refused to write to it.
  assert.equal(
    isReachable({ ...unreachable, email: "info@nowhere.co.za", emailStatus: "inferred" }),
    false,
  );
});

test("a published address is", () => {
  assert.equal(
    isReachable({ ...unreachable, email: "info@nowhere.co.za", emailStatus: "published" }),
    true,
  );
});

test("a phone number still carries a lead with no email at all", () => {
  // These are the ones that become a call rather than a discard.
  assert.equal(isReachable({ ...unreachable, mobile: "+27831234567" }), true);
  assert.equal(isReachable({ ...unreachable, landline: "+27312345678" }), true);
  assert.equal(isReachable({ ...unreachable, facebookUrl: "https://facebook.com/x" }), true);
});

test("nothing at all is nothing at all", () => {
  assert.equal(isReachable(unreachable), false);
});

test("pickEmail still marks its guess as a guess", () => {
  // The other half: isReachable can only tell a guess from a real address
  // because pickEmail labels it honestly.
  assert.deepEqual(pickEmail([], "https://nowhere.co.za"), {
    email: "info@nowhere.co.za",
    status: "inferred",
  });
  assert.equal(pickEmail(["hello@nowhere.co.za"], "https://nowhere.co.za").status, "published");
});

const SITE = "https://plumber.co.za";

test("the contact page wins over the about page", () => {
  const links = [
    "https://plumber.co.za/about-us",
    "https://plumber.co.za/services",
    "https://plumber.co.za/contact",
  ];
  assert.equal(contactPageUrl(links, SITE), "https://plumber.co.za/contact");
});

test("an about page is taken when there is no contact page", () => {
  // A one-page trade site usually hides the address there instead.
  assert.equal(
    contactPageUrl(["https://plumber.co.za/services", "https://plumber.co.za/about"], SITE),
    "https://plumber.co.za/about",
  );
});

test("the usual spellings are all recognised", () => {
  for (const path of ["/contact", "/contact-us/", "/contactus", "/get-in-touch", "/enquiries", "/kontak"]) {
    assert.equal(contactPageUrl([`${SITE}${path}`], SITE), `${SITE}${path}`, path);
  }
});

test("a contact link pointing off their own site is not followed", () => {
  // Otherwise "Contact us on Facebook" sends the scraper wandering, and the
  // address it comes back with belongs to somebody else.
  const links = [
    "https://facebook.com/plumber/contact",
    "https://www.yellowpages.co.za/plumber/contact-us",
  ];
  assert.equal(contactPageUrl(links, SITE), null);
});

test("no contact page means no contact page", () => {
  assert.equal(contactPageUrl(["https://plumber.co.za/services"], SITE), null);
  assert.equal(contactPageUrl([], SITE), null);
  assert.equal(contactPageUrl(["not a url at all"], SITE), null);
  assert.equal(contactPageUrl(["https://plumber.co.za/contact"], "not_found"), null);
});

test("a word merely containing 'contact' is not a contact page", () => {
  assert.equal(contactPageUrl([`${SITE}/contactors-we-work-with`], SITE), null);
});
