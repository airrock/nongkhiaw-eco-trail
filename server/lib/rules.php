<?php
// Booking rules, ported from apps-script/Code.gs (saveBooking_, issueReceipt_, saveAgreement_, saveLunch_, ...).
declare(strict_types=1);
require_once __DIR__ . '/db.php';

const TRANSPORT_ONLY = 'T00';
const STATUSES = ['Requested', 'Confirmed', 'Paid', 'Cancelled', 'No-show'];
const CONTENT_LANGS = ['en', 'lo', 'th', 'zh', 'ko', 'ja', 'fr', 'de'];   // column order of lib/content_seed.json after key and place

function clean($v, int $max): string { return mb_substr(trim(is_scalar($v) ? (string) $v : ''), 0, $max); }
function date_or_null($s): ?string {
  return is_string($s) && preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]) ? $s : null;
}
// A map link: only web addresses are kept (a "javascript:" link typed on the website must never reach a staff click).
function web_link($v): string { $v = clean($v, 300); return preg_match('~^https?://~i', $v) ? $v : ''; }
// Transport after the travellers changed (one added, removed, cancelled or set to no transfer): worked out again for the
// riders. Then Paid / Confirmed follows.
function recount_booking(string $id): void {
  $b = one('SELECT transfer, train_dropoff FROM bookings WHERE id = ?', [$id]);
  q('UPDATE bookings SET est_transfer_kip = ? WHERE id = ?', [transfer_kip($b['transfer'], (bool) $b['train_dropoff'], riders($id)), $id]);
  sync_paid_status($id);
}
// One traveller more (+1) or fewer (-1): the tour amount keeps the booking's own price per person.
function scale_tour(string $id, int $delta): void {
  $people = (int) val("SELECT COUNT(*) FROM travellers WHERE booking_id = ? AND status <> 'Cancelled'", [$id]);
  $usd = (float) val('SELECT est_tour_usd FROM bookings WHERE id = ?', [$id]);
  if ($people > 0 && $people + $delta >= 0) q('UPDATE bookings SET est_tour_usd = ? WHERE id = ?', [round($usd / $people * ($people + $delta), 2), $id]);
}
function goes_up(string $t): bool { return (bool) preg_match('/round/i', $t) || (preg_match('/one way/i', $t) && !preg_match('/luang prabang/i', $t)); }
function goes_down(string $t): bool { return (bool) preg_match('/round/i', $t) || (bool) preg_match('/to luang prabang/i', $t); }
function tour_length(string $tour): int { return max(1, (int) val('SELECT COALESCE(MAX(day), 1) FROM tour_days WHERE tour = ?', [$tour])); }

// The minivan times of a booking: [pickup in Luang Prabang, back from Nong Khiaw]. A time typed on the booking wins.
// Otherwise the pickup is 7:30 - 8:00 AM; the way back is 3:30 - 4:30 PM on the day the tour ends, else 10:00 - 10:30 AM.
const PICKUP_TIME = '7:30 - 8:00 AM';
const RETURN_MORNING = '10:00 - 10:30 AM';
const RETURN_AFTER_TOUR = '3:30 - 4:30 PM';
function transfer_times(array $b): array {
  $up = trim((string) ($b['pickup_time'] ?? '')); $down = trim((string) ($b['return_time'] ?? ''));
  if ($up === '' && goes_up((string) $b['transfer']) && !empty($b['pickup_date'])) $up = PICKUP_TIME;
  if ($down === '' && !empty($b['return_date'])) {
    $remark = (string) ($b['transport_remark'] ?? '');
    // only a time staff wrote as "Minivan back 2 PM" (the Sheet's wording) counts; the website's "Back after the tour, about ..."
    // note is a guess made when the guest booked and would stay wrong after the date back moves; other remarks are not times
    if (preg_match('/^\s*minivan back\s+(\d{1,2}(?::\d{2})?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?(?:AM|PM))/i', $remark, $m)) $down = preg_replace('/\s*-\s*/', ' - ', $m[1]);
    else {
      $ends = !empty($b['tour_date']) && $b['tour'] !== TRANSPORT_ONLY ? (new DateTime($b['tour_date']))->modify('+' . (tour_length((string) $b['tour']) - 1) . ' day')->format('Y-m-d') : null;
      $down = $ends !== null && $ends === $b['return_date'] ? RETURN_AFTER_TOUR : RETURN_MORNING;
    }
  }
  return [$up, $down];
}

