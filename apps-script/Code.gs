/**
 * Nong Khiaw Eco-Trail: booking and inquiry database + dashboard.
 *
 * Install (in the Google Sheet): Extensions > Apps Script, replace everything with this file, Save.
 * Run setup() once. Then Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 * Put the /exec URL in js/main.js (SHEET_URL). See apps-script/README.md.
 *
 * The website sends JSON here (passport numbers included, so keep the sheet's sharing Restricted).
 */

var TABS = { bookings: 'Bookings', travellers: 'Travellers', inquiries: 'Inquiries', reviews: 'Reviews', settings: 'Settings',
  dashboard: 'Dashboard', content: 'Content', contentBase: 'Content base', help: 'How to edit', trip: 'Trip sheet', lunch: 'Lunch menu' };

var BOOKING_COLS = ['Booking ID', 'Submitted at', 'Tour date', 'Tour month', 'Tour', 'Tour name', 'People', 'Lead name',
  'Traveller names', 'Countries', 'Food', 'Transfer', 'Pickup date', 'Return date', 'Train station drop-off', 'Accommodation',
  'Maps link', 'Pickups', 'Takeaway lunch', 'Lunch kip', 'Payment method', 'Source', 'Referrer', 'Site language', 'Note', 'Est. tour USD', 'Est. transfer kip', 'Status',
  'Receipt No', 'Amount paid USD', 'Staff notes'];
// Status and Receipt No are formulas (spilled from their header cell) that look the booking up: never written per row.
var TRAVELLER_COLS = ['Booking ID', 'Tour date', 'Tour', 'Traveller #', 'First name', 'Last name', 'Full name', 'Country',
  'Gender', 'Passport no', 'Passport issued', 'Passport expires', 'Food', 'Pickup place', 'Pickup map', 'Takeaway lunch', 'Lunch kip', 'Status', 'Receipt No'];
// Headers renamed in a later version: the old name is renamed in place, so its data stays put.
var RENAMES = { Travellers: { 'Name': 'Full name' }, Bookings: { 'Special food': 'Food' } };
// Reviews shown on the website: staff tick Show; newest Date first, at most REVIEWS_SHOWN.
var REVIEW_COLS = ['Show', 'Date', 'Name', 'Review'];
var REVIEWS_SHOWN = 8;
var INQUIRY_COLS = ['Submitted at', 'Month', 'Name', 'Contact', 'Tour', 'Question', 'Source', 'Referrer', 'Site language',
  'Status', 'Staff notes'];

var FORMATS = {
  Bookings: { 'Submitted at': 'dd/mm/yyyy hh:mm', 'Tour date': 'dd/mm/yyyy', 'Tour month': '@', 'Tour': '@',
    'Pickup date': 'dd/mm/yyyy', 'Return date': 'dd/mm/yyyy',
    'Est. tour USD': '#,##0', 'Est. transfer kip': '#,##0', 'Lunch kip': '#,##0', 'Amount paid USD': '#,##0.00' },
  Travellers: { 'Tour date': 'dd/mm/yyyy', 'Tour': '@', 'Lunch kip': '#,##0', 'Passport no': '@', 'Passport issued': 'dd/mm/yyyy', 'Passport expires': 'dd/mm/yyyy' },
  Inquiries: { 'Submitted at': 'dd/mm/yyyy hh:mm', 'Month': '@', 'Tour': '@' }
};

var STATUSES = ['Requested', 'Confirmed', 'Paid', 'Cancelled', 'No-show'];
var INQUIRY_STATUSES = ['New', 'Replied', 'Booked', 'Closed'];
var SOURCES = ['Google', 'Google Maps', 'Facebook', 'Instagram', 'TripAdvisor', 'Hostel / hotel', 'Friend', 'Walk-in', 'Other'];
var TOURS = [['101', 'Overnight camping above the clouds', 30], ['102', '2 days 1 night', 60],
  ['103', '3 days 2 nights', 90], ['001', '1-day boat trip', 30]];
var TRANSFER_KIP = 250000;
var TIME_ZONE = 'Asia/Vientiane';

/* ---------- setup: safe to run again; it never deletes data rows ---------- */

function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  ss.setSpreadsheetLocale('en_GB');  // dates are typed and shown Day/Month/Year
  setupSettings_(ss);
  setupTable_(ss, TABS.bookings, BOOKING_COLS, { 'Status': STATUSES, 'Source': SOURCES }, FORMATS.Bookings);
  setupTable_(ss, TABS.travellers, TRAVELLER_COLS, {}, FORMATS.Travellers);
  passportDatesToDates_(ss);
  setupTable_(ss, TABS.inquiries, INQUIRY_COLS, { 'Status': INQUIRY_STATUSES, 'Source': SOURCES }, FORMATS.Inquiries);
  setupReviews_(ss);
  setupContent_(ss);
  setupHelp_(ss);
  setupLunch_(ss);
  setupTrip_(ss);

  // Travellers.Status follows the booking's status, so cancelled trips drop out of the reports.
  var trav = ss.getSheetByName(TABS.travellers);
  ['Status', 'Receipt No'].forEach(function (col) {
    var bc = colLetter_(BOOKING_COLS.indexOf(col) + 1);
    trav.getRange(1, TRAVELLER_COLS.indexOf(col) + 1).setFormula(
      '={"' + col + '";ARRAYFORMULA(IF(A2:A="",,IFERROR(VLOOKUP(A2:A,{Bookings!A2:A,Bookings!' + bc + '2:' + bc +
      '},2,FALSE),"")))}');
  });

  setupDashboard_(ss);
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  ss.setActiveSheet(ss.getSheetByName(TABS.dashboard));
}

