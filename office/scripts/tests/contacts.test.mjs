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

// contacts.ts asks sources.ts which hosts belong to a directory, so that has
// to be compiled alongside it.
const { isReachable, contactPageUrl, pickEmail, NOT_FOUND } = await loadTs(
  "packages/shared/tools/contacts.ts",
  { "./sources": "packages/shared/tools/sources.ts" },
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

test("a directory's own address is never taken as the business's", () => {
  // A Snupit listing carries Snupit's details in the footer alongside the
  // plumber's. Taken as "published" it is written to the lead and then written
  // to — an outreach email addressed to a business and delivered to the
  // directory that listed it, with nothing downstream to hold it back.
  const found = ["info@snupit.co.za", "dave@daveplumbing.co.za"];
  assert.deepEqual(pickEmail(found, "https://daveplumbing.co.za"), {
    email: "dave@daveplumbing.co.za",
    status: "published",
  });
});

test("a directory address alone falls back to the guess, not to the directory", () => {
  assert.deepEqual(pickEmail(["support@snupit.co.za"], "https://daveplumbing.co.za"), {
    email: "info@daveplumbing.co.za",
    status: "inferred",
  });
});

test("every directory we search is covered, including subdomains", async () => {
  const { isDirectoryHost, SOURCES } = await loadTs("packages/shared/tools/sources.ts");
  for (const source of SOURCES) {
    const host = new URL(source.search("plumber", "Durban")).hostname;
    assert.equal(isDirectoryHost(host), true, source.id);
  }
  assert.equal(isDirectoryHost("listings.snupit.co.za"), true);
  assert.equal(isDirectoryHost("daveplumbing.co.za"), false);
  // Not a substring match: a business is not a directory for sharing letters.
  assert.equal(isDirectoryHost("notsnupit.co.za"), false);
  assert.equal(isDirectoryHost(null), false);
});

test("a guess is never built from the directory we found them on", () => {
  // A business with no site of its own falls back to the URL it was found at.
  // For a listing that is the directory, and "info@snupit.co.za" is a guess at
  // the address of the website we would be offering to rebuild.
  assert.deepEqual(pickEmail([], "https://www.snupit.co.za/durban/plumbers"), {
    email: "not_found",
    status: "not_found",
  });
  assert.deepEqual(pickEmail([], "https://www.yellowpages.co.za/search?what=plumber"), {
    email: "not_found",
    status: "not_found",
  });
  // A real business domain still gets its guess.
  assert.equal(pickEmail([], "https://daveplumbing.co.za").status, "inferred");
});
