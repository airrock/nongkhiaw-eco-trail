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
// "Back after the tour, about 3:30-4:30 PM" -> 3:30-4:30 PM; otherwise the usual 10:00-10:30 AM.
function return_time(string $remark, string $typed = ''): string {
  if (trim($typed) !== '') return trim($typed);
  return preg_match('/\d{1,2}(?::\d{2})?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?(?:AM|PM)/i', $remark, $m) ? preg_replace('/\s*-\s*/', '-', $m[0]) : '10:00-10:30 AM';
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

function team_message(array $people, ?string $up, ?string $down, bool $train, string $guest, string $phone, string $id, ?string $receipt, string $nk, string $remark, string $returnTime): string {
  $places = [];
  foreach ($people as $p) { $k = trim($p['place'] . ' ' . $p['map']); if (!in_array($k, $places, true)) $places[] = $k; }
  $lead = mb_strtolower(trim($guest));
  $others = array_values(array_filter(array_column($people, 'name'), fn ($n) => $n !== '' && mb_strtolower(trim($n)) !== $lead));
  $lines = ['Booking id: ' . $id, 'Receipt no: ' . short_receipt($receipt), ($up && $down ? 'ໄປກັບ ' : '') . count($people) . 'pax', 'ລູກຄ້າ: ' . $guest . wa_text($phone)];
  if ($others) $lines[] = 'ຜູ້ຕິດຕາມ: ' . implode(', ', $others);
  if ($up) { $lines[] = 'ຂຶ້ນ: ' . day_month($up); $lines[] = 'ບ່ອນຮັບ: ' . implode(' / ', $places); }
  if ($up && $down) $lines[] = '**';
  if ($down) {
    $lines[] = 'ລົງ: ' . day_month($down) . ' ' . return_time($remark, $returnTime) . ' ' . ($train ? 'ສົ່ງສະຖານີລົດໄຟ' : 'ສົ່ງຕົວເມືອງ ໃກ້ຕະຫຼາດມືດ');
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
  return 'Hello ' . ($first ?: 'there') . '! Your minivan to ' . $to . ' is booked for ' . $day . ".\n" .
    'Pickup at ' . $place . ($time ? ' between ' . $time : '') . ".\n" .
    'The plate number is ' . ($plate ?: '(we send it soon)') . ".\n" . $extra .
    ($manager ? "\nIf you need help with your pickup, please contact our transport manager: " . $manager . '.' : '');
}

// Everyone riding the minivan on $date: 'up' (Luang Prabang -> Nong Khiaw) and 'down' (back), one entry per pickup stop.
function transport_day(string $date): array {
  $today = lao_today();
  $tomorrow = (new DateTime($today))->modify('+1 day')->format('Y-m-d');
  $dayWord = $date === $tomorrow ? 'tomorrow' : ($date === $today ? 'today' : 'on ' . lao_day($date));
  $manager = trim(setting('transport_manager')); $office = setting('nk_office', 'Office (The Trio Bar & Cafe)');
  $rows = all("SELECT b.*, r.no AS receipt_no FROM bookings b LEFT JOIN receipts r ON r.booking_id = b.id
    WHERE b.deleted_at IS NULL AND b.status <> 'Cancelled' AND (b.pickup_date = ? OR b.return_date = ?) ORDER BY b.submitted_at", [$date, $date]);
  $up = []; $down = [];
  foreach ($rows as $b) {
    $goesUp = goes_up($b['transfer']); $back = goes_down($b['transfer']) || $b['return_date'] !== null;   // a return date typed later counts too
    if (!$goesUp && !$back) continue;
    $people = array_map(fn ($t) => ['n' => (int) $t['n'], 'name' => $t['full_name'], 'first' => $t['first_name'], 'place' => $t['pickup_place'], 'map' => $t['pickup_map'], 'phone' => $t['whatsapp']],
      all("SELECT * FROM travellers WHERE booking_id = ? AND pickup_place <> 'No transfer' AND status <> 'Cancelled' ORDER BY n", [$b['id']]));
    if (!$people) continue;
    $lead = (string) val('SELECT full_name FROM travellers WHERE booking_id = ? ORDER BY n LIMIT 1', [$b['id']]) ?: $people[0]['name'];
    $first = $people[0]['first'] ?: explode(' ', $people[0]['name'])[0];
    $nk = $b['nk_pickup'] ?: $office; $train = (bool) $b['train_dropoff'];
    $team = team_message($people, $goesUp ? $b['pickup_date'] : null, $back ? $b['return_date'] : null, $train, $lead, $b['whatsapp'], $b['id'], $b['receipt_no'], $nk, $b['transport_remark'], $b['return_time']);
    $base = ['booking_id' => $b['id'], 'receipt_no' => $b['receipt_no'], 'whatsapp' => $b['whatsapp'], 'lead' => $lead, 'remark' => $b['transport_remark'], 'wa' => wa_digits($b['whatsapp'])];
    if ($goesUp && $b['pickup_date'] === $date) {
      $stops = pickup_stops($people);
      foreach ($stops as $si => $g) {
        $place = $g[0]['place'] ?: 'your hotel';
        $up[] = $base + ['key' => $g[0]['place'] . '|' . $b['id'] . '|' . $si, 'pax' => count($g), 'names' => array_column($g, 'name'), 'place' => $g[0]['place'], 'map' => $g[0]['map'],
          'time' => $b['pickup_time'], 'vehicle' => $b['vehicle_to_nk'], 'stop' => count($stops) > 1 ? ($si + 1) . '/' . count($stops) : '',
          'team' => count($stops) === 1 ? $team : stop_message($g, $si, count($stops), $b['pickup_date'], $b['id'], $b['receipt_no'], $lead, $b['whatsapp']),
          'guest' => guest_message($first, 'Nong Khiaw', $place, $b['pickup_time'] ?: '7:30 and 8:00 AM', $b['vehicle_to_nk'], 'Please wait at your hotel reception for the driver to pick you up.', $manager, $dayWord)];
      }
    }
    if ($back && $b['return_date'] === $date) {
      $drop = $train ? 'Luang Prabang train station' : 'City center';
      $down[] = $base + ['key' => ($train ? '1' : '0') . '|' . $nk . '|' . $b['id'], 'pax' => count($people), 'names' => array_column($people, 'name'), 'place' => $nk, 'map' => '',
        'time' => $b['return_time'], 'vehicle' => $b['vehicle_to_lpb'], 'stop' => '', 'drop' => $drop, 'team' => $team,
        'guest' => guest_message($first, 'Luang Prabang', $nk, str_replace('-', ' and ', return_time($b['transport_remark'], $b['return_time'])), $b['vehicle_to_lpb'],
          'Please be ready a few minutes before. Drop-off: ' . $drop . '.', $manager, $dayWord)];
    }
  }
  $byKey = fn ($a, $b) => strcmp($a['key'], $b['key']);
  usort($up, $byKey); usort($down, $byKey);
  return ['date' => $date, 'up' => $up, 'down' => $down, 'up_pax' => array_sum(array_column($up, 'pax')), 'down_pax' => array_sum(array_column($down, 'pax'))];
}
