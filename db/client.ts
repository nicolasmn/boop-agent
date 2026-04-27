import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local.\n" +
    "Example: DATABASE_URL=postgres://boop:boop_dev@localhost:5432/boop",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

/** Convenience wrapper — runs a parameterised query and returns rows. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query<T>(sql, params as pg.QueryConfigValues<unknown[]>);
  return res.rows;
}

/** Runs a query and returns the first row (or undefined). */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}

/** Runs a query and returns nothing (INSERT/UPDATE/DELETE). */
export async function execute(sql: string, params?: unknown[]): Promise<void> {
  await pool.query(sql, params as pg.QueryConfigValues<unknown[]>);
}
