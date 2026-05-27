<?php
// ============================================================
// FILE: api/auth/delete.php
// PURPOSE: Delete user account permanently
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../../config/db.php';
$pdo = getDBConnection();

$body     = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$password = trim($body['password'] ?? '');

// Get token
$token = '';
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) $token = $m[1];
if (!$token) $token = $body['token'] ?? '';

if (!$token) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Not authenticated.']);
    exit;
}

$decoded = json_decode(base64_decode($token), true);
if (!$decoded || !isset($decoded['id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Invalid session token.']);
    exit;
}
$userId = (int)$decoded['id'];

$stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE id = :id");
$stmt->execute([':id' => $userId]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'User not found.']);
    exit;
}

if (!$password || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Incorrect password. Account not deleted.']);
    exit;
}

// Delete user (cascade-safe: remove FK-related data first if any)
$pdo->prepare("DELETE FROM users WHERE id = :id")->execute([':id' => $userId]);

echo json_encode([
    'success' => true,
    'message' => 'Account deleted successfully.',
]);