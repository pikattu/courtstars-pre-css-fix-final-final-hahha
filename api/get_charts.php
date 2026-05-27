<?php
// ============================================================
// FILE: api/get_charts.php
// PURPOSE: Chart data — scoring, 3P%, advanced stats (PER, TS%, ratings)
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';
$pdo = getDBConnection();

try {
    $sid = "(SELECT id FROM seasons WHERE is_current = 1 LIMIT 1)";

    // Scoring leaders
    $scoring = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS name,
               t.abbreviation AS team,
               ps.points_per_game AS ppg
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = {$sid}
          AND ps.points_per_game > 0
          AND p.is_active = 1
        ORDER BY ps.points_per_game DESC
        LIMIT 10
    ")->fetchAll();

    // 3-point percentage leaders (min 2 attempts/game)
    $threePt = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS name,
               t.abbreviation AS team,
               COALESCE(ps.three_pt_pct, ps.three_point_pct) AS three_pt_pct
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = {$sid}
          AND COALESCE(ps.three_pt_pct, ps.three_point_pct) > 0
          AND ps.three_point_attempts >= 2
          AND p.is_active = 1
        ORDER BY COALESCE(ps.three_pt_pct, ps.three_point_pct) DESC
        LIMIT 10
    ")->fetchAll();

    // Player Impact Estimate / PER leaders
    $per = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS name,
               t.abbreviation AS team,
               ps.player_efficiency_rating AS per
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = {$sid}
          AND ps.player_efficiency_rating > 0
          AND ps.games_played >= 10
          AND p.is_active = 1
        ORDER BY ps.player_efficiency_rating DESC
        LIMIT 10
    ")->fetchAll();

    // True Shooting % leaders (min 10 GP)
    $ts = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS name,
               t.abbreviation AS team,
               ps.true_shooting_pct AS ts_pct
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = {$sid}
          AND ps.true_shooting_pct > 0
          AND ps.games_played >= 10
          AND p.is_active = 1
        ORDER BY ps.true_shooting_pct DESC
        LIMIT 10
    ")->fetchAll();

    // Usage rate leaders
    $usage = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS name,
               t.abbreviation AS team,
               ps.usage_rate
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = {$sid}
          AND ps.usage_rate > 0
          AND p.is_active = 1
        ORDER BY ps.usage_rate DESC
        LIMIT 10
    ")->fetchAll();

    // Net rating (best two-way players, min 20 GP)
    $netRating = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS name,
               t.abbreviation AS team,
               ps.offensive_rating,
               ps.defensive_rating,
               ps.net_rating
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = {$sid}
          AND ps.net_rating IS NOT NULL
          AND ps.net_rating != 0
          AND ps.games_played >= 20
          AND p.is_active = 1
        ORDER BY ps.net_rating DESC
        LIMIT 10
    ")->fetchAll();

    echo json_encode([
        'success' => true,
        'data'    => [
            'scoring_leaders'     => $scoring,
            'three_point_leaders' => $threePt,
            'per_leaders'         => $per,
            'ts_pct_leaders'      => $ts,
            'usage_leaders'       => $usage,
            'net_rating_leaders'  => $netRating,
        ],
    ]);

} catch (PDOException $e) {
    error_log("get_charts.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve chart data.']);
}
?>
