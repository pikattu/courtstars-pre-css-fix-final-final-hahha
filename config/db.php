<?php
// ============================================================
// FILE: config/db.php
// PURPOSE: Database connection + schema bootstrap
// ============================================================
require_once __DIR__ . '/constants.php';

function getDBConnection(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    try {
        // Create database if it doesn't exist
        $server = new PDO(
            'mysql:host=' . DB_HOST . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $server->exec(
            "CREATE DATABASE IF NOT EXISTS `" . DB_NAME . "`
             CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        );

        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER, DB_PASS,
            [
                PDO::ATTR_ERRMODE          => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]
        );

        createTables($pdo);
        addMissingColumns($pdo);

    } catch (PDOException $e) {
        error_log("DB connection failed: " . $e->getMessage());
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error'   => 'Database connection failed. Ensure MySQL is running.',
            'details' => $e->getMessage(),
        ]);
        exit;
    }

    return $pdo;
}

// ── Check if stats are stale (> N hours since last update) ──
function statsAreStale(PDO $pdo, int $hours = 6): bool {
    try {
        $ts = $pdo->query("
            SELECT MAX(updated_at) FROM player_stats
        ")->fetchColumn();
        if (!$ts) return true;
        return (time() - strtotime($ts)) > ($hours * 3600);
    } catch (Throwable $e) {
        return true;
    }
}

function createTables(PDO $pdo): void {
    // teams
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS teams (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            api_team_id      INT UNIQUE,
            full_name        VARCHAR(120) NOT NULL,
            short_name       VARCHAR(80),
            nickname         VARCHAR(100),
            city             VARCHAR(80),
            abbreviation     VARCHAR(10) UNIQUE,
            conference       VARCHAR(30),
            division         VARCHAR(50),
            arena            VARCHAR(120),
            primary_color    VARCHAR(20) DEFAULT '#1a4a8a',
            secondary_color  VARCHAR(20) DEFAULT '#c9a227',
            logo_url         VARCHAR(255),
            championships    INT DEFAULT 0,
            founded_year     INT,
            legends          TEXT,
            rivals           TEXT,
            history          TEXT,
            created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // players
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS players (
            id             INT AUTO_INCREMENT PRIMARY KEY,
            api_player_id  INT UNIQUE,
            team_id        INT,
            first_name     VARCHAR(80) NOT NULL,
            last_name      VARCHAR(80) NOT NULL,
            position       VARCHAR(20),
            jersey_number  INT,
            height_inches  INT,
            weight_lbs     INT,
            country        VARCHAR(80),
            avatar_url     VARCHAR(255),
            is_active      TINYINT(1) DEFAULT 1,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (team_id) REFERENCES teams(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // seasons
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS seasons (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            season_label VARCHAR(10) NOT NULL UNIQUE,
            name         VARCHAR(40) NOT NULL UNIQUE,
            is_current   TINYINT(1) DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // player_stats — full advanced stats schema
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS player_stats (
            id                       INT AUTO_INCREMENT PRIMARY KEY,
            player_id                INT NOT NULL,
            season_id                INT NOT NULL,
            games_played             INT DEFAULT 0,
            games_started            INT DEFAULT 0,
            minutes_per_game         DECIMAL(5,2) DEFAULT 0.00,
            points_per_game          DECIMAL(5,2) DEFAULT 0.00,
            rebounds_per_game        DECIMAL(5,2) DEFAULT 0.00,
            offensive_rebounds       DECIMAL(5,2) DEFAULT 0.00,
            defensive_rebounds       DECIMAL(5,2) DEFAULT 0.00,
            assists_per_game         DECIMAL(5,2) DEFAULT 0.00,
            steals_per_game          DECIMAL(5,2) DEFAULT 0.00,
            blocks_per_game          DECIMAL(5,2) DEFAULT 0.00,
            turnovers_per_game       DECIMAL(5,2) DEFAULT 0.00,
            field_goal_pct           DECIMAL(5,3) DEFAULT 0.000,
            three_pt_pct             DECIMAL(5,3) DEFAULT 0.000,
            three_point_pct          DECIMAL(5,3) DEFAULT 0.000,
            free_throw_pct           DECIMAL(5,3) DEFAULT 0.000,
            three_point_attempts     DECIMAL(5,2) DEFAULT 0.00,
            three_point_made         DECIMAL(5,2) DEFAULT 0.00,
            player_efficiency_rating DECIMAL(6,3) DEFAULT 0.000,
            true_shooting_pct        DECIMAL(5,3) DEFAULT 0.000,
            assist_pct               DECIMAL(5,3) DEFAULT 0.000,
            usage_rate               DECIMAL(5,3) DEFAULT 0.000,
            offensive_rating         DECIMAL(6,1) DEFAULT 0.0,
            defensive_rating         DECIMAL(6,1) DEFAULT 0.0,
            net_rating               DECIMAL(6,1) DEFAULT 0.0,
            updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE (player_id, season_id),
            FOREIGN KEY (player_id) REFERENCES players(id),
            FOREIGN KEY (season_id) REFERENCES seasons(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // player_strengths
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS player_strengths (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            player_id    INT NOT NULL UNIQUE,
            scoring      TINYINT DEFAULT 0,
            defense      TINYINT DEFAULT 0,
            playmaking   TINYINT DEFAULT 0,
            athleticism  TINYINT DEFAULT 0,
            shooting     TINYINT DEFAULT 0,
            rebounding   TINYINT DEFAULT 0,
            badges       LONGTEXT,
            FOREIGN KEY (player_id) REFERENCES players(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // leaderboards
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS leaderboards (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            season_id     INT NOT NULL,
            player_id     INT NOT NULL,
            category      VARCHAR(50) NOT NULL,
            stat_value    DECIMAL(8,3) NOT NULL,
            rank_position INT NOT NULL,
            last_updated  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (season_id) REFERENCES seasons(id),
            FOREIGN KEY (player_id) REFERENCES players(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // history_timeline
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS history_timeline (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            event_year       YEAR NOT NULL,
            title            VARCHAR(255) NOT NULL,
            description      TEXT NOT NULL,
            category         VARCHAR(50) DEFAULT 'general',
            image_url        VARCHAR(255),
            related_team_id  INT,
            related_player   VARCHAR(100),
            sort_order       INT DEFAULT 0,
            FOREIGN KEY (related_team_id) REFERENCES teams(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // games
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS games (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            api_game_id  VARCHAR(50) UNIQUE,
            season_id    INT NOT NULL,
            home_team_id INT NOT NULL,
            away_team_id INT NOT NULL,
            game_date    DATE NOT NULL,
            game_time    TIME,
            home_score   INT,
            away_score   INT,
            status       ENUM('Scheduled','In Progress','Final','Postponed') DEFAULT 'Scheduled',
            period       TINYINT DEFAULT 0,
            created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (season_id)    REFERENCES seasons(id),
            FOREIGN KEY (home_team_id) REFERENCES teams(id),
            FOREIGN KEY (away_team_id) REFERENCES teams(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // users
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            username      VARCHAR(80) UNIQUE NOT NULL,
            email         VARCHAR(180) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Default season
    $pdo->exec("
        INSERT IGNORE INTO seasons (id, season_label, name, is_current)
        VALUES (1, 'Current', 'Current', 1)
    ");
}

function addMissingColumns(PDO $pdo): void {
    $alters = [
        // player_stats — advanced columns added by this version
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS player_efficiency_rating DECIMAL(6,3) DEFAULT 0.000",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS true_shooting_pct        DECIMAL(5,3) DEFAULT 0.000",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS assist_pct               DECIMAL(5,3) DEFAULT 0.000",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS usage_rate               DECIMAL(5,3) DEFAULT 0.000",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS offensive_rating         DECIMAL(6,1) DEFAULT 0.0",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS defensive_rating         DECIMAL(6,1) DEFAULT 0.0",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS net_rating               DECIMAL(6,1) DEFAULT 0.0",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS games_started            INT DEFAULT 0",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS offensive_rebounds       DECIMAL(5,2) DEFAULT 0.00",
        "ALTER TABLE player_stats ADD COLUMN IF NOT EXISTS defensive_rebounds       DECIMAL(5,2) DEFAULT 0.00",
        // teams
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS api_team_id INT NULL UNIQUE AFTER id",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS short_name VARCHAR(80) NULL",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS arena VARCHAR(120) NULL",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS championships INT DEFAULT 0",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS founded_year INT NULL",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS legends TEXT NULL",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS rivals TEXT NULL",
        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS history TEXT NULL",
    ];
    foreach ($alters as $sql) {
        try { $pdo->exec($sql); } catch (Throwable $e) { /* column already exists */ }
    }
}
?>