function country_name($raw): string {
  $s = clean($raw, 60);
  $key = preg_replace('/^(the|from)\s+/', '', preg_replace('/\s+/', ' ', mb_strtolower($s)));
  $hit = val('SELECT name FROM country_aliases WHERE alias = ?', [$key]);
  if ($hit !== null) return (string) $hit;
  return $s === '' ? 'Not given' : mb_strtoupper(mb_substr($s, 0, 1)) . mb_substr($s, 1);
}

// Transfer amount in kip: (one way or round trip, plus the train extra on the way back) x riders.
function transfer_kip(string $transfer, bool $train, int $riders): float {
  $legs = (int) goes_up($transfer) + (int) goes_down($transfer);
  $one = setting_num('transfer_one_kip', 250000);
  $base = $legs === 2 ? setting_num('transfer_round_kip', $one * 2) : ($legs === 1 ? $one : 0);
  return ($base + ($train && goes_down($transfer) ? setting_num('train_extra_kip', 70000) : 0)) * $riders;
}
function riders(string $bookingId): int {
  return (int) val("SELECT COUNT(*) FROM travellers WHERE booking_id = ? AND pickup_place <> 'No transfer' AND status <> 'Cancelled'", [$bookingId]);
}

// dish => ['price' => kip, 'choices' => [...]] for dishes with a price
function lunch_map(): array {
  $map = [];
  foreach (all('SELECT dish, choices, price_kip FROM lunch_menu WHERE price_kip > 0') as $r) {
    $map[$r['dish']] = ['price' => (float) $r['price_kip'], 'choices' => array_values(array_filter(array_map('trim', explode(',', $r['choices'])), 'strlen'))];
  }
  return $map;
}
function lunch_menu_json(): array {
  $out = [];
  foreach (all('SELECT grp, dish, choices, price_kip FROM lunch_menu WHERE `show` = 1 AND price_kip > 0 ORDER BY sort, id') as $r) {
    $out[] = ['group' => $r['grp'], 'dish' => $r['dish'], 'price' => (float) $r['price_kip'],
      'choices' => array_values(array_filter(array_map('trim', explode(',', $r['choices'])), 'strlen'))];
  }
  return $out;
}

/* ---------- website: booking and inquiry ---------- */