// Passport dates saved by earlier versions are text like 2030-01-31: turn them into real dates (shown Day/Month/Year).
function passportDatesToDates_(ss) {
  var sh = ss.getSheetByName(TABS.travellers), n = sh.getLastRow() - 1;
  if (n < 1) return;
  ['Passport issued', 'Passport expires'].forEach(function (c) {
    var rng = sh.getRange(2, TRAVELLER_COLS.indexOf(c) + 1, n, 1), v = rng.getValues();
    var out = v.map(function (r) { var d = typeof r[0] === 'string' ? parseDate_(r[0].replace(/^'/, '')) : ''; return [d || r[0]]; });
    rng.setValues(out);
  });
}

function setupSettings_(ss) {
  var sh = sheet_(ss, TABS.settings);
  // 2026-10-09 price change: move the old default on; a value staff typed themselves is left alone
  if (sh.getRange('F2').getValue() === 200000) sh.getRange('F2').setValue(TRANSFER_KIP);
  if (sh.getLastRow() > 0) { migrateSettings_(sh); return; }
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange(1, 1, 1, 3).setValues([['Tour', 'Name', 'Price USD (per person)']]);
  sh.getRange(2, 1, TOURS.length, 3).setValues(TOURS);
  sh.getRange('E1:F2').setValues([['Setting', 'Value'], ['Transfer kip per person, one way', TRANSFER_KIP]]);
  migrateSettings_(sh);
  sh.getRange('A1:F1').setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, 6);
}

// Round trip, train station fee and the explanatory note (older sheets only had the one-way price and a note in E4).
function migrateSettings_(sh) {
  var one = Number(sh.getRange('F2').getValue()) || TRANSFER_KIP;
  sh.getRange('E2').setValue('Transfer kip per person, one way');
  if (String(sh.getRange('E4').getValue()).indexOf('Edit prices') === 0) sh.getRange('E4:F4').clearContent();
  if (String(sh.getRange('E3').getValue()) === '') sh.getRange('E3:F3').setValues([['Transfer kip per person, round trip', one * 2]]);
  if (String(sh.getRange('E4').getValue()) === '') sh.getRange('E4:F4').setValues([['Train station drop-off, extra kip per person', 70000]]);
  sh.getRange('E6').setValue('Edit prices here: the website and new bookings use them within 5 minutes. Old rows keep the price they were booked at.');
  sh.getRange('F2:F4').setNumberFormat('#,##0');
  sh.getRange('E:E').setWrap(true);
}

function kipPrices_(ss) {
  var sh = ss.getSheetByName(TABS.settings);
  var one = Number(sh.getRange('F2').getValue()) || TRANSFER_KIP;
  return { one: one, round: Number(sh.getRange('F3').getValue()) || one * 2, train: Number(sh.getRange('F4').getValue()) || 70000 };
}

function setupTable_(ss, name, cols, dropdowns, formats) {
  var sh = sheet_(ss, name);
  renameColumns_(sh, RENAMES[name] || {});
  addMissingColumns_(sh, cols);
  dropDuplicateLookups_(sh, name, cols);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]);  // headers follow the column list; data rows untouched
  sh.getRange(1, 1, 1, cols.length).setFontWeight('bold').setBackground('#e8f0ea');
  sh.setFrozenRows(1);
  Object.keys(formats).forEach(function (c) {
    sh.getRange(2, cols.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat(formats[c]);
  });
  Object.keys(dropdowns).forEach(function (c) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(dropdowns[c], true).setAllowInvalid(true).build();
    sh.getRange(2, cols.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  });
}

/* ---------- Lunch menu (takeaway lunch from The Trio Bar & Cafe, ordered with the booking) ---------- */

var LUNCH_COLS = ['Show', 'Group', 'Dish', 'Choices (comma separated; empty if none)', 'Price kip'];
var SEED_LUNCH = [
  [true, 'Lao-Asian dishes', 'Stir fried ginger', 'Chicken, Pork, Tofu', 69000],
  [true, 'Lao-Asian dishes', 'Stir fried holy basil', 'Chicken, Pork, Tofu', 69000],
  [true, 'Lao-Asian dishes', 'Fried cashew nut', 'Chicken, Pork, Tofu', 79000],
  [true, 'Lao-Asian dishes', 'Green curry', 'Chicken, Pork, Tofu', 79000],
  [true, 'Lao-Asian dishes', 'Yellow curry', 'Chicken, Pork, Tofu', 79000],
  [true, 'Lao-Asian dishes', 'Red curry', 'Chicken, Pork, Tofu', 79000],
  [true, 'Lao-Asian dishes', 'Pad Thai', 'Chicken, Pork, Tofu', 69000],
  [true, 'Lao-Asian dishes', 'Classic fried rice', 'Chicken, Pork, Bacon, Egg, Tofu', 69000],
  [true, 'Sandwiches', 'Lemongrass chicken sandwich', '', 80000],
  [true, 'Sandwiches', 'Lemongrass tofu sandwich', '', 70000],
  [true, 'Sandwiches', 'Chicken sandwich', '', 70000],
  [true, 'Sandwiches', 'Bacon sandwich', '', 70000],
  [true, 'Sandwiches', 'Tuna sandwich', '', 70000],
  [true, 'Sandwiches', 'Avocado sandwich', '', 65000],
  [true, 'Sandwiches', 'Omelette or scrambled eggs sandwich', 'Omelette, Scrambled eggs', 70000],
  [true, 'Sandwiches', 'Chilli tamarind tofu sandwich', '', 65000],
  [true, 'Sandwiches', 'Pumpkin caramelised sandwich', '', 80000],
  [true, 'Sandwiches', 'Vegetable sandwich', '', 60000]
];

// Seeded once from The Trio's menu; after that the tab belongs to staff and is never overwritten.
function setupLunch_(ss) {
  if (ss.getSheetByName(TABS.lunch)) return;
  var sh = ss.insertSheet(TABS.lunch);
  sh.getRange(1, 1, 1, LUNCH_COLS.length).setValues([LUNCH_COLS]).setFontWeight('bold').setBackground('#e8f0ea').setWrap(true);
  sh.getRange(2, 1, SEED_LUNCH.length, LUNCH_COLS.length).setValues(SEED_LUNCH);
  sh.getRange('A2:A100').insertCheckboxes();
  sh.getRange('E2:E100').setNumberFormat('#,##0');
  sh.setColumnWidth(1, 60); sh.setColumnWidth(2, 150); sh.setColumnWidth(3, 280); sh.setColumnWidth(4, 260); sh.setColumnWidth(5, 100);
  sh.setFrozenRows(1);
  sh.getRange('G1').setValue('Guests can order these as takeaway lunch when they book (not included in the tour price, paid separately). ' +
    'Tick Show to offer a dish. Add new dishes as new rows; Group decides the heading in the list. ' +
    'Choices (e.g. Chicken, Pork, Tofu) are asked after the dish. Price is per portion in kip. Changes show on the website within 5 minutes.').setWrap(true);
  sh.setColumnWidth(7, 320);
}

// dish -> { price, choices[] } for every priced row (shown or not, so an order placed just before a change is still priced)
function lunchMap_(ss) {
  var sh = ss.getSheetByName(TABS.lunch), map = {};
  if (!sh || sh.getLastRow() < 2) return map;
  sh.getRange(2, 1, sh.getLastRow() - 1, LUNCH_COLS.length).getValues().forEach(function (r) {
    var dish = String(r[2]).trim(), price = Number(r[4]);
    if (dish && price > 0) map[dish] = { price: price, choices: String(r[3]).split(',').map(function (c) { return c.trim(); }).filter(String) };
  });
  return map;
}

function lunchMenuJson_(ss) {
  var sh = ss.getSheetByName(TABS.lunch), out = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, LUNCH_COLS.length).getValues().forEach(function (r) {
      var dish = String(r[2]).trim(), price = Number(r[4]);
      if (r[0] === true && dish && price > 0) {
        out.push({ group: String(r[1]).trim() || 'Menu', dish: dish, price: price,
          choices: String(r[3]).split(',').map(function (c) { return c.trim(); }).filter(String) });
      }
    });
  }
  return out;
}

/* ---------- Trip sheet: pick a date, see everyone on tours that day ---------- */

function setupTrip_(ss) {
  var sh = ss.getSheetByName(TABS.trip) || ss.insertSheet(TABS.trip);
  var date = sh.getRange('B2').getValue();
  if (!(date instanceof Date)) date = new Date();
  sh.clear();
  var B = function (c) { return 'Bookings!$' + colLetter_(BOOKING_COLS.indexOf(c) + 1) + '$2:$' + colLetter_(BOOKING_COLS.indexOf(c) + 1); };
  var T = function (c) { return 'Travellers!$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1) + '$2:$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var day = function (rng) { return rng + ',">="&$B$2,' + rng + ',"<"&($B$2+1)'; };
  var bDay = day(B('Tour date')) + ',' + B('Status') + ',"<>Cancelled"';
  var tDay = day(T('Tour date')) + ',' + T('Status') + ',"<>Cancelled"';
  sh.getRange('A1').setValue('Trip sheet').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Tour date (change the yellow cell):').setFontWeight('bold');
  sh.getRange('B2').setValue(date).setNumberFormat('ddd dd/mm/yyyy').setBackground('#fff2a8').setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  var kpis = [
    ['Booking requests', '=COUNTIFS(' + bDay + ')'],
    ['Travellers', '=SUMIFS(' + B('People') + ',' + bDay + ')'],
    ['Taking the transfer (by pickup place)', '=COUNTIFS(' + tDay + ',' + T('Pickup place') + ',"<>",' + T('Pickup place') + ',"<>No transfer")'],
    ['Food: Regular', '=COUNTIFS(' + tDay + ',' + T('Food') + ',"Regular")'],
    ['Food: Vegetarian', '=COUNTIFS(' + tDay + ',' + T('Food') + ',"Vegetarian")'],
    ['Food: Vegan', '=COUNTIFS(' + tDay + ',' + T('Food') + ',"Vegan")'],
    ['Food: Gluten-free', '=COUNTIFS(' + tDay + ',' + T('Food') + ',"Gluten-free")'],
    ['Tours to collect (USD, not yet paid)', '=SUMIFS(' + B('Est. tour USD') + ',' + bDay + ')-SUMIFS(' + B('Amount paid USD') + ',' + bDay + ')'],
    ['Transfers (kip, estimate)', '=SUMIFS(' + B('Est. transfer kip') + ',' + bDay + ')'],
    ['Takeaway lunches (kip, paid separately)', '=SUMIFS(' + B('Lunch kip') + ',' + bDay + ')']
  ];
  kpis.forEach(function (k, i) { sh.getRange(4 + i, 1).setValue(k[0]); sh.getRange(4 + i, 2).setFormula(k[1]).setFontWeight('bold').setHorizontalAlignment('left'); });
  sh.getRange('B11:B13').setNumberFormat('#,##0');
  var head = ['Tour', 'Name', 'Country', 'Gender', 'Food', 'Takeaway lunch', 'Pickup place', 'Pickup map', 'Booking ID', 'Receipt No'];
  var cols = ['Tour', 'Full name', 'Country', 'Gender', 'Food', 'Takeaway lunch', 'Pickup place', 'Pickup map', 'Booking ID', 'Receipt No'];
  sh.getRange(15, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8f0ea');
  var arr = '{' + cols.map(function (c) { return T(c); }).join(',') + '}';
  var cond = '(' + T('Tour date') + '>=$B$2)*(' + T('Tour date') + '<$B$2+1)*(' + T('Status') + '<>"Cancelled")*(' + T('Booking ID') + '<>"")';
  sh.getRange('A16').setFormula('=IFERROR(SORT(FILTER(' + arr + ',' + cond + '),1,TRUE,2,TRUE),"No travellers on this date")');
  sh.setColumnWidth(1, 250); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 120); sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 110); sh.setColumnWidth(6, 200); sh.setColumnWidth(7, 210); sh.setColumnWidth(8, 260);
  sh.setColumnWidth(9, 140); sh.setColumnWidth(10, 100);
  sh.setFrozenRows(15);
}

