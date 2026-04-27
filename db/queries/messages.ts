import { query, execute } from "../client.js";

export interface MessageRow {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: string;
  turnId?: string;
  createdAt: number;
}

export async function sendMessage(opts: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: string;
  turnId?: string;
}): Promise<void> {
  await execute(
    `INSERT INTO messages (conversation_id, role, content, agent_id, turn_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [opts.conversationId, opts.role, opts.content, opts.agentId ?? null, opts.turnId ?? null, Date.now()],
  );
  // upsert conversation tracker
  await execute(
    `INSERT INTO conversations (conversation_id, message_count, last_activity_at)
     VALUES ($1, 1, $2)
     ON CONFLICT (conversation_id) DO UPDATE
       SET message_count    = conversations.message_count + 1,
           last_activity_at = EXCLUDED.last_activity_at`,
    [opts.conversationId, Date.now()],
  );
}

export async function recentMessages(
  conversationId: string,
  limit = 10,
): Promise<MessageRow[]> {
  const rows = await query<{
    conversation_id: string; role: string; content: string;
    agent_id: string | null; turn_id: string | null; created_at: string;
  }>(
    `SELECT conversation_id, role, content, agent_id, turn_id, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [conversationId, limit],
  );
  return rows.reverse().map((r) => ({
    conversationId: r.conversation_id,
    role: r.role as MessageRow["role"],
    content: r.content,
    agentId: r.agent_id ?? undefined,
    turnId: r.turn_id ?? undefined,
    createdAt: Number(r.created_at),
  }));
}