// $d: the JSON the booking form sends (js/main.js). A booking ID sent twice is saved once. Returns the booking ID.
function save_booking(array $d, ?array $user = null): string {
  $people = array_slice(is_array($d['travellers'] ?? null) ? array_values($d['travellers']) : [], 0, 30);
  if (!$people) throw new Refused('booking without travellers');
  return tx(function () use ($d, $people, $user) {
    $tour = clean($d['tour'] ?? '', 5);
    if ($tour === TRANSPORT_ONLY) { $tourName = 'Transport only'; $price = 0.0; }
    else {
      $t = one('SELECT name, price_usd FROM tours WHERE code = ?', [$tour]);
      if (!$t && !$user) throw new Refused('unknown tour');
      $tourName = $t ? $t['name'] : $tour; $price = $t ? (float) $t['price_usd'] : 0.0;
    }
    if (isset($d['priceUsd']) && is_numeric($d['priceUsd']) && $user) $price = (float) $d['priceUsd'];   // staff override, per person
    if ($price < 0 || (isset($d['transferKip']) && is_numeric($d['transferKip']) && (float) $d['transferKip'] < 0)) throw new Refused('Amounts cannot be below 0.');
    $transfer = clean($d['transfer'] ?? '', 40) ?: 'No';
    $up = goes_up($transfer); $down = goes_down($transfer); $legs = (int) $up + (int) $down;
    $hotel = clean($d['hotel'] ?? '', 120); $map = web_link($d['map'] ?? '');
    if ($user && ($up || $down)) {   // the website checks these itself; the dashboard form does not
      $pu = date_or_null($d['pickupDate'] ?? null); $rd = date_or_null($d['returnDate'] ?? null);
      if ($up && !$pu) throw new Refused('Type the pickup date in Luang Prabang.');
      if ($down && !$rd) throw new Refused('Type the date back to Luang Prabang.');
      if ($up && $down && $rd < $pu) throw new Refused('The date back is before the pickup date.');
    }
    $nk = clean($d['nkPickup'] ?? '', 120) ?: ((!$up ? $hotel : '') ?: setting('nk_office', 'Office (The Trio Bar & Cafe)'));
    $train = $down && ($d['train'] ?? false) === true;
    $id = clean($d['id'] ?? '', 20);
    if ($id !== '' && !preg_match('/^[A-Za-z0-9-]{4,20}$/', $id)) {
      if ($user) throw new Refused('Booking ID: 4 to 20 letters, digits or "-", or leave it empty.');
      $id = '';
    }
    if ($id === '') {   // a new ID nobody has, with random letters so two bookings saved in the same second never share one
      do { $id = 'NK' . (new DateTime('now', new DateTimeZone('Asia/Vientiane')))->format('ymd') . '-' . strtoupper(bin2hex(random_bytes(2))); }
      while (val('SELECT 1 FROM bookings WHERE id = ?', [$id]));
    } elseif (val('SELECT 1 FROM bookings WHERE id = ?', [$id])) {
      // the website sends a booking again when the guest retries: the second copy is not saved. Staff are told.
      if ($user) throw new Refused("Booking $id already exists" . (val('SELECT 1 FROM bookings WHERE id = ? AND deleted_at IS NOT NULL', [$id]) ? ' (deleted: an admin can restore it)' : '') . '. Nothing new was saved.');
      return $id;
    }

    $plan = $d['returnPlan'] ?? '';
    q('INSERT INTO bookings (id, submitted_at, tour_date, tour, tour_name, transfer, pickup_date, return_date, train_dropoff, accommodation,
         maps_link, nk_pickup, payment_method, whatsapp, source, referrer, site_language, note, est_tour_usd, addon_package, private_tour,
         transport_remark, status, staff_notes)
       VALUES (?, UTC_TIMESTAMP(), ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [$id, date_or_null($d['date'] ?? null), $tour, $tourName, $transfer,
       $up ? date_or_null($d['pickupDate'] ?? null) : null, $down ? date_or_null($d['returnDate'] ?? null) : null, (int) $train,
       $up ? $hotel : '', $up ? $map : '', $down ? $nk : '', clean($d['payment'] ?? '', 40), clean($d['phone'] ?? '', 40),
       clean($d['source'] ?? '', 40) ?: 'Not given', clean($d['referrer'] ?? '', 120), clean($d['lang'] ?? '', 5), clean($d['note'] ?? '', 1000),
       $price * count($people), (string) (val('SELECT addon FROM tour_addons WHERE tour = ?', [$tour]) ?? ''), (int) (($d['private'] ?? false) === true && $tour !== TRANSPORT_ONLY),
       $plan === 'end' ? 'Back after the tour, about 3:30-4:30 PM' : ($plan === 'later' ? 'Back on another day, minivan about 10:30 AM' : ''),
       in_array($d['status'] ?? '', STATUSES, true) && $user && $d['status'] !== 'Paid' ? $d['status'] : ($user ? 'Confirmed' : 'Requested'), '']);

    $menu = lunch_map(); $riders = 0;
    foreach ($people as $i => $p) {
      $p = is_array($p) ? $p : [];
      $first = clean($p['first'] ?? '', 60); $last = clean($p['last'] ?? '', 60);
      $full = $first !== '' || $last !== '' ? trim("$first $last") : clean($p['name'] ?? '', 80);
      // the group's pickup place (default), the traveller's own place, or no transfer
      $mode = $legs === 0 ? 'none' : ($i > 0 && in_array($p['pickup'] ?? '', ['other', 'none'], true) ? $p['pickup'] : 'same');
      if ($mode === 'other' && clean($p['pkPlace'] ?? '', 120) === '') $mode = 'same';
      $place = $mode === 'none' ? ($legs === 0 ? '' : 'No transfer') : ($mode === 'other' ? clean($p['pkPlace'], 120) : ($up ? $hotel : $nk));
      $pmap = $mode === 'none' ? '' : ($mode === 'other' ? web_link($p['pkMap'] ?? '') : $map);
      if ($mode !== 'none') $riders++;
      // lunch is priced here from the menu: the page's numbers are never trusted
      $dish = clean($p['lunch'] ?? '', 80); $choice = ''; $kip = 0;
      if ($dish !== '' && isset($menu[$dish])) {
        $kip = $menu[$dish]['price'];
        $c = clean($p['lunchChoice'] ?? '', 40);
        if (in_array($c, $menu[$dish]['choices'], true)) $choice = $c;
      } else $dish = '';
      q('INSERT INTO travellers (booking_id, n, first_name, last_name, full_name, country, gender, passport_no, passport_issued,
           passport_expires, food, pickup_place, pickup_map, lunch_dish, lunch_choice, lunch_kip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$id, $i + 1, $first, $last, $full, country_name($p['nat'] ?? ''), clean($p['gender'] ?? '', 10), mb_strtoupper(clean($p['pass'] ?? '', 40)),
         clean($p['issued'] ?? '', 10), clean($p['expires'] ?? '', 10), clean($p['food'] ?? '', 20), $place, $pmap, $dish, $choice, $kip]);
    }
    $kipTotal = isset($d['transferKip']) && is_numeric($d['transferKip']) && $user ? (float) $d['transferKip'] : transfer_kip($transfer, $train, $riders);
    q('UPDATE bookings SET est_transfer_kip = ? WHERE id = ?', [$kipTotal, $id]);
    log_change('bookings', $id, 'insert', null, null, $user);
    return $id;
  });
}