/* ---------- editable website text (Content tab) and prices (Settings tab) ---------- */

// Content columns: A key, B where on the site, C..J the 8 languages (C = English, the one staff edit), K status, L hash.
var CONTENT_LANGS = ['en', 'lo', 'th', 'zh', 'ko', 'ja', 'fr', 'de'];
var CONTENT_NAMES = ['English (edit this)', 'Lao', 'Thai', 'Chinese', 'Korean', 'Japanese', 'French', 'German'];
var TRANSLATE_CODES = { lo: 'lo', th: 'th', zh: 'zh-CN', ko: 'ko', ja: 'ja', fr: 'fr', de: 'de' };
var CONTENT_WIDTH = 12;

// Builds or updates the Content tab from CONTENT_SEED (ContentSeed.gs). The "Content base" tab remembers the text the
// site ships with: a cell that differs from it is an edit and is served to the website; cells staff have not touched
// follow the shipped text, so updates to the site's built-in text still reach them.
function setupContent_(ss) {
  var sh = ss.getSheetByName(TABS.content) || ss.insertSheet(TABS.content);
  var base = ss.getSheetByName(TABS.contentBase) || ss.insertSheet(TABS.contentBase);
  var head = ['Key', 'Where on the site'].concat(CONTENT_NAMES).concat(['Status', 'Translated from (do not edit)']);
  var oldCur = {}, oldBase = {}, order = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CONTENT_WIDTH).getValues().forEach(function (r) { oldCur[r[0]] = r; order.push(r[0]); });
  if (base.getLastRow() > 1) base.getRange(2, 1, base.getLastRow() - 1, CONTENT_WIDTH).getValues().forEach(function (r) { oldBase[r[0]] = r; });
  var seed = {};
  CONTENT_SEED.forEach(function (r) { seed[r[0]] = r; });
  CONTENT_SEED.forEach(function (r) { if (order.indexOf(r[0]) === -1) order.push(r[0]); });
  var rows = [], baseRows = [];
  order.forEach(function (key) {
    var sd = seed[key]; if (!sd) return;   // text that no longer exists on the site
    var cur = oldCur[key], ob = oldBase[key], row = [key, sd[1]];
    for (var i = 0; i < 8; i++) {
      var shipped = sd[2 + i], was = ob ? String(ob[2 + i]) : null, now = cur ? String(cur[2 + i]) : null;
      row.push(cur && was !== null && now !== was ? now : shipped);   // keep a staff edit, otherwise follow the shipped text
    }
    row.push(cur ? cur[10] : '', cur ? cur[11] : '');
    rows.push(row);
    baseRows.push(sd.slice(0, 10).concat(['', '']));
  });
  sh.clear(); base.clear();
  sh.getRange(1, 1, 1, CONTENT_WIDTH).setValues([head]).setFontWeight('bold').setBackground('#e8f0ea');
  base.getRange(1, 1, 1, CONTENT_WIDTH).setValues([head]);
  sh.getRange(2, 1, rows.length, CONTENT_WIDTH).setValues(rows);
  base.getRange(2, 1, baseRows.length, CONTENT_WIDTH).setValues(baseRows);
  sh.getRange(2, 1, rows.length, CONTENT_WIDTH).setVerticalAlignment('top').setWrap(true);
  sh.getRange(2, 1, rows.length, 2).setBackground('#f3f3f3').setFontColor('#666666');
  sh.getRange(2, 11, rows.length, 1).setFontColor('#666666');
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 150); sh.setColumnWidth(3, 380);
  for (var c = 4; c <= 10; c++) sh.setColumnWidth(c, 260);
  sh.setColumnWidth(11, 170);
  sh.hideColumns(1); sh.hideColumns(CONTENT_WIDTH);
  sh.setFrozenRows(1); sh.setFrozenColumns(2);
  if (sh.getFilter()) sh.getFilter().remove();
  sh.getRange(1, 1, rows.length + 1, CONTENT_WIDTH).createFilter();
  base.hideSheet();
}

// Translates English edits that are not yet translated (at most maxRows per call) and resets rows whose English was put
// back to the shipped text. Returns how many edited rows still wait for their translation.
function refreshContent_(maxRows) {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TABS.content), base = ss.getSheetByName(TABS.contentBase);
  if (!sh || !base || sh.getLastRow() < 2) return 0;
  var data = sh.getRange(2, 1, sh.getLastRow() - 1, CONTENT_WIDTH).getValues(), baseMap = {};
  base.getRange(2, 1, base.getLastRow() - 1, CONTENT_WIDTH).getValues().forEach(function (r) { baseMap[r[0]] = r; });
  var done = 0, waiting = 0;
  data.forEach(function (row, i) {
    var b = baseMap[row[0]]; if (!b) return;
    var en = String(row[2]), edited = en.trim() !== '' && en !== String(b[2]);
    if (edited && row[11] !== hash_(en)) {
      if (done >= maxRows) { waiting++; sh.getRange(i + 2, 11).setValue('Waiting to translate'); return; }
      var out = [], ok = true;
      CONTENT_LANGS.slice(1).forEach(function (lang) {
        try { out.push(translate_(en, lang)); } catch (err) { console.error('translate ' + lang + ': ' + err); ok = false; out.push(row[3 + CONTENT_LANGS.indexOf(lang) - 1]); }
      });
      sh.getRange(i + 2, 4, 1, 9).setValues([out.concat([ok ? 'Translated automatically' : 'Translation failed, will retry', ok ? hash_(en) : ''])]);
      done++;
    } else if (!edited && row[11]) {   // English is back to the original: so are the other languages
      sh.getRange(i + 2, 4, 1, 9).setValues([b.slice(3, 10).concat(['', ''])]);
    }
  });
  return waiting;
}

