import { execute } from "../client.js";

export async function emitMemoryEvent(opts: {
  eventType: string;
  conversationId?: string;
  memoryId?: string;
  agentId?: string;
  data: string;
}): Promise<void> {
  await execute(
    `INSERT INTO memory_events (event_type, conversation_id, memory_id, agent_id, data, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      opts.eventType,
      opts.conversationId ?? null,
      opts.memoryId ?? null,
      opts.agentId ?? null,
      opts.data,
      Date.now(),
    ],
  );
}
