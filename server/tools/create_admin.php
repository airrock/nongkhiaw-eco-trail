<?php
// Creates (or resets) an admin account. Run once on the server, from the command line only:
//   php tools/create_admin.php "Name" email@example.com 'temporary password'
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once (is_dir(__DIR__ . '/../lib') ? __DIR__ . '/../lib' : '/var/www/lib') . '/auth.php';
[$name, $email, $pass] = array_slice($argv, 1) + [null, null, null];
if (!$name || !$email || !$pass) { fwrite(STDERR, "usage: php create_admin.php \"Name\" email 'password'\n"); exit(1); }
check_password($pass);
q("INSERT INTO users (name, email, password_hash, role, active, must_change_password) VALUES (?,?,?,'admin',1,1)
   ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), role = 'admin', active = 1, must_change_password = 1",
  [$name, mb_strtolower(trim($email)), password_hash($pass, PASSWORD_DEFAULT)]);
echo "admin ready: $email\n";
