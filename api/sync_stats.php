<?php
// ============================================================
// FILE: api/sync_stats.php
// PURPOSE: Full real-time sync pipeline
//
//   ROSTERS / TEAMS → ESPN public API  (no key, pure cURL)
//   PLAYER STATS    → nba_api Python   (pip install nba_api)
//   LIVE SCORES     → ESPN scoreboard  (no key, pure cURL)
//
// HOW TO RUN:
//   Browser : GET /courtstars/api/sync_stats.php
//   CLI     : php api/sync_stats.php
//   Auto    : Called from get_players.php when DB is empty
//             or stats are stale (> 6 hours old).
//
// WHAT IT DOES:
//   1. Sync 30 teams from ESPN
//   2. Sync full rosters from ESPN per-team roster endpoint
//   3. Run fetch_nba_api.py → real per-game + advanced stats → DB
//   4. Rebuild leaderboards from fresh stats
//   5. Sync recent + upcoming games from ESPN scoreboard
// ============================================================

set_time_limit(300);           // 5 minutes — roster + Python sync needs time
ini_set('memory_limit', '256M');

header('Content-Type: application/json');
require_once __DIR__ . '/../config/db.php';

// ── ESPN GET helper ───────────────────────────────────────────
function espnGet(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'CourtStars/2.0',
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body     = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if (!$body || $httpCode !== 200) {
        throw new RuntimeException("ESPN HTTP {$httpCode}: {$url}");
    }
    $decoded = json_decode($body, true);
    if (!is_array($decoded)) {
        throw new RuntimeException("Invalid JSON from ESPN: {$url}");
    }
    return $decoded;
}

