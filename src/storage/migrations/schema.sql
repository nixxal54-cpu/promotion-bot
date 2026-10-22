-- Schema definition for Movie Promo Bot
-- Compatible with PostgreSQL 12+

CREATE TABLE IF NOT EXISTS bot_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  request_count INTEGER NOT NULL DEFAULT 0,
  promo_threshold INTEGER NOT NULL DEFAULT 10,
  promo_cooldown_minutes INTEGER NOT NULL DEFAULT 30,
  is_promo_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_promotion_at BIGINT,
  total_promotions_sent INTEGER NOT NULL DEFAULT 0,
  total_eligible_requests INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id BIGINT PRIMARY KEY,
  processed_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action VARCHAR(128) NOT NULL,
  details JSONB
);

-- Index for speedy deduplication and retention cleanup
CREATE INDEX IF NOT EXISTS idx_processed_updates_time ON processed_updates(processed_at);
