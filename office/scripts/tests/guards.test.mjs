/**
 * Guard fixtures.
 *
 * Two lists per guard: things that MUST trip it, and things that must NOT.
 * The second list is the one that matters — a guard that trips on everything
 * is a guard everyone learns to click through without reading.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { loadTs } from "./_load.mjs";

const { checkMoney } = await loadTs("packages/shared/guards/money.ts");
const { checkClaims } = await loadTs("packages/shared/guards/claims.ts", {
  "./money": "packages/shared/guards/money.ts",
});
const { pseudonymise, restore, assertNoForbiddenContent, prepareForLlm } = await loadTs(
  "packages/shared/guards/pii.ts",
);
const { similarity, checkAgainstRecent, skeleton } = await loadTs(
  "packages/shared/guards/similarity.ts",
);

// ── Money ────────────────────────────────────────────────────────────────────
const MONEY_MUST_TRIP = [
  "The build comes to R11,500 and we can start Monday.",
  "Care plan is R1 100 per month.",
  "I can do it for ZAR 9500.",
  "That's about 12000 rand all in.",
  "I'll send a quote through this afternoon.",
  "Happy to knock off a discount if you sign this week.",
  "We'd need a 50% deposit to start.",
  "Full refund if you're not happy.",
  "Let's put R2,000 a month behind the ads.",
  "Attached is the agreement — just need your signature.",
  "There's no charge for that one.",
  "Our monthly fee covers hosting and updates.",
];

const MONEY_MUST_NOT_TRIP = [
  "Your site takes 8.4 seconds to load on a phone.",
  "Worth a short call on Tuesday or Thursday morning?",
  "We built smitkontrakteurs.co.za — same trade, bilingual, WhatsApp quote button.",
  "Your contact form doesn't work on mobile.",
  "I had a look at your Facebook page — you post finished jobs most weeks.",
  "Happy to run you through a free Direct Booking Audit.",
  "It costs you nothing to reply and say no.",
  "The gallery only shows four photos of the rooms.",
];

test("money guard trips on everything that touches money", () => {
  for (const text of MONEY_MUST_TRIP) {
    assert.equal(checkMoney(text).tripped, true, `should have tripped: ${text}`);
  }
});

test("money guard leaves ordinary outreach alone", () => {
  for (const text of MONEY_MUST_NOT_TRIP) {
    const r = checkMoney(text);
    assert.equal(r.tripped, false, `should NOT have tripped: ${text}\n  -> ${r.reason}`);
  }
});

// ── Claims ───────────────────────────────────────────────────────────────────
const CLAIMS_MUST_TRIP = [
  "We'll get you on page one of Google.",
  "This will double your enquiries.",
  "Guaranteed results or your money back.",
  "You'll see more leads within 30 days.",
  "We can get you ranking first for roof repairs durban.",
  "Expect 3x the traffic.",
  "40% more enquiries in the first quarter.",
  "You'll start getting calls almost immediately.",
  "We'll outrank the competition.",
  "Top 3 on Google for your area.",
  "More bookings, risk-free.",
  "Rankings improve within 8 weeks.",
];

const CLAIMS_MUST_NOT_TRIP = [
  "A page built to be found for 'roof repair durban'.",
  "The build takes about 3 to 4 weeks once we have your photos.",
  "Your site isn't mobile-responsive — it doesn't resize on a phone.",
  "We add a WhatsApp button so people can message you from the site.",
  "Direct bookings go to you instead of through the OTAs.",
  "I'll need your logo and about ten job photos to start.",
  "The contact form emails you directly.",
  "Same trade, same province — have a look at what we did for SMIT.",
];

test("claims guard trips on every ranking, traffic and guarantee promise", () => {
  for (const text of CLAIMS_MUST_TRIP) {
    assert.equal(checkClaims(text).tripped, true, `should have tripped: ${text}`);
  }
});

test("claims guard leaves honest description of the work alone", () => {
  for (const text of CLAIMS_MUST_NOT_TRIP) {
    const r = checkClaims(text);
    assert.equal(r.tripped, false, `should NOT have tripped: ${text}\n  -> ${r.reason}`);
  }
});

test("a timeframe on its own is fine; a timeframe on an outcome is not", () => {
  assert.equal(checkClaims("It takes about 3 weeks to build.").tripped, false);
  assert.equal(checkClaims("We'll be done in 4 weeks.").tripped, false);
  assert.equal(checkClaims("You'll rank in 4 weeks.").tripped, true);
  assert.equal(checkClaims("More enquiries within 60 days.").tripped, true);
});

// ── PII ──────────────────────────────────────────────────────────────────────
test("pseudonymise replaces names, emails, phones and urls with stable tokens", () => {
  const input =
    "Dean at Ballito Roofing — dean@ballitoroofing.co.za, 082 441 9087, http://www.ballitoroofing.co.za";
  const { text, map } = pseudonymise(input, ["Dean"]);

  assert.ok(!text.includes("dean@ballitoroofing.co.za"), "email leaked");
  assert.ok(!text.includes("082 441 9087"), "phone leaked");
  assert.ok(!text.includes("http://www.ballitoroofing.co.za"), "url leaked");
  assert.match(text, /«PERSON_1»/);
  assert.match(text, /«EMAIL_1»/);
  assert.equal(restore(text, map), input, "restore must be lossless");
});

test("the same value gets the same token twice, so the model can reason about it", () => {
  const { text } = pseudonymise("Email dean@x.co.za. Reply to dean@x.co.za.");
  assert.equal((text.match(/«EMAIL_1»/g) ?? []).length, 2);
  assert.ok(!text.includes("«EMAIL_2»"));
});

test("+27 numbers are caught as well as 0-prefixed ones", () => {
  const { text } = pseudonymise("Call +27824419087 or 031 561 7788.");
  assert.ok(!text.includes("+27824419087"));
  assert.ok(!text.includes("031 561 7788"));
});

test("quotes, contracts and invoices are refused outright, not masked", () => {
  assert.throws(() => assertNoForbiddenContent("Invoice number: INV-2026-014"), /never go to a free-tier model/);
  assert.throws(() => assertNoForbiddenContent("Signature: ______"), /never go to a free-tier model/);
  assert.throws(() => assertNoForbiddenContent("Branch code 250655, account number 62851…"), /banking details/);
  assert.throws(() => assertNoForbiddenContent("VAT number 4890265113"), /VAT registration/);
  assert.doesNotThrow(() => assertNoForbiddenContent("Their site has no contact form."));
});

test("prepareForLlm gives back a safe string and a working restore", () => {
  const { safe, restoreOutput } = prepareForLlm("Phone Priya on 083 661 4402.", ["Priya"]);
  assert.ok(!safe.includes("083 661 4402"));
  assert.ok(!safe.includes("Priya"));
  assert.equal(restoreOutput(safe), "Phone Priya on 083 661 4402.");
});

// ── Similarity ───────────────────────────────────────────────────────────────
test("a swapped business name does not make a template a personal letter", () => {
  const a =
    "I had a look at your site on my phone this morning and it doesn't resize properly. We built smitkontrakteurs.co.za for a contractor in George with the same problem. Worth a short call?";
  const b =
    "I had a look at your site on my phone this morning and it doesn't resize properly. We built smitkontrakteurs.co.za for a contractor in George with the same problem. Worth a quick call?";
  assert.ok(similarity(a, b) > 0.82, `expected a near-identical pair, got ${similarity(a, b)}`);
});

test("genuinely different emails pass", () => {
  const a = "Your site takes 8.4 seconds to load on a phone. We fixed the same thing for SMIT Kontrakteurs in George.";
  const b = "You take every booking enquiry through the OTAs. A direct booking page keeps that traffic on your own site.";
  assert.ok(similarity(a, b) < 0.3, `expected these to differ, got ${similarity(a, b)}`);
});

test("raw text alone would MISS a name-swapped template — this is why skeletons exist", () => {
  const a =
    "Morning Dean. I had a look at the Ballito Roofing site on my phone and it doesn't resize properly. We built smitkontrakteurs.co.za for a contractor in George with the same problem. Worth a short call on Tuesday?";
  const b =
    "Morning Priya. I had a look at the Umhlanga Lodge site on my phone and it doesn't resize properly. We built smitkontrakteurs.co.za for a contractor in George with the same problem. Worth a short call on Tuesday?";

  // Word for word the same email. On raw text it scores well under any usable
  // ceiling, which is precisely the bug skeletons fix.
  assert.ok(similarity(a, b) < 0.82, `raw similarity was ${similarity(a, b).toFixed(2)}`);

  const sa = skeleton(a, ["Dean", "Ballito Roofing"]);
  const sb = skeleton(b, ["Priya", "Umhlanga Lodge"]);
  assert.ok(
    similarity(sa, sb) > 0.95,
    `skeletons should be near-identical, got ${similarity(sa, sb).toFixed(2)}`,
  );
});

test("checkAgainstRecent flags the closest skeleton above the ceiling", () => {
  const recent = [
    skeleton("Completely unrelated text about gutters in Ballito.", ["Ballito"]),
    skeleton(
      "Morning Dean. I had a look at the Ballito Roofing site on my phone and it doesn't resize properly. We built smitkontrakteurs.co.za for a contractor in George. Worth a short call?",
      ["Dean", "Ballito Roofing"],
    ),
  ];
  const candidate = skeleton(
    "Morning Priya. I had a look at the Umhlanga Lodge site on my phone and it doesn't resize properly. We built smitkontrakteurs.co.za for a contractor in George. Worth a short call?",
    ["Priya", "Umhlanga Lodge"],
  );
  const verdict = checkAgainstRecent(candidate, recent, 0.82);
  assert.equal(verdict.tooSimilar, true, `score was ${verdict.score.toFixed(2)}`);
  assert.equal(verdict.closestIndex, 1);
});

test("a genuinely different email passes the skeleton check", () => {
  const recent = [
    skeleton(
      "Morning Dean. Your site takes 8.4 seconds to load on a phone. We fixed the same thing for SMIT Kontrakteurs in George. Worth a short call?",
      ["Dean"],
    ),
  ];
  const candidate = skeleton(
    "Hi Priya. Every booking enquiry on your site goes through the OTAs, so you pay commission on guests who already know your name. Happy to run a free Direct Booking Audit.",
    ["Priya"],
  );
  assert.equal(checkAgainstRecent(candidate, recent, 0.82).tooSimilar, false);
});

// ── The combined gate ────────────────────────────────────────────────────────
const { gate, gateAll } = await loadTs("packages/shared/guards/index.ts", {
  "./money": "packages/shared/guards/money.ts",
  "./claims": "packages/shared/guards/claims.ts",
  "./pii": "packages/shared/guards/pii.ts",
  "./similarity": "packages/shared/guards/similarity.ts",
});

test("the gate reports which guard caught it", () => {
  assert.equal(gate("It's R9,500 for the build.").guard, "money");
  assert.equal(gate("We'll get you to page one.").guard, "claims");
  assert.equal(gate("Your contact form doesn't work on a phone.").clear, true);
});

test("gateAll checks the subject as well as the body", () => {
  const v = gateAll({ subject: "page one for roof repairs", body: "Worth a short call?" });
  assert.equal(v.clear, false);
  assert.match(v.reason, /subject/);
});