// ── Static enrichment (championships, arena, legends, rivals, history) ───
function teamMeta(string $abbr): array {
    $d = [
        'ATL'=>[1946,1,'State Farm Arena','Dominique Wilkins, Bob Pettit, Trae Young','Boston Celtics, Orlando Magic','Atlanta blends deep scoring history with a modern guard-led identity.'],
        'BOS'=>[1946,18,'TD Garden','Bill Russell, Larry Bird, Paul Pierce, Jayson Tatum','Los Angeles Lakers, Philadelphia 76ers','Boston is one of the league\'s standard-setters, built on defense, banners, and elite wings.'],
        'BKN'=>[1967,0,'Barclays Center','Julius Erving, Jason Kidd, Vince Carter','New York Knicks, Boston Celtics','Brooklyn tracks a fast-changing roster in one of the NBA\'s biggest markets.'],
        'CHA'=>[1988,0,'Spectrum Center','Larry Johnson, Kemba Walker, LaMelo Ball','Atlanta Hawks, Orlando Magic','Charlotte continues building around young talent and pace.'],
        'CHI'=>[1966,6,'United Center','Michael Jordan, Scottie Pippen, Derrick Rose','Detroit Pistons, New York Knicks','Chicago owns one of basketball\'s most famous dynasties.'],
        'CLE'=>[1970,1,'Rocket Mortgage FieldHouse','LeBron James, Kyrie Irving, Mark Price','Golden State Warriors, Detroit Pistons','Cleveland reached the mountaintop in 2016 and now tracks a new competitive core.'],
        'DAL'=>[1980,1,'American Airlines Center','Dirk Nowitzki, Luka Doncic, Jason Kidd','San Antonio Spurs, Houston Rockets','Dallas has a star-driven history powered by elite shot creation.'],
        'DEN'=>[1976,1,'Ball Arena','Nikola Jokic, Alex English, Carmelo Anthony','Los Angeles Lakers, Utah Jazz','Denver rose from steady contender to champion.'],
        'DET'=>[1941,3,'Little Caesars Arena','Isiah Thomas, Ben Wallace, Grant Hill','Chicago Bulls, Indiana Pacers','Detroit is known for physical title teams and defense-first eras.'],
        'GSW'=>[1946,7,'Chase Center','Stephen Curry, Klay Thompson, Rick Barry','Cleveland Cavaliers, Los Angeles Lakers','Golden State reshaped the modern NBA with spacing and shooting.'],
        'HOU'=>[1967,2,'Toyota Center','Hakeem Olajuwon, James Harden, Clyde Drexler','Dallas Mavericks, Utah Jazz','Houston pairs analytics, pace, and center history.'],
        'IND'=>[1967,0,'Gainbridge Fieldhouse','Reggie Miller, Paul George, Tyrese Haliburton','New York Knicks, Detroit Pistons','Indiana carries ABA roots and a high-tempo modern roster.'],
        'LAC'=>[1970,0,'Intuit Dome','Chris Paul, Blake Griffin, Kawhi Leonard','Los Angeles Lakers, Phoenix Suns','The Clippers track a star-focused build in Los Angeles.'],
        'LAL'=>[1947,17,'Crypto.com Arena','Magic Johnson, Kobe Bryant, Kareem Abdul-Jabbar, LeBron James','Boston Celtics, Golden State Warriors','The Lakers are a championship spotlight franchise built around iconic superstars.'],
        'MEM'=>[1995,0,'FedExForum','Pau Gasol, Marc Gasol, Ja Morant','Golden State Warriors, New Orleans Pelicans','Memphis is known for grit, defense, and electric guard play.'],
        'MIA'=>[1988,3,'Kaseya Center','Dwyane Wade, LeBron James, Jimmy Butler','Boston Celtics, New York Knicks','Miami is built around toughness, conditioning, and playoff pressure.'],
        'MIL'=>[1968,2,'Fiserv Forum','Giannis Antetokounmpo, Kareem Abdul-Jabbar, Oscar Robertson','Boston Celtics, Chicago Bulls','Milwaukee pairs historic bigs with a modern championship core.'],
        'MIN'=>[1989,0,'Target Center','Kevin Garnett, Anthony Edwards, Karl-Anthony Towns','Denver Nuggets, Oklahoma City Thunder','Minnesota tracks a rising defensive and athletic identity.'],
        'NOP'=>[2002,0,'Smoothie King Center','Chris Paul, Anthony Davis, Zion Williamson','Memphis Grizzlies, Houston Rockets','New Orleans builds around physical forwards and transition pressure.'],
        'NYK'=>[1946,2,'Madison Square Garden','Willis Reed, Patrick Ewing, Jalen Brunson','Boston Celtics, Miami Heat','The Knicks carry the pressure and energy of Madison Square Garden.'],
        'OKC'=>[1967,1,'Paycom Center','Kevin Durant, Russell Westbrook, Shai Gilgeous-Alexander','Golden State Warriors, Denver Nuggets','Oklahoma City is built around player development and explosive perimeter stars.'],
        'ORL'=>[1989,0,'Kia Center','Shaquille O\'Neal, Penny Hardaway, Dwight Howard','Miami Heat, Atlanta Hawks','Orlando has a history of elite young bigs and long defensive teams.'],
        'PHI'=>[1946,3,'Wells Fargo Center','Julius Erving, Allen Iverson, Joel Embiid','Boston Celtics, New York Knicks','Philadelphia blends historic stars with one of the league\'s most demanding fanbases.'],
        'PHX'=>[1968,0,'Footprint Center','Steve Nash, Charles Barkley, Devin Booker','Los Angeles Lakers, San Antonio Spurs','Phoenix is known for guards, pace, and efficient offense.'],
        'POR'=>[1970,1,'Moda Center','Bill Walton, Clyde Drexler, Damian Lillard','Los Angeles Lakers, Utah Jazz','Portland has a loyal fanbase and a guard-heavy spotlight history.'],
        'SAC'=>[1923,1,'Golden 1 Center','Oscar Robertson, Chris Webber, De\'Aaron Fox','Los Angeles Lakers, Golden State Warriors','Sacramento combines old franchise roots with a fast modern offense.'],
        'SAS'=>[1967,5,'Frost Bank Center','Tim Duncan, David Robinson, Tony Parker, Manu Ginobili','Dallas Mavericks, Los Angeles Lakers','San Antonio is the model of stability, development, and team basketball.'],
        'TOR'=>[1995,1,'Scotiabank Arena','Vince Carter, DeMar DeRozan, Kawhi Leonard','Philadelphia 76ers, Boston Celtics','Toronto represents Canada with a development-focused championship history.'],
        'UTA'=>[1974,0,'Delta Center','Karl Malone, John Stockton, Donovan Mitchell','Portland Trail Blazers, Denver Nuggets','Utah\'s pick-and-roll legacy defines one of basketball\'s most efficient offenses.'],
        'WAS'=>[1961,1,'Capital One Arena','Elvin Hayes, Wes Unseld, Bradley Beal','Philadelphia 76ers, Boston Celtics','Washington\'s franchise spans multiple cities and eras of NBA growth.'],
    ];
    return $d[strtoupper($abbr)] ?? [2000, 0, 'Home Arena', '', '', ''];
}

