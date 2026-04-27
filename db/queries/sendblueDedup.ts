import { queryOne, execute } from "../client.js";

/** Atomically claim a handle. Returns true if this caller got the claim. */
export async function claimHandle(handle: string): Promise<boolean> {
  // Use INSERT ... ON CONFLICT DO NOTHING; rows returned = 1 means claimed
  const res = await queryOne<{ handle: string }>(
    `INSERT INTO sendblue_dedup (handle, claimed_at)
     VALUES ($1, $2)
     ON CONFLICT (handle) DO NOTHING
     RETURNING handle`,
    [handle, Date.now()],
  );
  return res !== undefined;
}
