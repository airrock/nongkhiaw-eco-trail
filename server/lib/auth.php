<?php
// Staff logins: each team member has an account. Roles: admin, staff (office staff).
declare(strict_types=1);
require_once __DIR__ . '/db.php';

function start_session(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
  session_name('nk_staff');
  ini_set('session.gc_maxlifetime', '43200');   // a dashboard left open in the office stays signed in for 12 hours
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
  session_start();
}

// The signed-in user (re-read every request, so a deactivated account or a changed role applies at once), or null.
function current_user(): ?array {
  start_session();
  $id = $_SESSION['uid'] ?? null;
  if (!$id) return null;
  $u = one('SELECT id, name, email, role, active, must_change_password, password_hash FROM users WHERE id = ?', [$id]);
  if (!$u || !$u['active']) { $_SESSION = []; return null; }
  // a password changed elsewhere (by the user or an admin) ends every other session of that user
  $mark = pw_mark($u['password_hash']); unset($u['password_hash']);
  if (!isset($_SESSION['pw'])) $_SESSION['pw'] = $mark;   // sessions from before this check
  elseif (!hash_equals($_SESSION['pw'], $mark)) { $_SESSION = []; return null; }
  $u['id'] = (int) $u['id']; $u['must_change_password'] = (bool) $u['must_change_password']; unset($u['active']);
  return $u;
}

function login(string $email, string $password): array {
  start_session();
  $u = one('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
  $wrong = new Refused('Wrong email or password.');
  if (!$u) { password_verify($password, '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG'); throw $wrong; }
  if ($u['locked_until'] && strtotime($u['locked_until'] . ' UTC') > time()) throw new Refused('Too many wrong passwords. Try again in 15 minutes.');
  if (!$u['active'] || !password_verify($password, $u['password_hash'])) {
    $fails = (int) $u['failed_logins'] + 1;
    q('UPDATE users SET failed_logins = ?, locked_until = IF(? >= 8, UTC_TIMESTAMP() + INTERVAL 15 MINUTE, NULL) WHERE id = ?', [$fails >= 8 ? 0 : $fails, $fails, $u['id']]);
    if ($fails >= 8) throw new Refused('Too many wrong passwords. Try again in 15 minutes.');
    throw $wrong;
  }
  q('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [$u['id']]);
  session_regenerate_id(true);
  $_SESSION['uid'] = (int) $u['id'];
  $_SESSION['pw'] = pw_mark($u['password_hash']);
  return current_user();
}

function pw_mark(string $hash): string { return substr(hash('sha256', $hash), 0, 20); }

function check_password(string $p): void {
  if (mb_strlen($p) < 8) throw new Refused('The password needs at least 8 characters.');
}

// There is always at least one active admin.
function guard_last_admin(int $userId, string $newRole, bool $newActive): void {
  $u = one('SELECT role, active FROM users WHERE id = ?', [$userId]);
  if ($u && $u['role'] === 'admin' && $u['active'] && ($newRole !== 'admin' || !$newActive)
      && !val("SELECT 1 FROM users WHERE role = 'admin' AND active = 1 AND id <> ? LIMIT 1", [$userId])) {
    throw new Refused('The last admin cannot be deactivated or made office staff.');
  }
}
