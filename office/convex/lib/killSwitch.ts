/**
 * The kill switch.
 *
 * Three properties matter, and each one is a consequence of how this is built:
 *
 *  1. **It takes effect within seconds, not at the next schedule tick** —
 *     because `checkHalt` is called at the top of every bot run (in
 *     `withRun`), again inside every loop via `handle.stopped()`, and once more
 *     in `convex/outbound.ts` immediately before each individual send. A bot
 *     halfway through a batch of emails stops on the next one, not after all of
 *     them.
 *  2. **It survives restarts and redeploys** — because the state is a row in
 *     the `settings` table, not a module-level variable. A Convex action is
 *     stateless and may run in a fresh isolate every time; in-memory state
 *     would silently reset and the switch would appear to work while doing
 *     nothing.
 *  3. **Lifting it is deliberate** — the UI requires typing a confirmation, and
 *     lifting does not by itself bring bots back on shift.
 *
 * It is separate from, and overrides, `pauseSending`: pause stops mail, STOP
 * stops everything.
 */
import type { ActionCtx } from "../_generated/server";
import { api } from "../_generated/api";

export interface HaltState {
  halted: boolean;
  reason?: string;
}

/** The single read. Cheap on purpose — it runs many times per bot run. */
export async function checkHalt(ctx: ActionCtx): Promise<HaltState> {
  return await ctx.runQuery(api.settings.haltState, {});
}

/** Non-throwing shorthand for loops that want to stop cleanly and report. */
export async function isHalted(ctx: ActionCtx): Promise<boolean> {
  return (await checkHalt(ctx)).halted;
}

export function haltMessage(state: HaltState): string {
  return `STOP is engaged${state.reason ? `: ${state.reason}` : ""}. Nothing ran.`;
}
