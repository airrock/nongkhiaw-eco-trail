<?php
// The dashboard's endpoint: POST JSON { action, ... } with the header X-NK: 1, signed in through a session cookie.
// What each role may do is decided here, on the server; the pages only hide what a role cannot use.
//   admin : everything.   staff (office staff): bookings, travellers, payments in, receipts, daily lists.
declare(strict_types=1);
require_once __DIR__ . '/../../lib/rules.php';
require_once __DIR__ . '/../../lib/auth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
function out($data, int $code = 200): void { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }

// Columns of a booking / traveller the dashboard may change (everything else is set by the rules).
const BOOKING_FIELDS = ['tour_date', 'tour', 'tour_name', 'transfer', 'pickup_date', 'return_date', 'train_dropoff', 'accommodation', 'maps_link',
  'nk_pickup', 'payment_method', 'source', 'note', 'est_tour_usd', 'est_transfer_kip', 'status', 'staff_notes', 'whatsapp', 'vehicle_to_nk',
  'vehicle_to_lpb', 'transport_remark', 'pickup_time', 'return_time', 'viewpoint', 'addon_package', 'private_tour'];
const TRAVELLER_FIELDS = ['first_name', 'last_name', 'full_name', 'country', 'gender', 'passport_no', 'passport_issued', 'passport_expires',
  'food', 'pickup_place', 'pickup_map', 'status', 'whatsapp'];
const DATE_FIELDS = ['tour_date', 'pickup_date', 'return_date'];
const SETTING_KEYS = ['transfer_one_kip', 'transfer_round_kip', 'train_extra_kip', 'kip_per_usd', 'nk_office', 'business_name',
  'business_address', 'business_contact', 'logo_url', 'transport_manager'];

// Updates the listed columns of one row, logs only what changed, returns the changed column names.
function update_row(string $table, string $where, array $whereArgs, array $allowed, array $in, string $rowId, array $user): array {
  $old = one("SELECT * FROM `$table` WHERE $where", $whereArgs);
  if (!$old) throw new Refused('Not found.');
  $set = []; $args = []; $was = []; $now = [];
  foreach ($allowed as $f) {
    if (!array_key_exists($f, $in)) continue;
    $v = $in[$f];
    if (in_array($f, DATE_FIELDS, true)) $v = date_or_null($v);
    elseif (is_bool($v)) $v = (int) $v;
    elseif ($v === null) $v = '';
    if ((string) $v === (string) $old[$f] && ($v === null) === ($old[$f] === null)) continue;
    $set[] = "`$f` = ?"; $args[] = $v; $was[$f] = $old[$f]; $now[$f] = $v;
  }
  if ($set) {
    q("UPDATE `$table` SET " . implode(', ', $set) . " WHERE $where", array_merge($args, $whereArgs));
    log_change($table, $rowId, 'update', $was, $now, $user);
  }
  return array_keys($now);
}

