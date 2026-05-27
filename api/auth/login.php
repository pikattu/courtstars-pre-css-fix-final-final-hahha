<?php
// ============================================================
// FILE: api/auth/login.php
// PURPOSE: Handle user login — validates credentials
// ============================================================
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../../config/db.php';
$pdo = getDBConnection();

// Ensure users table exists (in case login is called before any registration)
$pdo->exec("
    CREATE TABLE IF NOT EXISTS users (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        username    VARCHAR(80)  NOT NULL UNIQUE,
        email       VARCHAR(180) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(120),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login  TIMESTAMP NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
");

function ensureUserColumn(PDO $pdo, string $column, string $definition): void {
    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'users'
          AND COLUMN_NAME = ?
    ");
    $stmt->execute([$column]);
    if ((int)$stmt->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE users ADD COLUMN {$definition}");
    }
}

ensureUserColumn($pdo, 'password_hash', 'password_hash VARCHAR(255) NOT NULL');
ensureUserColumn($pdo, 'display_name', 'display_name VARCHAR(120) NULL');
ensureUserColumn($pdo, 'last_login', 'last_login TIMESTAMP NULL');

$body     = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$login    = trim($body['email'] ?? '');     // accepts email OR username
$password = trim($body['password'] ?? '');

if (!$login || !$password) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Email/username and password are required.']);
    exit;
}

$stmt = $pdo->prepare("
    SELECT id, username, email, password_hash, display_name
    FROM users
    WHERE email = :login_email OR username = :login_username
    LIMIT 1
");
$stmt->execute([
    ':login_email' => $login,
    ':login_username' => $login,
]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Invalid credentials. Please try again.']);
    exit;
}

// Update last_login
$pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = :id")->execute([':id' => $user['id']]);

$token = base64_encode(json_encode(['id' => $user['id'], 'username' => $user['username'], 'ts' => time()]));

echo json_encode([
    'success' => true,
    'message' => 'Welcome back, ' . ($user['display_name'] ?: $user['username']) . '!',
    'user'    => [
        'id'           => $user['id'],
        'username'     => $user['username'],
        'display_name' => $user['display_name'],
        'email'        => $user['email'],
    ],
    'token' => $token,
]);
