<?php
// Daily lists and money reports, computed from the bookings (the Sheet's Guide report, Lunch report, Collect on arrival,
// Arrange tour / Tour accounts and Agency share tabs).
declare(strict_types=1);
require_once __DIR__ . '/rules.php';

function add_days(string $ymd, int $n): string { return (new DateTime($ymd))->modify(($n >= 0 ? '+' : '') . $n . ' day')->format('Y-m-d'); }

// Everyone on tour on $date, one row per booking: day n of m with that day's plan.
function guide_report(string $date): array {
  $rows = [];
  $bookings = all("SELECT b.*, r.no AS receipt_no, r.issued_on FROM bookings b LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND b.tour <> ? AND b.tour_date IS NOT NULL AND b.tour_date <= ?
      AND b.tour_date >= ? ORDER BY b.tour, b.tour_date, b.submitted_at", [TRANSPORT_ONLY, $date, add_days($date, -30)]);
  foreach ($bookings as $b) {
    $len = tour_length($b['tour']);
    $dayNo = (int) (new DateTime($b['tour_date']))->diff(new DateTime($date))->days + 1;
    if ($dayNo > $len) continue;
    $trav = all("SELECT * FROM travellers WHERE booking_id = ? AND status = '' ORDER BY n", [$b['id']]);
    if (!$trav) continue;
    $s = booking_summary($b['id'], $trav);
    $addon = one('SELECT addon, starts_day FROM tour_addons WHERE tour = ?', [$b['tour']]);
    $rows[] = ['booking_id' => $b['id'], 'receipt_no' => $b['receipt_no'], 'issued_on' => $b['issued_on'], 'contact' => $s['lead_name'], 'names' => $s['traveller_names'],
      'pax' => count($trav), 'tour' => $b['tour'], 'package' => $b['tour_name'] . ($b['private_tour'] ? ' (PRIVATE)' : ''), 'day' => "Day $dayNo of $len",
      'plan' => (string) (val('SELECT plan FROM tour_days WHERE tour = ? AND day = ?', [$b['tour'], $dayNo]) ?? ''), 'viewpoint' => $b['viewpoint'],
      'addon' => $b['addon_package'], 'addon_date' => $b['addon_package'] !== '' && $addon && $addon['starts_day'] ? add_days($b['tour_date'], (int) $addon['starts_day'] - 1) : null,
      'food' => $s['food'], 'pickup_date' => $b['pickup_date'], 'tour_date' => $b['tour_date'], 'pickups' => $s['pickups'], 'return_date' => $b['return_date'],
      'notes' => trim($b['note'] . ($b['note'] !== '' && $b['staff_notes'] !== '' ? ' | ' : '') . $b['staff_notes']), 'whatsapp' => $b['whatsapp']];
  }
  return ['date' => $date, 'rows' => $rows, 'pax' => array_sum(array_column($rows, 'pax'))];
}

// Takeaway lunches for the tours starting on $date, with the count per dish and the message for the kitchen.
function lunch_report(string $date): array {
  $rows = all("SELECT t.booking_id, COALESCE(b.tour_date, b.pickup_date) AS day, b.tour, t.full_name, t.lunch_dish, t.lunch_choice, t.lunch_kip, t.food, t.pickup_place,
      b.note, b.pickup_date, b.transport_remark, COALESCE(r.no, NULLIF(b.receipt_ref, '')) AS receipt_no,
      (SELECT COUNT(*) FROM travellers x WHERE x.booking_id = b.id AND x.status = '') AS pax
    FROM travellers t JOIN bookings b ON b.id = t.booking_id LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND t.status = '' AND t.lunch_dish <> '' AND COALESCE(b.tour_date, b.pickup_date) = ?
    ORDER BY b.submitted_at, t.n", [$date]);
  $out = []; $count = []; $lines = [];
  foreach ($rows as $i => $r) {
    $item = trim($r['lunch_dish'] . ' ' . $r['lunch_choice']);
    $rides = $r['pickup_place'] !== '' && $r['pickup_place'] !== 'No transfer' && $r['pickup_date'] === $r['day'];
    $special = trim(($r['food'] !== '' && $r['food'] !== 'Regular' ? $r['food'] . ($r['note'] !== '' ? ' | ' : '') : '') . $r['note']);
    $out[] = ['no' => $i + 1, 'booking_id' => $r['booking_id'], 'tour' => $r['tour'], 'receipt_no' => $r['receipt_no'], 'name' => $r['full_name'], 'pax' => (int) $r['pax'],
      'food' => $r['food'] !== '' ? $r['food'] : 'Regular', 'item' => $item, 'qty' => 1, 'day' => $r['day'],
      'ready_by' => ($rides ? 'When the minivan from Luang Prabang arrives' : 'Before the tour starts') . ($r['transport_remark'] !== '' ? " ({$r['transport_remark']})" : ''),
      'special' => $special, 'kip' => (float) $r['lunch_kip']];
    $count[$item] = ($count[$item] ?? 0) + 1;
    $lines[] = ($i + 1) . '.) ' . $item . ' x1 : ' . $r['full_name'];
  }
  ksort($count);
  return ['date' => $date, 'rows' => $out, 'dishes' => $count, 'total_kip' => array_sum(array_column($out, 'kip')),
    'message' => $out ? day_month_r($date) . "\n" . implode("\n", $lines) : ''];
}
function day_month_r(string $ymd): string { return substr($ymd, 8, 2) . '/' . substr($ymd, 5, 2); }

// What each group still pays when it arrives (arrival = pickup date in Luang Prabang, else the tour date).
function collect_report(string $from, string $to): array {
  $rate = setting_num('kip_per_usd', 22500); $rows = [];
  $bookings = all("SELECT b.*, r.no AS receipt_no, COALESCE(b.pickup_date, b.tour_date) AS arrive FROM bookings b LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND COALESCE(b.pickup_date, b.tour_date) BETWEEN ? AND ? ORDER BY arrive, b.submitted_at", [$from, $to]);
  foreach ($bookings as $b) {
    $t = booking_totals($b['id']);
    $rows[] = ['arrive' => $b['arrive'], 'booking_id' => $b['id'], 'receipt_no' => $b['receipt_no'], 'tour' => $b['tour'],
      'name' => (string) val('SELECT full_name FROM travellers WHERE booking_id = ? ORDER BY n LIMIT 1', [$b['id']]),
      'pax' => (int) val("SELECT COUNT(*) FROM travellers WHERE booking_id = ? AND status = ''", [$b['id']]),
      'tour_usd' => $t['tour_usd'], 'lunch_kip' => $t['lunch_kip'], 'transfer_kip' => $t['transfer_kip'], 'total_usd' => $t['total_usd'], 'total_kip' => $t['total_kip'],
      'paid_usd' => $t['paid_usd'], 'due_usd' => max(0, $t['balance_usd']), 'due_kip' => max(0, $t['balance_kip']), 'status' => $b['status']];
  }
  $sum = fn ($k) => array_sum(array_column($rows, $k));
  return ['from' => $from, 'to' => $to, 'rate' => $rate, 'rows' => $rows,
    'total' => ['pax' => $sum('pax'), 'total_usd' => round($sum('total_usd'), 2), 'paid_usd' => round($sum('paid_usd'), 2), 'due_usd' => round($sum('due_usd'), 2), 'due_kip' => $sum('due_kip')]];
}

// Cost lines of one tour on one day from the tour's cost list. A per-person line counts the guests, "2 people" one per 2 guests.
function arrange_tour(string $date, string $tour): array {
  $rate = setting_num('kip_per_usd', 22500);
  $bk = all("SELECT b.id, b.est_tour_usd, r.no AS receipt_no FROM bookings b LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND b.tour_date = ? AND b.tour = ? ORDER BY b.submitted_at", [$date, $tour]);
  $guests = 0; $income = 0.0;
  foreach ($bk as $b) { $guests += (int) val("SELECT COUNT(*) FROM travellers WHERE booking_id = ? AND status = ''", [$b['id']]); $income += (float) $b['est_tour_usd'] * $rate; }
  $lines = [];
  foreach (all('SELECT item, unit_kip, counted_per, qty FROM tour_costs WHERE tour = ? ORDER BY id', [$tour]) as $c) {
    $per = mb_strtolower(trim($c['counted_per']));
    if (preg_match('/^(person|pax|guest)/', $per)) $qty = $guests;
    elseif (preg_match('/^(\d+)\s*(people|persons?|pax)$/', $per, $m)) $qty = (int) ceil($guests / max(1, (int) $m[1]));
    else $qty = (float) $c['qty'] ?: 1;
    $lines[] = ['item' => $c['item'], 'counted_per' => $c['counted_per'], 'qty' => $qty, 'unit_kip' => (float) $c['unit_kip'], 'total_kip' => $qty * (float) $c['unit_kip']];
  }
  $saved = one('SELECT * FROM tour_accounts WHERE tour_date = ? AND tour = ?', [$date, $tour]);
  return ['date' => $date, 'tour' => $tour, 'guests' => $guests, 'receipt_nos' => implode(', ', array_filter(array_column($bk, 'receipt_no'))),
    'booking_ids' => implode(', ', array_column($bk, 'id')), 'income_kip' => round($income), 'lines' => $lines, 'saved' => $saved];
}

/* ---------- trip sheet: everyone on a tour that starts on one day ---------- */
function trip_sheet(string $date): array {
  $rows = all("SELECT b.tour, b.tour_name, t.full_name, t.country, t.gender, t.food, t.lunch_dish, t.lunch_choice, t.pickup_place, t.pickup_map, t.booking_id,
      COALESCE(r.no, NULLIF(b.receipt_ref, '')) AS receipt_no
    FROM travellers t JOIN bookings b ON b.id = t.booking_id LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND t.status = '' AND b.tour_date = ?
    ORDER BY (COALESCE(r.no, NULLIF(b.receipt_ref, '')) IS NULL), receipt_no, t.full_name", [$date]);
  $food = []; $riders = 0;
  foreach ($rows as &$r) {
    $f = $r['food'] !== '' ? $r['food'] : 'Regular'; $food[$f] = ($food[$f] ?? 0) + 1;
    if ($r['pickup_place'] !== '' && $r['pickup_place'] !== 'No transfer') $riders++;
    else $r['pickup_place'] = 'Staying in Nong Khiaw';
    $r['lunch'] = $r['lunch_dish'] . ($r['lunch_choice'] !== '' ? ' (' . $r['lunch_choice'] . ')' : '');
    $r['tour'] = trim($r['tour'] . ' ' . $r['tour_name']);
  }
  unset($r);
  $ids = array_column(all("SELECT id FROM bookings WHERE deleted_at IS NULL AND status NOT IN ('Cancelled','No-show') AND tour_date = ?", [$date]), 'id');
  $due = 0; $transfer = 0; $lunch = 0;
  foreach ($ids as $id) { $t = booking_totals($id); $due += max(0, $t['tour_usd'] - $t['paid_usd']); $transfer += $t['transfer_kip']; $lunch += $t['lunch_kip']; }
  arsort($food);
  return ['date' => $date, 'bookings' => count($ids), 'travellers' => count($rows), 'riders' => $riders, 'food' => (object) $food,
    'tour_due_usd' => round($due, 2), 'transfer_kip' => $transfer, 'lunch_kip' => $lunch, 'rows' => $rows];
}

/* ---------- tour report for the team: everyone whose tour starts on one day, and who guides each package ---------- */
// Packages that start together are one group (101, 102, 103 all begin with the overnight camping): the group's first package
// carries the head count of the whole group, the others their own. The guide of each line is typed by staff (day_guides).
function tour_report(string $date): array {
  $rows = all("SELECT t.booking_id, b.tour, b.tour_name, b.note, t.full_name, t.food, COALESCE(r.no, NULLIF(b.receipt_ref, '')) AS receipt_no,
      (SELECT COUNT(*) FROM travellers x WHERE x.booking_id = b.id AND x.status = '') AS pax
    FROM travellers t JOIN bookings b ON b.id = t.booking_id LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND t.status = '' AND b.tour <> ? AND b.tour_date = ?
    ORDER BY b.tour, b.submitted_at, b.id, t.n", [TRANSPORT_ONLY, $date]);
  $out = []; $count = []; $last = '';
  foreach ($rows as $i => $r) {
    $first = $r['booking_id'] !== $last; $last = $r['booking_id'];
    $out[] = ['no' => $i + 1, 'booking_id' => $r['booking_id'], 'tour' => $r['tour'], 'receipt_no' => $r['receipt_no'], 'name' => $r['full_name'],
      'pax' => $first ? (int) $r['pax'] : '', 'food' => ($r['food'] !== '' ? $r['food'] : 'Regular'), 'note' => $first ? $r['note'] : ''];
    $count[$r['tour']] = ($count[$r['tour']] ?? 0) + 1;
  }
  $names = []; foreach (all('SELECT code, name FROM tours ORDER BY sort, code') as $t) $names[$t['code']] = $t['name'];
  $guides = []; foreach (all('SELECT tour, guide FROM day_guides WHERE day = ?', [$date]) as $g) $guides[$g['tour']] = $g['guide'];
  $groups = [];
  foreach (array_keys($count) as $code) $groups[substr((string) $code, 0, 1)][] = (string) $code;
  $lines = [];
  foreach ($groups as $key => $codes) {
    $all = array_values(array_filter(array_map('strval', array_keys($names)), fn ($c) => substr($c, 0, 1) === (string) $key));
    $head = $all ? min($all) : min($codes);
    $total = array_sum(array_map(fn ($c) => $count[$c], $codes));
    $lines[] = ['tour' => $head, 'label' => $names[$head] ?? "Package $head", 'pax' => $total, 'guide' => $guides[$head] ?? ''];
    foreach ($codes as $c) if ($c !== $head) $lines[] = ['tour' => $c, 'label' => "Package $c: " . ($names[$c] ?? ''), 'pax' => $count[$c], 'guide' => $guides[$c] ?? ''];
  }
  return ['date' => $date, 'rows' => $out, 'lines' => $lines, 'pax' => count($out)];
}

/* ---------- overview: the Sheet's Dashboard tab ---------- */
function overview(): array {
  $live = "b.deleted_at IS NULL"; $counted = "$live AND b.status NOT IN ('Cancelled','No-show')";
  $paidBy = "(SELECT booking_id, SUM(amount_usd) paid FROM payments GROUP BY booking_id) p";
  $num = fn ($rows) => array_map(fn ($r) => array_map(fn ($v) => is_numeric($v) ? $v + 0 : $v, $r), $rows);
  return [
    'cards' => [
      'Booking requests' => (int) val("SELECT COUNT(*) FROM bookings b WHERE $live"),
      'Confirmed or paid' => (int) val("SELECT COUNT(*) FROM bookings b WHERE $live AND b.status IN ('Confirmed','Paid')"),
      'Travellers' => (int) val("SELECT COUNT(*) FROM travellers t JOIN bookings b ON b.id = t.booking_id WHERE $counted AND t.status = ''"),
      'Received (USD)' => round((float) val("SELECT COALESCE(SUM(p.amount_usd), 0) FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE $live"), 2),
      'Confirmed, not yet paid (tour USD)' => round((float) val("SELECT COALESCE(SUM(b.est_tour_usd), 0) FROM bookings b WHERE $live AND b.status = 'Confirmed'"), 2),
      'Inquiries' => (int) val('SELECT COUNT(*) FROM inquiries'),
    ],
    'by_month' => $num(all("SELECT DATE_FORMAT(b.tour_date, '%Y-%m') month, COUNT(*) bookings,
        (SELECT COUNT(*) FROM travellers t JOIN bookings x ON x.id = t.booking_id WHERE x.deleted_at IS NULL AND x.status NOT IN ('Cancelled','No-show') AND t.status = '' AND DATE_FORMAT(x.tour_date, '%Y-%m') = DATE_FORMAT(b.tour_date, '%Y-%m')) travellers,
        SUM(b.est_tour_usd) tour_usd, COALESCE(SUM(p.paid), 0) paid_usd
      FROM bookings b LEFT JOIN $paidBy ON p.booking_id = b.id WHERE $counted AND b.tour_date IS NOT NULL GROUP BY month ORDER BY month DESC LIMIT 24")),
    'by_tour' => $num(all("SELECT TRIM(CONCAT(b.tour, ' ', b.tour_name)) tour, COUNT(*) bookings,
        (SELECT COUNT(*) FROM travellers t JOIN bookings x ON x.id = t.booking_id WHERE x.deleted_at IS NULL AND x.status NOT IN ('Cancelled','No-show') AND t.status = '' AND x.tour = b.tour AND x.tour_name = b.tour_name) travellers,
        COALESCE(SUM(p.paid), 0) paid_usd
      FROM bookings b LEFT JOIN $paidBy ON p.booking_id = b.id WHERE $counted GROUP BY b.tour, b.tour_name ORDER BY bookings DESC LIMIT 20")),
    'by_country' => $num(all("SELECT IF(t.country = '', '(not given)', t.country) country, COUNT(*) travellers FROM travellers t JOIN bookings b ON b.id = t.booking_id
      WHERE $counted AND t.status = '' GROUP BY country ORDER BY travellers DESC LIMIT 20")),
    'by_source' => $num(all("SELECT IF(b.source = '', '(not given)', b.source) source, COUNT(*) bookings FROM bookings b WHERE $live GROUP BY source ORDER BY bookings DESC")),
    'by_status' => $num(all("SELECT b.status, COUNT(*) bookings FROM bookings b WHERE $live GROUP BY b.status ORDER BY bookings DESC")),
    'inquiries' => $num(all("SELECT DATE_FORMAT(submitted_at, '%Y-%m') month, COUNT(*) inquiries, SUM(status = 'Booked') booked FROM inquiries GROUP BY month ORDER BY month DESC LIMIT 24")),
  ];
}
