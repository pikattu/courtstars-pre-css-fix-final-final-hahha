<?php
// ============================================================
// FILE: api/get_teams.php
// PURPOSE: Returns team data — tries ESPN API first (live),
//          falls back to local MySQL database
// ESPN API: http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
require_once __DIR__ . '/../config/db.php';

$pdo = getDBConnection();

// ── Static enrichment data (same as sync script) ─────────────
function teamEnrich(string $abbr): array {
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

try {
    // ── Try ESPN API first ────────────────────────────────────
    $espnUrl = 'http://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=32';
    $ch = curl_init($espnUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_USERAGENT      => 'CourtStars/1.0',
    ]);
    $espnResponse = curl_exec($ch);
    $httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($espnResponse && $httpCode === 200) {
        $raw       = json_decode($espnResponse, true);
        $espnTeams = $raw['sports'][0]['leagues'][0]['teams'] ?? [];

        if (!empty($espnTeams)) {
            // Get roster counts from DB
            $rosterCounts = [];
            try {
                $rows = $pdo->query("
                    SELECT t.abbreviation, COUNT(p.id) AS cnt
                    FROM teams t
                    LEFT JOIN players p ON t.id = p.team_id AND p.is_active = 1
                    GROUP BY t.abbreviation
                ")->fetchAll();
                foreach ($rows as $r) {
                    $rosterCounts[strtoupper($r['abbreviation'])] = (int)$r['cnt'];
                }
            } catch (Throwable $ignored) {}

            $teams = [];
            foreach ($espnTeams as $entry) {
                $t    = $entry['team'];
                $abbr = strtoupper($t['abbreviation'] ?? '');
                if (!$abbr) continue;

                [$founded,$chips,$arena,$legends,$rivals,$history] = teamEnrich($abbr);
                $color1 = '#' . ltrim($t['color']          ?? '1a4a8a', '#');
                $color2 = '#' . ltrim($t['alternateColor'] ?? 'c9a227', '#');
                $logo   = "https://a.espncdn.com/i/teamlogos/nba/500/" . strtolower($abbr) . ".png";

                $conf = ''; $div = '';
                foreach (($t['groups'] ?? []) as $g) {
                    $gn = strtolower($g['name'] ?? '');
                    if (str_contains($gn, 'conference')) $conf = $g['shortName'] ?? '';
                    if (str_contains($gn, 'division'))   $div  = $g['name']      ?? '';
                }

                $teams[] = [
                    'id'            => (int)($t['id'] ?? 0),
                    'abbreviation'  => $abbr,
                    'full_name'     => $t['displayName'] ?? $abbr,
                    'short_name'    => $t['shortDisplayName'] ?? $abbr,
                    'city'          => $t['location'] ?? '',
                    'conference'    => $conf,
                    'division'      => $div,
                    'arena'         => $arena,
                    'primary_color' => $color1,
                    'secondary_color'=> $color2,
                    'logo_url'      => $logo,
                    'championships' => $chips,
                    'founded_year'  => $founded,
                    'legends'       => $legends,
                    'rivals'        => $rivals,
                    'history'       => $history,
                    'roster_count'  => $rosterCounts[$abbr] ?? 0,
                    'source'        => 'espn_live',
                ];
            }

            echo json_encode(['success' => true, 'count' => count($teams), 'data' => $teams]);
            exit;
        }
    }

    // ── Fallback: local database ──────────────────────────────
    $stmt = $pdo->query("
        SELECT
            t.id, t.abbreviation, t.full_name, t.short_name, t.city,
            t.conference, t.division, t.arena,
            t.primary_color, t.secondary_color, t.logo_url,
            t.championships, t.founded_year,
            t.legends, t.rivals, t.history,
            COUNT(p.id) AS roster_count
        FROM teams t
        LEFT JOIN players p ON t.id = p.team_id AND p.is_active = 1
        GROUP BY t.id
        ORDER BY t.conference ASC, t.division ASC, t.short_name ASC
    ");
    $teams = $stmt->fetchAll();

    echo json_encode(['success' => true, 'count' => count($teams), 'data' => $teams, 'source' => 'db_fallback']);

} catch (Throwable $e) {
    error_log("get_teams.php error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve teams.']);
}
