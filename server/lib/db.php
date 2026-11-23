<?php
// Database connection and small helpers. Settings come from environment variables (Docker) or from
// lib/config.local.php on the server (not in the repository): return ['host'=>..,'name'=>..,'user'=>..,'pass'=>..];
declare(strict_types=1);

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $c = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];
  $host = $c['host'] ?? getenv('NK_DB_HOST') ?: 'localhost';
  $name = $c['name'] ?? getenv('NK_DB_NAME');
  $pdo = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $c['user'] ?? getenv('NK_DB_USER'), $c['pass'] ?? getenv('NK_DB_PASS'), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false,
  ]);
  $pdo->exec("SET time_zone = '+00:00', sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION'");
  return $pdo;
}
function q(string $sql, array $p = []): PDOStatement { $s = db()->prepare($sql); $s->execute($p); return $s; }
function one(string $sql, array $p = []): ?array { $r = q($sql, $p)->fetch(); return $r === false ? null : $r; }
function all(string $sql, array $p = []): array { return q($sql, $p)->fetchAll(); }
function val(string $sql, array $p = []) { $r = q($sql, $p)->fetchColumn(); return $r === false ? null : $r; }

// Runs $fn inside one transaction; anything thrown undoes all of it.
function tx(callable $fn) {
  $pdo = db();
  if ($pdo->inTransaction()) return $fn();
  $pdo->beginTransaction();
  try { $out = $fn(); $pdo->commit(); return $out; }
  catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function setting(string $key, string $fallback = ''): string {
  $v = val('SELECT value FROM settings WHERE `key` = ?', [$key]);
  return $v === null || $v === '' ? $fallback : (string) $v;
}
function setting_num(string $key, float $fallback): float { $v = setting($key); return is_numeric($v) ? (float) $v : $fallback; }

// Today in Laos (the business day), and "now" for timestamps (UTC in the database).
function lao_today(): string { return (new DateTime('now', new DateTimeZone('Asia/Vientiane')))->format('Y-m-d'); }

// Who changed what. $old / $new hold only the columns that changed (null for an insert's values).
function log_change(string $table, string $rowId, string $action, ?array $old, ?array $new, ?array $user): void {
  q('INSERT INTO change_log (user_id, user_name, table_name, row_id, action, old_values, new_values) VALUES (?,?,?,?,?,?,?)',
    [$user['id'] ?? null, $user['name'] ?? 'website', $table, $rowId, $action,
     $old === null ? null : json_encode($old, JSON_UNESCAPED_UNICODE), $new === null ? null : json_encode($new, JSON_UNESCAPED_UNICODE)]);
}

class Refused extends Exception {}   // a request the rules do not allow: shown to the user as it is
