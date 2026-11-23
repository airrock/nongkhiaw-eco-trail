<?php
// The website's endpoint. Same contract as the Apps Script /exec URL it replaces, so the site only changes one address:
//   POST (JSON sent as text/plain): { type: booking | inquiry | agreement | lunch, ... }
//   GET ?config=1 | ?reviews=1 | ?agreement=<key> | ?lunch=<key>
declare(strict_types=1);
ini_set('display_errors', '0');   // errors go to the server log, never to the page
// lib/ sits two folders up locally; on the hosting it is kept outside the web folder, in nk/lib
$lib = is_dir(__DIR__ . '/../../lib') ? __DIR__ . '/../../lib' : __DIR__ . '/../../../nk/lib';
require_once $lib . '/rules.php';

header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store');
function reply($out): void {
  if (is_string($out)) { header('Content-Type: text/plain; charset=utf-8'); echo $out; }
  else { header('Content-Type: application/json; charset=utf-8'); echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }
  exit;
}
try {
  if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { header('Access-Control-Allow-Headers: Content-Type'); exit; }
  if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (($_GET['config'] ?? '') === '1') reply(config_json());
    if (($_GET['reviews'] ?? '') === '1') reply(reviews_json());
    if (isset($_GET['agreement'])) reply(agreement_json($_GET['agreement']));
    if (isset($_GET['lunch'])) reply(lunch_json($_GET['lunch']));
    reply('Nong Khiaw Eco-Trail booking endpoint is running.');
  }
  $raw = file_get_contents('php://input');
  if (strlen($raw) > 200000) { http_response_code(413); reply('too large'); }
  $d = json_decode($raw, true);
  if (!is_array($d)) { http_response_code(400); reply('bad request'); }
  if (!empty($d['website'])) reply('ok');   // honeypot field: only bots fill it
  switch ($d['type'] ?? '') {
    case 'booking': save_booking($d); reply('ok');
    case 'inquiry': save_inquiry($d); reply('ok');
    case 'agreement': reply(['saved' => save_agreement($d)]);
    case 'lunch': reply(['saved' => save_lunch($d)]);
    default: reply('unknown type');
  }
} catch (Refused $e) {
  http_response_code(400); reply($e->getMessage());
} catch (Throwable $e) {
  error_log('exec.php failed: ' . $e);   // the guest's details are not written to the log
  http_response_code(500); reply('error');
}
