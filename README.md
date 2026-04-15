<p align="center">
  <img src="assets/boop.png" alt="Boop" width="220" />
</p>

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

## Heads up before you use this

- **This was never meant to be open-sourced.** I built it for personal use and decided to share the architecture after enough people asked. It's not a product.
- **Not optimized for cost or security.** Use at your own risk. Review the code, set your own budgets, and don't trust it with anything you wouldn't trust yourself with.
- **I'm open to PRs for optimizations** — performance, bug fixes, DX improvements, new example integrations, better docs.
- **Claude Agent SDK is load-bearing.** I won't merge PRs that swap it out or add workarounds to run non-Anthropic models. This template exists specifically to show what you can build on top of the SDK. If you want to run this against a different model or provider, please fork — I'll happily link to good forks from here.

---

## What you get

- **iMessage in / iMessage out** via Sendblue (with typing indicators and webhook dedup).
- **Sendblue CLI integration** — `npm run dev` auto-registers the inbound webhook for you every restart (no re-pasting into the dashboard when free ngrok rotates your URL).
- **Dispatcher + workers** pattern: a lean interaction agent decides what to do, spawns focused sub-agents that actually do the work.
- **Pure dispatcher** — the interaction agent has only memory + spawn + automation + draft tools. Web access, files, and integrations are explicitly denied to it; sub-agents get `WebSearch` / `WebFetch` / the integrations.
- **Tiered memory** (short / long / permanent) with post-turn extraction, decay, and cleaning.
- **Vector search** for recall when you add an embeddings key (Voyage or OpenAI) — falls back to substring.
- **Memory consolidation** — a nightly proposer + judge pass that merges duplicates and resolves contradictions.
- **Automations** — the agent can schedule recurring work from a text ("every morning at 8 summarize my calendar") and push results back to iMessage.
- **Draft-and-send** — any external action stages a draft first; the agent only commits when the user confirms.
- **Heartbeat + retry** — stuck agents auto-fail, debug dashboard can retry.
- **OAuth flow** — connect Google and Slack with a click from the debug UI, tokens stored in Convex.
- **Integrations as MCP servers** — drop a folder into `/integrations/`, register it, your agent can use it.
- **Four working examples (off by default)**: Google Calendar, Gmail, Notion, Slack.
- **Debug dashboard** (React + Vite) with a Boop mascot — Dashboard (spend + tokens + agent status), Agents (timeline + integration logos), Automations, Memory (table + force-directed graph), Events, Connections.
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

# 4. Install ngrok (one-time) and authorize it
brew install ngrok
# or grab from https://ngrok.com/download
ngrok config add-authtoken <your-token>   # free at https://dashboard.ngrok.com

# 5. Start everything with one command — server, Convex, debug UI, and ngrok
npm run dev
```

`npm run dev` prints color-prefixed output from all four processes and shows a banner with your ngrok webhook URL once the tunnel is live.

```
Public URL:        https://<abc123>.ngrok.app
Sendblue webhook:  https://<abc123>.ngrok.app/sendblue/webhook
```

On free ngrok, **the webhook auto-registers with Sendblue every boot** — no manual paste needed. For stable URLs (ngrok reserved or Cloudflare Tunnel), set the webhook once in the dashboard.

Text your Sendblue-provisioned number from a **different** phone. The agent replies.

> **⚠ ngrok free plan gives you a new URL every time.** That means every time you restart `npm run dev`, your Sendblue webhook URL is dead until you paste the new one in.
>
> If you're going to run this for more than a quick demo, **strongly recommend one of:**
> - **ngrok paid plan** — gives you a reserved domain that stays the same forever
> - **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** — free, stable subdomain, a bit more setup
> - Any other tunnel with a static URL (Tailscale Funnel, localtunnel reserved, etc.)
>
> If you use a non-ngrok tunnel, point it at `localhost:3456` yourself — `npm run dev` will still run the rest, just ignore its ngrok output and use your tunnel's URL.

> **Gotcha:** `SENDBLUE_FROM_NUMBER` must be your Sendblue-provisioned number (the one people text TO), not your personal cell. Sendblue's API requires it, and misconfiguring it returns either "missing required parameter: from_number" or "Cannot send messages to self".
>
> **Fix in one command:** `npm run sendblue:sync` pulls the right number from the Sendblue CLI and writes it to `.env.local`.

---

## How the Sendblue integration works

Boop uses the [Sendblue CLI](https://github.com/sendblue-api/sendblue-cli) (`@sendblue/cli`) to eliminate almost all manual dashboard work. Three NPM scripts wrap it:

| Command | What it does |
|---|---|
| `npm run setup` | Interactive. Offers to run `sendblue login` / `sendblue setup` and pulls `api_key_id` + `api_secret_key` from `sendblue show-keys` into `.env.local`. |
| `npm run sendblue:sync` | Runs `sendblue lines`, parses your provisioned phone number, and writes `SENDBLUE_FROM_NUMBER` to `.env.local` in E.164 format. Run this anytime your number changes or got set wrong. |
| `npm run sendblue:webhook -- <url>` | Runs `sendblue webhooks list`, removes stale ngrok/tunnel hooks, and adds `<url>` as a `type=receive` inbound webhook. Called automatically by `npm run dev`. |

### The `npm run dev` lifecycle

```
 1. Preflight: confirm convex/_generated/ exists (else prompt to run setup).
 2. Spawn four children in parallel, each with a prefixed log stream:
       server │   (tsx watch server/index.ts)
       convex │   (npx convex dev — pushes schema + functions)
       debug  │   (vite dev server on :5173)
       ngrok  │   (if installed AND no static URL) exposes :PORT
 3. Wait for all four readiness signals:
       server → "listening on :PORT"
       convex → "Convex functions ready"
       debug  → "Local:  http://localhost:5173/"
       ngrok  → tunnel URL visible at http://127.0.0.1:4040
 4. Auto-register the webhook (FREE ngrok only, not reserved domains):
       webhook │ [webhook] removed stale https://old.ngrok-free.app/sendblue/webhook
       webhook │ [webhook] registered https://new.ngrok-free.app/sendblue/webhook (type=receive)
 5. Show the banner with dashboard + public URL + your Sendblue number.
