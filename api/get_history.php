<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/../config/db.php';

$pdo = getDBConnection();

try {
    $stmt = $pdo->query("
        SELECT
            id,
            event_year,
            title,
            description,
            category,
            image_url,
            related_player
        FROM history_timeline
        ORDER BY sort_order ASC, event_year ASC
    ");

    echo json_encode([
        'success' => true,
        'data' => $stmt->fetchAll()
    ]);
} catch (PDOException $e) {
    error_log('get_history.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Failed to retrieve history.']);
}
?>
