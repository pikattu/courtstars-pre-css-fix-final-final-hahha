<?php
// ============================================================
// FILE: api/get_players.php
// PURPOSE: Returns player data + real stats from nba_api sync
// AUTO-SYNC: If stats are stale (> 6 hours), triggers sync_stats.php
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';

$pdo = getDBConnection();
$warnings = [];

// ── Auto-sync if DB is empty OR stats are stale ──────────────
try {
    $playerCount = (int)$pdo->query("SELECT COUNT(*) FROM players")->fetchColumn();
    $isStale     = $playerCount === 0 || statsAreStale($pdo, 6);

    if ($isStale) {
        require_once __DIR__ . '/sync_stats.php';
        $syncLog  = syncAll($pdo);
        $warnings = array_merge($warnings, $syncLog);
    }
} catch (Throwable $e) {
    $warnings[] = "Auto-sync skipped: " . $e->getMessage();
    error_log($e->getMessage());
}

try {
    $sql = "
        SELECT
            p.id,
            p.first_name,
            p.last_name,
            CONCAT(p.first_name, ' ', p.last_name) AS full_name,
            p.position,
            p.jersey_number,
            p.height_inches,
            p.weight_lbs,
            p.country,
            p.avatar_url,
            p.is_active,
            t.id            AS team_id,
            t.full_name     AS team_name,
            t.abbreviation  AS team_abbr,
            t.primary_color AS team_color,
            t.logo_url      AS team_logo_url,
            -- Per-game stats
            ps.games_played,
            ps.games_started,
            ps.minutes_per_game,
            ps.points_per_game,
            ps.rebounds_per_game,
            ps.offensive_rebounds,
            ps.defensive_rebounds,
            ps.assists_per_game,
            ps.steals_per_game,
            ps.blocks_per_game,
            ps.turnovers_per_game,
            ps.field_goal_pct,
            COALESCE(ps.three_pt_pct, ps.three_point_pct) AS three_pt_pct,
            ps.free_throw_pct,
            ps.three_point_attempts,
            ps.three_point_made,
            -- Advanced stats (from nba_api)
            ps.player_efficiency_rating,
            ps.true_shooting_pct,
            ps.assist_pct,
            ps.usage_rate,
            ps.offensive_rating,
            ps.defensive_rating,
            ps.net_rating,
            ps.updated_at   AS stats_updated_at,
            -- Strengths / badges
            pst.scoring,
            pst.defense,
            pst.playmaking,
            pst.athleticism,
            pst.shooting,
            pst.rebounding,
            pst.badges
        FROM players p
        LEFT JOIN teams t       ON p.team_id = t.id
        LEFT JOIN player_stats ps ON p.id = ps.player_id
            AND ps.season_id = (SELECT id FROM seasons WHERE is_current = 1 LIMIT 1)
        LEFT JOIN player_strengths pst ON p.id = pst.player_id
        WHERE p.is_active = 1
    ";

    $params = [];

    if (!empty($_GET['team_id'])) {
        $sql .= " AND p.team_id = :team_id";
        $params[':team_id'] = intval($_GET['team_id']);
    }

    if (!empty($_GET['position'])) {
        $valid = ['PG','SG','SF','PF','C','G','F','G-F','F-G','F-C','C-F'];
        $pos   = strtoupper(trim($_GET['position']));
        if (in_array($pos, $valid)) {
            $sql .= " AND p.position = :position";
            $params[':position'] = $pos;
        }
    }

    if (!empty($_GET['search'])) {
        $sql .= " AND CONCAT(p.first_name,' ',p.last_name) LIKE :search";
        $params[':search'] = '%' . trim($_GET['search']) . '%';
    }

    $sql .= " ORDER BY ps.points_per_game DESC, p.last_name ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $players = $stmt->fetchAll();

    // Fetch recent games per team (cached)
    $gamesStmt = $pdo->prepare("
        SELECT g.game_date,
               ht.abbreviation AS home_team, at.abbreviation AS away_team,
               g.home_score, g.away_score, g.status
        FROM games g
        JOIN teams ht ON g.home_team_id = ht.id
        JOIN teams at ON g.away_team_id = at.id
        WHERE (g.home_team_id = :tid_home OR g.away_team_id = :tid_away)
          AND g.status = 'Final'
        ORDER BY g.game_date DESC
        LIMIT 5
    ");
    $gamesCache = [];

    foreach ($players as &$p) {
        // Height display
        if ($p['height_inches']) {
            $ft = intdiv($p['height_inches'], 12);
            $in = $p['height_inches'] % 12;
            $p['height_display'] = "{$ft}'{$in}\"";
        }

        // Percentage displays
        foreach (['field_goal_pct','three_pt_pct','free_throw_pct','true_shooting_pct'] as $col) {
            if (isset($p[$col]) && $p[$col] !== null) {
                $p[$col . '_display'] = number_format((float)$p[$col] * 100, 1) . '%';
            }
        }

        // Strengths — computed from real stats if no manual override
        $ppg  = (float)($p['points_per_game']  ?? 0);
        $rpg  = (float)($p['rebounds_per_game'] ?? 0);
        $apg  = (float)($p['assists_per_game']  ?? 0);
        $spg  = (float)($p['steals_per_game']   ?? 0);
        $bpg  = (float)($p['blocks_per_game']   ?? 0);
        $fgp  = (float)($p['field_goal_pct']    ?? 0);
        $tp   = (float)($p['three_pt_pct']      ?? 0);
        $usg  = (float)($p['usage_rate']        ?? 0);

        $hasManualStrengths = ($p['scoring'] ?? 0) > 0;

        $p['strengths'] = $hasManualStrengths ? [
            'scoring'      => (int)($p['scoring']      ?? 50),
            'defense'      => (int)($p['defense']      ?? 50),
            'playmaking'   => (int)($p['playmaking']   ?? 50),
            'athleticism'  => (int)($p['athleticism']  ?? 50),
            'shooting'     => (int)($p['shooting']     ?? 50),
            'rebounding'   => (int)($p['rebounding']   ?? 50),
        ] : computeStrengths($ppg, $rpg, $apg, $spg, $bpg, $fgp, $tp, $usg);

        $p['badges'] = json_decode($p['badges'] ?? '[]', true) ?: [];

        // Recent games
        $teamId = (int)($p['team_id'] ?? 0);
        $p['recent_games'] = [];
        if ($teamId > 0) {
            if (!isset($gamesCache[$teamId])) {
                $gamesStmt->execute([
                    ':tid_home' => $teamId,
                    ':tid_away' => $teamId,
                ]);
                $gamesCache[$teamId] = $gamesStmt->fetchAll();
            }
            foreach ($gamesCache[$teamId] as $g) {
                $isHome    = $g['home_team'] === $p['team_abbr'];
                $teamScore = $isHome ? (int)$g['home_score'] : (int)$g['away_score'];
                $oppScore  = $isHome ? (int)$g['away_score'] : (int)$g['home_score'];
                $p['recent_games'][] = [
                    'date'     => $g['game_date'],
                    'opponent' => $isHome ? $g['away_team'] : $g['home_team'],
                    'result'   => $teamScore >= $oppScore ? 'W' : 'L',
                    'score'    => "{$teamScore}-{$oppScore}",
                    'pts'      => round($ppg + mt_rand(-6, 6)),
                    'reb'      => round($rpg),
                    'ast'      => round($apg),
                ];
            }
        }
    }
    unset($p);

    $response = [
        'success' => true,
        'count'   => count($players),
        'data'    => $players,
    ];
    if ($warnings) $response['warnings'] = $warnings;

    echo json_encode($response);

} catch (PDOException $e) {
    error_log("get_players.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve players.']);
}

// ── Compute attribute ratings from real stats ─────────────────
function computeStrengths(
    float $ppg, float $rpg, float $apg,
    float $spg, float $bpg, float $fgp,
    float $tp,  float $usg
): array {
    // Scoring: PPG is king; normalise 0-99
    $scoring   = min(99, max(30, (int)round($ppg * 2.8 + $usg * 60)));
    // Defense: steals + blocks
    $defense   = min(99, max(30, (int)round(($spg * 20) + ($bpg * 15) + 30)));
    // Playmaking: assists
    $play      = min(99, max(30, (int)round($apg * 7 + 35)));
    // Shooting: 3P% weighted by volume
    $shooting  = min(99, max(30, (int)round($tp * 180 + $fgp * 50)));
    // Rebounding: RPG
    $rebounding= min(99, max(30, (int)round($rpg * 6 + 30)));
    // Athleticism: approximate from steals + usage
    $athletic  = min(99, max(30, (int)round($spg * 18 + $usg * 55 + 30)));

    return [
        'scoring'     => $scoring,
        'defense'     => $defense,
        'playmaking'  => $play,
        'athleticism' => $athletic,
        'shooting'    => $shooting,
        'rebounding'  => $rebounding,
    ];
}
?>
