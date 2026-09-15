"use client";
/**
 * `useQuery`, `useMutation` and `useAction`, with the session token attached.
 *
 * Every public Convex function now takes a `token` and refuses to run without
 * a live session (convex/lib/authed.ts). Rather than thread that through
 * seventy-odd call sites by hand — and rather than rely on nobody ever
 * forgetting it — these read it once and merge it in.
 *
 * The token is the same one the passcode gate stores. Gate only renders the
 * office once it has verified it, so by the time any of these run there is one
 * to send; a stale or revoked token gets a clear "not signed in" from the
 * server rather than an empty screen.
 *
 * Deliberately the same names, one prefix apart, so a raw `useQuery` left
 * behind stands out in a diff — and would fail to typecheck anyway, since the
 * real function now demands a `token` the caller is not passing.
 */
import {
  useQuery as useConvexQuery,
  useMutation as useConvexMutation,
  useAction as useConvexAction,
} from "convex/react";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";

/** Must match convex/auth.ts's storage key in app/components/Gate.tsx. */
const TOKEN_KEY = "tcc-office-token";

function readToken(): string {
  // localStorage throws in a few real situations — private browsing with site
  // data blocked, an iframe with third-party storage disabled. An empty string
  // is the honest answer, and the server turns it into "not signed in".
  try {
    return localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * What a caller supplies: everything the function takes, minus the token.
 *
 * Written inline per hook rather than as a shared alias — a generic alias here
 * needs a constraint TypeScript will not let us spell without `any`, and each
 * hook already constrains its own reference precisely.
 */

export function useAuthedQuery<Q extends FunctionReference<"query">>(
  ref: Q,
  args: Omit<FunctionArgs<Q>, "token"> | "skip" = {} as Omit<FunctionArgs<Q>, "token">,
): FunctionReturnType<Q> | undefined {
  const withToken =
    args === "skip" ? "skip" : ({ ...args, token: readToken() } as FunctionArgs<Q>);
  // The generated signature is a rest parameter whose shape depends on whether
  // the function takes arguments at all; it cannot see that this object is the
  // right one for every Q at once.
  return (useConvexQuery as (r: Q, a: unknown) => FunctionReturnType<Q> | undefined)(
    ref,
    withToken,
  );
}

export function useAuthedMutation<M extends FunctionReference<"mutation">>(
  ref: M,
): (args?: Omit<FunctionArgs<M>, "token">) => Promise<FunctionReturnType<M>> {
  const run = useConvexMutation(ref) as (a: unknown) => Promise<FunctionReturnType<M>>;
  return (args = {} as Omit<FunctionArgs<M>, "token">) =>
    run({ ...args, token: readToken() });
}

export function useAuthedAction<A extends FunctionReference<"action">>(
  ref: A,
): (args?: Omit<FunctionArgs<A>, "token">) => Promise<FunctionReturnType<A>> {
  const run = useConvexAction(ref) as (a: unknown) => Promise<FunctionReturnType<A>>;
  return (args = {} as Omit<FunctionArgs<A>, "token">) =>
    run({ ...args, token: readToken() });
}