// Google Translate keeps {placeholders} and HTML tags; if a placeholder is lost the English text is used for that language.
function translate_(text, lang) {
  var wrapped = text.replace(/\{(\w+)\}/g, '<span class="notranslate" translate="no">{$1}</span>');
  var out = LanguageApp.translate(wrapped, 'en', TRANSLATE_CODES[lang], { contentType: 'html' });
  out = out.replace(/<span[^>]*>(\{\w+\})<\/span>/g, '$1').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  var tokens = text.match(/\{\w+\}/g) || [];
  return tokens.every(function (tk) { return out.indexOf(tk) !== -1; }) ? out : text;
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// What the website needs: the cells staff changed (per language) plus prices. Cached; shorter while translations are pending.
function configJson_(holdsLock) {
  var cache = CacheService.getScriptCache(), hit = cache.get('config');
  if (hit) return hit;
  var ss = SpreadsheetApp.getActive(), waiting = 0, lock = LockService.getScriptLock();
  if (holdsLock) waiting = refreshContent_(3);   // the caller (doPost) already holds the script lock
  else if (lock.tryLock(5000)) { try { waiting = refreshContent_(3); } finally { lock.releaseLock(); } }
  var out = { content: {}, prices: {}, kip: kipPrices_(ss), menu: lunchMenuJson_(ss) };
  var sh = ss.getSheetByName(TABS.content), base = ss.getSheetByName(TABS.contentBase);
  if (sh && base && sh.getLastRow() > 1) {
    var baseMap = {};
    base.getRange(2, 1, base.getLastRow() - 1, CONTENT_WIDTH).getValues().forEach(function (r) { baseMap[r[0]] = r; });
    sh.getRange(2, 1, sh.getLastRow() - 1, CONTENT_WIDTH).getValues().forEach(function (row) {
      var b = baseMap[row[0]]; if (!b) return;
      CONTENT_LANGS.forEach(function (lang, i) {
        var v = String(row[2 + i]);
        if (v.trim() !== '' && v !== String(b[2 + i])) { (out.content[lang] = out.content[lang] || {})[row[0]] = v; }
      });
    });
  }
  ss.getSheetByName(TABS.settings).getRange('A2:C20').getValues().forEach(function (r) {
    if (String(r[0]).trim() && Number(r[2]) > 0) out.prices[String(r[0]).trim()] = Number(r[2]);
  });
  var json = JSON.stringify(out);
  if (json.length < 90000) cache.put('config', json, waiting ? 60 : 300);
  return json;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Website').addItem('Update the website now', 'updateWebsiteNow').addToUi();
}

function updateWebsiteNow() {
  var cache = CacheService.getScriptCache();
  cache.remove('config'); cache.remove('reviews');
  var waiting = refreshContent_(25);
  cache.remove('config');
  SpreadsheetApp.getActive().toast(waiting ? waiting + ' edited rows are still being translated; run this again in a minute.' :
    'Done. The website shows your changes within a minute.', 'Website', 8);
}

function setupHelp_(ss) {
  var sh = ss.getSheetByName(TABS.help) || ss.insertSheet(TABS.help, 1);   // rewritten on every setup: staff do not edit it
  sh.clear();
  var lines = [
    ['How to edit the website'],
    [''],
    ['TEXT  (tab "Content")'],
    ['1. Find the sentence (use the filter on "Where on the site", or Ctrl/Cmd+F).'],
    ['2. Change the English cell. Do not change the Key column.'],
    ['3. The other 7 languages are translated automatically (the Status column says "Translated automatically").'],
    ['4. To fix a translation by hand, type over that language cell. It is kept until you change the English again.'],
    ['5. To undo a change, put the original English back (or clear the cell): the site goes back to the original text.'],
    ['6. Menu "Website" > "Update the website now" makes it show straight away. Otherwise it shows within about 5 minutes.'],
    ['Words like {p102} or {kip1} are prices taken from the Settings tab. Leave them in place.'],
    [''],
    ['PRICES  (tab "Settings")'],
    ['Change the tour prices (USD) and the transfer prices (kip). Prices in the text, the cards and the WhatsApp message follow.'],
    [''],
    ['REVIEWS  (tab "Reviews")'],
    ['Tick Show for the reviews that should appear on the website (newest Date first, up to 8). Paste new Google reviews as new rows.'],
    [''],
    ['LUNCH MENU  (tab "Lunch menu")'],
    ['Dishes guests can order as takeaway lunch when they book. Tick Show, add dishes as new rows, change prices. Paid separately.'],
    [''],
    ['PHOTOS'],
    ['Photos are not in the sheet. Send the new photo to Jeevesh, or upload it on GitHub (images folder) with the same file name.'],
    [''],
    ['BOOKINGS  (tabs "Bookings", "Travellers", "Inquiries", "Dashboard")'],
    ['Set Status, Receipt No and Amount paid in "Bookings". The Dashboard updates by itself.']
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 760);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  ['A3', 'A12', 'A15', 'A18', 'A21', 'A24'].forEach(function (a) { sh.getRange(a).setFontWeight('bold').setFontColor('#2f6b4f'); });
}

// Seeded once with the reviews the site showed before; after that the tab is staff-owned and never overwritten.
var SEED_REVIEWS = [
  [true, '2026-10-08', 'Callum Kemp', 'Had an amazing time on this trip, it was well organised and all the staff were very friendly. The views at the top were incredible. Just be wary, the hike…'],
  [true, '', 'Tim', 'It was perfectly organized, I felt safe all the time and the views were stunning. Besides the regular touring he helped me with the bus transfer, offered a place to take a shower after the tour…'],
  [true, '', 'Lucie Desmoulin', 'We had the best time during our 2 days tour with Pat and his team! … a wonderful hike in the jungle leading to the best viewpoint we had in Laos!'],
  [true, '', 'Felix Dagnaud', 'But hang on tight for the climb it’s tough! Still, no pain, no view… and trust us, the view is totally worth it!'],
  [true, '', 'Owen Knight', 'We had a really tasty dinner (they catered for Vegetarians too) … We got picked up and dropped off from the town before and after the hikes and had a guide for the hike up and down too.'],
  [true, '', 'Jack Paddick', 'It was a little bit more money than some other tours but the extra cost in price is completely worth it! It is incredible value for money!!'],
  [true, '', 'Marie Cerisel', 'This experience was even better than we expected! … The guides cooked delicious meals, and the whole experience felt so authentic.']
];

function setupReviews_(ss) {
  var sh = ss.getSheetByName(TABS.reviews);
  if (sh) return;
  sh = ss.insertSheet(TABS.reviews);
  sh.getRange(1, 1, 1, REVIEW_COLS.length).setValues([REVIEW_COLS]).setFontWeight('bold').setBackground('#e8f0ea');
  sh.getRange(2, 1, SEED_REVIEWS.length, REVIEW_COLS.length).setValues(SEED_REVIEWS.map(function (r) {
    return [r[0], r[1] ? parseDate_(r[1]) : '', r[2], r[3]]; }));
  sh.getRange('A2:A100').insertCheckboxes();
  sh.getRange('B2:B100').setNumberFormat('dd/mm/yyyy');
  sh.getRange('D:D').setWrap(true);
  sh.setColumnWidth(1, 60); sh.setColumnWidth(2, 100); sh.setColumnWidth(3, 160); sh.setColumnWidth(4, 640);
  sh.setFrozenRows(1);
  sh.getRange('F1').setValue('Tick Show to put a review on the website (newest Date first, up to ' + REVIEWS_SHOWN +
    '). Paste new Google reviews as new rows. The site updates within 5 minutes.').setWrap(true);
  sh.setColumnWidth(6, 260);
}

// Public list for the website: only ticked reviews, cached for 5 minutes.
function reviewsJson_() {
  var cache = CacheService.getScriptCache(), hit = cache.get('reviews');
  if (hit) return hit;
  var sh = SpreadsheetApp.getActive().getSheetByName(TABS.reviews), list = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, REVIEW_COLS.length).getValues().forEach(function (r, i) {
      if (r[0] === true && String(r[3]).trim()) {
        list.push({ name: String(r[2]).trim(), text: String(r[3]).trim(), when: r[1] instanceof Date ? r[1].getTime() : 0, row: i });
      }
    });
  }
  list.sort(function (a, b) { return (b.when - a.when) || (a.row - b.row); });
  var json = JSON.stringify(list.slice(0, REVIEWS_SHOWN).map(function (r) { return { name: r.name, text: r.text }; }));
  cache.put('reviews', json, 300);
  return json;
}