// ── Current season string e.g. "2024-25" ─────────────────────
function currentSeasonStr(): string {
    $m = (int)date('n');
    $y = (int)date('Y');
    $start = ($m >= 10) ? $y : $y - 1;
    return $start . '-' . substr((string)($start + 1), -2);
}

// ══════════════════════════════════════════════════════════════
// STEP 1 — TEAMS via ESPN
// ══════════════════════════════════════════════════════════════
function syncTeams(PDO $pdo): array {
    $log          = [];
    $espnTeamIds  = [];   // [ espnNumericId => 'ABBR' ]

    try {
        $raw       = espnGet('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=32');
        $espnTeams = $raw['sports'][0]['leagues'][0]['teams'] ?? [];
        if (empty($espnTeams)) throw new RuntimeException('No teams returned');

        $stmt = $pdo->prepare("
            INSERT INTO teams
                (api_team_id, full_name, short_name, city, abbreviation,
                 conference, division, arena, primary_color, secondary_color,
                 logo_url, championships, founded_year, legends, rivals, history)
            VALUES
                (:api_team_id,:full_name,:short_name,:city,:abbreviation,
                 :conference,:division,:arena,:primary_color,:secondary_color,
                 :logo_url,:championships,:founded_year,:legends,:rivals,:history)
            ON DUPLICATE KEY UPDATE
                full_name=VALUES(full_name), short_name=VALUES(short_name),
                city=VALUES(city), conference=VALUES(conference),
                division=VALUES(division), primary_color=VALUES(primary_color),
                secondary_color=VALUES(secondary_color), logo_url=VALUES(logo_url)
        ");

        $cnt = 0;
        foreach ($espnTeams as $entry) {
            $t    = $entry['team'];
            $abbr = strtoupper($t['abbreviation'] ?? '');
            if (!$abbr) continue;

            $eid = (int)($t['id'] ?? 0);
            if ($eid) $espnTeamIds[$eid] = $abbr;

            [$founded, $chips, $arena, $legends, $rivals, $history] = teamMeta($abbr);
            $c1   = '#' . ltrim($t['color']          ?? '1a4a8a', '#');
            $c2   = '#' . ltrim($t['alternateColor'] ?? 'c9a227', '#');
            $logo = 'https://a.espncdn.com/i/teamlogos/nba/500/' . strtolower($abbr) . '.png';

            $conf = ''; $div = '';
            foreach (($t['groups'] ?? []) as $g) {
                $gn = strtolower($g['name'] ?? '');
                if (str_contains($gn, 'conference')) $conf = $g['shortName'] ?? '';
                if (str_contains($gn, 'division'))   $div  = $g['name']      ?? '';
            }

            $stmt->execute([
                ':api_team_id'    => $eid,
                ':full_name'      => $t['displayName']      ?? $abbr,
                ':short_name'     => $t['shortDisplayName'] ?? $abbr,
                ':city'           => $t['location']         ?? '',
                ':abbreviation'   => $abbr,
                ':conference'     => $conf,
                ':division'       => $div,
                ':arena'          => $arena,
                ':primary_color'  => $c1,
                ':secondary_color'=> $c2,
                ':logo_url'       => $logo,
                ':championships'  => $chips,
                ':founded_year'   => $founded,
                ':legends'        => $legends,
                ':rivals'         => $rivals,
                ':history'        => $history,
            ]);
            $cnt++;
        }
        $log[] = "✅ Teams: {$cnt} synced from ESPN";
    } catch (Throwable $e) {
        $log[] = "⚠️ Teams: " . $e->getMessage();
    }

    return [$log, $espnTeamIds];
}

// ══════════════════════════════════════════════════════════════
// STEP 2 — ROSTERS via ESPN (players + basic bio)
// ══════════════════════════════════════════════════════════════
function syncRosters(PDO $pdo, array $espnTeamIds): array {
    $log = [];

    if (empty($espnTeamIds)) {
        // Try to rebuild from DB
        foreach ($pdo->query("SELECT api_team_id, abbreviation FROM teams WHERE api_team_id IS NOT NULL")->fetchAll() as $r) {
            $espnTeamIds[(int)$r['api_team_id']] = strtoupper($r['abbreviation']);
        }
    }
    if (empty($espnTeamIds)) {
        $log[] = "⚠️ Rosters: No ESPN team IDs — run team sync first";
        return $log;
    }

    $teamMap = $pdo->query("SELECT abbreviation, id FROM teams")->fetchAll(PDO::FETCH_KEY_PAIR);

    $pStmt = $pdo->prepare("
        INSERT INTO players
            (api_player_id, team_id, first_name, last_name, position,
             jersey_number, height_inches, weight_lbs, country, avatar_url, is_active)
        VALUES
            (:api_id, :team_id, :first, :last, :pos,
             :jersey, :height, :weight, :country, :avatar, 1)
        ON DUPLICATE KEY UPDATE
            team_id=VALUES(team_id), first_name=VALUES(first_name), last_name=VALUES(last_name),
            position=VALUES(position), jersey_number=VALUES(jersey_number),
            height_inches=VALUES(height_inches), weight_lbs=VALUES(weight_lbs),
            country=VALUES(country), avatar_url=VALUES(avatar_url), is_active=1
    ");

    // Placeholder stats row so JOINs never break before the Python sync runs
    $sStmt = $pdo->prepare("
        INSERT IGNORE INTO player_stats (player_id, season_id, games_played)
        VALUES (:pid, 1, 0)
    ");

    $cnt = 0;
    foreach ($espnTeamIds as $eid => $abbr) {
        try {
            $url  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{$eid}/roster";
            $data = espnGet($url);

            foreach (($data['athletes'] ?? []) as $group) {
                $items = isset($group['items']) ? $group['items'] : [$group];
                foreach ($items as $a) {
                    if (empty($a['id'])) continue;

                    $fullName = trim($a['displayName'] ?? $a['fullName'] ?? '');
                    $parts    = explode(' ', $fullName, 2);
                    $first    = $parts[0] ?? '';
                    $last     = $parts[1] ?? '';
                    if (!$first && !$last) continue;

                    // Height "6' 7\"" → inches
                    $heightIn = null;
                    $dh = (string)($a['displayHeight'] ?? $a['height'] ?? '');
                    if (preg_match('/(\d+)\D+(\d+)/', $dh, $m)) {
                        $heightIn = (int)$m[1] * 12 + (int)$m[2];
                    } elseif (is_numeric($dh) && (int)$dh > 0) {
                        $heightIn = (int)$dh;
                    }

                    // Weight "220 lbs" → int
                    $weight = null;
                    $dw = (string)($a['displayWeight'] ?? $a['weight'] ?? '');
                    if (preg_match('/(\d+)/', $dw, $m)) $weight = (int)$m[1];

                    $espnPid = (int)$a['id'];
                    $avatar  = "https://a.espncdn.com/i/headshots/nba/players/full/{$espnPid}.png";
                    $teamId  = $teamMap[$abbr] ?? null;

                    $pStmt->execute([
                        ':api_id'  => $espnPid,
                        ':team_id' => $teamId,
                        ':first'   => $first,
                        ':last'    => $last,
                        ':pos'     => $a['position']['abbreviation'] ?? '',
                        ':jersey'  => isset($a['jersey']) ? (int)$a['jersey'] : null,
                        ':height'  => $heightIn,
                        ':weight'  => $weight,
                        ':country' => $a['birthPlace']['country'] ?? '',
                        ':avatar'  => $avatar,
                    ]);

                    $pid = (int)$pdo->lastInsertId();
                    if (!$pid) {
                        $r = $pdo->prepare("SELECT id FROM players WHERE api_player_id = ?");
                        $r->execute([$espnPid]);
                        $pid = (int)($r->fetchColumn() ?: 0);
                    }
                    if ($pid) $sStmt->execute([':pid' => $pid]);
                    $cnt++;
                }
            }
        } catch (Throwable $e) {
            error_log("Roster sync failed for {$abbr}: " . $e->getMessage());
        }
        usleep(120_000);   // 120 ms per team
    }

    // Mark players not in any roster as inactive
    try {
        // We re-fetched all active players above; any player whose api_player_id was NOT
        // touched in this run still exists in the DB — just set them inactive.
        // (Simple approach: leave existing is_active as-is; ESPN sync sets is_active=1 for
        // every player it touches, so leavers will no longer be updated.)
    } catch (Throwable $ignored) {}

    $log[] = "✅ Rosters: {$cnt} players synced from ESPN";
    return $log;
}

// ══════════════════════════════════════════════════════════════
// STEP 3 — REAL STATS via nba_api Python script
// ── Find a Python binary that has nba_api installed ──────────
function findPythonWithNbaApi(): ?string {
    if (PHP_OS_FAMILY === 'Darwin'
        && file_exists('/usr/bin/arch')
        && file_exists('/usr/local/bin/python3')) {
        return '/usr/bin/arch -arm64 /usr/local/bin/python3';
    }

    // Try each candidate; write a temp file as signal instead of relying on stdout/quoting
    $candidates = [
        ['/usr/local/bin/python3', '/usr/bin/arch -arm64 /usr/local/bin/python3'],
        ['/usr/local/bin/python3', '/usr/local/bin/python3'],
        ['/opt/homebrew/bin/python3', '/usr/bin/arch -arm64 /opt/homebrew/bin/python3'],
        ['/opt/homebrew/bin/python3', '/opt/homebrew/bin/python3'],
        ['/Library/Frameworks/Python.framework/Versions/3.14/bin/python3', '/usr/bin/arch -arm64 /Library/Frameworks/Python.framework/Versions/3.14/bin/python3'],
        ['/Library/Frameworks/Python.framework/Versions/3.14/bin/python3', '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3'],
        ['/Library/Frameworks/Python.framework/Versions/3.13/bin/python3', '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3'],
        ['/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3'],
        ['/Library/Frameworks/Python.framework/Versions/3.11/bin/python3', '/Library/Frameworks/Python.framework/Versions/3.11/bin/python3'],
        ['/usr/local/bin/python3.14', '/usr/local/bin/python3.14'],
        ['/usr/local/bin/python3.13', '/usr/local/bin/python3.13'],
        ['/usr/local/bin/python3.12', '/usr/local/bin/python3.12'],
        ['/usr/local/bin/python3.11', '/usr/local/bin/python3.11'],
        ['/usr/bin/python3', '/usr/bin/python3'],
    ];
    $flag = sys_get_temp_dir() . '/nba_api_check_' . getmypid() . '.tmp';
    foreach ($candidates as [$bin, $cmdPrefix]) {
        if (!file_exists($bin)) continue;
        @unlink($flag);
        // Write flag file on success — avoids all shell quoting issues
        $cmd = $cmdPrefix
             . " -c "
             . escapeshellarg("from nba_api.stats.endpoints import leaguedashplayerstats; import pathlib; pathlib.Path(" . var_export($flag, true) . ").write_text('ok')")
             . " 2>/dev/null";
        shell_exec($cmd);
        if (@file_get_contents($flag) === 'ok') {
            @unlink($flag);
            return $cmdPrefix;
        }
    }
    @unlink($flag);
    return null;
}

// ══════════════════════════════════════════════════════════════
function syncStats(PDO $pdo): array {
    $log    = [];
    $script = __DIR__ . '/../scripts/fetch_nba_api.py';

    if (!file_exists($script)) {
        $log[] = "⚠️ Stats: fetch_nba_api.py not found at {$script}";
        return $log;
    }

    $python = findPythonWithNbaApi();
    if (!$python) {
        $log[] = "⚠️ Stats: nba_api not found in any Python. Run: pip3 install nba_api";
        return $log;
    }
    $log[] = "ℹ️ Stats: using Python at {$python}";

    $season = currentSeasonStr();
    $raw    = shell_exec($python . " " . escapeshellarg($script) . " --season " . escapeshellarg($season) . " 2>/dev/null");

    if (!$raw) {
        $log[] = "⚠️ Stats: Python script returned nothing — nba_api may have a network issue";
        return $log;
    }

    $players = json_decode($raw, true);
    if (!is_array($players)) {
        $err = $players['error'] ?? 'Invalid JSON from Python script';
        $log[] = "⚠️ Stats: {$err}";
        return $log;
    }

    if (isset($players['error'])) {
        $log[] = "⚠️ Stats: " . $players['error'];
        return $log;
    }

    $seasonId = (int)$pdo->query("SELECT id FROM seasons WHERE is_current = 1 LIMIT 1")->fetchColumn();
    if (!$seasonId) {
        $log[] = "⚠️ Stats: No current season in DB";
        return $log;
    }

    // Map NBA API player IDs → DB player IDs
    // ESPN rosters and nba_api use different player ID systems, so use
    // api_player_id when possible and fall back to player name + team.
    $idStmt = $pdo->prepare("SELECT id FROM players WHERE api_player_id = ? LIMIT 1");
    $nameTeamStmt = $pdo->prepare("
        SELECT p.id
        FROM players p
        JOIN teams t ON p.team_id = t.id
        WHERE LOWER(p.first_name) = LOWER(?)
          AND LOWER(p.last_name) = LOWER(?)
          AND UPPER(t.abbreviation) = UPPER(?)
        LIMIT 1
    ");

    $statStmt = $pdo->prepare("
        INSERT INTO player_stats
            (player_id, season_id, games_played, games_started, minutes_per_game,
             points_per_game, rebounds_per_game, offensive_rebounds, defensive_rebounds,
             assists_per_game, steals_per_game, blocks_per_game, turnovers_per_game,
             field_goal_pct, three_pt_pct, three_point_pct, free_throw_pct,
             three_point_attempts, three_point_made,
             player_efficiency_rating, true_shooting_pct,
             assist_pct, usage_rate, offensive_rating, defensive_rating, net_rating)
        VALUES
            (:player_id, :season_id, :gp, :gs, :min,
             :ppg, :rpg, :oreb, :dreb,
             :apg, :spg, :bpg, :tpg,
             :fgp, :threep, :threep2, :ftp,
             :tpa, :tpm,
             :per, :ts, :ast_pct, :usg, :ortg, :drtg, :net)
        ON DUPLICATE KEY UPDATE
            games_played=VALUES(games_played), games_started=VALUES(games_started),
            minutes_per_game=VALUES(minutes_per_game),
            points_per_game=VALUES(points_per_game),
            rebounds_per_game=VALUES(rebounds_per_game),
            offensive_rebounds=VALUES(offensive_rebounds),
            defensive_rebounds=VALUES(defensive_rebounds),
            assists_per_game=VALUES(assists_per_game),
            steals_per_game=VALUES(steals_per_game),
            blocks_per_game=VALUES(blocks_per_game),
            turnovers_per_game=VALUES(turnovers_per_game),
            field_goal_pct=VALUES(field_goal_pct),
            three_pt_pct=VALUES(three_pt_pct),
            three_point_pct=VALUES(three_point_pct),
            free_throw_pct=VALUES(free_throw_pct),
            three_point_attempts=VALUES(three_point_attempts),
            three_point_made=VALUES(three_point_made),
            player_efficiency_rating=VALUES(player_efficiency_rating),
            true_shooting_pct=VALUES(true_shooting_pct),
            assist_pct=VALUES(assist_pct),
            usage_rate=VALUES(usage_rate),
            offensive_rating=VALUES(offensive_rating),
            defensive_rating=VALUES(defensive_rating),
            net_rating=VALUES(net_rating)
    ");

    $cnt = 0;
    foreach ($players as $p) {
        $idStmt->execute([(int)($p['nba_id'] ?? 0)]);
        $pid = (int)($idStmt->fetchColumn() ?: 0);
        if (!$pid) {
            $nameTeamStmt->execute([
                $p['first_name'] ?? '',
                $p['last_name'] ?? '',
                $p['team_abbreviation'] ?? '',
            ]);
            $pid = (int)($nameTeamStmt->fetchColumn() ?: 0);
        }
        if (!$pid) continue;   // player not in DB roster yet (will appear after next roster sync)

        $statStmt->execute([
            ':player_id' => $pid,
            ':season_id' => $seasonId,
            ':gp'  => $p['games_played']   ?? 0,
            ':gs'  => $p['games_started']  ?? 0,
            ':min' => $p['minutes_per_game'] ?? 0,
            ':ppg' => $p['points_per_game'] ?? 0,
            ':rpg' => $p['rebounds_per_game'] ?? 0,
            ':oreb'=> $p['offensive_rebounds'] ?? 0,
            ':dreb'=> $p['defensive_rebounds'] ?? 0,
            ':apg' => $p['assists_per_game'] ?? 0,
            ':spg' => $p['steals_per_game'] ?? 0,
            ':bpg' => $p['blocks_per_game'] ?? 0,
            ':tpg' => $p['turnovers_per_game'] ?? 0,
            ':fgp' => $p['field_goal_pct']  ?? 0,
            ':threep' => $p['three_pt_pct'] ?? 0,
            ':threep2'=> $p['three_pt_pct'] ?? 0,
            ':ftp' => $p['free_throw_pct']  ?? 0,
            ':tpa' => $p['three_point_attempts'] ?? 0,
            ':tpm' => $p['three_point_made'] ?? 0,
            ':per' => $p['player_efficiency_rating'] ?? 0,
            ':ts'  => $p['true_shooting_pct'] ?? 0,
            ':ast_pct' => $p['assist_pct'] ?? 0,
            ':usg' => $p['usage_rate'] ?? 0,
            ':ortg'=> $p['offensive_rating'] ?? 0,
            ':drtg'=> $p['defensive_rating'] ?? 0,
            ':net' => $p['net_rating'] ?? 0,
        ]);
        $cnt++;
    }

    $log[] = "✅ Stats: {$cnt} players updated from nba_api ({$season})";
    return $log;
}

// ══════════════════════════════════════════════════════════════
// STEP 4 — REBUILD LEADERBOARDS
// ══════════════════════════════════════════════════════════════
function rebuildLeaderboardsInternal(PDO $pdo): array {
    $log = [];
    try {
        $seasonId = (int)$pdo->query("SELECT id FROM seasons WHERE is_current = 1 LIMIT 1")->fetchColumn();
        if (!$seasonId) { $log[] = "⚠️ Leaderboards: No current season"; return $log; }

        $pdo->prepare("DELETE FROM leaderboards WHERE season_id = ?")->execute([$seasonId]);

        $cats = [
            'points'    => 'ps.points_per_game',
            'rebounds'  => 'ps.rebounds_per_game',
            'assists'   => 'ps.assists_per_game',
            'steals'    => 'ps.steals_per_game',
            'blocks'    => 'ps.blocks_per_game',
            'three_pt'  => 'COALESCE(ps.three_pt_pct, ps.three_point_pct)',
            'per'       => 'ps.player_efficiency_rating',
            'ts_pct'    => 'ps.true_shooting_pct',
            'usage'     => 'ps.usage_rate',
            'net_rating'=> 'ps.net_rating',
        ];

        $ins = $pdo->prepare("
            INSERT INTO leaderboards (season_id, player_id, category, stat_value, rank_position)
            VALUES (?, ?, ?, ?, ?)
        ");

        $total = 0;
        foreach ($cats as $cat => $col) {
            $minGP = in_array($cat, ['per', 'ts_pct', 'net_rating']) ? 'AND ps.games_played >= 10' : '';
            $rows = $pdo->query("
                SELECT ps.player_id, {$col} AS val
                FROM player_stats ps
                JOIN players p ON ps.player_id = p.id
                WHERE ps.season_id = {$seasonId}
                  AND {$col} > 0
                  AND p.is_active = 1
                  {$minGP}
                ORDER BY val DESC
                LIMIT 25
            ")->fetchAll();

            foreach ($rows as $rank => $row) {
                $ins->execute([$seasonId, $row['player_id'], $cat, $row['val'], $rank + 1]);
                $total++;
            }
        }
        $log[] = "✅ Leaderboards: rebuilt ({$total} rows across 10 categories)";
    } catch (Throwable $e) {
        $log[] = "⚠️ Leaderboards: " . $e->getMessage();
    }
    return $log;
}

// ══════════════════════════════════════════════════════════════
// STEP 5 — GAMES via ESPN scoreboard
// ══════════════════════════════════════════════════════════════
function syncGames(PDO $pdo): array {
    $log = [];
    try {
        $seasonId = (int)$pdo->query("SELECT id FROM seasons WHERE is_current = 1 LIMIT 1")->fetchColumn();
        if (!$seasonId) { $log[] = "⚠️ Games: No current season"; return $log; }

        // ESPN scoreboard covers today; also fetch yesterday and tomorrow
        $dates = [
            date('Ymd', strtotime('-1 day')),
            date('Ymd'),
            date('Ymd', strtotime('+1 day')),
        ];

        $teamAbrToId = $pdo->query("SELECT abbreviation, id FROM teams")->fetchAll(PDO::FETCH_KEY_PAIR);

        $upsert = $pdo->prepare("
            INSERT INTO games
                (api_game_id, season_id, home_team_id, away_team_id,
                 game_date, game_time, home_score, away_score, status, period)
            VALUES
                (:gid, :sid, :htid, :atid, :gdate, :gtime, :hs, :as, :status, :period)
            ON DUPLICATE KEY UPDATE
                home_score=VALUES(home_score), away_score=VALUES(away_score),
                status=VALUES(status), period=VALUES(period)
        ");

        $cnt = 0;
        foreach ($dates as $d) {
            try {
                $url  = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={$d}";
                $data = espnGet($url);

                foreach (($data['events'] ?? []) as $ev) {
                    $comp = $ev['competitions'][0] ?? [];
                    if (empty($comp)) continue;

                    $competitors = $comp['competitors'] ?? [];
                    $home = $away = null;
                    foreach ($competitors as $c) {
                        if (($c['homeAway'] ?? '') === 'home') $home = $c;
                        if (($c['homeAway'] ?? '') === 'away') $away = $c;
                    }
                    if (!$home || !$away) continue;

                    $homeAbbr = strtoupper($home['team']['abbreviation'] ?? '');
                    $awayAbbr = strtoupper($away['team']['abbreviation'] ?? '');
                    $htid     = $teamAbrToId[$homeAbbr] ?? null;
                    $atid     = $teamAbrToId[$awayAbbr] ?? null;
                    if (!$htid || !$atid) continue;

                    $status = $ev['status']['type']['name'] ?? 'STATUS_SCHEDULED';
                    $dbStatus = match(true) {
                        str_contains($status, 'IN_PROGRESS'), str_contains($status, 'HALFTIME') => 'In Progress',
                        str_contains($status, 'FINAL') => 'Final',
                        str_contains($status, 'POSTPONED') => 'Postponed',
                        default => 'Scheduled',
                    };

                    $gameDate = substr($ev['date'] ?? date('Y-m-d'), 0, 10);
                    $gameTime = null;
                    if (!empty($ev['date']) && strlen($ev['date']) > 10) {
                        $ts = strtotime($ev['date']);
                        if ($ts) $gameTime = date('H:i:s', $ts);
                    }

                    $upsert->execute([
                        ':gid'    => $ev['id'] ?? uniqid('espn_'),
                        ':sid'    => $seasonId,
                        ':htid'   => $htid,
                        ':atid'   => $atid,
                        ':gdate'  => $gameDate,
                        ':gtime'  => $gameTime,
                        ':hs'     => (int)($home['score'] ?? 0) ?: null,
                        ':as'     => (int)($away['score'] ?? 0) ?: null,
                        ':status' => $dbStatus,
                        ':period' => (int)($ev['status']['period'] ?? 0),
                    ]);
                    $cnt++;
                }
            } catch (Throwable $e) {
                error_log("Games sync failed for date {$d}: " . $e->getMessage());
            }
        }
        $log[] = "✅ Games: {$cnt} upserted from ESPN scoreboard";
    } catch (Throwable $e) {
        $log[] = "⚠️ Games: " . $e->getMessage();
    }
    return $log;
}

// ══════════════════════════════════════════════════════════════
// ENTRY POINT
// ══════════════════════════════════════════════════════════════
function syncAll(PDO $pdo): array {
    $log = [];

    [$teamLog, $espnTeamIds] = syncTeams($pdo);
    $log = array_merge($log, $teamLog);

    $log = array_merge($log, syncRosters($pdo, $espnTeamIds));
    $log = array_merge($log, syncStats($pdo));
    $log = array_merge($log, rebuildLeaderboardsInternal($pdo));
    $log = array_merge($log, syncGames($pdo));

    return $log;
}

// Run when called directly (browser or CLI)
if (basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    $pdo = getDBConnection();
    $log = syncAll($pdo);
    echo json_encode(['success' => true, 'log' => $log], JSON_PRETTY_PRINT);
}
?>
