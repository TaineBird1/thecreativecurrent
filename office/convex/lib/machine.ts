/**
 * How a bot identifies itself when it calls a public function.
 *
 * Only actions can call other functions, and an action calling
 * `api.settings.sendState` arrives at exactly the same door as the browser —
 * so it needs a token like anything else. This is that token.
 *
 * Spread into the args rather than passed as a bare value, so a call reads as
 * `{ ...MACHINE, limit: 50 }` and nothing has to remember the field name.
 *
 * Unset means an empty string, which requireSession rejects. That is
 * deliberate: a missing OFFICE_MACHINE_TOKEN stops the bots with a clear
 * "not signed in", rather than quietly letting anonymous calls through.
 */
export const machineArgs = (): { token: string } => ({
  token: process.env.OFFICE_MACHINE_TOKEN ?? "",
});
