<?php
// Pickups and minivan lists for one day, with the messages for the minivan team (Lao) and for the guest.
// Ported from buildTransport_, teamMessage_, stopMessage_ and guestMessage_ in apps-script/Code.gs.
declare(strict_types=1);
require_once __DIR__ . '/rules.php';

function wa_digits($phone): string { return preg_replace('/^00/', '', preg_replace('/\D/', '', (string) $phone)); }
function wa_text($phone): string { $d = wa_digits($phone); return strlen($d) >= 7 ? '  WhatsApp: ' . trim((string) $phone) . ' https://wa.me/' . $d : ''; }
function day_month(?string $ymd): string { return $ymd ? substr($ymd, 8, 2) . '/' . substr($ymd, 5, 2) : ''; }
// 000007 -> 007, as Noy writes it for the team
function short_receipt(?string $no): string {
  $no = trim((string) $no);
  return preg_match('/^\d+$/', $no) ? str_pad((string) (int) $no, 3, '0', STR_PAD_LEFT) : $no;
}
// The riders of a booking grouped by pickup place (and map), in traveller order.
function pickup_stops(array $people): array {
  $at = []; $out = [];
  foreach ($people as $p) {
    $k = mb_strtolower(trim($p['place'])) . '|' . trim($p['map']);
    if (!isset($at[$k])) { $at[$k] = count($out); $out[] = []; }
    $out[$at[$k]][] = $p;
  }
  return $out;
}

function team_message(array $people, ?string $up, ?string $down, bool $train, string $guest, string $phone, string $id, ?string $receipt, string $nk, string $downTime): string {
  $places = [];
  foreach ($people as $p) { $k = trim($p['place'] . ' ' . $p['map']); if (!in_array($k, $places, true)) $places[] = $k; }
  $lead = mb_strtolower(trim($guest));
  $others = array_values(array_filter(array_column($people, 'name'), fn ($n) => $n !== '' && mb_strtolower(trim($n)) !== $lead));
  $lines = ['Booking id: ' . $id, 'Receipt no: ' . short_receipt($receipt), ($up && $down ? 'ໄປກັບ ' : '') . count($people) . 'pax', 'ລູກຄ້າ: ' . $guest . wa_text($phone)];
  if ($others) $lines[] = 'ຜູ້ຕິດຕາມ: ' . implode(', ', $others);
  if ($up) { $lines[] = 'ຂຶ້ນ: ' . day_month($up); $lines[] = 'ບ່ອນຮັບ: ' . implode(' / ', $places); }
  if ($up && $down) $lines[] = '**';
  if ($down) {
    $lines[] = 'ລົງ: ' . day_month($down) . ' ' . $downTime . ' ' . ($train ? 'ສົ່ງສະຖານີລົດໄຟ' : 'ສົ່ງຕົວເມືອງ ໃກ້ຕະຫຼາດມືດ');
    $lines[] = 'ບ່ອນຮັບໜອງຂຽວ: ' . $nk;
  }
  return implode("\n", $lines);
}

// Team message for one pickup stop of a booking whose guests are picked up at several places.
function stop_message(array $g, int $si, int $n, ?string $up, string $id, ?string $receipt, string $lead, string $phone): string {
  $leadKey = mb_strtolower(trim($lead)); $leadHere = false;
  $lines = ['Booking id: ' . $id, 'Receipt no: ' . short_receipt($receipt), 'ຈຸດຮັບ ' . ($si + 1) . '/' . $n . ': ' . count($g) . 'pax'];
  foreach ($g as $p) {
    $isLead = mb_strtolower(trim($p['name'])) === $leadKey; $leadHere = $leadHere || $isLead;
    $lines[] = '- ' . $p['name'] . wa_text($p['phone'] ?: ($isLead ? $phone : ''));
  }
  if (!$leadHere) $lines[] = 'ຕິດຕໍ່ (booked by ' . $lead . ')' . wa_text($phone);
  $lines[] = 'ຂຶ້ນ: ' . day_month($up);
  $lines[] = 'ບ່ອນຮັບ: ' . trim($g[0]['place'] . ' ' . $g[0]['map']);
  return implode("\n", $lines);
}

