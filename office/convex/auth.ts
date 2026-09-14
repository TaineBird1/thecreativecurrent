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
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { stamps, alive } from "./lib/soft";

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
    await ctx.runMutation(internal.auth.storeSession, {
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

    const session = await ctx.runQuery(internal.auth.findSession, { token });
    return { ok: Boolean(session && session.expiresAt > Date.now()) };
  },
});

export const storeSession = internalMutation({
  args: { token: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    // Housekeeping: drop expired rows rather than letting them accumulate.
    const stale = alive(await ctx.db.query("sessions").collect()).filter(
      (s) => s.expiresAt < Date.now(),
    );
    for (const s of stale) await ctx.db.patch(s._id, { deletedAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("sessions", { ...args, ...stamps() });
  },
});

export const findSession = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    return row && row.deletedAt === undefined ? row : null;
  },
});
