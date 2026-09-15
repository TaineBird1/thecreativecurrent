/**
 * `query`, `mutation` and `action`, but signed in.
 *
 * Every public function in this project is defined with one of these instead of
 * the raw builders. They add a `token` argument and refuse to run without a
 * live session — see convex/lib/session.ts for why a browser-side passcode
 * screen was never enough.
 *
 * Deliberately a drop-in replacement rather than a check each handler has to
 * remember to call. A check you can forget is a check that will be forgotten,
 * once, in the one function that mattered — and nothing about the code would
 * look wrong afterwards. scripts/check-authed.mjs fails the build if a public
 * function is defined with a raw builder, so forgetting is loud.
 *
 * The two exceptions live in convex/auth.ts: `login` takes a passcode and
 * hands back a token, and `check` says whether a token is still good. Both must
 * be callable by someone who has no token yet, which is the entire point of
 * them. Neither reads or writes anything else.
 */
import { v } from "convex/values";
import type { ObjectType, PropertyValidators } from "convex/values";
import { query, mutation, action } from "../_generated/server";
import type { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireSession } from "./session";

/** The argument every public function gains. */
const TOKEN = { token: v.string() };

type WithToken<Args extends PropertyValidators> = ObjectType<Args> & { token: string };

export function authedQuery<Args extends PropertyValidators, Output>(def: {
  args: Args;
  handler: (ctx: QueryCtx, args: WithToken<Args>) => Output;
}) {
  return query({
    args: { ...def.args, ...TOKEN },
    handler: async (ctx, args) => {
      await requireSession(ctx, (args as { token: string }).token);
      return await def.handler(ctx, args as WithToken<Args>);
    },
  });
}

export function authedMutation<Args extends PropertyValidators, Output>(def: {
  args: Args;
  handler: (ctx: MutationCtx, args: WithToken<Args>) => Output;
}) {
  return mutation({
    args: { ...def.args, ...TOKEN },
    handler: async (ctx, args) => {
      await requireSession(ctx, (args as { token: string }).token);
      return await def.handler(ctx, args as WithToken<Args>);
    },
  });
}

export function authedAction<Args extends PropertyValidators, Output>(def: {
  args: Args;
  handler: (ctx: ActionCtx, args: WithToken<Args>) => Output;
}) {
  return action({
    args: { ...def.args, ...TOKEN },
    handler: async (ctx, args) => {
      // An action has no database handle of its own, so the same check runs as
      // a query rather than being reimplemented here — one definition of "is
      // this caller allowed in", not two that can drift apart.
      await ctx.runQuery(internal.authStore.verify, {
        token: (args as { token: string }).token,
      });
      return await def.handler(ctx, args as WithToken<Args>);
    },
  });
}
