/**
 * The lock on the public URL.
 *
 * A Pages Function that runs before any file is served, so a visitor without
 * the password never receives the page — and, more to the point, never
 * receives the JavaScript bundle, which contains NEXT_PUBLIC_CONVEX_URL.
 *
 * Why this and not Cloudflare Access, which is the usual answer: Zero Trust
 * Free demands a credit card on file. This project's brief rules that out
 * flatly — no service requiring a card — and a "free" tier you cannot enter
 * without card details is not free for this purpose. Pages Functions are
 * included with no card and no plan.
 *
 * What this is NOT: per-function authorisation. The Convex functions still do
 * not check the session token themselves. This stops the URL being readable by
 * strangers, which is what makes the Convex URL discoverable in the first
 * place; it is a door, not a safe. If the office ever holds something you
 * would be embarrassed to leak, the real fix is a token check inside every
 * query and mutation, and this is not a substitute for it.
 *
 * Set the password in the Pages project (Settings -> Environment variables):
 *
 *   OFFICE_WEB_PASSWORD = something long
 *
 * Any username works at the browser prompt; only the password is checked.
 */

const REALM = 'Basic realm="The Creative Current Office", charset="UTF-8"';

/** Length-independent comparison, so a wrong guess leaks nothing by timing. */
function sameSecret(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // Fold the length difference in rather than returning early on it.
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function locked(body) {
  return new Response(body, {
    status: 401,
    headers: {
      "WWW-Authenticate": REALM,
      "content-type": "text/plain; charset=utf-8",
      // Never let a shared cache hold a 401 or, worse, a page fetched with
      // someone else's credentials.
      "cache-control": "no-store",
    },
  });
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const expected = env.OFFICE_WEB_PASSWORD;

  // Fail closed. An unset password must not mean an open office — that is the
  // failure mode where the lock silently does nothing and everyone assumes it
  // is working.
  if (!expected) {
    return new Response(
      "OFFICE_WEB_PASSWORD is not set on this Pages project, so this site is " +
        "refusing to serve anything. Set it under Settings -> Environment " +
        "variables and redeploy. See SETUP.md.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const header = request.headers.get("Authorization") ?? "";
  if (!header.startsWith("Basic ")) return locked("Password required.");

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return locked("Malformed credentials.");
  }

  // "user:password" — the password is everything after the FIRST colon, since
  // a password may contain one.
  const colon = decoded.indexOf(":");
  const supplied = colon === -1 ? "" : decoded.slice(colon + 1);

  if (!sameSecret(supplied, expected)) return locked("Wrong password.");

  const response = await next();
  // The office is one person's back office; nothing in it should sit in a
  // shared cache between authenticated requests.
  const out = new Response(response.body, response);
  out.headers.set("cache-control", "no-store");
  return out;
}
