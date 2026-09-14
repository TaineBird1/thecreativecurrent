"use node";
/**
 * Access control.
 *
 * One boss, one passcode. There is no user table, no signup, no password reset
 * and no third-party auth — all of which would be more machinery than a
 * single-operator back office needs, and two of which cost money.
 *
 * What this is: the passcode lives in Convex env (`OFFICE_PASSCODE`), never in
 * the repo. A correct passcode gets an HMAC-signed token, stored server-side
 * with an expiry, held in the browser's localStorage. The signature means a
 * token cannot be forged; the stored row means it can be revoked.
 *
 * What this is not: it does not protect against someone with your laptop open.
 * If you want real accounts later, swap this for Convex Auth — no bot code
 * touches it.
 *
 * Why the session rows live in convex/authStore.ts and not here: this file is
 * `"use node"` (node:crypto, for HMAC and a constant-time compare), and a
 * Node-runtime Convex module may only export ACTIONS. A query or mutation in
 * here fails the entire deploy, not just this file.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function sign(nonce: string, secret: string): string {
  return createHmac("sha256", secret).update(nonce).digest("hex");
}

export const login = action({
  args: { passcode: v.string() },
  handler: async (ctx, { passcode }): Promise<{ ok: boolean; token?: string; error?: string }> => {
    const expected = process.env.OFFICE_PASSCODE;
    const secret = process.env.OFFICE_TOKEN_SECRET;

    if (!expected || !secret) {
      return {
        ok: false,
        error:
          "OFFICE_PASSCODE and OFFICE_TOKEN_SECRET aren't set in Convex. See SETUP.md — the office won't open until they are.",
      };
    }

    // Constant-time compare. Padding to a fixed length first, because
    // timingSafeEqual throws on a length mismatch and that throw is itself a
    // timing signal about the passcode's length.
    const a = Buffer.from(passcode.padEnd(64, "\0").slice(0, 64));
    const b = Buffer.from(expected.padEnd(64, "\0").slice(0, 64));
    if (!timingSafeEqual(a, b)) {
      return { ok: false, error: "That's not the passcode." };
    }

    const nonce = randomBytes(24).toString("hex");
    const token = `${nonce}.${sign(nonce, secret)}`;
    await ctx.runMutation(internal.authStore.storeSession, {
      token,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return { ok: true, token };
  },
});

export const check = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<{ ok: boolean }> => {
    const secret = process.env.OFFICE_TOKEN_SECRET;
    if (!secret) return { ok: false };

    const [nonce, signature] = token.split(".");
    if (!nonce || !signature) return { ok: false };
    if (sign(nonce, secret) !== signature) return { ok: false };

    const session = await ctx.runQuery(internal.authStore.findSession, { token });
    return { ok: Boolean(session && session.expiresAt > Date.now()) };
  },
});
