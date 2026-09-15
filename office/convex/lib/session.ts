/**
 * Is this caller allowed to be here?
 *
 * Until now the answer was "yes, always". The passcode gate lives in the
 * browser: it decides whether to render the office, and nothing more. The
 * Convex URL ships inside the page's JavaScript, so anyone who loaded the site
 * could call every public function directly and never meet the gate at all —
 * every lead, every prospect's email address, the settings, a send.
 *
 * This is the check that closes that, and every public function now runs it
 * before doing anything.
 *
 * Verification is a database lookup, not a signature check. The session row has
 * to exist, which is strictly stronger than proving a token was signed: a
 * forged token is not in the table, and a revoked one stops working the moment
 * its row is soft-deleted. It also means this runs in a query, where node:crypto
 * is unavailable — convex/auth.ts needs `"use node"` for its HMAC and therefore
 * may only export actions.
 */
import type { QueryCtx } from "../_generated/server";

export class NotAuthenticatedError extends Error {
  constructor(message = "Not signed in to the office.") {
    super(message);
    this.name = "NotAuthenticatedError";
  }
}

/**
 * Throws unless `token` belongs to a live session, or is a trusted machine.
 *
 * Two kinds of caller are not a browser and cannot pass a passcode screen:
 *
 *  - the local worker, a plain script on Taine's laptop, which leases scrape
 *    jobs and sends a heartbeat;
 *  - the bots themselves. An internal action calling a public query goes
 *    through the same front door as the browser does, so `api.settings.sendState`
 *    from inside Lerato's run needs a token too.
 *
 * Both use OFFICE_MACHINE_TOKEN, held in Convex's environment and, for the
 * worker, its own .env.local. One token rather than two because the trust is
 * identical: neither is a person, both are already inside the system. Rotate it
 * by changing the variable in both places.
 *
 * It is not a substitute for a session — a browser can never send it, because
 * it is never in the bundle.
 */
export async function requireSession(
  ctx: Pick<QueryCtx, "db">,
  token: string | undefined,
): Promise<void> {
  if (!token) throw new NotAuthenticatedError();

  const machineToken = process.env.OFFICE_MACHINE_TOKEN;
  // Compared to a non-empty value only: an unset OFFICE_MACHINE_TOKEN must
  // never make an empty or missing token valid.
  if (machineToken && token === machineToken) return;

  const row = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!row || row.deletedAt !== undefined) throw new NotAuthenticatedError();
  if (row.expiresAt <= Date.now()) {
    throw new NotAuthenticatedError("That session has expired — sign in again.");
  }
}