function save_inquiry(array $d): void {
  if (clean($d['name'] ?? '', 80) === '' || clean($d['contact'] ?? '', 120) === '' || clean($d['question'] ?? '', 2000) === '') throw new Refused('inquiry: name, contact and question are needed');
  q("INSERT INTO inquiries (submitted_at, name, contact, tour, question, source, referrer, site_language, staff_notes) VALUES (UTC_TIMESTAMP(),?,?,?,?,?,?,?,'')",
    [clean($d['name'] ?? '', 80), clean($d['contact'] ?? '', 120), clean($d['tour'] ?? '', 20), clean($d['question'] ?? '', 2000),
     clean($d['source'] ?? '', 40) ?: 'Not given', clean($d['referrer'] ?? '', 120), clean($d['lang'] ?? '', 5)]);
}

function config_json(): array {
  $content = [];
  foreach (all("SELECT `key`, lang, value FROM content WHERE TRIM(value) <> ''") as $r) $content[$r['lang']][$r['key']] = $r['value'];
  $prices = [];
  // prices the website shows: the four built-in tours and the tours staff ticked "Show on the website"
  foreach (all("SELECT code, price_usd FROM tours WHERE price_usd > 0 AND (web_show = 1 OR code IN ('101','102','103','001'))") as $r) $prices[$r['code']] = (float) $r['price_usd'];
  $one = setting_num('transfer_one_kip', 250000);
  $tours = [];
  foreach (all("SELECT * FROM tours WHERE web_show = 1 AND price_usd > 0 AND code NOT IN ('101','102','103','001') ORDER BY sort, code") as $r) {
    $tours[] = ['code' => $r['code'], 'name' => $r['name'], 'title' => $r['web_title'] ?: $r['name'], 'summary' => $r['web_summary'], 'duration' => $r['web_duration'],
      'level' => $r['web_level'], 'included' => $r['web_included'], 'photo' => $r['web_photo'] !== '' ? upload_url($r['web_photo']) : '', 'price' => (float) $r['price_usd'],
      'days' => array_column(all('SELECT plan FROM tour_days WHERE tour = ? ORDER BY day', [$r['code']]), 'plan')];
  }
  return ['content' => (object) $content, 'prices' => (object) $prices, 'tours' => $tours,
    'kip' => ['one' => $one, 'round' => setting_num('transfer_round_kip', $one * 2), 'train' => setting_num('train_extra_kip', 70000)],
    'menu' => lunch_menu_json()];
}
// Address of a file in the uploads folder (next to api/), as the website on the other domain needs it.
function upload_url(string $file): string {
  $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
  $base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x'))), '/');
  return ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $base . '/uploads/' . rawurlencode($file);
}
function reviews_json(): array {
  return array_map(fn ($r) => ['name' => trim($r['name']), 'text' => trim($r['review'])],
    all("SELECT name, review FROM reviews WHERE `show` = 1 AND TRIM(review) <> '' ORDER BY review_date IS NULL, review_date DESC, id DESC LIMIT 8"));
}

