<?php
// ============================================================
// FILE: api/get_leaderboards.php
// PURPOSE: Leaderboard data for all stat categories
// EXAMPLE: fetch('api/get_leaderboards.php?category=per&limit=10')
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';
$pdo = getDBConnection();

try {
    // Allowed categories → DB column mapping
    // 'three_pt' kept as the DB category name so existing JS doesn't break
    $category_map = [
        'points'    => 'points',
        'rebounds'  => 'rebounds',
        'assists'   => 'assists',
        'steals'    => 'steals',
        'blocks'    => 'blocks',
        'three_pt'  => 'three_pt',
        // advanced — stored in leaderboards with these category keys
        'per'       => 'per',
        'ts_pct'    => 'ts_pct',
        'usage'     => 'usage',
        'net_rating'=> 'net_rating',
        // aliases
        'currentPPG'=> 'points',
    ];

    $category = isset($_GET['category']) ? trim($_GET['category']) : 'points';
    if (!array_key_exists($category, $category_map)) $category = 'points';
    $dbCategory = $category_map[$category];

    $limit = isset($_GET['limit']) ? min(50, max(1, intval($_GET['limit']))) : 10;

    // Auto-rebuild if stale or empty
    $validCount = (int)$pdo->query("
        SELECT COUNT(*) FROM leaderboards lb
        JOIN players p ON lb.player_id = p.id
        WHERE lb.season_id = (SELECT id FROM seasons WHERE is_current = 1 LIMIT 1)
    ")->fetchColumn();

    if ($validCount === 0) {
        rebuildLeaderboards($pdo);
    }

    $stmt = $pdo->prepare("
        SELECT p.id,
               CONCAT(p.first_name,' ',p.last_name) AS player_name,
               p.avatar_url,
               p.position,
               t.abbreviation  AS team_abbr,
               t.primary_color AS team_color,
               lb.stat_value,
               lb.rank_position AS `rank`
        FROM leaderboards lb
        JOIN players p ON lb.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE lb.season_id = (SELECT id FROM seasons WHERE is_current = 1 LIMIT 1)
          AND lb.category = :category
        ORDER BY lb.rank_position ASC
        LIMIT :limit
    ");
    $stmt->bindValue(':category', $dbCategory);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();

    echo json_encode([
        'success'  => true,
        'category' => $category,
        'data'     => $stmt->fetchAll(),
    ]);

} catch (PDOException $e) {
    error_log("get_leaderboards.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve leaderboards.']);
}

// ── Rebuild leaderboards from live player_stats ───────────────
function rebuildLeaderboards(PDO $pdo): void {
    try {
        $sid = (int)$pdo->query("SELECT id FROM seasons WHERE is_current = 1 LIMIT 1")->fetchColumn();
        if (!$sid) return;

        $pdo->prepare("DELETE FROM leaderboards WHERE season_id = ?")->execute([$sid]);

        // Basic per-game categories
        $cats = [
            'points'    => 'ps.points_per_game',
            'rebounds'  => 'ps.rebounds_per_game',
            'assists'   => 'ps.assists_per_game',
            'steals'    => 'ps.steals_per_game',
            'blocks'    => 'ps.blocks_per_game',
            'three_pt'  => 'COALESCE(ps.three_pt_pct, ps.three_point_pct)',
        ];

        // Advanced categories (only populated if nba_api sync has run)
        $advCats = [
            'per'        => 'ps.player_efficiency_rating',
            'ts_pct'     => 'ps.true_shooting_pct',
            'usage'      => 'ps.usage_rate',
            'net_rating' => 'ps.net_rating',
        ];

        $ins = $pdo->prepare("
            INSERT INTO leaderboards (season_id, player_id, category, stat_value, rank_position)
            VALUES (?, ?, ?, ?, ?)
        ");

        foreach (array_merge($cats, $advCats) as $cat => $col) {
            $minGP = in_array($cat, ['per','ts_pct','net_rating']) ? 'AND ps.games_played >= 10' : '';
            $rows = $pdo->query("
                SELECT ps.player_id, {$col} AS val
                FROM player_stats ps
                JOIN players p ON ps.player_id = p.id
                WHERE ps.season_id = {$sid}
                  AND {$col} > 0
                  AND p.is_active = 1
                  {$minGP}
                ORDER BY val DESC
                LIMIT 25
            ")->fetchAll();

            foreach ($rows as $rank => $row) {
                $ins->execute([$sid, $row['player_id'], $cat, $row['val'], $rank + 1]);
            }
        }
    } catch (Throwable $e) {
        error_log("rebuildLeaderboards: " . $e->getMessage());
    }
}
?>
