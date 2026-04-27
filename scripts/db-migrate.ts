/**
 * Minimal migration runner.
 * Applies SQL files in db/migrations/ in lexicographic order,
 * skipping any already recorded in the migrations_log table.
 *
 * Usage: npm run db:migrate
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "./load-env.js";
import { pool } from "../db/client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../db/migrations");

async function run(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        name TEXT PRIMARY KEY,
        applied_at BIGINT NOT NULL
      )
    `);

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        `SELECT 1 FROM migrations_log WHERE name = $1`,
        [file],
      );
      if (rows.length > 0) {
        console.log(`  skip  ${file}`);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      console.log(`  apply ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO migrations_log (name, applied_at) VALUES ($1, $2)`,
          [file, Date.now()],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("migrations done");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("migration failed", err);
  process.exit(1);
});
