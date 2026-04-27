/**
 * Integration tests for DB layer (Postgres).
 * Runs against real Postgres via DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../server/db.js';

beforeAll(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
});

afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS conversations');
  await pool.end();
});

describe('conversations table', () => {
  it('inserts and retrieves a conversation', async () => {
    const id = `test-${Date.now()}`;
    await pool.query('INSERT INTO conversations(id, data) VALUES($1,$2)', [id, { messages: [] }]);
    const { rows } = await pool.query('SELECT * FROM conversations WHERE id=$1', [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
  });
});
