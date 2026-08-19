-- ============================================================
-- FILE: migrate_v2.sql
-- PURPOSE: Upgrade courtstars_db to v2 live-data schema
--
-- RUN ONCE in phpMyAdmin or: mysql -u root courtstars_db < migrate_v2.sql
--
-- WHAT THIS DOES:
--   1. Adds advanced stat columns to player_stats
--   2. Clears static/manually-entered stats so the live sync
--      can write fresh data from nba_api
--   3. Clears stale leaderboard rows (will be rebuilt on next page load)
--   4. Adds advanced leaderboard categories
--   5. Ensures seasons row exists
-- ============================================================

-- ── 1. Add advanced columns to player_stats ───────────────────
ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS games_started            INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offensive_rebounds       DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS defensive_rebounds       DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS player_efficiency_rating DECIMAL(6,3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS true_shooting_pct        DECIMAL(5,3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS assist_pct               DECIMAL(5,3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS usage_rate               DECIMAL(5,3) DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS offensive_rating         DECIMAL(6,1) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS defensive_rating         DECIMAL(6,1) DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS net_rating               DECIMAL(6,1) DEFAULT 0.0;

-- ── 2. Clear all static/manually-entered stats ───────────────
--    The nba_api sync will re-populate these with live data.
--    IMPORTANT: this deletes all player_stats rows.
--    If you want to keep any manual rows, comment this out.
TRUNCATE TABLE leaderboards;
TRUNCATE TABLE player_stats;

-- ── 3. Ensure the seasons table has a current season row ─────
INSERT IGNORE INTO seasons (id, season_label, name, is_current)
VALUES (1, 'Current', 'Current', 1);

-- ── 4. Drop old BallDontLie-era columns if they exist ────────
--    (safe no-ops if columns don't exist — MySQL 8+ only)
-- ALTER TABLE players DROP COLUMN IF EXISTS balldontlie_id;

-- ── 5. Ensure games table has api_game_id column ─────────────
ALTER TABLE games MODIFY COLUMN api_game_id VARCHAR(50);

-- Done. Open your browser and visit:
--   http://localhost/courtstars/api/sync_stats.php
-- to populate live data.
SELECT 'Migration complete. Run sync_stats.php to populate live data.' AS status;
