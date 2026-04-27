import { query, queryOne, execute } from "../client.js";

export interface MemoryRecord {
  memoryId: string;
  content: string;
  tier: "short" | "long" | "permanent";
  segment: "identity" | "preference" | "correction" | "relationship" | "project" | "knowledge" | "context";
  importance: number;
  decayRate: number;
  accessCount: number;
  lastAccessedAt: number;
  sourceTurn?: string;
  lifecycle: "active" | "archived" | "pruned";
  supersedes?: string[];
  embedding?: number[];
  metadata?: string;
  createdAt: number;
}

function rowToRecord(r: Record<string, unknown>): MemoryRecord {
  return {
    memoryId: r.memory_id as string,
    content: r.content as string,
    tier: r.tier as MemoryRecord["tier"],
    segment: r.segment as MemoryRecord["segment"],
    importance: Number(r.importance),
    decayRate: Number(r.decay_rate),
    accessCount: Number(r.access_count),
    lastAccessedAt: Number(r.last_accessed_at),
    sourceTurn: (r.source_turn as string | null) ?? undefined,
    lifecycle: r.lifecycle as MemoryRecord["lifecycle"],
    supersedes: (r.supersedes as string[] | null) ?? undefined,
    embedding: (r.embedding as number[] | null) ?? undefined,
    metadata: (r.metadata as string | null) ?? undefined,
    createdAt: Number(r.created_at),
  };
}

export async function upsertMemory(opts: {
  memoryId: string;
  content: string;
  tier: MemoryRecord["tier"];
  segment: MemoryRecord["segment"];
  importance: number;
  decayRate: number;
  supersedes?: string[];
  sourceTurn?: string;
  embedding?: number[];
  metadata?: string;
}): Promise<void> {
  const embeddingLiteral = opts.embedding ? `'[${opts.embedding.join(",")}]'::vector` : "NULL";
  const now = Date.now();
  // Archive superseded memories first
  if (opts.supersedes?.length) {
    await execute(
      `UPDATE memory_records SET lifecycle = 'archived'
       WHERE memory_id = ANY($1::text[])`,
      [opts.supersedes],
    );
  }
  await execute(
    `INSERT INTO memory_records
       (memory_id, content, tier, segment, importance, decay_rate, access_count,
        last_accessed_at, source_turn, lifecycle, supersedes, embedding, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,'active',$9,${embeddingLiteral},$10,$11)
     ON CONFLICT (memory_id) DO UPDATE SET
       content          = EXCLUDED.content,
       tier             = EXCLUDED.tier,
       segment          = EXCLUDED.segment,
       importance       = EXCLUDED.importance,
       decay_rate       = EXCLUDED.decay_rate,
       supersedes       = EXCLUDED.supersedes,
       embedding        = ${embeddingLiteral},
       metadata         = EXCLUDED.metadata`,
    [
      opts.memoryId, opts.content, opts.tier, opts.segment,
      opts.importance, opts.decayRate, now,
      opts.sourceTurn ?? null, opts.supersedes ?? null,
      opts.metadata ?? null, now,
    ],
  );
}

export async function markAccessed(memoryId: string): Promise<void> {
  await execute(
    `UPDATE memory_records
     SET access_count = access_count + 1, last_accessed_at = $1
     WHERE memory_id = $2`,
    [Date.now(), memoryId],
  );
}

export async function setLifecycle(
  memoryId: string,
  lifecycle: MemoryRecord["lifecycle"],
): Promise<void> {
  await execute(
    `UPDATE memory_records SET lifecycle = $1 WHERE memory_id = $2`,
    [lifecycle, memoryId],
  );
}

export async function listMemories(opts: {
  lifecycle: MemoryRecord["lifecycle"];
  limit?: number;
}): Promise<MemoryRecord[]> {
  const rows = await query(
    `SELECT * FROM memory_records WHERE lifecycle = $1 ORDER BY created_at DESC LIMIT $2`,
    [opts.lifecycle, opts.limit ?? 500],
  );
  return rows.map(rowToRecord);
}

export async function searchMemories(opts: {
  query: string;
  limit?: number;
}): Promise<MemoryRecord[]> {
  const rows = await query(
    `SELECT * FROM memory_records
     WHERE lifecycle = 'active' AND content ILIKE $1
     ORDER BY importance DESC
     LIMIT $2`,
    [`%${opts.query}%`, opts.limit ?? 10],
  );
  return rows.map(rowToRecord);
}

export async function vectorSearchMemories(opts: {
  embedding: number[];
  limit?: number;
}): Promise<Array<{ score: number; record: MemoryRecord }>> {
  const vec = `[${opts.embedding.join(",")}]`;
  const rows = await query<Record<string, unknown>>(
    `SELECT *, 1 - (embedding <=> $1::vector) AS score
     FROM memory_records
     WHERE lifecycle = 'active' AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vec, opts.limit ?? 10],
  );
  return rows.map((r) => ({ score: Number(r.score), record: rowToRecord(r) }));
}

export async function getMemory(memoryId: string): Promise<MemoryRecord | undefined> {
  const r = await queryOne(
    `SELECT * FROM memory_records WHERE memory_id = $1`,
    [memoryId],
  );
  return r ? rowToRecord(r as Record<string, unknown>) : undefined;
}
