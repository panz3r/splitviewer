-- Migration number: 0001 	 2026-11-09T10:39:00.014Z
-- Phase 1: users, shares, group_cache (see plans/phase-1-setup.md)

CREATE TABLE users (
  id TEXT PRIMARY KEY,                      -- UUID v4, generated in code (crypto.randomUUID)
  splitwise_user_id TEXT NOT NULL UNIQUE,   -- Splitwise's numeric id, stored as TEXT
  encrypted_access_token TEXT NOT NULL,     -- AES-GCM output from src/lib/crypto.ts
  encrypted_refresh_token TEXT NOT NULL,
  token_expiry INTEGER,                     -- epoch ms, NULL if Splitwise didn't return one
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE shares (
  slug TEXT PRIMARY KEY,                    -- 16-char nanoid slug, created in Phase 3
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  splitwise_group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (user_id, splitwise_group_id)
);

CREATE TABLE group_cache (
  slug TEXT PRIMARY KEY,                    -- matches shares.slug; no FK on purpose (cache can outlive a revoked share until next refresh)
  payload TEXT NOT NULL,                    -- sanitized JSON snapshot (built in Phase 4)
  last_fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_shares_user ON shares(user_id);
