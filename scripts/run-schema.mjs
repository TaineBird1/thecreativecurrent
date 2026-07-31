import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = postgres(process.env.POSTGRES_URL_NON_POOLING, { prepare: false });

const schema = readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");

try {
  await sql.unsafe(schema);
  console.log("Schema applied successfully.");

  const result = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'leads'
    ORDER BY ordinal_position
  `;
  console.log("leads table columns:");
  for (const row of result) {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  }
} catch (err) {
  console.error("Failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
