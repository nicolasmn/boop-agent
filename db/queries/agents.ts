import { query, queryOne, execute } from "../client.js";

export interface AgentRow {
  agentId: string;
  conversationId?: string;
  name: string;
  task: string;
  status: "spawned" | "running" | "completed" | "failed" | "cancelled";
  result?: string;
  error?: string;
  mcpServers: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd: number;
  startedAt: number;
  completedAt?: number;
}

function rowToAgent(r: Record<string, unknown>): AgentRow {
  return {
    agentId: r.agent_id as string,
    conversationId: (r.conversation_id as string | null) ?? undefined,
    name: r.name as string,
    task: r.task as string,
    status: r.status as AgentRow["status"],
    result: (r.result as string | null) ?? undefined,
    error: (r.error as string | null) ?? undefined,
    mcpServers: (r.mcp_servers as string[]) ?? [],
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    cacheReadTokens: r.cache_read_tokens != null ? Number(r.cache_read_tokens) : undefined,
    cacheCreationTokens: r.cache_creation_tokens != null ? Number(r.cache_creation_tokens) : undefined,
    costUsd: Number(r.cost_usd),
    startedAt: Number(r.started_at),
    completedAt: r.completed_at != null ? Number(r.completed_at) : undefined,
  };
}

export async function createAgent(opts: {
  agentId: string;
  conversationId?: string;
  name: string;
  task: string;
  mcpServers: string[];
}): Promise<void> {
  await execute(
    `INSERT INTO execution_agents
       (agent_id, conversation_id, name, task, status, mcp_servers,
        input_tokens, output_tokens, cost_usd, started_at)
     VALUES ($1,$2,$3,$4,'spawned',$5,0,0,0,$6)`,
    [opts.agentId, opts.conversationId ?? null, opts.name, opts.task, opts.mcpServers, Date.now()],
  );
}

export async function updateAgent(opts: {
  agentId: string;
  status?: AgentRow["status"];
  result?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
}): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const add = (col: string, val: unknown) => { sets.push(`${col} = $${i++}`); vals.push(val); };
  if (opts.status !== undefined) add("status", opts.status);
  if (opts.result !== undefined) add("result", opts.result);
  if (opts.error !== undefined) add("error", opts.error);
  if (opts.inputTokens !== undefined) add("input_tokens", opts.inputTokens);
  if (opts.outputTokens !== undefined) add("output_tokens", opts.outputTokens);
  if (opts.cacheReadTokens !== undefined) add("cache_read_tokens", opts.cacheReadTokens);
  if (opts.cacheCreationTokens !== undefined) add("cache_creation_tokens", opts.cacheCreationTokens);
  if (opts.costUsd !== undefined) add("cost_usd", opts.costUsd);
  if (["completed", "failed", "cancelled"].includes(opts.status ?? "")) add("completed_at", Date.now());
  if (!sets.length) return;
  vals.push(opts.agentId);
  await execute(`UPDATE execution_agents SET ${sets.join(", ")} WHERE agent_id = $${i}`, vals);
}

export async function addAgentLog(opts: {
  agentId: string;
  logType: "thinking" | "tool_use" | "tool_result" | "text" | "error";
  toolName?: string;
  content: string;
}): Promise<void> {
  await execute(
    `INSERT INTO agent_logs (agent_id, log_type, tool_name, content, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [opts.agentId, opts.logType, opts.toolName ?? null, opts.content, Date.now()],
  );
}

export async function getAgent(agentId: string): Promise<AgentRow | undefined> {
  const r = await queryOne(
    `SELECT * FROM execution_agents WHERE agent_id = $1`,
    [agentId],
  );
  return r ? rowToAgent(r as Record<string, unknown>) : undefined;
}
