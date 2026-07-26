CREATE TABLE IF NOT EXISTS machines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  os TEXT,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS usage_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  record_hash TEXT NOT NULL,
  agent TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  ts TEXT NOT NULL,
  session TEXT,
  project TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  billed_cost_usd REAL,
  pricing_source TEXT,
  UNIQUE (machine_id, record_hash)
);

CREATE TABLE IF NOT EXISTS pricing_catalog (
  id INTEGER PRIMARY KEY DEFAULT 1,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quota_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  provider TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  percent_used REAL,
  plan TEXT,
  resets_at TEXT,
  raw TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS usage_records_ts_idx ON usage_records (ts);
CREATE INDEX IF NOT EXISTS usage_records_machine_ts_idx ON usage_records (machine_id, ts);
CREATE INDEX IF NOT EXISTS usage_records_agent_ts_idx ON usage_records (agent, ts);
CREATE INDEX IF NOT EXISTS usage_records_model_ts_idx ON usage_records (model, ts);
CREATE INDEX IF NOT EXISTS usage_records_day_idx ON usage_records (strftime('%Y-%m-%d', ts));
CREATE INDEX IF NOT EXISTS usage_records_day_agent_idx ON usage_records (strftime('%Y-%m-%d', ts), agent);
CREATE INDEX IF NOT EXISTS usage_records_day_agent_cover_idx ON usage_records (
  strftime('%Y-%m-%d', ts),
  agent,
  input_tokens,
  output_tokens,
  reasoning_tokens,
  cache_read_tokens,
  cache_write_tokens,
  cost_usd,
  billed_cost_usd
);
CREATE INDEX IF NOT EXISTS usage_records_day_model_idx ON usage_records (strftime('%Y-%m-%d', ts), model);
CREATE INDEX IF NOT EXISTS usage_records_day_machine_idx ON usage_records (strftime('%Y-%m-%d', ts), machine_id);
CREATE INDEX IF NOT EXISTS quota_snapshots_machine_provider_taken_idx ON quota_snapshots (machine_id, provider, taken_at);
