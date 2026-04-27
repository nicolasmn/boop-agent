import { query, execute } from "../db/client.js";
import { cancelAgent, runningAgentIds } from "./execution-agent.js";
import { broadcast } from "./broadcast.js";

const STALE_MS = 15 * 60 * 1000;

export async function sweepStaleAgents(): Promise<void> {
  const rows = await query<Record<string, unknown>>(
    `SELECT agent_id, started_at FROM execution_agents
     WHERE status = 'running'
     LIMIT 100`,
  );
  const now = Date.now();
  const live = new Set(runningAgentIds());

  for (const row of rows) {
    const agentId = row.agent_id as string;
    const startedAt = Number(row.started_at);
    const age = now - startedAt;
    if (age < STALE_MS) continue;

    if (live.has(agentId)) {
      cancelAgent(agentId);
    }
    await execute(
      `UPDATE execution_agents SET status='failed', error=$1, completed_at=$2 WHERE agent_id=$3`,
      [`Marked failed after ${Math.round(age / 1000)}s (stale heartbeat).`, now, agentId],
    );
    broadcast("agent_stale", { agentId });
  }
}

export function startHeartbeatLoop(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    sweepStaleAgents().catch((err) => console.error("[heartbeat] sweep error", err));
  }, intervalMs);
  return () => clearInterval(timer);
}