```

The banner will look like:

```
════════════════════════════════════════════════════════════════════
  Boop is ready — ngrok tunnel is live  (webhook auto-registered).

  🐶 Debug dashboard (click me):   http://localhost:5173
  🌐 Public URL:                   https://abc123.ngrok-free.app
  📮 Sendblue webhook (inbound):   https://abc123.ngrok-free.app/sendblue/webhook
  📱 Text this Sendblue number:    +13053369541  (from a DIFFERENT phone)
════════════════════════════════════════════════════════════════════
```

### When auto-register fires vs when it doesn't

| Setup | Auto-register fires? | Why |
|---|---|---|
| Free ngrok (default) | **Yes**, every boot | URL rotates; dashboard would be stale otherwise |
| Reserved `NGROK_DOMAIN` | No | URL is stable; configure once in Sendblue dashboard |
| Static `PUBLIC_URL` (Cloudflare Tunnel etc.) | No | Same reason |
| `SENDBLUE_AUTO_WEBHOOK=false` | No | Manual opt-out |

### What you'll see in the server logs during a conversation

When someone texts your Sendblue number, expect this sequence in your terminal:

```
server │ [turn a3f21d] ← +14155551234: "what's on my calendar today?"
server │ [turn a3f21d] tool: recall({"query":"calendar today"})
server │ [turn a3f21d] tool: spawn_agent({"integrations":["google-calendar"],"task":"Pull today's events"})
server │ [agent 9e82c1] spawn: google-calendar [google-calendar] — "Pull today's events"
server │ [agent 9e82c1] tool: list_events
server │ [agent 9e82c1] done (completed, 2.1s, in/out tokens 1234/567)
server │ [turn a3f21d] → reply (3.4s, 140 chars): "Light day — just your 2pm with Sarah..."
server │ [sendblue] → sent 140 chars to +14155551234
```

Per-line anatomy:

- **`[turn xxxxxx]`** — one iMessage round trip. Same id across `←` (incoming) → tool calls → `→ reply` → `[sendblue] sent`.
- **`[agent xxxxxx]`** — a spawned execution agent. Shows `spawn`, each `tool:` it invokes, and `done` with timing + token counts.
- **`[sendblue]`** — outbound send results. If Sendblue rejects, the error body is logged with a hint about the likely cause (from_number mismatch, self-send, etc.).

The same events are written to Convex (`messages`, `executionAgents`, `agentLogs`, `memoryEvents` tables) and streamed to the debug dashboard in real time.

### When to re-run each Sendblue script

- **First time / after losing `.env.local`** → `npm run setup` (walks through Sendblue + Convex together)
- **Phone number looks wrong in the banner** → `npm run sendblue:sync`
- **Webhook went stale in the dashboard and auto-register is off** → `npm run sendblue:webhook -- https://your-url.example.com/sendblue/webhook`

### Disabling auto-register

Add to `.env.local`:

```
SENDBLUE_AUTO_WEBHOOK=false
```

`npm run dev` will still show you the webhook URL in the banner so you can paste it yourself.

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
├── debug/                         # Dashboard: Dashboard / Agents / Automations / Memory / Events / Connections
├── scripts/
│   ├── setup.ts                   # Interactive setup CLI
│   ├── dev.mjs                    # One-command orchestrator (server + convex + vite + ngrok)
│   ├── preflight.mjs              # Checks convex/_generated exists before booting
│   ├── sendblue-sync.mjs          # Pulls phone number from `sendblue lines`
│   └── sendblue-webhook.mjs       # Registers inbound webhook via Sendblue CLI
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

**"Could not find public function for X:Y".**
- `CONVEX_DEPLOYMENT` and `CONVEX_URL` in `.env.local` are pointing at different projects. `convex dev` pushes functions to `CONVEX_DEPLOYMENT` but the client reads from `CONVEX_URL`. Fix: make sure the URL has the same name as the deployment — `CONVEX_DEPLOYMENT=dev:foo-bar-123` → `CONVEX_URL=https://foo-bar-123.convex.cloud`. Re-running `npm run setup` now auto-syncs these.

**Agent replies but can't use my integration.**
- Check it's registered — `server/integrations/registry.ts` imports list.
- Check the `register()` function actually calls `opts.registerIntegration(mod)` (not commented out).
- Check required env vars are set. Tools return an auth error if the token is missing.

**I want to skip Sendblue for now.**
- The server exposes `POST /chat` with `{ conversationId, content }` — curl or a tiny client can drive the agent directly, no iMessage required.

**Claude SDK says no credentials.**
- Run `claude` once and sign in, or set `ANTHROPIC_API_KEY` in `.env.local`.

**"Cannot send messages to self" / "missing required parameter: from_number".**
- `SENDBLUE_FROM_NUMBER` is set to your personal cell instead of your Sendblue-provisioned number. Run `npm run sendblue:sync` to pull the correct number from `sendblue lines` and write it to `.env.local`.

**"Dashboard crashed" in the debug UI.**
- The ErrorBoundary caught something. Check the server logs (`server │` stream) and the browser console — both will have the real error. Most common cause: a new Convex function hasn't been deployed yet. Restart `npm run dev` so `convex dev` re-pushes.

---

## License

MIT. Build whatever you want on top of this.
