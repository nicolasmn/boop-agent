import { execute } from "../client.js";

export async function createConsolidationRun(opts: { runId: string; trigger: string }): Promise<void> {
  await execute(
    `INSERT INTO consolidation_runs
       (run_id, trigger, status, proposals_count, merged_count, pruned_count, started_at)
     VALUES ($1,$2,'running',0,0,0,$3)`,
    [opts.runId, opts.trigger, Date.now()],
  );
}

export async function updateConsolidationRun(opts: {
  runId: string;
  status?: "completed" | "failed";
  proposalsCount?: number;
  mergedCount?: number;
  prunedCount?: number;
  notes?: string;
  details?: string;
}): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown) => { sets.push(`${col} = $${i++}`); vals.push(val); };
  if (opts.status !== undefined) { add("status", opts.status); add("completed_at", Date.now()); }
  if (opts.proposalsCount !== undefined) add("proposals_count", opts.proposalsCount);
  if (opts.mergedCount !== undefined) add("merged_count", opts.mergedCount);
  if (opts.prunedCount !== undefined) add("pruned_count", opts.prunedCount);
  if (opts.notes !== undefined) add("notes", opts.notes);
  if (opts.details !== undefined) add("details", opts.details);
  if (!sets.length) return;
  vals.push(opts.runId);
  await execute(`UPDATE consolidation_runs SET ${sets.join(", ")} WHERE run_id = $${i}`, vals);
}
