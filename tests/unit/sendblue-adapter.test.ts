/**
 * Unit tests for Telegram adapter (replacing Sendblue).
 * No real HTTP calls — adapter module is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the fetch used by the Telegram adapter
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Telegram adapter', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    process.env.TELEGRAM_BOT_TOKEN = '000:test';
    process.env.TELEGRAM_CHAT_ID = '123456';
  });

  it('sends message to Telegram API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { message_id: 1 } }),
    });

    // Dynamically import so env vars are already set
    const { sendMessage } = await import('../../server/telegram.js');
    await sendMessage('hello world');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('sendMessage');
    const body = JSON.parse(opts.body);
    expect(body.text).toBe('hello world');
    expect(body.chat_id).toBe('123456');
  });

  it('throws on Telegram API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, description: 'Unauthorized' }),
    });

    const { sendMessage } = await import('../../server/telegram.js');
    await expect(sendMessage('fail')).rejects.toThrow(/Unauthorized/);
  });
});
