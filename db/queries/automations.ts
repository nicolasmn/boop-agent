import { query, execute } from "../client.js";

export interface AutomationRow {
  automationId: string;
  name: string;
  task: string;
  integrations: string[];
  schedule: string;
  enabled: boolean;
  conversationId?: string;
  notifyConversationId?: string;
  lastRunAt?: number;
  nextRunAt?: number;
  createdAt: number;
}

function rowToAutomation(r: Record<string, unknown>): AutomationRow {
  return {
    automationId: r.automation_id as string,
    name: r.name as string,
    task: r.task as string,
    integrations: (r.integrations as string[]) ?? [],
    schedule: r.schedule as string,
    enabled: r.enabled as boolean,
    conversationId: (r.conversation_id as string | null) ?? undefined,
    notifyConversationId: (r.notify_conversation_id as string | null) ?? undefined,
    lastRunAt: r.last_run_at != null ? Number(r.last_run_at) : undefined,
    nextRunAt: r.next_run_at != null ? Number(r.next_run_at) : undefined,
    createdAt: Number(r.created_at),
  };
}

export async function createAutomation(opts: {
  automationId: string;
  name: string;
  task: string;
  integrations: string[];
  schedule: string;
  conversationId?: string;
  notifyConversationId?: string;
  nextRunAt?: number;
}): Promise<void> {
  await execute(
    `INSERT INTO automations
       (automation_id, name, task, integrations, schedule, enabled,
        conversation_id, notify_conversation_id, next_run_at, created_at)
     VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9)`,
    [
      opts.automationId, opts.name, opts.task, opts.integrations, opts.schedule,
      opts.conversationId ?? null, opts.notifyConversationId ?? null,
      opts.nextRunAt ?? null, Date.now(),
    ],
  );
}

export async function listAutomations(enabledOnly = false): Promise<AutomationRow[]> {
  const rows = await query(
    enabledOnly
      ? `SELECT * FROM automations WHERE enabled = TRUE ORDER BY created_at`
      : `SELECT * FROM automations ORDER BY created_at`,
  );
  return rows.map((r) => rowToAutomation(r as Record<string, unknown>));
}

export async function setAutomationEnabled(automationId: string, enabled: boolean): Promise<boolean> {
  const res = await query(
    `UPDATE automations SET enabled = $1 WHERE automation_id = $2 RETURNING automation_id`,
    [enabled, automationId],
  );
  return res.length > 0;
}

export async function removeAutomation(automationId: string): Promise<boolean> {
  const res = await query(
    `DELETE FROM automations WHERE automation_id = $1 RETURNING automation_id`,
    [automationId],
  );
  return res.length > 0;
}

export async function markAutomationRan(opts: {
  automationId: string;
  lastRunAt: number;
  nextRunAt?: number;
}): Promise<void> {
  await execute(
    `UPDATE automations SET last_run_at = $1, next_run_at = $2 WHERE automation_id = $3`,
    [opts.lastRunAt, opts.nextRunAt ?? null, opts.automationId],
  );
}

export async function createAutomationRun(opts: { runId: string; automationId: string }): Promise<void> {
  await execute(
    `INSERT INTO automation_runs (run_id, automation_id, status, started_at) VALUES ($1,$2,'running',$3)`,
    [opts.runId, opts.automationId, Date.now()],
  );
}

export async function updateAutomationRun(opts: {
  runId: string;
  status: "completed" | "failed";
  result?: string;
  error?: string;
  agentId?: string;
}): Promise<void> {
  await execute(
    `UPDATE automation_runs
     SET status=$1, result=$2, error=$3, agent_id=$4, completed_at=$5
     WHERE run_id=$6`,
    [opts.status, opts.result ?? null, opts.error ?? null, opts.agentId ?? null, Date.now(), opts.runId],
  );
}