/* ---------- summaries and totals ---------- */

// What the Sheet kept as columns of Bookings, computed from the travellers.
function booking_summary(string $id, ?array $trav = null): array {
  $trav = $trav ?? all('SELECT * FROM travellers WHERE booking_id = ? ORDER BY n', [$id]);
  $count = function (array $keys, string $glue, string $between) {
    $c = []; foreach ($keys as $k) if ($k !== '') $c[$k] = ($c[$k] ?? 0) + 1;
    return implode($glue, array_map(fn ($k) => $k . $between . $c[$k], array_keys($c)));
  };
  $stops = [];
  foreach ($trav as $t) if ($t['pickup_place'] !== '') $stops[$t['pickup_place'] . "\1" . $t['pickup_map']][] = $t['n'];
  $pick = [];
  foreach ($stops as $k => $nums) $pick[] = explode("\1", $k)[0] . ': ' . implode(', ', $nums);
  return [
    'people' => count($trav), 'lead_name' => (array_values(array_filter($trav, fn ($t) => $t['status'] !== 'Cancelled'))[0] ?? $trav[0] ?? [])['full_name'] ?? '',   // a cancelled first guest is not the name on the receipt
    'traveller_names' => implode(', ', array_column($trav, 'full_name')),
    'countries' => implode(', ', array_values(array_unique(array_filter(array_column($trav, 'country'), 'strlen')))),
    'food' => $count(array_map(fn ($t) => $t['food'] ?: 'Regular', $trav), ', ', ' '),
    'lunch' => $count(array_map(fn ($t) => $t['lunch_dish'] === '' || $t['status'] === 'Cancelled' ? '' : $t['lunch_dish'] . ($t['lunch_choice'] !== '' ? " ({$t['lunch_choice']})" : ''), $trav), '; ', ' '),
    'lunch_kip' => array_sum(array_map(fn ($t) => (float) $t['lunch_kip'], $trav)),
    'pickups' => implode('; ', $pick),
  ];
}

