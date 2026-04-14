# Boop

An iMessage-based personal agent built on top of the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview).

📺 **Watch the walkthrough:** [YouTube — How I built Boop](https://www.youtube.com/watch?v=3Rc4MlMJMNU)

> **This is a starting point, not a finished product.**
> It's the architecture I built for my own personal agent, opened up as a template so you can take it, text-enable your own Claude, and extend it however you want. The repo ships with example integrations (Gmail, Calendar, Notion, Slack) that are **commented out by default** — so first-run works with zero setup and you opt into tools as you need them.

```
 iMessage  →  Sendblue webhook  →  Interaction agent  →  Sub-agents (per task)
                                          │                    │
                                          ▼                    ▼
                                    Memory store  ←──  Integrations (your MCP tools)
```

Built on:
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) — the loop, tool use, sub-agents, MCP
- [Sendblue](https://sendblue.co) — iMessage in/out (free on their agent plan)
- [Convex](https://convex.dev) — real-time database for memory, agents, drafts
- Your [Claude Code](https://claude.com/code) subscription — no separate Anthropic API key required

---

## What you get

- **iMessage in / iMessage out** via Sendblue (with typing indicators and webhook dedup).
- **Dispatcher + workers** pattern: a lean interaction agent decides what to do, spawns focused sub-agents to actually do it.
- **Tiered memory** (short / long / permanent) with post-turn extraction, decay, and cleaning.
- **Vector search** for recall when you add an embeddings key (Voyage or OpenAI) — falls back to substring.
- **Memory consolidation** — a nightly proposer + judge pass that merges duplicates and resolves contradictions.
- **Automations** — the agent can schedule recurring work from a text ("every morning at 8 summarize my calendar") and push results back to iMessage.
- **Draft-and-send** — any external action stages a draft first; the agent only commits when the user confirms.
- **Heartbeat + retry** — stuck agents auto-fail, debug dashboard can retry.
- **OAuth flow** — connect Google and Slack with a click from the debug UI, tokens stored in Convex.
- **Integrations as MCP servers** — drop a folder into `/integrations/`, register it, your agent can use it.
- **Four working examples**: Google Calendar, Gmail, Notion, Slack.
- **Debug dashboard** (React + Vite) — chat, agents, automations, drafts, memories, events, connections.
- **Convex** for persistence — real-time, typed, free tier.
- **Uses your Claude Code subscription** — no separate Anthropic API key required.

---

## Prerequisites

You need accounts for these. Keep the tabs open — setup will ask for credentials from each.

| Service | Why | Free? |
|---|---|---|
| [Claude Code](https://claude.com/code) | Powers the agent. Install it, sign in once, the SDK uses your session. | Subscription required |
| [Sendblue](https://sendblue.co) | iMessage bridge. Get a number, grab API keys. | Free on their agent plan |
| [Convex](https://convex.dev) | Database + realtime. | Free tier is plenty |
| [ngrok](https://ngrok.com) or similar | Expose your local port so Sendblue can reach it. | Free tier works |

Integrations are **off by default**. First-run gives you a plain chat agent with memory + automations. Enable what you want when you want — see the table further down.

---

## Quickstart

```bash
# 1. Clone + install
git clone <your-fork-url> boop-agent
cd boop-agent
npm install

# 2. Install Claude Code (one-time, global) and sign in
npm install -g @anthropic-ai/claude-code
claude  # sign in, then Ctrl-C to exit

# 3. Interactive setup — writes .env.local, creates Convex deployment
npm run setup

# 4. Start everything (server + Convex dev + debug dashboard)
npm run dev

# 5. Expose your server so Sendblue can reach it
ngrok http 3456
# → point your Sendblue webhook at  https://<your-ngrok>.ngrok.app/sendblue/webhook
```

Text your Sendblue number. The agent replies.

Visit `http://localhost:5173` for the debug dashboard (chat, agents, memory, events). You can also chat from the dashboard's Chat tab without Sendblue.

**This is the full first-run.** You now have a working agent that chats, remembers, and schedules reminders. Enable integrations (Gmail, Calendar, Notion, Slack) when you want more — see the next section.

---

## Architecture in 30 seconds

```
┌─────────────┐    webhook     ┌─────────────────────┐
│   iMessage  │ ─────────────► │ Sendblue → /webhook │
└─────────────┘                └──────────┬──────────┘
                                          │
                                          ▼
                          ┌────────────────────────────┐
                          │    Interaction agent       │
                          │    (dispatcher only)       │
                          │  • recall / write_memory   │
                          │  • spawn_agent(...)        │
                          └────────┬────────┬──────────┘
                                   │        │
                   ┌───────────────┘        └──────────────┐
                   ▼                                       ▼
           ┌───────────────┐                      ┌──────────────┐
           │   Memory      │                      │  Execution   │
           │ (Convex)      │                      │  agent(s)    │
           │ + cleaning    │                      │  + integrations│
           └───────────────┘                      └──────────────┘
```

- **Interaction agent** (`server/interaction-agent.ts`) is the front door. It reads the user's message + recent history, optionally calls `recall`, writes memories, creates automations, and decides whether to answer directly or spawn a sub-agent.
- **Execution agent** (`server/execution-agent.ts`) is spawned per task. It loads only the integrations it needs and returns a tight answer.
- **Memory** (`server/memory/`) handles writes, recall, post-turn extraction, and daily cleaning. Stored in Convex.
- **Automations** (`server/automations.ts`) poll every 30s for due jobs, spawn an execution agent to run them, and push results back to the user.
- **Integrations** (`/integrations/`) are MCP servers. The `google-calendar` and `notion` folders are working examples.

Deep dive: [ARCHITECTURE.md](./ARCHITECTURE.md). Adding your own tools: [INTEGRATIONS.md](./INTEGRATIONS.md).

---

## Using your Claude Code subscription

The Claude Agent SDK reuses the credentials Claude Code writes to your machine when you sign in. You do not need an `ANTHROPIC_API_KEY`.

- Install once: `npm install -g @anthropic-ai/claude-code`
- Run `claude` in a terminal, sign in.
- That's it — the SDK finds the session automatically.

If you'd prefer an API key (e.g. for a deployed server), set `ANTHROPIC_API_KEY` in `.env.local` and the SDK will use it instead.

---

## Environment variables

Everything lives in `.env.local` (auto-created by `npm run setup`). See `.env.example` for the full list.

| Var | Required | Notes |
|---|---|---|
| `CONVEX_URL` / `VITE_CONVEX_URL` | yes | Convex deployment URL. Written by `npx convex dev`. |
| `SENDBLUE_API_KEY` / `SENDBLUE_API_SECRET` | yes | From your Sendblue dashboard. |
| `SENDBLUE_FROM_NUMBER` | yes | Your Sendblue-provisioned number. |
| `BOOP_MODEL` | no | Default `claude-sonnet-4-6`. |
| `PORT` | no | Default `3456`. |
| `PUBLIC_URL` | no | Needed for OAuth callbacks and Sendblue webhook URL. |
| `VOYAGE_API_KEY` **or** `OPENAI_API_KEY` | optional | Unlocks vector recall. Falls back to substring. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | OAuth for Calendar + Gmail. Needed for "Connect Google" in the dashboard. |
| `GOOGLE_REFRESH_TOKEN` | optional | Alternative to OAuth — static token for personal use. |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | optional | OAuth for Slack. |
| `SLACK_BOT_TOKEN` / `SLACK_USER_TOKEN` | optional | Alternative to OAuth — static tokens. |
| `NOTION_TOKEN` | optional | Internal-integration token. |
| `ANTHROPIC_API_KEY` | optional | Bypass the Claude Code subscription. |

---

## Turning on the example integrations

Four examples ship disabled. To enable one:

1. Open `server/integrations/registry.ts`.
2. Uncomment its `import(...)` line in the `loaders` array.
3. Add the env vars in `.env.local` — see each integration's README.
4. Restart the server.

| Integration | Required env | Docs |
|---|---|---|
| Google Calendar | `GOOGLE_REFRESH_TOKEN` + client id/secret **or** OAuth via the Connections tab | [integrations/google-calendar/README.md](./integrations/google-calendar/README.md) |
| Gmail | same as Calendar (both ride the same Google OAuth) | [integrations/gmail/README.md](./integrations/gmail/README.md) |
| Notion | `NOTION_TOKEN` (internal integration) | [integrations/notion/README.md](./integrations/notion/README.md) |
| Slack | `SLACK_BOT_TOKEN` **or** OAuth via the Connections tab | [integrations/slack/README.md](./integrations/slack/README.md) |

## Adding your own integration

Copy the skeleton:

```bash
cp -r integrations/_template integrations/my-thing
# edit integrations/my-thing/index.ts — rename, add tools, uncomment opts.registerIntegration(mod)
# then add import("../../integrations/my-thing/index.js") to loaders[] in server/integrations/registry.ts
```

Each integration is an MCP server. Each `tool(name, description, schema, handler)` call becomes a callable the sub-agent can use. Tool descriptions are the spec — the model reads them to choose when to call what. Full guide: [INTEGRATIONS.md](./INTEGRATIONS.md).

---

## Project layout

```
boop-agent/
├── server/
│   ├── index.ts                   # Express + WS + HTTP routes
│   ├── sendblue.ts                # iMessage webhook, reply, typing indicator
│   ├── interaction-agent.ts       # Dispatcher
│   ├── execution-agent.ts         # Sub-agent runner
│   ├── automations.ts             # Cron loop
│   ├── automation-tools.ts        # create/list/toggle/delete MCP
│   ├── draft-tools.ts             # save_draft / send_draft / reject_draft MCP
│   ├── heartbeat.ts               # Stale-agent sweep
│   ├── consolidation.ts           # Proposer + judge pipeline
│   ├── embeddings.ts              # Voyage / OpenAI wrapper
│   ├── oauth.ts                   # OAuth routes for Google + Slack
│   ├── broadcast.ts               # WS fanout
│   ├── convex-client.ts           # Convex HTTP client
│   ├── memory/
│   │   ├── types.ts
│   │   ├── tools.ts               # write_memory / recall (vector + substring)
│   │   ├── extract.ts             # Post-turn extraction
│   │   └── clean.ts               # Decay + archive + prune
│   └── integrations/
│       └── registry.ts            # Integration loader
├── integrations/
│   ├── _template/                 # Copy this to add your own
│   ├── google-calendar/
│   ├── gmail/
│   ├── notion/
│   └── slack/
├── convex/
│   ├── schema.ts                  # 7 tables
│   ├── messages.ts
│   ├── memoryRecords.ts
│   ├── agents.ts
│   ├── automations.ts
│   ├── consolidation.ts
│   ├── connections.ts
│   ├── conversations.ts
│   ├── drafts.ts
│   ├── memoryEvents.ts
│   └── sendblueDedup.ts
├── debug/                         # Dashboard (chat, agents, memory, events)
├── scripts/setup.ts               # Interactive setup CLI
├── README.md           ← you are here
├── ARCHITECTURE.md
└── INTEGRATIONS.md
```

---

## Troubleshooting

**Agent doesn't reply.**
- Check the server is running: `curl http://localhost:3456/health`
- Check the Sendblue webhook is pointed at `<public-url>/sendblue/webhook`
- Watch server logs. Look for `[sendblue]` and `[interaction]` messages.

**Convex errors / `VITE_CONVEX_URL is not set`.**
- Run `npx convex dev` manually. Ensure `.env.local` has both `CONVEX_URL` and `VITE_CONVEX_URL`.

**Agent replies but can't use my integration.**
- Check it's registered — `server/integrations/registry.ts` imports list.
- Check the `register()` function actually calls `opts.registerIntegration(mod)` (not commented out).
- Check required env vars are set. Tools return an auth error if the token is missing.

**I want to skip Sendblue for now.**
- Use the debug dashboard's Chat tab (`http://localhost:5173`) — it sends to `/chat` directly, no SMS needed.

**Claude SDK says no credentials.**
- Run `claude` once and sign in, or set `ANTHROPIC_API_KEY` in `.env.local`.

---

## License

MIT. Build whatever you want on top of this.
