import postgres from "postgres";

let client: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!client) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error("POSTGRES_URL is not set");
    }
    // Supabase's pooled connection runs pgbouncer in transaction mode,
    // which doesn't support prepared statements.
    client = postgres(connectionString, { max: 1, prepare: false });
  }
  return client;
}
