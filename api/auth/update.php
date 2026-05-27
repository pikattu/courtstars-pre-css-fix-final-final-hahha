<?php
// ============================================================
// FILE: api/auth/update.php
// PURPOSE: Update user profile (username, email, password, display_name)
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

$body            = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$currentPassword = trim($body['current_password'] ?? '');
$newUsername     = trim($body['username']         ?? '');
$newDisplayName  = trim($body['display_name']     ?? '');
$newEmail        = trim($body['email']            ?? '');
$newPassword     = trim($body['new_password']     ?? '');

// Get token from Authorization header or body
$token = '';
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/Bearer\s+(.+)/i', $authHeader, $m)) $token = $m[1];
if (!$token) $token = $body['token'] ?? '';

if (!$token) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Not authenticated.']);
    exit;
}

// Decode token to get user id
$decoded = json_decode(base64_decode($token), true);
if (!$decoded || !isset($decoded['id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Invalid session token.']);
    exit;
}
$userId = (int)$decoded['id'];

// Fetch current user
$stmt = $pdo->prepare("SELECT id, username, email, password_hash, display_name FROM users WHERE id = :id");
$stmt->execute([':id' => $userId]);
$user = $stmt->fetch();

if (!$user) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'User not found.']);
    exit;
}

if (!$currentPassword || !password_verify($currentPassword, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Current password is incorrect.']);
    exit;
}

// Build update fields
$fields = [];
$params = [':id' => $userId];

if ($newUsername && $newUsername !== $user['username']) {
    if (strlen($newUsername) < 3) {
        echo json_encode(['success' => false, 'error' => 'Username must be at least 3 characters.']);
        exit;
    }
    // Check uniqueness
    $chk = $pdo->prepare("SELECT id FROM users WHERE username = :u AND id != :id");
    $chk->execute([':u' => $newUsername, ':id' => $userId]);
    if ($chk->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Username already taken.']);
        exit;
    }
    $fields[] = 'username = :username';
    $params[':username'] = $newUsername;
}

if ($newDisplayName) {
    $fields[] = 'display_name = :display_name';
    $params[':display_name'] = $newDisplayName;
}

if ($newEmail && $newEmail !== $user['email']) {
    if (!filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
        echo json_encode(['success' => false, 'error' => 'Invalid email address.']);
        exit;
    }
    $chk = $pdo->prepare("SELECT id FROM users WHERE email = :e AND id != :id");
    $chk->execute([':e' => $newEmail, ':id' => $userId]);
    if ($chk->fetch()) {
        echo json_encode(['success' => false, 'error' => 'Email already in use.']);
        exit;
    }
    $fields[] = 'email = :email';
    $params[':email'] = $newEmail;
}

if ($newPassword) {
    if (strlen($newPassword) < 6) {
        echo json_encode(['success' => false, 'error' => 'New password must be at least 6 characters.']);
        exit;
    }
    $fields[] = 'password_hash = :password_hash';
    $params[':password_hash'] = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
}

if (empty($fields)) {
    echo json_encode(['success' => false, 'error' => 'No changes provided.']);
    exit;
}

$sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id";
$pdo->prepare($sql)->execute($params);

// Fetch updated user
$stmt = $pdo->prepare("SELECT id, username, email, display_name FROM users WHERE id = :id");
$stmt->execute([':id' => $userId]);
$updated = $stmt->fetch();

$newToken = base64_encode(json_encode(['id' => $updated['id'], 'username' => $updated['username'], 'ts' => time()]));

echo json_encode([
    'success' => true,
    'message' => 'Profile updated successfully!',
    'user'    => $updated,
    'token'   => $newToken,
]);