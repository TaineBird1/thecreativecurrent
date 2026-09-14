/**
 * The settings singleton, plus the kill switch check that guards every action.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { stamps } from "./soft";

export const SETTINGS_KEY = "global";

export const DEFAULT_SETTINGS = {
  key: SETTINGS_KEY,
  killSwitch: { active: false },
  pauseSending: false,
  // Empty sender => sending is disabled entirely. Set it in Settings once the
  // Resend domain is verified. Nothing goes out until then.
  senderEmail: "",
  senderName: "The Creative Current",
  replyToEmail: "",
  bookingUrl: "", // Cal.com link
  dailySendCap: 20,
  similarityCeiling: 0.82,
  integrations: {
    gemini: false,
    groq: false,
    resend: false,
    searchConsole: false,
    googleAds: false,
  },
};

export async function readSettings(ctx: QueryCtx | MutationCtx): Promise<Doc<"settings"> | null> {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY))
    .unique();
}

/** Read settings, creating the singleton on first touch. Mutations only. */
export async function ensureSettings(ctx: MutationCtx): Promise<Doc<"settings">> {
  const existing = await readSettings(ctx);
  if (existing) return existing;
  const id = await ctx.db.insert("settings", {
    ...DEFAULT_SETTINGS,
    budgets: {},
    pricingYaml: "",
    ...stamps(),
  });
  return (await ctx.db.get(id))!;
}

export class HaltedError extends Error {
  constructor(reason?: string) {
    super(`STOP is engaged${reason ? `: ${reason}` : ""}. No outbound action ran.`);
    this.name = "HaltedError";
  }
}

export class SendingPausedError extends Error {
  constructor(why: string) {
    super(why);
    this.name = "SendingPausedError";
  }
}
