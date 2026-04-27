import express from "express";
import { api } from "../convex/_generated/api.js";
import { convex } from "./convex-client.js";
import { handleUserMessage } from "./interaction-agent.js";
import { broadcast } from "./broadcast.js";

const MAX_CHUNK = 4096; // Telegram message limit

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk(text: string, size = MAX_CHUNK): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split(/\n/)) {
    if ((buf + "\n" + line).length > size) {
      if (buf) out.push(buf);
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function botToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN ?? null;
}

async function telegramApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("[telegram] TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`[telegram] ${method} failed: ${json.description}`);
  return json.result;
}

// ---------------------------------------------------------------------------
// Public API (mirrors sendblue.ts interface)
// ---------------------------------------------------------------------------

export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  if (!botToken()) {
    console.warn("[telegram] missing TELEGRAM_BOT_TOKEN — not sending");
    return;
  }
  for (const part of chunk(text)) {
    try {
      await telegramApi("sendMessage", {
        chat_id: chatId,
        text: part,
        parse_mode: "Markdown",
      });
      console.log(`[telegram] → sent ${part.length} chars to ${chatId}`);
    } catch (err) {
      // Retry without parse_mode in case of Markdown parse error
      try {
        await telegramApi("sendMessage", { chat_id: chatId, text: part });
        console.log(`[telegram] → sent (plain) ${part.length} chars to ${chatId}`);
      } catch (err2) {
        console.error(`[telegram] send failed`, err2);
      }
    }
  }
}

export async function sendTypingAction(chatId: number | string): Promise<void> {
  try {
    await telegramApi("sendChatAction", { chat_id: chatId, action: "typing" });
  } catch {
    /* non-fatal */
  }
}

export function startTypingLoop(chatId: number | string): () => void {
  sendTypingAction(chatId);
  const timer = setInterval(() => sendTypingAction(chatId), 5000);
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------------------
// Message handler (shared between webhook + polling paths)
// ---------------------------------------------------------------------------

async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return;

  const chatId = msg.chat.id;
  const updateId = update.update_id;
  const conversationId = `telegram:${chatId}`;
  const turnTag = Math.random().toString(36).slice(2, 8);
  const preview = msg.text.length > 100 ? msg.text.slice(0, 100) + "…" : msg.text;
  console.log(`[turn ${turnTag}] ← telegram:${chatId}: ${JSON.stringify(preview)}`);
  const start = Date.now();

  // Dedup via Convex (reuse sendblueDedup table — handle is update_id)
  const handle = `tg:${updateId}`;
  try {
    const { claimed } = await convex.mutation(api.sendblueDedup.claim, { handle });
    if (!claimed) {
      console.log(`[turn ${turnTag}] deduped (update_id=${updateId})`);
      return;
    }
  } catch {
    // Table might not exist in all deployments — proceed without dedup
  }

  broadcast("message_in", { conversationId, content: msg.text, from_number: String(chatId) });

  const stopTyping = startTypingLoop(chatId);
  try {
    const reply = await handleUserMessage({
      conversationId,
      content: msg.text,
      turnTag,
      onThinking: (t) => broadcast("thinking", { conversationId, t }),
    });
    if (reply) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const replyPreview = reply.length > 100 ? reply.slice(0, 100) + "…" : reply;
      console.log(
        `[turn ${turnTag}] → reply (${elapsed}s, ${reply.length} chars): ${JSON.stringify(replyPreview)}`,
      );
      await sendTelegramMessage(chatId, reply);
      await convex.mutation(api.messages.send, {
        conversationId,
        role: "assistant",
        content: reply,
      });
    } else {
      console.log(`[turn ${turnTag}] → (no reply)`);
    }
  } catch (err) {
    console.error(`[turn ${turnTag}] handler error`, err);
  } finally {
    stopTyping();
  }
}

// ---------------------------------------------------------------------------
// Webhook router
// ---------------------------------------------------------------------------

export function createTelegramRouter(): express.Router {
  const router = express.Router();

  router.post("/webhook", async (req, res) => {
    // Optional secret token check
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secret) {
      const header = req.headers["x-telegram-bot-api-secret-token"];
      if (header !== secret) {
        res.status(403).json({ error: "invalid secret" });
        return;
      }
    }

    const update = req.body as TelegramUpdate;
    res.json({ ok: true }); // ACK immediately
    handleTelegramUpdate(update).catch((err) =>
      console.error("[telegram] webhook handler error", err),
    );
  });

  return router;
}

// ---------------------------------------------------------------------------
// Polling mode
// ---------------------------------------------------------------------------

export async function startPolling(): Promise<void> {
  const token = botToken();
  if (!token) {
    console.error("[telegram] TELEGRAM_BOT_TOKEN not set — polling disabled");
    return;
  }

  console.log("[telegram] starting long-poll loop…");
  let offset = 0;

  async function poll(): Promise<void> {
    try {
      const updates = await telegramApi<TelegramUpdate[]>("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "edited_message"],
      });
      for (const update of updates) {
        offset = update.update_id + 1;
        handleTelegramUpdate(update).catch((err) =>
          console.error("[telegram] poll handler error", err),
        );
      }
    } catch (err) {
      console.error("[telegram] poll error", err);
      await new Promise((r) => setTimeout(r, 5000)); // backoff
    }
    setImmediate(poll);
  }

  poll();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

interface TelegramMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
}
