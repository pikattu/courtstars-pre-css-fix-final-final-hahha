<?php
// ============================================================
// FILE: api/auth/register.php
// PURPOSE: Handle user registration — saves to database
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

// ── Ensure users table exists ─────────────────────────────────
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

// ── Read + validate input ──────────────────────────────────────
$body = json_decode(file_get_contents('php://input'), true) ?: $_POST;

$username    = trim($body['username']    ?? '');
$email       = trim($body['email']       ?? '');
$password    = trim($body['password']    ?? '');
$displayName = trim($body['display_name'] ?? $username);

$errors = [];
if (strlen($username) < 3)  $errors[] = 'Username must be at least 3 characters.';
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'Invalid email address.';
if (strlen($password) < 6)  $errors[] = 'Password must be at least 6 characters.';

if ($errors) {
    http_response_code(422);
    echo json_encode(['success' => false, 'errors' => $errors]);
    exit;
}

// ── Check duplicates ──────────────────────────────────────────
$dup = $pdo->prepare("SELECT id FROM users WHERE email = :e OR username = :u LIMIT 1");
$dup->execute([':e' => $email, ':u' => $username]);
if ($dup->fetch()) {
    http_response_code(409);
    echo json_encode(['success' => false, 'error' => 'Email or username already in use.']);
    exit;
}

// ── Hash & insert ─────────────────────────────────────────────
$hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
$ins  = $pdo->prepare("
    INSERT INTO users (username, email, password_hash, display_name)
    VALUES (:u, :e, :p, :d)
");
$ins->execute([':u' => $username, ':e' => $email, ':p' => $hash, ':d' => $displayName]);
$newId = (int) $pdo->lastInsertId();

// Return a session token (simple signed token — for production use JWT or sessions)
$token = base64_encode(json_encode(['id' => $newId, 'username' => $username, 'ts' => time()]));

echo json_encode([
    'success' => true,
    'message' => 'Account created successfully!',
    'user'    => ['id' => $newId, 'username' => $username, 'display_name' => $displayName],
    'token'   => $token,
]);
