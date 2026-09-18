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
const { isReachable, contactPageUrls, contactPagesFromSitemap, pickEmail, NOT_FOUND } = await loadTs(
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

/** What the old single-answer version would have returned. */
const first = (links, site = SITE) => contactPageUrls(links, site)[0] ?? null;

test("the contact page is read before the about page", () => {
  const links = [
    "https://plumber.co.za/about-us",
    "https://plumber.co.za/services",
    "https://plumber.co.za/contact",
  ];
  const order = contactPageUrls(links, SITE);
  assert.equal(order[0], "https://plumber.co.za/contact");
  assert.ok(order.indexOf("https://plumber.co.za/about-us") > 0);
});

test("an about page is taken when there is no contact page", () => {
  // A one-page trade site usually hides the address there instead.
  assert.equal(
    first(["https://plumber.co.za/services", "https://plumber.co.za/about"]),
    "https://plumber.co.za/about",
  );
});

test("the usual spellings are all recognised", () => {
  for (const path of ["/contact", "/contact-us/", "/contactus", "/get-in-touch", "/enquiries", "/kontak"]) {
    assert.equal(first([`${SITE}${path}`]), `${SITE}${path}`, path);
  }
});

test("a contact link pointing off their own site is not followed", () => {
  // Otherwise "Contact us on Facebook" sends the scraper wandering, and the
  // address it comes back with belongs to somebody else.
  const links = [
    "https://facebook.com/plumber/contact",
    "https://www.yellowpages.co.za/plumber/contact-us",
  ];
  assert.deepEqual(
    contactPageUrls(links, SITE).filter((u) => !u.startsWith(SITE)),
    [],
  );
});

test("the usual addresses are tried even when nothing links to them", () => {
  // The change that matters: a site whose contact page is linked from an image
  // or a JavaScript menu used to be a dead end.
  const guesses = contactPageUrls([], SITE);
  assert.deepEqual(guesses, [
    "https://plumber.co.za/contact",
    "https://plumber.co.za/contact-us",
    "https://plumber.co.za/about",
  ]);
});

test("a page their own links point at is read before a guessed address", () => {
  const order = contactPageUrls(["https://plumber.co.za/get-in-touch"], SITE);
  assert.equal(order[0], "https://plumber.co.za/get-in-touch");
  assert.ok(order.length > 1, "the guesses should still follow");
});

test("a real link is never queued twice as a guess", () => {
  const order = contactPageUrls(["https://plumber.co.za/contact"], SITE);
  assert.equal(order.filter((u) => u === "https://plumber.co.za/contact").length, 1);
});

test("nothing usable means nothing is tried", () => {
  assert.deepEqual(contactPageUrls(["https://plumber.co.za/contact"], "not_found"), []);
  assert.deepEqual(contactPageUrls(["not a url at all"], "not_found"), []);
});

test("a word merely containing 'contact' is not a contact page", () => {
  assert.ok(!contactPageUrls([`${SITE}/contactors-we-work-with`], SITE).includes(
    `${SITE}/contactors-we-work-with`,
  ));
});

test("the sitemap is read for pages nothing linked to", () => {
  // The site's own index of itself — the one source that cannot be wrong about
  // which pages exist.
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://plumber.co.za/</loc></url>
    <url><loc>https://plumber.co.za/emergency-callouts</loc></url>
    <url><loc> https://plumber.co.za/contact-us </loc></url>
  </urlset>`;
  assert.deepEqual(contactPagesFromSitemap(xml, SITE), ["https://plumber.co.za/contact-us"]);
});

test("the sitemap never invents a page it does not list", () => {
  // The guessed addresses are useful from a homepage and misleading here: a
  // sitemap that does not list /contact is saying there isn't one.
  const xml = "<urlset><url><loc>https://plumber.co.za/services</loc></url></urlset>";
  assert.deepEqual(contactPagesFromSitemap(xml, SITE), []);
  assert.deepEqual(contactPagesFromSitemap("not xml at all", SITE), []);
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

// ── One business, found twice ────────────────────────────────────────────────
// A trade that covers more than one suburb turns up in more than one location
// search, and without the number in the key each appearance becomes its own
// lead. Both pairs below are real rows that were sitting in the call list.
const { dedupeKey } = await loadTs("packages/shared/tools/contacts.ts", {
  "./sources": "packages/shared/tools/sources.ts",
});

test("the same number in two suburbs is one business", () => {
  // ERD Construction: "construction contractor, Margate" and "construction
  // company, Hillcrest", same phone. Two leads, one man.
  assert.equal(
    dedupeKey("ERD Construction", "Margate", "not_found", "+27813333654"),
    dedupeKey("ERD Construction", "Hillcrest", "not_found", "+27813333654"),
  );
  // And it survives the number being written differently.
  assert.equal(
    dedupeKey("Kev on Call", "Margate", "not_found", "+27616123424"),
    dedupeKey("KEV ON CALL", "Hillcrest", "not_found", "061 612 3424"),
  );
});

test("two different businesses are still two", () => {
  assert.notEqual(
    dedupeKey("ERD Construction", "Margate", "not_found", "+27813333654"),
    dedupeKey("Kev on Call", "Margate", "not_found", "+27616123424"),
  );
});

test("a website still wins over the number", () => {
  // Two branches sharing a switchboard are one website and one lead; the
  // domain was always the strongest signal and stays first.
  assert.equal(
    dedupeKey("Hi-Tec Plumbing", "Durban", "https://hitec.co.za", "+27831111111"),
    dedupeKey("Hi Tec Plumbing Durban", "Berea", "https://www.hitec.co.za/", "+27832222222"),
  );
});

test("with no website and no number it falls back to name and suburb", () => {
  assert.equal(
    dedupeKey("Some Builder", "Margate", "not_found", "not_found"),
    dedupeKey("Some Builder!", "margate", "not_found", undefined),
  );
  assert.notEqual(
    dedupeKey("Some Builder", "Margate", "not_found"),
    dedupeKey("Some Builder", "Hillcrest", "not_found"),
  );
});