function setupDashboard_(ss) {
  var sh = sheet_(ss, TABS.dashboard);
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
  sh.clear();

  var B = function (c) { return colLetter_(BOOKING_COLS.indexOf(c) + 1); };
  var T = function (c) { return colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var I = function (c) { return colLetter_(INQUIRY_COLS.indexOf(c) + 1); };
  var bRange = 'Bookings!A2:' + colLetter_(BOOKING_COLS.length);
  var notCancelled = B('Status') + " <> 'Cancelled'";

  sh.getRange('A1').setValue('Nong Khiaw Eco-Trail: bookings dashboard').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Updates live from the website. Staff fill in Status and Amount paid on the Bookings tab. ' +
    'Cancelled bookings are left out of tours, travellers, months and countries.').setFontColor('#5a665f');

  var kpis = [
    ['Booking requests', '=COUNTA(Bookings!A2:A)'],
    ['Confirmed or paid', '=COUNTIF(Bookings!' + B('Status') + '2:' + B('Status') + ',"Confirmed")+COUNTIF(Bookings!' +
      B('Status') + '2:' + B('Status') + ',"Paid")'],
    ['Travellers', '=SUMIFS(Bookings!' + B('People') + '2:' + B('People') + ',Bookings!' + B('Status') + '2:' + B('Status') +
      ',"<>Cancelled",Bookings!A2:A,"<>")'],
    ['Revenue received (USD)', '=SUM(Bookings!' + B('Amount paid USD') + '2:' + B('Amount paid USD') + ')'],
    ['Expected, confirmed not paid (USD)', '=SUMIFS(Bookings!' + B('Est. tour USD') + '2:' + B('Est. tour USD') + ',Bookings!' +
      B('Status') + '2:' + B('Status') + ',"Confirmed")'],
    ['Inquiries', '=COUNTA(Inquiries!A2:A)']
  ];
  kpis.forEach(function (k, i) {
    sh.getRange(4, 1 + i).setValue(k[0]).setFontColor('#5a665f').setWrap(true);
    sh.getRange(5, 1 + i).setFormula(k[1]).setFontSize(20).setFontWeight('bold');
  });

  // Each table: static header row 9, QUERY output from row 10 (labels blanked so QUERY adds no header).
  var tables = [
    { col: 'A', head: ['Month (tour date)', 'Bookings', 'Travellers', 'Est. tour USD', 'Paid USD'],
      q: '=IFERROR(QUERY(' + bRange + ',"select ' + B('Tour month') + ', count(A), sum(' + B('People') + '), sum(' +
        B('Est. tour USD') + ') where A is not null and ' + B('Tour month') + ' is not null and ' + notCancelled + ' group by ' + B('Tour month') + ' order by ' +
        B('Tour month') + ' label count(A) \'\', sum(' + B('People') + ') \'\', sum(' + B('Est. tour USD') + ') \'\'",0),"")',
      paid: { col: 'E', key: 'Tour month', from: 'A' } },
    { col: 'G', head: ['Tour', 'Bookings', 'Travellers', 'Paid USD'],
      q: '=IFERROR(QUERY(' + bRange + ',"select ' + B('Tour name') + ', count(A), sum(' + B('People') + ') where A is not null and ' +
        notCancelled + ' group by ' + B('Tour name') + ' order by sum(' + B('People') + ') desc label count(A) \'\', sum(' +
        B('People') + ') \'\'",0),"")',
      paid: { col: 'J', key: 'Tour name', from: 'G' } },
    { col: 'L', head: ['Country', 'Travellers'],
      q: '=IFERROR(QUERY(Travellers!A2:' + colLetter_(TRAVELLER_COLS.length) + ',"select ' + T('Country') + ', count(A) where A is not null and ' + T('Country') + ' is not null and ' + T('Status') +
        " <> 'Cancelled' group by " + T('Country') + ' order by count(A) desc label count(A) \'\'",0),"")' },
    { col: 'O', head: ['Booking source', 'Bookings'],
      q: '=IFERROR(QUERY(' + bRange + ',"select ' + B('Source') + ', count(A) where A is not null group by ' + B('Source') +
        ' order by count(A) desc label count(A) \'\'",0),"")' },
    { col: 'R', head: ['Status', 'Bookings'],
      q: '=IFERROR(QUERY(' + bRange + ',"select ' + B('Status') + ', count(A) where A is not null group by ' + B('Status') +
        ' order by count(A) desc label count(A) \'\'",0),"")' },
    // "Booked" is filled beside this by a COUNTIFS (W10), since Status is text
    { col: 'U', head: ['Inquiry month', 'Inquiries', 'Booked'],
      q: '=IFERROR(QUERY(Inquiries!A2:K,"select ' + I('Month') + ', count(A) where A is not null group by ' +
        I('Month') + ' order by ' + I('Month') + ' label count(A) \'\'",0),"")' }
  ];

  tables.forEach(function (t) {
    var c = sh.getRange(t.col + '9').getColumn();
    sh.getRange(9, c, 1, t.head.length).setValues([t.head]).setFontWeight('bold').setBackground('#e8f0ea');
    sh.getRange(10, c).setFormula(t.q);
    // QUERY cannot sum a column that is still empty, so "Paid USD" is a SUMIFS beside the grouped rows
    if (t.paid) {
      var k = B(t.paid.key), paid = B('Amount paid USD'), st = B('Status');
      sh.getRange(t.paid.col + '10').setFormula('=ARRAYFORMULA(IF(' + t.paid.from + '10:' + t.paid.from + '="",,SUMIFS(Bookings!' +
        paid + '2:' + paid + ',Bookings!' + k + '2:' + k + ',' + t.paid.from + '10:' + t.paid.from + ',Bookings!' + st + '2:' + st +
        ',"<>Cancelled")))');
    }
  });
  sh.getRange('W10').setFormula('=ARRAYFORMULA(IF(U10:U="",,COUNTIFS(Inquiries!' + I('Month') + '2:' + I('Month') +
    ',U10:U,Inquiries!' + I('Status') + '2:' + I('Status') + ',"Booked")))');

  var chart = function (range, type, title, row, col, stacked) {
    var b = sh.newChart().setChartType(type).addRange(sh.getRange(range)).setNumHeaders(1)
      .setOption('title', title).setOption('legend', { position: 'bottom' })
      .setPosition(row, col, 0, 0).setOption('width', 520).setOption('height', 300);
    if (stacked) b.setOption('isStacked', true);
    sh.insertChart(b.build());
  };
  chart('A9:C60', Charts.ChartType.COLUMN, 'Bookings and travellers per month', 32, 1);
  chart('G9:H20', Charts.ChartType.BAR, 'Best-selling tours (bookings)', 32, 7);
  chart('L9:M40', Charts.ChartType.PIE, 'Travellers by country', 49, 1);
  chart('O9:P20', Charts.ChartType.PIE, 'Booking sources', 49, 7);
  chart('U9:V60', Charts.ChartType.COLUMN, 'Inquiries per month', 66, 1);

  sh.setFrozenRows(5);
  sh.setColumnWidths(1, 23, 110);
}

/* ---------- web endpoint ---------- */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.website) return reply_('ok');  // honeypot field: only bots fill it
    var ss = SpreadsheetApp.getActive();
    if (ss.getSpreadsheetTimeZone() !== TIME_ZONE) ss.setSpreadsheetTimeZone(TIME_ZONE);
    if (d.type === 'booking') saveBooking_(ss, d);
    else if (d.type === 'inquiry') saveInquiry_(ss, d);
    else if (d.type === 'selftest') return reply_(selfTest_(ss));
    else if (d.type === 'rebuild') { setup(); return reply_('rebuilt'); }  // idempotent; never touches data rows
    else return reply_('unknown type');
    return reply_('ok');
  } catch (err) {
    console.error('doPost failed: ' + err + '\n' + (e && e.postData ? e.postData.contents : ''));
    throw err;  // shows as a failed run under Apps Script > Executions
  } finally {
    lock.releaseLock();
  }
}

// The owner opening <web app URL>?setup=1 grants access once and builds the tabs; anyone else just sees a status line.
function doGet(e) {
  var owner = Session.getEffectiveUser().getEmail();
  if (e && e.parameter.setup === '1' && owner && Session.getActiveUser().getEmail() === owner) {
    setup();
    return reply_('Setup done. Open the sheet to see the Dashboard.');
  }
  if (e && e.parameter.config === '1') {
    return ContentService.createTextOutput(configJson_()).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter.reviews === '1') {
    return ContentService.createTextOutput(reviewsJson_()).setMimeType(ContentService.MimeType.JSON);
  }
  return reply_('Nong Khiaw Eco-Trail booking endpoint is running.');
}

