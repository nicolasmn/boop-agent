-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT        NOT NULL,
  role            TEXT        NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT        NOT NULL,
  agent_id        TEXT,
  turn_id         TEXT,
  created_at      BIGINT      NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_conversation       ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_by_conversation_turn  ON messages (conversation_id, turn_id);

-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT        NOT NULL UNIQUE,
  title           TEXT,
  summary         TEXT,
  message_count   INT         NOT NULL DEFAULT 0,
  last_activity_at BIGINT     NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_by_id ON conversations (conversation_id);

-- memory_records
CREATE TABLE IF NOT EXISTS memory_records (
  id               BIGSERIAL PRIMARY KEY,
  memory_id        TEXT        NOT NULL UNIQUE,
  content          TEXT        NOT NULL,
  tier             TEXT        NOT NULL CHECK (tier IN ('short','long','permanent')),
  segment          TEXT        NOT NULL CHECK (segment IN ('identity','preference','correction','relationship','project','knowledge','context')),
  importance       FLOAT8      NOT NULL,
  decay_rate       FLOAT8      NOT NULL,
  access_count     INT         NOT NULL DEFAULT 0,
  last_accessed_at BIGINT      NOT NULL,
  source_turn      TEXT,
  lifecycle        TEXT        NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','archived','pruned')),
  supersedes       TEXT[],
  embedding        vector(1024),
  metadata         TEXT,
  created_at       BIGINT      NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_by_id        ON memory_records (memory_id);
CREATE INDEX IF NOT EXISTS memory_by_tier      ON memory_records (tier);
CREATE INDEX IF NOT EXISTS memory_by_segment   ON memory_records (segment);
CREATE INDEX IF NOT EXISTS memory_by_lifecycle ON memory_records (lifecycle);
-- HNSW vector index filtered to active memories
CREATE INDEX IF NOT EXISTS memory_embedding_hnsw
  ON memory_records USING hnsw (embedding vector_cosine_ops)
  WHERE lifecycle = 'active';

-- execution_agents
CREATE TABLE IF NOT EXISTS execution_agents (
  id                    BIGSERIAL PRIMARY KEY,
  agent_id              TEXT    NOT NULL UNIQUE,
  conversation_id       TEXT,
  name                  TEXT    NOT NULL,
  task                  TEXT    NOT NULL,
  status                TEXT    NOT NULL CHECK (status IN ('spawned','running','completed','failed','cancelled')),
  result                TEXT,
  error                 TEXT,
  mcp_servers           TEXT[]  NOT NULL DEFAULT '{}',
  input_tokens          INT     NOT NULL DEFAULT 0,
  output_tokens         INT     NOT NULL DEFAULT 0,
  cache_read_tokens     INT,
  cache_creation_tokens INT,
  cost_usd              FLOAT8  NOT NULL DEFAULT 0,
  started_at            BIGINT  NOT NULL,
  completed_at          BIGINT
);
CREATE INDEX IF NOT EXISTS agents_by_id           ON execution_agents (agent_id);
CREATE INDEX IF NOT EXISTS agents_by_status       ON execution_agents (status);
CREATE INDEX IF NOT EXISTS agents_by_conversation ON execution_agents (conversation_id);

-- usage_records
CREATE TABLE IF NOT EXISTS usage_records (
  id                    BIGSERIAL PRIMARY KEY,
  source                TEXT    NOT NULL,
  conversation_id       TEXT,
  turn_id               TEXT,
  agent_id              TEXT,
  run_id                TEXT,
  model                 TEXT    NOT NULL,
  input_tokens          INT     NOT NULL DEFAULT 0,
  output_tokens         INT     NOT NULL DEFAULT 0,
  cache_read_tokens     INT     NOT NULL DEFAULT 0,
  cache_creation_tokens INT     NOT NULL DEFAULT 0,
  cost_usd              FLOAT8  NOT NULL DEFAULT 0,
  duration_ms           INT     NOT NULL DEFAULT 0,
  created_at            BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS usage_by_conversation ON usage_records (conversation_id);
CREATE INDEX IF NOT EXISTS usage_by_agent        ON usage_records (agent_id);
CREATE INDEX IF NOT EXISTS usage_by_source       ON usage_records (source);

-- agent_logs
CREATE TABLE IF NOT EXISTS agent_logs (
  id         BIGSERIAL PRIMARY KEY,
  agent_id   TEXT   NOT NULL,
  log_type   TEXT   NOT NULL CHECK (log_type IN ('thinking','tool_use','tool_result','text','error')),
  tool_name  TEXT,
  content    TEXT   NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_logs_by_agent ON agent_logs (agent_id);

-- memory_events
CREATE TABLE IF NOT EXISTS memory_events (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT   NOT NULL,
  conversation_id TEXT,
  memory_id       TEXT,
  agent_id        TEXT,
  data            TEXT   NOT NULL,
  created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_events_by_conversation ON memory_events (conversation_id);
CREATE INDEX IF NOT EXISTS memory_events_by_type         ON memory_events (event_type);

-- automations
CREATE TABLE IF NOT EXISTS automations (
  id                      BIGSERIAL PRIMARY KEY,
  automation_id           TEXT    NOT NULL UNIQUE,
  name                    TEXT    NOT NULL,
  task                    TEXT    NOT NULL,
  integrations            TEXT[]  NOT NULL DEFAULT '{}',
  schedule                TEXT    NOT NULL,
  enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  conversation_id         TEXT,
  notify_conversation_id  TEXT,
  last_run_at             BIGINT,
  next_run_at             BIGINT,
  created_at              BIGINT  NOT NULL
);
CREATE INDEX IF NOT EXISTS automations_by_id      ON automations (automation_id);
CREATE INDEX IF NOT EXISTS automations_by_enabled ON automations (enabled);

-- sendblue_dedup
CREATE TABLE IF NOT EXISTS sendblue_dedup (
  id         BIGSERIAL PRIMARY KEY,
  handle     TEXT   NOT NULL UNIQUE,
  claimed_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS dedup_by_handle ON sendblue_dedup (handle);

-- drafts
CREATE TABLE IF NOT EXISTS drafts (
  id              BIGSERIAL PRIMARY KEY,
  draft_id        TEXT   NOT NULL UNIQUE,
  conversation_id TEXT   NOT NULL,
  kind            TEXT   NOT NULL,
  summary         TEXT   NOT NULL,
  payload         TEXT   NOT NULL,
  status          TEXT   NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','rejected','expired')),
  created_at      BIGINT NOT NULL,
  decided_at      BIGINT
);
CREATE INDEX IF NOT EXISTS drafts_by_id                  ON drafts (draft_id);
CREATE INDEX IF NOT EXISTS drafts_by_conversation_status ON drafts (conversation_id, status);

-- consolidation_runs
CREATE TABLE IF NOT EXISTS consolidation_runs (
  id              BIGSERIAL PRIMARY KEY,
  run_id          TEXT   NOT NULL UNIQUE,
  trigger         TEXT   NOT NULL,
  status          TEXT   NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  proposals_count INT    NOT NULL DEFAULT 0,
  merged_count    INT    NOT NULL DEFAULT 0,
  pruned_count    INT    NOT NULL DEFAULT 0,
  notes           TEXT,
  details         TEXT,
  started_at      BIGINT NOT NULL,
  completed_at    BIGINT
);
CREATE INDEX IF NOT EXISTS consolidation_by_run_id ON consolidation_runs (run_id);
CREATE INDEX IF NOT EXISTS consolidation_by_status ON consolidation_runs (status);

-- automation_runs
CREATE TABLE IF NOT EXISTS automation_runs (
  id            BIGSERIAL PRIMARY KEY,
  run_id        TEXT   NOT NULL UNIQUE,
  automation_id TEXT   NOT NULL,
  status        TEXT   NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  result        TEXT,
  error         TEXT,
  agent_id      TEXT,
  started_at    BIGINT NOT NULL,
  completed_at  BIGINT
);
CREATE INDEX IF NOT EXISTS automation_runs_by_automation ON automation_runs (automation_id);
CREATE INDEX IF NOT EXISTS automation_runs_by_run_id     ON automation_runs (run_id);