// Totals of a booking: tour in USD, transport and lunch in kip, paid from the payments.
function booking_totals(string $id): array {
  $b = one('SELECT est_tour_usd, est_transfer_kip FROM bookings WHERE id = ?', [$id]);
  if (!$b) throw new Refused("no booking $id");
  $rate = setting_num('kip_per_usd', 22500);
  $lunch = (float) val("SELECT COALESCE(SUM(lunch_kip), 0) FROM travellers WHERE booking_id = ? AND status <> 'Cancelled'", [$id]);   // a cancelled guest pays no lunch
  $paid = (float) val('SELECT COALESCE(SUM(amount_usd), 0) FROM payments WHERE booking_id = ?', [$id]);
  $tour = (float) $b['est_tour_usd']; $transfer = (float) $b['est_transfer_kip'];
  $totalUsd = round($tour + ($transfer + $lunch) / $rate, 2);
  $totalKip = round($tour * $rate) + $transfer + $lunch; $balanceUsd = round($totalUsd - $paid, 2);
  // Kip side: money taken in kip counts as typed, money taken in USD at today's rate. The kip balance is the kip total minus
  // that, never the rounded USD balance converted back (that drifted by a few kip), and it is 0 once the USD balance is.
  $paidKip = (float) val("SELECT COALESCE(SUM(CASE WHEN currency = 'LAK' THEN amount ELSE ROUND(amount_usd * ?) END), 0) FROM payments WHERE booking_id = ?", [$rate, $id]);
  // Settled when either side is within a cent: kip paid to the last kip leaves a rounding cent on the USD side, and the other way round.
  if ($totalUsd > 0 && (abs($balanceUsd) <= 0.005 || abs($totalKip - $paidKip) < $rate / 100)) { $paidKip = $totalKip; $balanceUsd = 0.0; $paid = $totalUsd; }
  return ['tour_usd' => $tour, 'transfer_kip' => $transfer, 'lunch_kip' => $lunch, 'rate' => $rate, 'total_usd' => $totalUsd,
    'total_kip' => $totalKip, 'paid_usd' => round($paid, 2), 'balance_usd' => $balanceUsd, 'paid_kip' => $paidKip, 'balance_kip' => $totalKip - $paidKip];
}

/* ---------- receipts and payments ---------- */

