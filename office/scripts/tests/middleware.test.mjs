/**
 * The edge lock on the public URL.
 *
 * Worth real tests because it is the only thing standing between a stranger
 * and the JavaScript bundle, and the bundle carries NEXT_PUBLIC_CONVEX_URL —
 * from which every Convex function is callable, since none of them check the
 * session token themselves. A hole here is not "the site looks wrong", it is
 * the whole database readable by anyone who finds the address.
 *
 * Run: pnpm test
 */
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { onRequest } = await import(
  pathToFileURL(join(root, "functions", "_middleware.js")).href
);

const PASSWORD = "a-long-office-password";
const served = "THE OFFICE";

function call(authHeader, password = PASSWORD) {
  return onRequest({
    request: new Request(
      "https://office.pages.dev/",
      authHeader ? { headers: { Authorization: authHeader } } : {},
    ),
    env: password === null ? {} : { OFFICE_WEB_PASSWORD: password },
    next: async () => new Response(served, { status: 200 }),
  });
}

const basic = (user, pass) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

test("no credentials gets a challenge, not the page", async () => {
  const res = await call(null);
  assert.equal(res.status, 401);
  assert.match(res.headers.get("WWW-Authenticate") ?? "", /^Basic realm=/);
  assert.notEqual(await res.text(), served);
});

test("an unset password serves nothing at all", async () => {
  // The failure that matters most. If a missing OFFICE_WEB_PASSWORD meant
  // "let everyone in", the lock would be doing nothing on exactly the day
  // someone forgot to set it, and the site would look perfectly normal.
  const res = await call(basic("me", PASSWORD), null);
  assert.equal(res.status, 503);
  assert.notEqual(await res.text(), served);
});

test("the wrong password, an empty one, or junk all fail", async () => {
  for (const header of [
    basic("me", "wrong"),
    basic("me", ""),
    "Basic !!!not-base64!!!",
    "Bearer some-token",
    "Basic",
  ]) {
    const res = await call(header);
    assert.equal(res.status, 401, `should have been refused: ${header}`);
    assert.notEqual(await res.text(), served);
  }
});

test("the right password serves the page", async () => {
  const res = await call(basic("anything", PASSWORD));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), served);
});

test("a password containing a colon still works", async () => {
  // Basic auth is "user:password" and a naive split on ":" truncates at the
  // first one — which would silently accept a prefix of the real password.
  const withColon = "pa:ss:word";
  const res = await call(basic("me", withColon), withColon);
  assert.equal(res.status, 200);

  const truncated = await call(basic("me", "pa"), withColon);
  assert.equal(truncated.status, 401, "a prefix must not be accepted");
});

test("nothing authenticated is left in a shared cache", async () => {
  const ok = await call(basic("me", PASSWORD));
  assert.equal(ok.headers.get("cache-control"), "no-store");
  const denied = await call(null);
  assert.equal(denied.headers.get("cache-control"), "no-store");
});

// ── The one exemption ────────────────────────────────────────────────────────
// /demo/* holds one-page demonstration sites built for a named prospect, to be
// opened by that prospect during a call. A password in front of them defeats
// the point entirely. Tested in both directions, because an exemption written
// loosely is how the lock quietly stops being a lock.

function callPath(path, authHeader, password = PASSWORD) {
  return onRequest({
    request: new Request(
      `https://office.pages.dev${path}`,
      authHeader ? { headers: { Authorization: authHeader } } : {},
    ),
    env: password === null ? {} : { OFFICE_WEB_PASSWORD: password },
    next: async () => new Response(served, { status: 200 }),
  });
}

test("a demo page opens with no password at all", async () => {
  for (const path of ["/demo/p4plumbing/", "/demo/apr-roofing/index.html", "/demo/robots.txt", "/demo"]) {
    const res = await callPath(path, null);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), served, path);
  }
});

test("a demo page opens even when the office password is unset", async () => {
  // The office itself refuses to serve anything in that state, deliberately.
  // A prospect's demo is not part of what that protects.
  const res = await callPath("/demo/p4plumbing/", null, null);
  assert.equal(res.status, 200);
  assert.equal((await callPath("/", null, null)).status, 503);
});

test("the exemption does not leak past the folder it names", async () => {
  // Each of these contains "demo" and none of them is a demo page.
  for (const path of [
    "/demonstration",
    "/demo-office",
    "/leads?next=/demo/",
    "/settings/demo",
    "/demo../leads",
  ]) {
    const res = await callPath(path, null);
    assert.equal(res.status, 401, `${path} should still need the password`);
  }
});

test("traversal resolves before the check, not around it", async () => {
  // "/../demo" is "/demo" by the time the URL is parsed, so it is the demo
  // folder and serving it is right. What matters is that nothing resolves the
  // other way — out of /demo and into the office.
  assert.equal((await callPath("/../demo", null)).status, 200);
  assert.equal((await callPath("/demo/../leads", null)).status, 401);
  assert.equal((await callPath("/demo/../../settings", null)).status, 401);
});

test("the office itself is untouched by the exemption", async () => {
  assert.equal((await callPath("/", null)).status, 401);
  assert.equal((await callPath("/leads", null)).status, 401);
  assert.equal((await callPath("/", basic("x", PASSWORD))).status, 200);
});
