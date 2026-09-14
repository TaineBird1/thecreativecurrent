/**
 * Session storage for the passcode gate.
 *
 * Deliberately a separate file from convex/auth.ts. That file needs `"use node"`
 * because it uses node:crypto for HMAC signing and constant-time comparison,
 * and a Node-runtime Convex module may only export ACTIONS — a query or
 * mutation in there fails the whole deploy with "Only actions can be defined in
 * Node.js". So the crypto lives there and the database work lives here.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { stamps, alive } from "./lib/soft";

export const storeSession = internalMutation({
  args: { token: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    // Housekeeping: drop expired rows rather than letting them accumulate.
    const stale = alive(await ctx.db.query("sessions").collect()).filter(
      (s) => s.expiresAt < Date.now(),
    );
    for (const s of stale) {
      await ctx.db.patch(s._id, { deletedAt: Date.now(), updatedAt: Date.now() });
    }
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
