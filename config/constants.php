<?php
// ── MySQL settings ───────────────────────────────────────────
// Defaults keep local XAMPP working; Docker/Kubernetes inject env vars.
define('DB_HOST', getenv('DB_HOST') ?: '127.0.0.1');
define('DB_NAME', getenv('DB_NAME') ?: 'courtstars_db');
define('DB_USER', getenv('DB_USER') ?: 'root');
define('DB_PASS', getenv('DB_PASS') !== false ? getenv('DB_PASS') : '');

// ── API Keys ─────────────────────────────────────────────────
// ESPN public API  → no key required
// nba_api Python   → no key required (pip install nba_api)
// BallDontLie      → NO LONGER USED (removed)
define('NBA_API_KEY', getenv('NBA_API_KEY') ?: '');

// Stats TTL: auto-sync is triggered if stats are older than this many hours
define('STATS_STALE_HOURS', (int)(getenv('STATS_STALE_HOURS') ?: 6));