function saveBooking_(ss, d) {
  var people = (Array.isArray(d.travellers) ? d.travellers : []).slice(0, 30);
  if (!people.length) throw new Error('booking without travellers');
  var tour = clean_(d.tour, 5);
  var info = tourInfo_(ss, tour);
  var date = parseDate_(d.date);
  var transfer = clean_(d.transfer, 40) || 'No';
  var legs = /round/i.test(transfer) ? 2 : (/one way/i.test(transfer) ? 1 : 0);
  var countries = people.map(function (p) { return country_(p.nat); });
  // First and last name come separately; an older cached page may still send one full name.
  var names = people.map(function (p) {
    var first = clean_(p.first, 60), last = clean_(p.last, 60);
    return { first: first, last: last, full: first || last ? (first + ' ' + last).trim() : clean_(p.name, 80) };
  });
  // Per traveller: the group's pickup place (default), their own place, or no transfer. Nobody has one without a transfer.
  var pickup = people.map(function (p, i) {
    var mode = legs === 0 ? 'none' : (i > 0 && (p.pickup === 'other' || p.pickup === 'none') ? p.pickup : 'same');
    if (mode === 'other' && !clean_(p.pkPlace, 120)) mode = 'same';
    return { mode: mode,
      place: mode === 'none' ? (legs === 0 ? '' : 'No transfer') : mode === 'other' ? clean_(p.pkPlace, 120) : clean_(d.hotel, 120),
      map: mode === 'none' ? '' : mode === 'other' ? clean_(p.pkMap, 300) : clean_(d.map, 300) };
  });
  var riders = pickup.filter(function (x) { return x.mode !== 'none'; }).length;   // people who take the transfer
  var train = legs === 2 && d.train === true;
  var menu = lunchMap_(ss);
  var lunch = people.map(function (p) {   // priced here from the Lunch menu tab: the page's numbers are never trusted
    var dish = clean_(p.lunch, 80), item = menu[dish];
    if (!dish || !item) return { text: '', kip: 0 };
    var choice = clean_(p.lunchChoice, 40);
    return { text: dish + (item.choices.indexOf(choice) !== -1 ? ' (' + choice + ')' : ''), kip: item.price };
  });
  var lunchCount = {};
  lunch.forEach(function (x) { if (x.text) lunchCount[x.text] = (lunchCount[x.text] || 0) + 1; });
  var lunchText = Object.keys(lunchCount).map(function (k) { return k + ' ' + lunchCount[k]; }).join('; ');
  var lunchKip = lunch.reduce(function (a, x) { return a + x.kip; }, 0);
  var food = {};  // everyone's choice with counts, e.g. "Regular 1, Vegan 1"
  people.forEach(function (p) { var f = clean_(p.food, 20) || 'Regular'; food[f] = (food[f] || 0) + 1; });
  var foodText = Object.keys(food).map(function (f) { return f + ' ' + food[f]; }).join(', ');
  var id = clean_(d.id, 20) || ('NK' + Utilities.formatDate(new Date(), TIME_ZONE, 'yyMMddHHmmss'));

  addRow_(ss, TABS.bookings, BOOKING_COLS, {
    'Booking ID': id, 'Submitted at': new Date(), 'Tour date': date,
    'Tour month': date ? text_(Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM')) : '', 'Tour': text_(tour), 'Tour name': info.name,
    'People': people.length, 'Lead name': names[0].full, 'Traveller names': names.map(function (n) { return n.full; }).join(', '),
    'Countries': unique_(countries).join(', '), 'Food': foodText, 'Transfer': transfer,
    'Pickup date': legs ? parseDate_(d.pickupDate) : '', 'Return date': legs === 2 ? parseDate_(d.returnDate) : '',
    'Train station drop-off': train ? 'Yes' : '',
    'Accommodation': legs ? clean_(d.hotel, 120) : '', 'Maps link': legs ? clean_(d.map, 300) : '',
    'Pickups': legs ? pickupSummary_(pickup) : '', 'Takeaway lunch': lunchText, 'Lunch kip': lunchKip || '',
    'Payment method': clean_(d.payment, 40), 'Source': clean_(d.source, 40) || 'Not given', 'Referrer': clean_(d.referrer, 120),
    'Site language': clean_(d.lang, 5), 'Note': clean_(d.note, 1000), 'Est. tour USD': info.price * people.length,
    'Est. transfer kip': ((legs === 2 ? kipPrices_(ss).round : legs === 1 ? kipPrices_(ss).one : 0) + (train ? kipPrices_(ss).train : 0)) * riders, 'Status': 'Requested'
  });
  people.forEach(function (p, i) {
    addRow_(ss, TABS.travellers, TRAVELLER_COLS, {
      'Booking ID': id, 'Tour date': date, 'Tour': text_(tour), 'Traveller #': i + 1, 'First name': names[i].first,
      'Last name': names[i].last, 'Full name': names[i].full, 'Country': countries[i], 'Gender': clean_(p.gender, 10),
      'Passport no': text_(clean_(p.pass, 40).toUpperCase()),
      'Passport issued': parseDate_(p.issued) || text_(clean_(p.issued, 10)),
      'Passport expires': parseDate_(p.expires) || text_(clean_(p.expires, 10)), 'Food': clean_(p.food, 20),
      'Pickup place': pickup[i].place, 'Pickup map': pickup[i].map, 'Takeaway lunch': lunch[i].text, 'Lunch kip': lunch[i].kip || ''
    });
  });
}

// "Sunset Hostel: 1, 3; Villa Maly: 2; No transfer: 4" (traveller numbers per pickup place)
function pickupSummary_(pickup) {
  var stops = [], at = {};
  pickup.forEach(function (x, i) {
    var key = x.place + '\u0001' + x.map;
    if (at[key] === undefined) { at[key] = stops.length; stops.push({ place: x.place, nums: [] }); }
    stops[at[key]].nums.push(i + 1);
  });
  return stops.map(function (st) { return st.place + ': ' + st.nums.join(', '); }).join('; ');
}

// Writes one sample booking and inquiry, reads them back, then deletes them. Returns what was written.
function selfTest_(ss) {
  var id = 'SELFTEST-' + new Date().getTime().toString(36);  // must fit the 20-char ID limit
  saveBooking_(ss, { id: id, tour: '101', date: '2030-01-15', transfer: 'Round trip', pickupDate: '2030-01-15', returnDate: '2030-01-18',
    train: true, hotel: 'Test hostel', map: 'https://maps.app.goo.gl/test', source: 'Other', payment: 'BCEL QR',
    travellers: [{ first: 'Test', last: 'Person', gender: 'X', nat: 'deutsch', food: 'Vegetarian', pass: 'ab123',
      issued: '2020-01-01', expires: '2030-01-01', pickup: 'same' },
      { first: 'Second', last: 'Person', gender: 'X', nat: 'german', food: 'Regular', pass: 'cd456', issued: '2020-01-01',
        expires: '2030-01-01', pickup: 'none', lunch: 'Avocado sandwich' }] });
  saveInquiry_(ss, { name: id, contact: 'test', question: 'test' });
  SpreadsheetApp.flush();
  var dash = ss.getSheetByName(TABS.dashboard);
  // Public endpoint: report only pass/fail, never the business's figures.
  var kpis = dash.getRange('A5:F5').getDisplayValues()[0], tables = dash.getRange('A10:W10').getDisplayValues()[0];
  var out = { dashboardOk: Number(kpis[0]) >= 1 && Number(kpis[5]) >= 1 && ['A', 'G', 'L', 'O', 'R', 'U'].every(function (c) {
    return tables[dash.getRange(c + '1').getColumn() - 1] !== ''; }) };
  var header = function (name) { var sh = ss.getSheetByName(name); return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].join('|'); };
  out.headersOk = header(TABS.bookings) === BOOKING_COLS.join('|') && header(TABS.travellers) === TRAVELLER_COLS.join('|');
  if (!out.headersOk) {   // column names are public (they are in the repo): name the first one that differs
    [[TABS.bookings, BOOKING_COLS], [TABS.travellers, TRAVELLER_COLS]].forEach(function (x) {
      var have = header(x[0]).split('|');
      for (var i = 0; i < Math.max(have.length, x[1].length); i++) if (have[i] !== x[1][i]) { out.headerIssue = x[0] + ' column ' + (i + 1) + ': found "' + have[i] + '", expected "' + x[1][i] + '"; headers: ' + have.join(' | '); return; }
    });
  }
  var b = ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[0] || [];
  var t = ss.getSheetByName(TABS.travellers).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[0] || [];
  out.datesOk = b[BOOKING_COLS.indexOf('Pickup date')] === '15/01/2030' && b[BOOKING_COLS.indexOf('Return date')] === '18/01/2030';
  out.namesOk = t[TRAVELLER_COLS.indexOf('First name')] === 'Test' && t[TRAVELLER_COLS.indexOf('Last name')] === 'Person' &&
    b[BOOKING_COLS.indexOf('Lead name')] === 'Test Person';
  out.fieldsOk = b[BOOKING_COLS.indexOf('Food')] === 'Vegetarian 1, Regular 1' && b[BOOKING_COLS.indexOf('Payment method')] === 'BCEL QR' &&
    t[TRAVELLER_COLS.indexOf('Passport no')] === 'AB123' && t[TRAVELLER_COLS.indexOf('Passport issued')] === '01/01/2020' &&
    t[TRAVELLER_COLS.indexOf('Passport expires')] === '01/01/2030' && t[TRAVELLER_COLS.indexOf('Food')] === 'Vegetarian';
  out.transferOk = b[BOOKING_COLS.indexOf('Train station drop-off')] === 'Yes' &&
    b[BOOKING_COLS.indexOf('Pickups')] === 'Test hostel: 1; No transfer: 2' &&
    b[BOOKING_COLS.indexOf('Est. transfer kip')] === '570,000' && t[TRAVELLER_COLS.indexOf('Pickup place')] === 'Test hostel';
  var t2 = ss.getSheetByName(TABS.travellers).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[1] || [];
  out.lunchOk = b[BOOKING_COLS.indexOf('Takeaway lunch')] === 'Avocado sandwich 1' && b[BOOKING_COLS.indexOf('Lunch kip')] === '65,000' &&
    t2[TRAVELLER_COLS.indexOf('Takeaway lunch')] === 'Avocado sandwich' && t2[TRAVELLER_COLS.indexOf('Lunch kip')] === '65,000';
  out.tripOk = tripSelfTest_(ss);
  out.reviewsOk = JSON.parse(reviewsJson_()).length > 0;
  out.contentOk = contentSelfTest_(ss);
  var testIds = {};  // booking IDs of test bookings (a site test has an NK... ID and SELFTEST- as lead name)
  [TABS.bookings, TABS.travellers, TABS.inquiries].forEach(function (name) {
    var sh = ss.getSheetByName(name), values = sh.getDataRange().getDisplayValues();
    for (var r = values.length - 1; r >= 1; r--) {
      var row = values[r].join('|');
      if (row.indexOf(id) !== -1) out[name] = true;
      var isTest = row.indexOf('SELFTEST-') !== -1 || (name === TABS.travellers && testIds[values[r][0]]);
      if (name === TABS.bookings && isTest) testIds[values[r][0]] = true;
      if (isTest) sh.deleteRow(r + 1);  // also clears leftovers of earlier runs
    }
  });
  out.tabsOk = ss.getSheets().length >= 6;
  out.frozenOk = [TABS.bookings, TABS.travellers, TABS.inquiries].every(function (n) { return ss.getSheetByName(n).getFrozenRows() === 1; });
  return JSON.stringify(out);
}