function guest_message(string $first, string $to, string $place, string $time, string $plate, string $extra, string $manager, string $day): string {
  return 'Hello ' . ($first ?: 'there') . '! Your minivan to ' . $to . ' is booked ' . $day . ".\n" .
    'Pickup at ' . $place . ($time ? ' between ' . $time : '') . ".\n" .
    'The plate number is ' . ($plate ?: '(we send it soon)') . ".\n" . $extra .
    ($manager ? "\nIf you need help with your pickup, please contact our transport manager: " . $manager . '.' : '');
}

// Everyone riding the minivan on $date: 'up' (Luang Prabang -> Nong Khiaw) and 'down' (back), one entry per pickup stop,
// and the same people one per row ('up_rows', 'down_rows') for the list that goes to the minivan manager.
function transport_day(string $date, ?string $onlyBooking = null): array {
  $today = lao_today();
  $tomorrow = (new DateTime($today))->modify('+1 day')->format('Y-m-d');
  $dayWord = $date === $tomorrow ? 'for tomorrow' : ($date === $today ? 'for today' : 'for ' . lao_day($date));
  $manager = trim(setting('transport_manager')); $office = setting('nk_office', 'Office (The Trio Bar & Cafe)');
  $rows = all("SELECT b.*, COALESCE(r.no, NULLIF(b.receipt_ref, '')) AS receipt_no FROM bookings b LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status NOT IN ('Cancelled','No-show') AND (b.pickup_date = ? OR b.return_date = ?)" . ($onlyBooking !== null ? ' AND b.id = ?' : '') . ' ORDER BY b.submitted_at',
    $onlyBooking !== null ? [$date, $date, $onlyBooking] : [$date, $date]);
  $up = []; $down = []; $upRows = []; $downRows = []; $passengers = [];
  foreach ($rows as $b) {
    $goesUp = goes_up($b['transfer']); $back = goes_down($b['transfer']) || $b['return_date'] !== null;   // a return date typed later counts too
    if (!$goesUp && !$back) continue;
    $people = array_map(fn ($t) => ['n' => (int) $t['n'], 'name' => $t['full_name'], 'first' => $t['first_name'], 'place' => $t['pickup_place'], 'map' => $t['pickup_map'], 'phone' => $t['whatsapp'],
        'passport' => $t['passport_no'], 'issued' => show_date($t['passport_issued']), 'expires' => show_date($t['passport_expires']), 'country' => $t['country'],
        'food' => $t['food'] !== '' ? $t['food'] : 'Regular', 'lunch' => trim($t['lunch_dish'] . ($t['lunch_choice'] !== '' ? ' (' . $t['lunch_choice'] . ')' : ''))],
      all("SELECT * FROM travellers WHERE booking_id = ? AND pickup_place <> 'No transfer' AND status = '' ORDER BY n", [$b['id']]));
    if (!$people) continue;
    $lead = (string) val('SELECT full_name FROM travellers WHERE booking_id = ? ORDER BY n LIMIT 1', [$b['id']]) ?: $people[0]['name'];
    $first = $people[0]['first'] ?: explode(' ', $people[0]['name'])[0];
    $nk = $b['nk_pickup'] ?: $office; $train = (bool) $b['train_dropoff'];
    [$upTime, $downTime] = array_map('time_label', transfer_times($b));
    $team = team_message($people, $goesUp ? $b['pickup_date'] : null, $back ? $b['return_date'] : null, $train, $lead, $b['whatsapp'], $b['id'], $b['receipt_no'], $nk, $downTime);
    $base = ['booking_id' => $b['id'], 'receipt_no' => $b['receipt_no'], 'whatsapp' => $b['whatsapp'], 'lead' => $lead, 'remark' => $b['transport_remark'], 'wa' => wa_digits($b['whatsapp'])];
    $row = fn ($p, $i) => ['booking_id' => $b['id'], 'tour' => $b['tour'], 'receipt_no' => $b['receipt_no'], 'name' => $p['name'], 'pax' => $i === 0 ? count($people) : '', 'riders' => 1];
    // the passenger list the minivan carries: one row per guest riding that day, either way, with the passport details
    $ridesUp = $goesUp && $b['pickup_date'] === $date; $ridesDown = $back && $b['return_date'] === $date;
    if ($ridesUp || $ridesDown) foreach ($people as $p) $passengers[] = ['way' => $ridesUp && $ridesDown ? 'ຂຶ້ນ + ລົງ' : ($ridesUp ? 'ຂຶ້ນ' : 'ລົງ'), 'name' => $p['name'], 'passport' => $p['passport'],
      'issued' => $p['issued'], 'expires' => $p['expires'], 'country' => $p['country'], 'place' => $ridesUp && $ridesDown ? $p['place'] . ' / back from ' . $nk : ($ridesUp ? $p['place'] : $nk),
      'pickup_date' => $goesUp ? $b['pickup_date'] : null, 'return_date' => $back ? $b['return_date'] : null, 'booking_id' => $b['id'], 'vehicle' => $ridesUp && $ridesDown ? trim($b['vehicle_to_nk'] . ' / ' . $b['vehicle_to_lpb'], ' /') : ($ridesUp ? $b['vehicle_to_nk'] : $b['vehicle_to_lpb'])];
    if ($goesUp && $b['pickup_date'] === $date) {
      $stops = pickup_stops($people);
      foreach ($stops as $si => $g) {
        $place = $g[0]['place'] ?: 'your hotel';
        // a stop without the person who booked: greet the guests of that stop, on their own WhatsApp when staff typed one
        $leadHere = in_array(mb_strtolower(trim($lead)), array_map(fn ($x) => mb_strtolower(trim($x['name'])), $g), true);
        $greet = $leadHere ? $first : ($g[0]['first'] ?: explode(' ', $g[0]['name'])[0]);
        $own = $leadHere ? '' : (string) (array_values(array_filter(array_column($g, 'phone')))[0] ?? '');
        $up[] = ($own !== '' ? ['wa' => wa_digits($own)] : []) + $base + ['key' => $g[0]['place'] . '|' . $b['id'] . '|' . $si, 'pax' => count($g), 'names' => array_column($g, 'name'), 'place' => $g[0]['place'], 'map' => $g[0]['map'],
          'time' => $upTime, 'vehicle' => $b['vehicle_to_nk'], 'stop' => count($stops) > 1 ? ($si + 1) . '/' . count($stops) : '',
          'team' => count($stops) === 1 ? $team : stop_message($g, $si, count($stops), $b['pickup_date'], $b['id'], $b['receipt_no'], $lead, $b['whatsapp']),
          'guest' => guest_message($greet, 'Nong Khiaw', $place, str_replace(' - ', ' and ', $upTime), $b['vehicle_to_nk'], 'Please wait at your hotel reception for the driver to pick you up.', $manager, $dayWord)];
      }
      foreach ($people as $i => $p) $upRows[] = $row($p, $i) + ['food' => $p['food'], 'date' => $b['pickup_date'], 'time' => $upTime, 'place' => $p['place'], 'map' => $p['map'],
        'lunch' => $p['lunch'], 'lunch_qty' => $p['lunch'] !== '' ? 1 : '', 'lunch_date' => $p['lunch'] !== '' ? ($b['tour_date'] ?? $b['pickup_date']) : '', 'vehicle' => $b['vehicle_to_nk'], 'remark' => $b['transport_remark']];
    }
    if ($back && $b['return_date'] === $date) {
      $drop = $train ? 'Luang Prabang train station' : 'City center';
      $down[] = $base + ['key' => ($train ? '1' : '0') . '|' . $nk . '|' . $b['id'], 'pax' => count($people), 'names' => array_column($people, 'name'), 'place' => $nk, 'map' => '',
        'time' => $downTime, 'vehicle' => $b['vehicle_to_lpb'], 'stop' => '', 'drop' => $drop, 'team' => $team,
        'guest' => guest_message($first, 'Luang Prabang', $nk, str_replace(' - ', ' and ', $downTime), $b['vehicle_to_lpb'],
          'Please be ready a few minutes before. Drop-off: ' . $drop . '.', $manager, $dayWord)];
      $note = 'Leave at ' . $downTime . ', drop off ' . ($train ? 'at the train station' : 'in the city center near the night market');
      foreach ($people as $i => $p) $downRows[] = $row($p, $i) + ['date' => $b['return_date'], 'time' => $downTime, 'place' => $nk, 'train' => $train, 'notes' => $note, 'vehicle' => $b['vehicle_to_lpb'], 'remark' => $b['transport_remark']];
    }
  }
  $byKey = fn ($a, $b) => strcmp($a['key'], $b['key']);
  usort($up, $byKey); usort($down, $byKey);
  // the way back, earliest minivan first; one summary line per leaving time
  usort($upRows, fn ($a, $b) => time_sort($a['time']) <=> time_sort($b['time']));   // stable: a booking's guests stay together
  usort($downRows, fn ($a, $b) => [time_sort($a['time']), $a['booking_id']] <=> [time_sort($b['time']), $b['booking_id']]);
  $slots = [];
  foreach ($downRows as $r) { $slots[$r['time']] = $slots[$r['time']] ?? ['time' => $r['time'], 'pax' => 0, 'train' => 0]; $slots[$r['time']]['pax']++; $slots[$r['time']]['train'] += (int) $r['train']; }
  foreach ($upRows as $i => &$r) $r['no'] = $i + 1;
  unset($r);
  foreach ($downRows as $i => &$r) $r['no'] = $i + 1;
  unset($r);
  usort($passengers, fn ($a, $b) => [$a['way'] === 'ລົງ' ? 1 : 0, $a['booking_id']] <=> [$b['way'] === 'ລົງ' ? 1 : 0, $b['booking_id']]);
  foreach ($passengers as $i => &$r) $r['no'] = $i + 1;
  unset($r);
  return ['date' => $date, 'up' => $up, 'down' => $down, 'up_pax' => array_sum(array_column($up, 'pax')), 'down_pax' => array_sum(array_column($down, 'pax')),
    'up_rows' => $upRows, 'down_rows' => $downRows, 'passengers' => $passengers, 'down_slots' => array_values($slots)];
}
// "3:30 - 4:30 PM" -> minutes after midnight of the first time, so the lists sort by the clock. Unreadable times go last.
function time_sort(string $t): int {
  if (!preg_match('/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?(?:\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?)?/i', $t, $m)) return 9999;
  $h1 = (int) $m[1] % 12; $min = (int) ($m[2] ?? 0); $mk1 = strtolower($m[3] ?? ''); $mk2 = strtolower($m[6] ?? '');
  if ($mk1 === 'pm') $h1 += 12;
  elseif ($mk1 === '' && $mk2 !== '') {   // "11:30 - 12:30 PM": the marker comes after the dash, and the first time is the earlier one
    $h2 = ((int) $m[4] % 12) + ($mk2 === 'pm' ? 12 : 0);
    if ($mk2 === 'pm' && $h1 + 12 <= $h2) $h1 += 12;
  } elseif ($mk1 === '' && $h1 < 7) $h1 += 12;   // "3:30 - 4:30" typed without AM or PM is the afternoon minivan
  return $h1 * 60 + $min;
}
// A typed time without AM/PM gets the one time_sort() assumed, so "3:30 - 4:30" and "3:30 - 4:30 PM" are the same minivan.
function time_label(string $t): string {
  $t = trim($t);
  if ($t === '' || preg_match('/am|pm/i', $t) || !preg_match('/^\d{1,2}([:.]\d{2})?(\s*[-–]\s*\d{1,2}([:.]\d{2})?)?$/u', $t)) return $t;
  return $t . (time_sort($t) >= 12 * 60 ? ' PM' : ' AM');
}

// One plate number for everyone on the minivan that day in one direction. Returns how many bookings it was written on.
function set_day_plate(string $date, string $dir, string $plate, array $user): int {
  $col = $dir === 'up' ? 'vehicle_to_nk' : 'vehicle_to_lpb';
  $day = transport_day($date);
  $ids = array_values(array_unique(array_column($dir === 'up' ? $day['up'] : $day['down'], 'booking_id')));
  foreach ($ids as $id) {
    $old = (string) val("SELECT `$col` FROM bookings WHERE id = ?", [$id]);
    if ($old === $plate) continue;
    q("UPDATE bookings SET `$col` = ? WHERE id = ?", [$plate, $id]);
    log_change('bookings', $id, 'update', [$col => $old], [$col => $plate], $user);
  }
  return count($ids);
}
