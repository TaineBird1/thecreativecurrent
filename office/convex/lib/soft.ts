/**
 * Soft delete helpers. Bots never delete data — that is a standing rule, not a
 * preference — so every read goes through one of these and every "delete" sets
 * a timestamp.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";

export function now(): number {
  return Date.now();
}

/** Timestamp columns for a freshly inserted row. */
export function stamps(): { createdAt: number; updatedAt: number } {
  const t = now();
  return { createdAt: t, updatedAt: t };
}

export function touch(): { updatedAt: number } {
  return { updatedAt: now() };
}

export function alive<T extends { deletedAt?: number }>(rows: T[]): T[] {
  return rows.filter((r) => r.deletedAt === undefined);
}

export function isAlive(row: { deletedAt?: number } | null): boolean {
  return row !== null && row.deletedAt === undefined;
}

/** Get a row only if it has not been soft-deleted. */
export async function getAlive<T extends TableNames>(
  ctx: QueryCtx | MutationCtx,
  id: Id<T>,
): Promise<Doc<T> | null> {
  const row = await ctx.db.get(id);
  if (!row || (row as { deletedAt?: number }).deletedAt !== undefined) return null;
  return row as Doc<T>;
}

/** The only "delete" in the codebase. */
export async function softDelete<T extends TableNames>(
  ctx: MutationCtx,
  id: Id<T>,
): Promise<void> {
  await ctx.db.patch(id, { deletedAt: now(), updatedAt: now() } as never);
}