// Points the trip sheet at the sample booking's date, checks the list and the totals, then puts the date back.
function tripSelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.trip), cell = sh.getRange('B2'), saved = cell.getValue(), ok = false;
  try {
    cell.setValue(new Date(2030, 0, 15, 12)); SpreadsheetApp.flush();
    var rows = sh.getRange(16, 1, 4, 10).getDisplayValues();
    var people = Number(sh.getRange('B5').getValue()), riders = Number(sh.getRange('B6').getValue());
    ok = rows.some(function (r) { return r[1] === 'Test Person' && r[6] === 'Test hostel'; }) &&
      rows.some(function (r) { return r[1] === 'Second Person' && r[6] === 'No transfer' && r[5] === 'Avocado sandwich'; }) &&
      people >= 2 && riders >= 1 && Number(sh.getRange('B13').getValue()) >= 65000;
  } catch (err) { console.error('trip selftest: ' + err); }
  finally { cell.setValue(saved); }
  return ok;
}

// Edits two English cells, checks the translations arrive with their {placeholders}, then puts both rows back.
function contentSelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.content), cache = CacheService.getScriptCache(), keys = ['rev_src', 'tr_one'], saved = {}, ok = false;
  var rowOf = function (key) { var v = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(); for (var i = 0; i < v.length; i++) if (v[i][0] === key) return i + 2; return 0; };
  try {
    keys.forEach(function (k) { var r = rowOf(k); saved[k] = { r: r, vals: sh.getRange(r, 3, 1, 10).getValues()[0] }; });
    sh.getRange(saved.rev_src.r, 3).setValue('Selftest review');
    sh.getRange(saved.tr_one.r, 3).setValue('Selftest one way ({kip1} kip)');
    cache.remove('config');
    var cfg = JSON.parse(configJson_(true));
    var c = cfg.content;
    ok = !!(c.en && c.en.rev_src === 'Selftest review' && c.de && c.de.rev_src && c.de.rev_src !== 'Selftest review' &&
      c.de.tr_one && c.de.tr_one.indexOf('{kip1}') !== -1 && c.th && c.th.tr_one.indexOf('{kip1}') !== -1);
  } catch (err) {
    console.error('content selftest: ' + err);
  } finally {
    keys.forEach(function (k) { if (saved[k]) sh.getRange(saved[k].r, 3, 1, 10).setValues([saved[k].vals]); });
    cache.remove('config');
    var after = JSON.parse(configJson_(true)).content;
    ok = ok && !(after.en && (after.en.rev_src || after.en.tr_one));   // the test edits are gone again
  }
  return ok;
}

function saveInquiry_(ss, d) {
  var now = new Date();
  addRow_(ss, TABS.inquiries, INQUIRY_COLS, [
    now, text_(Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM')), clean_(d.name, 80), clean_(d.contact, 120),
    text_(clean_(d.tour, 20)), clean_(d.question, 2000), clean_(d.source, 40) || 'Not given', clean_(d.referrer, 120),
    clean_(d.lang, 5), 'New', ''
  ]);
}

/* ---------- helpers ---------- */

// Appends a row and sets its number formats (column formats from setup do not always carry to new rows).
function addRow_(ss, name, cols, values) {
  var sh = ss.getSheetByName(name), r = sh.getLastRow() + 1;
  if (!Array.isArray(values)) {  // an object keyed by column name; only columns before the lookup formulas are written
    var last = name === TABS.travellers ? cols.indexOf('Status') : cols.length;
    values = cols.slice(0, last).map(function (c) { return values[c] == null ? '' : values[c]; });
  }
  sh.getRange(r, 1, 1, values.length).setValues([values]);
  var f = FORMATS[name] || {};
  Object.keys(f).forEach(function (c) { sh.getRange(r, cols.indexOf(c) + 1).setNumberFormat(f[c]); });
}

// The Travellers lookup columns (Status, Receipt No) are formulas; a second copy left at the end by a column move is removed.
function dropDuplicateLookups_(sh, name, cols) {
  if (name !== TABS.travellers || sh.getLastRow() === 0) return;
  var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = have.length - 1; i >= cols.length; i--) {
    if ((have[i] === 'Status' || have[i] === 'Receipt No') && have.indexOf(have[i]) < i) sh.deleteColumn(i + 1);
  }
}

