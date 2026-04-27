/**
 * Integration tests: real Express server + real Postgres.
 * Claude calls are stubbed so no API costs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

// Stub Claude before server imports
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  ClaudeAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({ output: 'test-reply', usage: { input_tokens: 1, output_tokens: 1 } }),
  })),
}));

// Stub Telegram so no real HTTP
vi.mock('../../server/telegram.js', () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

let app: any;

beforeAll(async () => {
  const mod = await import('../../server/index.js');
  app = mod.app; // server/index.ts must export `app` for testing
});

aftherAll(async () => {
  // close DB pool if exported
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('POST /chat', () => {
  it('requires conversationId and content', async () => {
    const res = await request(app).post('/chat').send({});
    expect(res.status).toBe(400);
  });

  it('returns agent reply', async () => {
    const res = await request(app)
      .post('/chat')
      .send({ conversationId: 'integ-test-1', content: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('test-reply');
  });
});

describe('POST /telegram/webhook', () => {
  it('accepts valid Telegram update', async () => {
    const update = {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: 123456789, first_name: 'Test' },
        chat: { id: 123456789, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: 'hello agent',
      },
    };
    const res = await request(app)
      .post('/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', process.env.TELEGRAM_WEBHOOK_SECRET ?? 'ci-secret')
      .send(update);
    expect([200, 202]).toContain(res.status);
  });
});
