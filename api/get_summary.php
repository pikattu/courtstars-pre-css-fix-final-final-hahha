<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';

$pdo = getDBConnection();

try {
    $summary = [
        'players' => (int) $pdo->query('SELECT COUNT(*) FROM players WHERE is_active = 1')->fetchColumn(),
        'seasons' => (int) $pdo->query('SELECT COUNT(*) FROM seasons')->fetchColumn(),
        'teams' => (int) $pdo->query('SELECT COUNT(*) FROM teams')->fetchColumn(),
        'championships' => (int) $pdo->query('SELECT COALESCE(SUM(championships), 0) FROM teams')->fetchColumn(),
    ];

    echo json_encode(['success' => true, 'data' => $summary]);
} catch (PDOException $e) {
    error_log('get_summary.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve summary.']);
}
?>