// Gives the booking its receipt number (once) and stores the totals of the day. A booking never gets two numbers.
function issue_receipt(string $bookingId, string $language, array $user): array {
  return tx(function () use ($bookingId, $language, $user) {
    if (!one('SELECT id FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$bookingId])) throw new Refused("no booking $bookingId");
    $t = booking_totals($bookingId);
    $r = one('SELECT * FROM receipts WHERE booking_id = ?', [$bookingId]);
    if ($r) {
      q('UPDATE receipts SET total_usd = ?, total_kip = ?, deposit_usd = ?, balance_usd = ?, language = ? WHERE no = ?',
        [$t['total_usd'], $t['total_kip'], $t['paid_usd'], $t['balance_usd'], $language ?: $r['language'], $r['no']]);
    } else {
      $next = (int) val("SELECT value FROM settings WHERE `key` = 'receipt_next' FOR UPDATE");
      do { $no = str_pad((string) $next, 6, '0', STR_PAD_LEFT); $next++; } while (val('SELECT 1 FROM receipts WHERE no = ?', [$no]));
      q("UPDATE settings SET value = ? WHERE `key` = 'receipt_next'", [(string) $next]);
      q("INSERT INTO receipts (no, issued_on, booking_id, language, total_usd, total_kip, deposit_usd, balance_usd, issued_by, form_key, overrides)
         VALUES (?,?,?,?,?,?,?,?,?,?,'{}')",
        [$no, lao_today(), $bookingId, $language ?: 'en', $t['total_usd'], $t['total_kip'], $t['paid_usd'], $t['balance_usd'], $user['name'], bin2hex(random_bytes(8))]);
      log_change('receipts', $no, 'insert', null, null, $user);
    }
    return one('SELECT * FROM receipts WHERE booking_id = ?', [$bookingId]);
  });
}

// After any change of payments: paid in full becomes Paid; no longer paid in full goes back to Confirmed.
function sync_paid_status(string $bookingId): void {
  $t = booking_totals($bookingId);
  if ($t['total_usd'] > 0 && $t['balance_usd'] <= 0.005) q("UPDATE bookings SET status = 'Paid' WHERE id = ? AND status IN ('Requested','Confirmed')", [$bookingId]);   // also overpaid
  else q("UPDATE bookings SET status = 'Confirmed' WHERE id = ? AND status = 'Paid'", [$bookingId]);
}

// Records money received; the rate of the day is kept with it.
function add_payment(string $bookingId, $amount, string $currency, string $method, string $note, ?string $paidOn, array $user): array {
  if (!is_numeric($amount) || (float) $amount == 0.0) throw new Refused('Type the amount.');
  if (abs((float) $amount) > 100000000) throw new Refused('That amount is too large.');
  if ($paidOn !== null && $paidOn !== '' && !date_or_null($paidOn)) throw new Refused('The payment date is not a real date.');
  if (!in_array($currency, ['USD', 'LAK'], true)) throw new Refused('Currency must be USD or LAK.');
  return tx(function () use ($bookingId, $amount, $currency, $method, $note, $paidOn, $user) {
    if (!one('SELECT id FROM bookings WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [$bookingId])) throw new Refused("no booking $bookingId");
    $rate = setting_num('kip_per_usd', 22500);
    $usd = $currency === 'USD' ? round((float) $amount, 2) : round((float) $amount / $rate, 2);
    q('INSERT INTO payments (booking_id, paid_on, amount, currency, kip_per_usd, amount_usd, method, note, taken_by, taken_by_name) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [$bookingId, date_or_null($paidOn) ?? lao_today(), $amount, $currency, $rate, $usd, clean($method, 40), clean($note, 300), $user['id'], $user['name']]);
    $id = (int) db()->lastInsertId();
    log_change('payments', (string) $id, 'insert', null, ['booking_id' => $bookingId, 'amount' => (float) $amount, 'currency' => $currency], $user);
    sync_paid_status($bookingId);
    return one('SELECT * FROM payments WHERE id = ?', [$id]);
  });
}

/* ---------- agreement form and lunch page (private link code = receipts.form_key) ---------- */

function key_receipt($key): ?array {
  if (!is_string($key) || !preg_match('/^[a-f0-9]{16}$/', $key)) return null;
  return one('SELECT r.* FROM receipts r JOIN bookings b ON b.id = r.booking_id WHERE r.form_key = ? AND b.deleted_at IS NULL', [$key]);
}
function lao_day(?string $ymd): string { return $ymd ? substr($ymd, 8, 2) . '/' . substr($ymd, 5, 2) . '/' . substr($ymd, 0, 4) : ''; }

// A date stored as yyyy-mm-dd is shown as dd/mm/yyyy; anything else (partial dates guests typed) as it is.
function show_date(string $s): string { return date_or_null($s) ? lao_day($s) : $s; }

function agreement_json($key): array {
  $r = key_receipt($key);
  if (!$r) return ['error' => 'invalid'];
  $b = one('SELECT tour_date, tour, tour_name FROM bookings WHERE id = ?', [$r['booking_id']]);
  $trav = array_map(fn ($t) => ['n' => (int) $t['n'], 'first' => $t['first_name'], 'last' => $t['last_name'], 'full' => $t['full_name'],
      'gender' => $t['gender'], 'nat' => $t['country'], 'pass' => $t['passport_no'], 'issued' => show_date($t['passport_issued']), 'expires' => show_date($t['passport_expires'])],
    all("SELECT * FROM travellers WHERE booking_id = ? AND status <> 'Cancelled' ORDER BY n", [$r['booking_id']]));
  $signed = array_map('intval', array_column(all('SELECT n FROM agreements WHERE booking_id = ? ORDER BY n', [$r['booking_id']]), 'n'));
  return ['receipt' => $r['no'], 'date' => lao_day($b['tour_date']), 'tour' => $b['tour'], 'tourName' => $b['tour_name'], 'travellers' => $trav, 'signed' => $signed];
}

// $d: { key, lang, people: [{ n, photo, medical, ecName, ecPhone, insurance, signedName, accept }] }; returns how many were saved
function save_agreement(array $d): int {
  $r = key_receipt($d['key'] ?? null);
  if (!$r) throw new Refused('agreement: bad key');
  return tx(function () use ($d, $r) {
    $saved = 0;
    foreach (is_array($d['people'] ?? null) ? $d['people'] : [] as $p) {
      if (!is_array($p)) continue;
      $t = one("SELECT * FROM travellers WHERE booking_id = ? AND n = ? AND status <> 'Cancelled'", [$r['booking_id'], (int) ($p['n'] ?? 0)]);
      if (!$t || val('SELECT 1 FROM agreements WHERE booking_id = ? AND n = ?', [$r['booking_id'], $t['n']])) continue;   // each traveller signs once
      $signed = clean($p['signedName'] ?? '', 80); $ecName = clean($p['ecName'] ?? '', 80); $ecPhone = clean($p['ecPhone'] ?? '', 40);
      if (($p['accept'] ?? false) !== true || !in_array($p['photo'] ?? '', ['yes', 'no'], true) || mb_strlen($signed) < 2 || $ecName === '' || $ecPhone === '') continue;
      q('INSERT INTO agreements (submitted_at, booking_id, n, full_name, gender, nationality, passport_no, photo_permission, medical, ec_name, ec_phone,
           insurance, signed_name, language, form_version) VALUES (UTC_TIMESTAMP(),?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$r['booking_id'], $t['n'], $t['full_name'], $t['gender'], $t['country'], $t['passport_no'], (int) ($p['photo'] === 'yes'), clean($p['medical'] ?? '', 500),
         $ecName, $ecPhone, clean($p['insurance'] ?? '', 60), $signed, clean($d['lang'] ?? '', 5), setting('agreement_version')]);
      $saved++;
    }
    return $saved;
  });
}

function lunch_json($key): array {
  $r = key_receipt($key);
  if (!$r) return ['error' => 'invalid'];
  $b = one('SELECT tour_date, tour, tour_name FROM bookings WHERE id = ?', [$r['booking_id']]);
  $trav = array_map(fn ($t) => ['n' => (int) $t['n'], 'first' => $t['first_name'] ?: $t['full_name'], 'lunch' => $t['lunch_dish'], 'choice' => $t['lunch_choice']],
    all("SELECT * FROM travellers WHERE booking_id = ? AND status <> 'Cancelled' ORDER BY n", [$r['booking_id']]));
  return ['date' => lao_day($b['tour_date']), 'tour' => $b['tour'], 'tourName' => $b['tour_name'], 'menu' => lunch_menu_json(), 'travellers' => $trav];
}

// $d: { key, people: [{ n, lunch, choice }] }; a dish not on the menu (or empty) clears the order.
function save_lunch(array $d): int {
  $r = key_receipt($d['key'] ?? null);
  if (!$r) throw new Refused('lunch: bad key');
  return tx(function () use ($d, $r) {
    $menu = lunch_map(); $saved = 0;
    foreach (array_slice(is_array($d['people'] ?? null) ? $d['people'] : [], 0, 30) as $p) {
      if (!is_array($p)) continue;
      if (!val("SELECT 1 FROM travellers WHERE booking_id = ? AND n = ? AND status <> 'Cancelled'", [$r['booking_id'], (int) ($p['n'] ?? 0)])) continue;
      $saved++;
      set_lunch($r['booking_id'], (int) $p['n'], clean($p['lunch'] ?? '', 80), clean($p['choice'] ?? '', 40), $menu);
    }
    return $saved;
  });
}
function set_lunch(string $bookingId, int $n, string $dish, string $choice, ?array $menu = null): void {
  $menu = $menu ?? lunch_map();
  $item = $dish !== '' ? ($menu[$dish] ?? null) : null;
  q('UPDATE travellers SET lunch_dish = ?, lunch_choice = ?, lunch_kip = ? WHERE booking_id = ? AND n = ?',
    [$item ? $dish : '', $item && in_array($choice, $item['choices'], true) ? $choice : '', $item ? $item['price'] : 0, $bookingId, $n]);
}