function booking_full(string $id, array $user): array {
  $b = one('SELECT * FROM bookings WHERE id = ?', [$id]);
  if (!$b || ($b['deleted_at'] && $user['role'] !== 'admin')) throw new Refused('Booking not found.');
  $trav = all('SELECT * FROM travellers WHERE booking_id = ? ORDER BY n', [$id]);
  return ['booking' => $b, 'travellers' => $trav, 'summary' => booking_summary($id, $trav), 'totals' => booking_totals($id),
    'payments' => all('SELECT * FROM payments WHERE booking_id = ? ORDER BY paid_on, id', [$id]),
    'receipt' => one('SELECT * FROM receipts WHERE booking_id = ?', [$id]),
    'agreements' => all('SELECT * FROM agreements WHERE booking_id = ? ORDER BY n', [$id])];
}

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_X_NK'] ?? '') !== '1') out(['error' => 'bad request'], 400);
  $in = json_decode(file_get_contents('php://input'), true);
  if (!is_array($in)) out(['error' => 'bad request'], 400);
  $action = (string) ($in['action'] ?? '');

  if ($action === 'login') out(['user' => login((string) ($in['email'] ?? ''), (string) ($in['password'] ?? ''))]);
  $user = current_user();
  if ($action === 'me') out(['user' => $user]);
  if (!$user) out(['error' => 'Please sign in.'], 401);
  if ($action === 'logout') { $_SESSION = []; session_destroy(); out(['ok' => true]); }
  if ($action === 'change_password') {
    $row = one('SELECT password_hash FROM users WHERE id = ?', [$user['id']]);
    if (!password_verify((string) ($in['old'] ?? ''), $row['password_hash'])) throw new Refused('The current password is wrong.');
    check_password((string) ($in['new'] ?? ''));
    q('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [password_hash($in['new'], PASSWORD_DEFAULT), $user['id']]);
    out(['ok' => true]);
  }
  $admin = $user['role'] === 'admin';
  $adminOnly = ['booking_delete', 'booking_restore', 'payment_edit', 'payment_delete', 'settings_save', 'tour_save', 'tour_delete',
    'menu_save', 'menu_delete', 'users', 'user_add', 'user_save', 'user_password', 'history_all'];
  if (in_array($action, $adminOnly, true) && !$admin) out(['error' => 'Only an admin can do this.'], 403);

  switch ($action) {
    /* ----- bookings ----- */
    case 'bookings': {
      $w = ['1=1']; $a = [];
      if (empty($in['deleted']) || !$admin) $w[] = 'b.deleted_at IS NULL'; else $w[] = 'b.deleted_at IS NOT NULL';
      if ($d = date_or_null($in['from'] ?? null)) { $w[] = 'b.tour_date >= ?'; $a[] = $d; }
      if ($d = date_or_null($in['to'] ?? null)) { $w[] = 'b.tour_date <= ?'; $a[] = $d; }
      if (in_array($in['status'] ?? '', STATUSES, true)) { $w[] = 'b.status = ?'; $a[] = $in['status']; }
      $s = clean($in['q'] ?? '', 60);
      if ($s !== '') {
        $w[] = '(b.id LIKE ? OR b.whatsapp LIKE ? OR r.no LIKE ? OR EXISTS (SELECT 1 FROM travellers t WHERE t.booking_id = b.id AND (t.full_name LIKE ? OR t.passport_no LIKE ?)))';
        array_push($a, "%$s%", "%$s%", "%$s%", "%$s%", "%$s%");
      }
      $rows = all('SELECT b.id, b.tour_date, b.tour, b.tour_name, b.transfer, b.status, b.whatsapp, b.est_tour_usd, b.est_transfer_kip, b.private_tour,
          b.submitted_at, r.no AS receipt_no,
          (SELECT COUNT(*) FROM travellers t WHERE t.booking_id = b.id) AS people,
          (SELECT t.full_name FROM travellers t WHERE t.booking_id = b.id ORDER BY t.n LIMIT 1) AS lead_name,
          (SELECT COALESCE(SUM(p.amount_usd), 0) FROM payments p WHERE p.booking_id = b.id) AS paid_usd
        FROM bookings b LEFT JOIN receipts r ON r.booking_id = b.id WHERE ' . implode(' AND ', $w) . ' ORDER BY b.tour_date IS NULL, b.tour_date, b.submitted_at LIMIT 500', $a);
      out(['bookings' => $rows]);
    }
    case 'booking': out(booking_full((string) $in['id'], $user));
    case 'booking_new': out(booking_full(save_booking(['lang' => 'Staff'] + (array) ($in['booking'] ?? []), $user), $user));
    case 'booking_save': {
      $id = (string) $in['id']; $f = (array) ($in['fields'] ?? []);
      if (isset($f['status']) && !in_array($f['status'], STATUSES, true)) throw new Refused('Unknown status.');
      tx(function () use ($id, $f, $user) {
        $old = one('SELECT * FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$id]);
        if (!$old) throw new Refused('Booking not found.');
        $changed = update_row('bookings', 'id = ?', [$id], BOOKING_FIELDS, $f, $id, $user);
        // the transfer amount follows Transfer and the train drop-off unless the amount itself was typed
        if (array_intersect($changed, ['transfer', 'train_dropoff']) && !in_array('est_transfer_kip', $changed, true)) {
          $b = one('SELECT transfer, train_dropoff FROM bookings WHERE id = ?', [$id]);
          q('UPDATE bookings SET est_transfer_kip = ? WHERE id = ?', [transfer_kip($b['transfer'], (bool) $b['train_dropoff'], riders($id)), $id]);
        }
        if (in_array('status', $changed, true) && $f['status'] === 'Cancelled') {
          q("UPDATE bookings SET staff_notes = TRIM(CONCAT(staff_notes, ' Cancelled ', ?)) WHERE id = ?", [lao_day(lao_today()), $id]);
        }
        sync_paid_status($id);
      });
      out(booking_full($id, $user));
    }
    case 'booking_delete':
      q('UPDATE bookings SET deleted_at = UTC_TIMESTAMP(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL', [$user['id'], (string) $in['id']]);
      log_change('bookings', (string) $in['id'], 'delete', null, null, $user); out(['ok' => true]);
    case 'booking_restore':
      q('UPDATE bookings SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [(string) $in['id']]);
      log_change('bookings', (string) $in['id'], 'restore', null, null, $user); out(['ok' => true]);

    /* ----- travellers ----- */
    case 'traveller_save': {
      $id = (string) $in['booking_id']; $n = (int) $in['n']; $f = (array) ($in['fields'] ?? []);
      if (isset($f['status']) && !in_array($f['status'], ['', 'Cancelled', 'No-show'], true)) throw new Refused('Unknown status.');
      tx(function () use ($id, $n, $f, $user) {
        if (!one('SELECT id FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$id])) throw new Refused('Booking not found.');
        $changed = update_row('travellers', 'booking_id = ? AND n = ?', [$id, $n], TRAVELLER_FIELDS, $f, "$id #$n", $user);
        if (array_key_exists('lunch_dish', $f)) set_lunch($id, $n, clean($f['lunch_dish'], 80), clean($f['lunch_choice'] ?? '', 40));
        if (in_array('pickup_place', $changed, true)) {
          $b = one('SELECT transfer, train_dropoff FROM bookings WHERE id = ?', [$id]);
          q('UPDATE bookings SET est_transfer_kip = ? WHERE id = ?', [transfer_kip($b['transfer'], (bool) $b['train_dropoff'], riders($id)), $id]);
        }
        sync_paid_status($id);
      });
      out(booking_full($id, $user));
    }
    case 'traveller_add': {
      $id = (string) $in['booking_id'];
      tx(function () use ($id, $in, $user) {
        if (!one('SELECT id FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$id])) throw new Refused('Booking not found.');
        $n = 1 + (int) val('SELECT COALESCE(MAX(n), 0) FROM travellers WHERE booking_id = ?', [$id]);
        $first = one('SELECT pickup_place, pickup_map FROM travellers WHERE booking_id = ? ORDER BY n LIMIT 1', [$id]) ?: ['pickup_place' => '', 'pickup_map' => ''];
        q('INSERT INTO travellers (booking_id, n, pickup_place, pickup_map) VALUES (?,?,?,?)', [$id, $n, $first['pickup_place'], $first['pickup_map']]);
        log_change('travellers', "$id #$n", 'insert', null, null, $user);
        update_row('travellers', 'booking_id = ? AND n = ?', [$id, $n], TRAVELLER_FIELDS, (array) ($in['fields'] ?? []), "$id #$n", $user);
      });
      out(booking_full($id, $user));
    }
    case 'traveller_remove': {
      $id = (string) $in['booking_id']; $n = (int) $in['n'];
      tx(function () use ($id, $n, $user) {
        $t = one('SELECT * FROM travellers WHERE booking_id = ? AND n = ?', [$id, $n]);
        if (!$t) throw new Refused('Traveller not found.');
        if ((int) val('SELECT COUNT(*) FROM travellers WHERE booking_id = ?', [$id]) < 2) throw new Refused('A booking needs at least one traveller.');
        q('DELETE FROM travellers WHERE booking_id = ? AND n = ?', [$id, $n]);
        log_change('travellers', "$id #$n", 'delete', ['full_name' => $t['full_name']], null, $user);
      });
      out(booking_full($id, $user));
    }

    /* ----- payments and receipts ----- */
    case 'payment_add':
      add_payment((string) $in['booking_id'], $in['amount'] ?? null, (string) ($in['currency'] ?? 'USD'), (string) ($in['method'] ?? ''),
        (string) ($in['note'] ?? ''), $in['paid_on'] ?? null, $user);
      out(booking_full((string) $in['booking_id'], $user));
    case 'payment_edit': {
      $p = one('SELECT * FROM payments WHERE id = ?', [(int) $in['id']]);
      if (!$p) throw new Refused('Payment not found.');
      tx(function () use ($p, $in, $user) {
        $f = (array) ($in['fields'] ?? []);
        if (isset($f['amount'])) {
          if (!is_numeric($f['amount']) || (float) $f['amount'] == 0.0) throw new Refused('Type the amount.');
          $f['amount_usd'] = $p['currency'] === 'USD' ? round((float) $f['amount'], 2) : round((float) $f['amount'] / (float) $p['kip_per_usd'], 2);
        }
        if (isset($f['paid_on']) && !date_or_null($f['paid_on'])) unset($f['paid_on']);
        update_row('payments', 'id = ?', [$p['id']], ['amount', 'amount_usd', 'method', 'note', 'paid_on'], $f, (string) $p['id'], $user);
        sync_paid_status($p['booking_id']);
      });
      out(booking_full($p['booking_id'], $user));
    }
    case 'payment_delete': {
      $p = one('SELECT * FROM payments WHERE id = ?', [(int) $in['id']]);
      if (!$p) throw new Refused('Payment not found.');
      tx(function () use ($p, $user) {
        q('DELETE FROM payments WHERE id = ?', [$p['id']]);
        log_change('payments', (string) $p['id'], 'delete', ['booking_id' => $p['booking_id'], 'amount' => $p['amount'], 'currency' => $p['currency']], null, $user);
        sync_paid_status($p['booking_id']);
      });
      out(booking_full($p['booking_id'], $user));
    }
    case 'receipt_issue':
      issue_receipt((string) $in['booking_id'], clean($in['language'] ?? '', 5), $user);
      out(booking_full((string) $in['booking_id'], $user));
    case 'receipt_save': {
      $f = [];
      if (isset($in['language'])) $f['language'] = clean($in['language'], 5);
      if (isset($in['overrides']) && is_array($in['overrides'])) $f['overrides'] = json_encode((object) $in['overrides'], JSON_UNESCAPED_UNICODE);
      update_row('receipts', 'no = ?', [(string) $in['no']], ['language', 'overrides'], $f, (string) $in['no'], $user);
      out(['receipt' => one('SELECT * FROM receipts WHERE no = ?', [(string) $in['no']])]);
    }

    /* ----- settings, prices, menu (read: everyone; change: admin) ----- */
    case 'settings': {
      $s = [];
      foreach (all('SELECT `key`, value FROM settings') as $r) if (in_array($r['key'], SETTING_KEYS, true)) $s[$r['key']] = $r['value'];
      out(['settings' => $s, 'tours' => all('SELECT * FROM tours ORDER BY sort, code'), 'menu' => all('SELECT * FROM lunch_menu ORDER BY sort, id')]);
    }
    case 'settings_save':
      foreach ((array) ($in['settings'] ?? []) as $k => $v) {
        if (!in_array($k, SETTING_KEYS, true)) continue;
        if (str_ends_with($k, '_kip') || $k === 'kip_per_usd') { if (!is_numeric($v) || (float) $v <= 0) throw new Refused("$k must be a number above 0."); }
        update_row('settings', '`key` = ?', [$k], ['value'], ['value' => (string) $v], $k, $user);
      }
      out(['ok' => true]);
    case 'tour_save': {
      $code = clean($in['code'] ?? '', 5);
      if (!preg_match('/^[A-Za-z0-9]{1,5}$/', $code) || $code === TRANSPORT_ONLY) throw new Refused('Tour code: up to 5 letters or digits.');
      if (!is_numeric($in['price_usd'] ?? null) || (float) $in['price_usd'] < 0) throw new Refused('Type the price.');
      $old = one('SELECT * FROM tours WHERE code = ?', [$code]);
      q('INSERT INTO tours (code, name, price_usd, sort) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name), price_usd = VALUES(price_usd), sort = VALUES(sort)',
        [$code, clean($in['name'] ?? '', 120), $in['price_usd'], (int) ($in['sort'] ?? 0)]);
      log_change('tours', $code, $old ? 'update' : 'insert', $old ? ['name' => $old['name'], 'price_usd' => $old['price_usd']] : null,
        ['name' => clean($in['name'] ?? '', 120), 'price_usd' => $in['price_usd']], $user);
      out(['ok' => true]);
    }
    case 'tour_delete':
      q('DELETE FROM tours WHERE code = ?', [(string) $in['code']]); log_change('tours', (string) $in['code'], 'delete', null, null, $user); out(['ok' => true]);
    case 'menu_save': {
      $dish = clean($in['dish'] ?? '', 80);
      if ($dish === '') throw new Refused('Type the dish.');
      $row = [(int) !empty($in['show']), clean($in['grp'] ?? '', 80), $dish, clean($in['choices'] ?? '', 300), is_numeric($in['price_kip'] ?? null) ? $in['price_kip'] : 0, (int) ($in['sort'] ?? 0)];
      if (!empty($in['id'])) q('UPDATE lunch_menu SET `show` = ?, grp = ?, dish = ?, choices = ?, price_kip = ?, sort = ? WHERE id = ?', array_merge($row, [(int) $in['id']]));
      else q('INSERT INTO lunch_menu (`show`, grp, dish, choices, price_kip, sort) VALUES (?,?,?,?,?,?)', $row);
      log_change('lunch_menu', $dish, empty($in['id']) ? 'insert' : 'update', null, ['price_kip' => $row[4], 'show' => $row[0]], $user);
      out(['ok' => true]);
    }
    case 'menu_delete':
      q('DELETE FROM lunch_menu WHERE id = ?', [(int) $in['id']]); log_change('lunch_menu', (string) $in['id'], 'delete', null, null, $user); out(['ok' => true]);

    /* ----- users (admin) ----- */
    case 'users': out(['users' => all('SELECT id, name, email, role, active, must_change_password, created_at FROM users ORDER BY active DESC, name')]);
    case 'user_add': {
      $email = mb_strtolower(trim((string) ($in['email'] ?? ''))); $name = clean($in['name'] ?? '', 80);
      if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new Refused('Type a name and a valid email.');
      if (!in_array($in['role'] ?? '', ['admin', 'staff'], true)) throw new Refused('Choose a role.');
      check_password((string) ($in['password'] ?? ''));
      if (val('SELECT 1 FROM users WHERE email = ?', [$email])) throw new Refused('This email already has an account.');
      q('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)', [$name, $email, password_hash($in['password'], PASSWORD_DEFAULT), $in['role']]);
      log_change('users', $email, 'insert', null, ['role' => $in['role']], $user);
      out(['ok' => true]);
    }
    case 'user_save': {
      $id = (int) $in['id']; $u = one('SELECT * FROM users WHERE id = ?', [$id]);
      if (!$u) throw new Refused('User not found.');
      $role = in_array($in['role'] ?? '', ['admin', 'staff'], true) ? $in['role'] : $u['role'];
      $active = array_key_exists('active', $in) ? (bool) $in['active'] : (bool) $u['active'];
      tx(function () use ($id, $u, $role, $active, $in, $user) {
        q('SELECT id FROM users FOR UPDATE');
        guard_last_admin($id, $role, $active);
        update_row('users', 'id = ?', [$id], ['name', 'role', 'active'], ['name' => clean($in['name'] ?? $u['name'], 80), 'role' => $role, 'active' => $active], $u['email'], $user);
      });
      out(['ok' => true]);
    }
    case 'user_password': {
      check_password((string) ($in['password'] ?? ''));
      q('UPDATE users SET password_hash = ?, must_change_password = 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [password_hash($in['password'], PASSWORD_DEFAULT), (int) $in['id']]);
      log_change('users', (string) (int) $in['id'], 'password', null, null, $user);
      out(['ok' => true]);
    }

    /* ----- history of one booking ----- */
    case 'history': {
      $id = (string) $in['id'];
      out(['history' => all("SELECT at, user_name, table_name, row_id, action, old_values, new_values FROM change_log
        WHERE (table_name = 'bookings' AND row_id = ?) OR (table_name = 'travellers' AND row_id LIKE ?) ORDER BY id DESC LIMIT 200", [$id, "$id #%"])]);
    }
    default: out(['error' => 'unknown action'], 400);
  }
} catch (Refused $e) {
  out(['error' => $e->getMessage()], 400);
} catch (Throwable $e) {
  error_log('admin.php failed: ' . $e);
  out(['error' => 'Something went wrong on the server. Nothing was saved.'], 500);
}
