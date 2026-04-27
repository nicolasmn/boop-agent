import { query, queryOne, execute } from "../client.js";

export interface DraftRow {
  draftId: string;
  conversationId: string;
  kind: string;
  summary: string;
  payload: string;
  status: "pending" | "sent" | "rejected" | "expired";
  createdAt: number;
  decidedAt?: number;
}

function rowToDraft(r: Record<string, unknown>): DraftRow {
  return {
    draftId: r.draft_id as string,
    conversationId: r.conversation_id as string,
    kind: r.kind as string,
    summary: r.summary as string,
    payload: r.payload as string,
    status: r.status as DraftRow["status"],
    createdAt: Number(r.created_at),
    decidedAt: r.decided_at != null ? Number(r.decided_at) : undefined,
  };
}

export async function createDraft(opts: {
  draftId: string;
  conversationId: string;
  kind: string;
  summary: string;
  payload: string;
}): Promise<void> {
  await execute(
    `INSERT INTO drafts (draft_id, conversation_id, kind, summary, payload, status, created_at)
     VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
    [opts.draftId, opts.conversationId, opts.kind, opts.summary, opts.payload, Date.now()],
  );
}

export async function pendingDraftsByConversation(conversationId: string): Promise<DraftRow[]> {
  const rows = await query(
    `SELECT * FROM drafts WHERE conversation_id=$1 AND status='pending' ORDER BY created_at`,
    [conversationId],
  );
  return rows.map((r) => rowToDraft(r as Record<string, unknown>));
}

export async function getDraft(draftId: string): Promise<DraftRow | undefined> {
  const r = await queryOne(
    `SELECT * FROM drafts WHERE draft_id=$1`,
    [draftId],
  );
  return r ? rowToDraft(r as Record<string, unknown>) : undefined;
}

export async function setDraftStatus(
  draftId: string,
  status: "sent" | "rejected" | "expired",
): Promise<void> {
  await execute(
    `UPDATE drafts SET status=$1, decided_at=$2 WHERE draft_id=$3`,
    [status, Date.now(), draftId],
  );
}
