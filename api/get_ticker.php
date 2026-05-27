<?php
// ============================================================
// FILE: api/get_ticker.php
// PURPOSE: Returns live scoreboard (ESPN) + scoring leader (DB)
//          for the top ticker bar
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';
$pdo = getDBConnection();

// ── Live scoreboard from ESPN ─────────────────────────────────
function fetchEspnScoreboard(): array {
    $url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'CourtStars/2.0',
    ]);
    $body     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!$body || $httpCode !== 200) return [];

    $data   = json_decode($body, true);
    $events = $data['events'] ?? [];
    $games  = [];

    foreach ($events as $ev) {
        $comp  = $ev['competitions'][0] ?? [];
        $comps = $comp['competitors']   ?? [];

        $home = $away = null;
        foreach ($comps as $c) {
            if (($c['homeAway'] ?? '') === 'home') $home = $c;
            if (($c['homeAway'] ?? '') === 'away') $away = $c;
        }
        if (!$home || !$away) continue;

        $statusType = $ev['status']['type'] ?? [];
        $statusName = $statusType['name']   ?? 'STATUS_SCHEDULED';

        $isLive = str_contains($statusName, 'IN_PROGRESS') || str_contains($statusName, 'HALFTIME');
        $isFinal= str_contains($statusName, 'FINAL');

        $detail = $ev['status']['displayClock'] ?? '';
        if ($isLive && !empty($ev['status']['period'])) {
            $p = (int)$ev['status']['period'];
            $detail = "Q{$p} " . ($ev['status']['displayClock'] ?? '');
        }

        // Game time (convert UTC to local-ish)
        $gameTime = '';
        if (!$isLive && !$isFinal && !empty($ev['date'])) {
            $ts = strtotime($ev['date']);
            if ($ts) $gameTime = date('g:i A', $ts);
        }

        $games[] = [
            'home_team'  => strtoupper($home['team']['abbreviation'] ?? ''),
            'away_team'  => strtoupper($away['team']['abbreviation'] ?? ''),
            'home_score' => $isLive || $isFinal ? (int)($home['score'] ?? 0) : null,
            'away_score' => $isLive || $isFinal ? (int)($away['score'] ?? 0) : null,
            'status'     => $isFinal ? 'Final' : ($isLive ? 'In Progress' : 'Scheduled'),
            'game_date'  => substr($ev['date'] ?? '', 0, 10),
            'game_time'  => $gameTime,
            'is_live'    => $isLive,
            'detail'     => $isLive ? trim($detail) : '',
        ];
    }

    return $games;
}

try {
    // Try live ESPN first; fall back to DB
    $games = fetchEspnScoreboard();

    if (empty($games)) {
        $rows = $pdo->query("
            SELECT g.game_date, g.game_time, g.status,
                   ht.abbreviation AS home_team, at.abbreviation AS away_team,
                   g.home_score, g.away_score, g.period,
                   (g.status = 'In Progress') AS is_live
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.id
            JOIN teams at ON g.away_team_id = at.id
            WHERE g.game_date BETWEEN DATE_SUB(NOW(), INTERVAL 3 DAY) AND DATE_ADD(NOW(), INTERVAL 7 DAY)
            ORDER BY g.game_date ASC, g.game_time ASC
            LIMIT 10
        ")->fetchAll();

        foreach ($rows as &$row) {
            $row['is_live'] = (bool)$row['is_live'];
            $row['detail']  = '';
        }
        $games = $rows;
    }

    // Scoring leader from DB
    $leader = $pdo->query("
        SELECT CONCAT(p.first_name,' ',p.last_name) AS player_name,
               t.abbreviation AS team_abbr,
               ps.points_per_game
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        LEFT JOIN teams t ON p.team_id = t.id
        WHERE ps.season_id = (SELECT id FROM seasons WHERE is_current = 1 LIMIT 1)
          AND ps.points_per_game > 0
          AND p.is_active = 1
        ORDER BY ps.points_per_game DESC
        LIMIT 1
    ")->fetch();

    echo json_encode([
        'success' => true,
        'data'    => [
            'games'          => $games,
            'scoring_leader' => $leader ?: null,
        ],
    ]);

} catch (PDOException $e) {
    error_log("get_ticker.php: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve ticker data.']);
}
?>