function renameColumns_(sh, renames) {
  if (sh.getLastRow() === 0) return;
  var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(renames).forEach(function (from) {
    var at = have.indexOf(from);
    if (at !== -1 && have.indexOf(renames[from]) === -1) sh.getRange(1, at + 1).setValue(renames[from]);
  });
}

// A column added to the code later is inserted at its place in the sheet, shifting old data with its header.
function addMissingColumns_(sh, cols) {
  if (sh.getLastRow() === 0) return;
  for (var i = 0; i < cols.length; i++) {
    var have = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
    if (have.indexOf(cols[i]) !== -1) continue;
    if (i >= have.length) { sh.getRange(1, have.length + 1).setValue(cols[i]); continue; }  // belongs at the end: just add it
    if (i === 0) sh.insertColumnBefore(1); else sh.insertColumnAfter(i);
    sh.getRange(1, i + 1).setValue(cols[i]);
  }
}

function sheet_(ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }

function reply_(msg) { return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT); }

// Trim, cap length, and stop typed text from being read as a formula.
function clean_(v, max) {
  var s = String(v == null ? '' : v).trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// Leading ' keeps codes like 001 and months like 2026-10 as text.
function text_(s) { return s && s.charAt(0) !== "'" ? "'" + s : s; }

function parseDate_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : '';  // noon, so no timezone shifts the day
}

function unique_(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }

function colLetter_(n) {
  var s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

function tourInfo_(ss, code) {
  var rows = ss.getSheetByName(TABS.settings).getRange('A2:C20').getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]) === code) return { name: rows[i][1], price: Number(rows[i][2]) || 0 };
  }
  return { name: code, price: 0 };
}

function kipPerWay_(ss) { return Number(ss.getSheetByName(TABS.settings).getRange('F2').getValue()) || TRANSFER_KIP; }

// Nationality is typed freely, in any of the site's 8 languages: map common spellings to one country name.
var COUNTRY_WORDS = {
  'Germany': ['german', 'germany', 'deutsch', 'deutschland', 'allemand', 'allemande', 'allemagne', 'เยอรมัน', 'เยอรมนี',
    'ドイツ', '德国', '德國', '독일', 'ເຢຍລະມັນ'],
  'France': ['french', 'france', 'français', 'francais', 'française', 'francaise', 'ฝรั่งเศส', 'フランス', '法国', '프랑스', 'ຝຣັ່ງ'],
  'United Kingdom': ['british', 'uk', 'u.k.', 'united kingdom', 'great britain', 'england', 'english', 'scottish', 'scotland',
    'welsh', 'wales', 'britannique', 'anglais', 'britisch', 'อังกฤษ', 'イギリス', '英国', '영국'],
  'United States': ['american', 'usa', 'us', 'u.s.', 'u.s.a.', 'united states', 'america', 'américain', 'americain',
    'amerikanisch', 'อเมริกัน', 'アメリカ', '美国', '미국'],
  'Netherlands': ['dutch', 'netherlands', 'holland', 'néerlandais', 'niederländisch', 'niederlande', 'オランダ', '荷兰', '네덜란드'],
  'Belgium': ['belgian', 'belgium', 'belge', 'belgique', 'belgisch', 'belgien'],
  'Switzerland': ['swiss', 'switzerland', 'suisse', 'schweizer', 'schweiz', 'スイス', '瑞士', '스위스'],
  'Austria': ['austrian', 'austria', 'autrichien', 'autriche', 'österreichisch', 'österreich', 'osterreich'],
  'Italy': ['italian', 'italy', 'italien', 'italienne', 'italie', 'italienisch', 'イタリア', '意大利', '이탈리아'],
  'Spain': ['spanish', 'spain', 'espagnol', 'espagnole', 'espagne', 'spanisch', 'spanien', 'スペイン', '西班牙', '스페인'],
  'Portugal': ['portuguese', 'portugal', 'portugais', 'portugiesisch'],
  'Ireland': ['irish', 'ireland', 'irlandais', 'irland'],
  'Sweden': ['swedish', 'sweden', 'suédois', 'schwedisch', 'schweden'],
  'Norway': ['norwegian', 'norway', 'norvégien', 'norwegisch', 'norwegen'],
  'Denmark': ['danish', 'denmark', 'danois', 'dänisch', 'dänemark'],
  'Finland': ['finnish', 'finland', 'finlandais', 'finnisch', 'finnland'],
  'Poland': ['polish', 'poland', 'polonais', 'polnisch', 'polen'],
  'Czechia': ['czech', 'czechia', 'czech republic', 'tchèque', 'tschechisch', 'tschechien'],
  'Israel': ['israeli', 'israel', 'israélien'],
  'Canada': ['canadian', 'canada', 'canadien', 'canadienne', 'kanadisch', 'kanada', 'カナダ', '加拿大', '캐나다'],
  'Australia': ['australian', 'australia', 'australien', 'australienne', 'australisch', 'オーストラリア', '澳大利亚', '호주'],
  'New Zealand': ['new zealander', 'kiwi', 'new zealand', 'néo-zélandais'],
  'Laos': ['lao', 'laos', 'laotian', 'laotien', 'ລາວ', 'ลาว', 'ラオス', '老挝', '라오스'],
  'Thailand': ['thai', 'thailand', 'thaïlandais', 'thailandais', 'thaïlande', 'thailändisch', 'ไทย', 'タイ', '泰国', '태국'],
  'Vietnam': ['vietnamese', 'vietnam', 'viet nam', 'vietnamien', 'ベトナム', '越南', '베트남', 'ຫວຽດນາມ', 'เวียดนาม'],
  'China': ['chinese', 'china', 'chinois', 'chinoise', 'chine', 'chinesisch', '中国', '中國', '中国人', '중국', 'ຈີນ', 'จีน', '中国の'],
  'Taiwan': ['taiwanese', 'taiwan', '台湾', '台灣', '대만'],
  'Hong Kong': ['hong kong', 'hongkong', 'hong konger', '香港'],
  'South Korea': ['korean', 'south korea', 'korea', 'coréen', 'coréenne', 'koreanisch', '한국', '대한민국', '韩国', '韓国', 'เกาหลี', 'ເກົາຫຼີ'],
  'Japan': ['japanese', 'japan', 'japonais', 'japonaise', 'japon', 'japanisch', '日本', '日本人', '일본', 'ญี่ปุ่น', 'ຍີ່ປຸ່ນ'],
  'India': ['indian', 'india', 'indien', 'indienne', 'indisch'],
  'Singapore': ['singaporean', 'singapore', 'singapour'],
  'Malaysia': ['malaysian', 'malaysia', 'malaisie'],
  'Philippines': ['filipino', 'filipina', 'philippines'],
  'Indonesia': ['indonesian', 'indonesia', 'indonésie'],
  'Russia': ['russian', 'russia', 'russe', 'russie', 'russisch', 'russland'],
  'Brazil': ['brazilian', 'brazil', 'brésilien', 'brésil', 'brasilien'],
  'Argentina': ['argentinian', 'argentine', 'argentina', 'argentinien'],
  'Mexico': ['mexican', 'mexico', 'mexicain', 'mexique', 'mexikanisch', 'mexiko'],
  'Chile': ['chilean', 'chile', 'chilien', 'chili'],
  'South Africa': ['south african', 'south africa', 'sud-africain', 'afrique du sud'],
  'Turkey': ['turkish', 'turkey', 'türkiye', 'turc', 'turquie', 'türkisch', 'türkei']
};
var COUNTRY_INDEX = (function () {
  var idx = {};
  Object.keys(COUNTRY_WORDS).forEach(function (c) { COUNTRY_WORDS[c].forEach(function (w) { idx[w] = c; }); });
  return idx;
})();

function country_(raw) {
  var s = clean_(raw, 60);
  var key = s.toLowerCase().replace(/\s+/g, ' ').replace(/^(the|from)\s+/, '');
  if (COUNTRY_INDEX[key]) return COUNTRY_INDEX[key];
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Not given';
}
