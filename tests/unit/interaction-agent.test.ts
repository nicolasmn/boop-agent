/**
 * Unit tests for message routing logic in interaction-agent.
 * Claude SDK and DB are mocked — tests cover pure orchestration.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../server/convex-client.js', () => ({
  getConversation: vi.fn().mockResolvedValue(null),
  saveConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
  appendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  ClaudeAgent: vi.fn().mockImplementation(() => ({
    run: vi.fn().mockResolvedValue({ output: 'pong', usage: { input_tokens: 5, output_tokens: 3 } }),
  })),
}));

describe('handleUserMessage', () => {
  it('returns agent reply for valid input', async () => {
    const { handleUserMessage } = await import('../../server/interaction-agent.js');
    const reply = await handleUserMessage({ conversationId: 'test-1', content: 'ping' });
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
  });

  it('throws when content is empty', async () => {
    const { handleUserMessage } = await import('../../server/interaction-agent.js');
    await expect(handleUserMessage({ conversationId: 'test-2', content: '' }))
      .rejects.toThrow();
  });
});
