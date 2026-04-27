import { execute } from "../client.js";

export async function recordUsage(opts: {
  source: "dispatcher" | "execution" | "extract" | "consolidation-proposer" | "consolidation-adversary" | "consolidation-judge";
  conversationId?: string;
  turnId?: string;
  agentId?: string;
  runId?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  durationMs: number;
}): Promise<void> {
  await execute(
    `INSERT INTO usage_records
       (source, conversation_id, turn_id, agent_id, run_id, model,
        input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
        cost_usd, duration_ms, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      opts.source,
      opts.conversationId ?? null,
      opts.turnId ?? null,
      opts.agentId ?? null,
      opts.runId ?? null,
      opts.model,
      opts.inputTokens,
      opts.outputTokens,
      opts.cacheReadTokens,
      opts.cacheCreationTokens,
      opts.costUsd,
      opts.durationMs,
      Date.now(),
    ],
  );
}
