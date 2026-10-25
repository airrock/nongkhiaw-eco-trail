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
  dashboard: 'Dashboard', content: 'Content', contentBase: 'Content base', help: 'How to edit', trip: 'Trip sheet', lunch: 'Lunch menu',
  receipt: 'Receipt', receiptLog: 'Receipt log', receiptText: 'Receipt text', agreements: 'Agreements', allGuests: 'All guests', transport: 'Transport', guide: 'Guide report',
  agency: 'Agency share', newBooking: 'New booking', plans: 'Tour plans', lunchReport: 'Lunch report', arrange: 'Arrange tour',
  accounts: 'Tour accounts', collect: 'Collect on arrival' };

var BOOKING_COLS = ['Booking ID', 'Submitted at', 'Tour date', 'Tour month', 'Tour', 'Tour name', 'People', 'Lead name',
  'Traveller names', 'Countries', 'Food', 'Transfer', 'Pickup date', 'Return date', 'Train station drop-off', 'Accommodation',
  'Maps link', 'Pickups', 'Takeaway lunch', 'Lunch kip', 'Payment method', 'Source', 'Referrer', 'Site language', 'Note', 'Est. tour USD', 'Est. transfer kip', 'Status',
  'Receipt No', 'Amount paid USD', 'Staff notes',
  'WhatsApp no', 'Pickup in Nong Khiaw', 'Vehicle to Nong Khiaw', 'Vehicle to Luang Prabang', 'Transport remark', 'Viewpoint', 'Additional package',
  'Private tour'];
// Status and Receipt No are formulas (spilled from their header cell) that look the booking up: never written per row.
var TRAVELLER_COLS = ['Booking ID', 'Tour date', 'Tour', 'Traveller #', 'First name', 'Last name', 'Full name', 'Country',
  'Gender', 'Passport no', 'Passport issued', 'Passport expires', 'Food', 'Pickup place', 'Pickup map', 'Takeaway lunch', 'Lunch kip', 'Status', 'Receipt No',
  'Traveller status',   // typed: Cancelled / No-show for one traveller; Status (formula) shows it, else the booking's status
  'Traveller WhatsApp'];   // typed by staff: that guest's own number, shown in the minivan message of their pickup stop
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
    'Est. tour USD': '#,##0', 'Est. transfer kip': '#,##0', 'Lunch kip': '#,##0', 'Amount paid USD': '#,##0.00', 'WhatsApp no': '@' },
  Travellers: { 'Traveller WhatsApp': '@', 'Tour date': 'dd/mm/yyyy', 'Tour': '@', 'Lunch kip': '#,##0', 'Passport no': '@', 'Passport issued': 'dd/mm/yyyy', 'Passport expires': 'dd/mm/yyyy' },
  Inquiries: { 'Submitted at': 'dd/mm/yyyy hh:mm', 'Month': '@', 'Tour': '@' },
  Agreements: { 'Submitted at': 'dd/mm/yyyy hh:mm', 'Tour date': 'dd/mm/yyyy', 'Tour': '@', 'Receipt No': '@', 'Passport no': '@', 'Emergency phone': '@' }
};

var STATUSES = ['Requested', 'Confirmed', 'Paid', 'Cancelled', 'No-show'];
var TRAVELLER_STATUSES = ['Cancelled', 'No-show'];
var FOODS = ['Regular', 'Vegetarian', 'Vegan', 'Gluten-free', 'No pork', 'No fish', 'No beef', 'No seafood', 'Halal', 'No spicy'];   // typed text is fine too
var INQUIRY_STATUSES = ['New', 'Replied', 'Booked', 'Closed'];
var SOURCES = ['Google', 'Google Maps', 'Facebook', 'Instagram', 'TripAdvisor', 'Hostel / hotel', 'Friend', 'Walk-in', 'WhatsApp', 'Other'];
// Minivan transfer choices (website, New booking tab, Bookings dropdown). "Up" = Luang Prabang -> Nong Khiaw, "down" = back.
var TRANSFERS = ['No', 'One way to Nong Khiaw', 'One way to Luang Prabang', 'Round trip'];
function goesUp_(transfer) { return /round/i.test(transfer) || (/one way/i.test(transfer) && !/luang prabang/i.test(transfer)); }
function goesDown_(transfer) { return /round/i.test(transfer) || /to luang prabang/i.test(transfer); }
var TRANSPORT_ONLY = 'T00';
var NK_OFFICE = 'Office (The Trio Bar & Cafe)';   // Nong Khiaw pickup for the way back unless the guest asks for another place   // tour code of a booking without a tour (shuttle only)
var TOURS = [['101', 'Overnight camping above the clouds', 30], ['102', '2 days 1 night', 60],
  ['103', '3 days 2 nights', 90], ['001', '1-day boat trip', 30]];
var TRANSFER_KIP = 250000;   // one way per person (a legal minimum, 2026-10-18); round trip is twice that (Settings F2:F3, staff-editable)
var TIME_ZONE = 'Asia/Vientiane';

/* ---------- setup: safe to run again; it never deletes data rows ---------- */

function setup() {
  var ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  ss.setSpreadsheetLocale('en_GB');  // dates are typed and shown Day/Month/Year
  setupSettings_(ss);
  setupTable_(ss, TABS.bookings, BOOKING_COLS, { 'Status': STATUSES, 'Source': SOURCES, 'Transfer': TRANSFERS, 'Train station drop-off': ['Yes', 'No'] }, FORMATS.Bookings);
  greyCancelled_(ss);
  setupTable_(ss, TABS.travellers, TRAVELLER_COLS, { 'Takeaway lunch': lunchDishes_(ss), 'Traveller status': TRAVELLER_STATUSES, 'Food': FOODS }, FORMATS.Travellers);
  passportDatesToDates_(ss);
  setupTable_(ss, TABS.inquiries, INQUIRY_COLS, { 'Status': INQUIRY_STATUSES, 'Source': SOURCES }, FORMATS.Inquiries);
  setupReviews_(ss);
  setupContent_(ss);
  setupHelp_(ss);
  setupLunch_(ss);
  setupPlans_(ss);
  // A filter staff put on a formula tab stops its list formula from being written again: take it off, put it back at the end.
  var filters = [TABS.trip, TABS.allGuests, TABS.guide, TABS.dashboard, TABS.agency, TABS.lunchReport, TABS.collect].map(function (n) {
    var f = ss.getSheetByName(n) && ss.getSheetByName(n).getFilter();
    if (!f) return null;
    var at = { sheet: n, a1: f.getRange().getA1Notation() }; f.remove(); return at;
  }).filter(Boolean);
  setupTrip_(ss);
  setupReceipt_(ss);
  setupAgreements_(ss);
  setupAllGuests_(ss);
  setupTransport_(ss);
  setupGuide_(ss);
  setupAgency_(ss);
  setupNewBooking_(ss);
  setupLunchReport_(ss);
  setupCollect_(ss);
  setupArrange_(ss);
  sortBookings_(ss);

  // Travellers.Status follows the booking's status (so cancelled trips drop out of the reports), unless that one traveller
  // has a Traveller status typed (Cancelled / No-show for one person of a group).
  var trav = ss.getSheetByName(TABS.travellers);
  var ov = colLetter_(TRAVELLER_COLS.indexOf('Traveller status') + 1);
  ['Status', 'Receipt No'].forEach(function (col) {
    var bc = colLetter_(BOOKING_COLS.indexOf(col) + 1);
    var look = 'IFERROR(VLOOKUP(A2:A,{Bookings!A2:A,Bookings!' + bc + '2:' + bc + '},2,FALSE),"")';
    trav.getRange(1, TRAVELLER_COLS.indexOf(col) + 1).setFormula(
      '={"' + col + '";ARRAYFORMULA(IF(A2:A="",,' + (col === 'Status' ? 'IF(' + ov + '2:' + ov + '<>"",' + ov + '2:' + ov + ',' + look + ')' : look) + '))}');
  });
  trav.getRange(1, TRAVELLER_COLS.indexOf('Status') + 1).setNote('Automatic: it follows the booking\'s Status in Bookings. To cancel one traveller only, choose Cancelled in the column "Traveller status" on the right.');
  var cancelledRule = '=$' + colLetter_(TRAVELLER_COLS.indexOf('Status') + 1) + '2="Cancelled"';
  trav.setConditionalFormatRules(trav.getConditionalFormatRules().filter(function (r) {
    var b = r.getBooleanCondition(); return !(b && b.getCriteriaValues()[0] === cancelledRule); })
    .concat([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(cancelledRule).setBackground('#f4cccc').setFontColor('#9c1c1c')
      .setRanges([trav.getRange(2, 1, trav.getMaxRows() - 1, TRAVELLER_COLS.length)]).build()]));

  setupDashboard_(ss);
  filters.forEach(function (f) { var sh = ss.getSheetByName(f.sheet); if (!sh.getFilter()) sh.getRange(f.a1).createFilter(); });
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);
  // Tab order: the ones used every day first, set-up tabs last.
  [TABS.dashboard, TABS.allGuests, TABS.bookings, TABS.newBooking, TABS.travellers, TABS.trip, TABS.guide, TABS.lunchReport, TABS.collect, TABS.transport,
    TABS.arrange, TABS.accounts, TABS.agency, TABS.receipt, TABS.receiptLog, TABS.agreements, TABS.inquiries, TABS.reviews, TABS.lunch, TABS.plans,
    TABS.content, TABS.settings, TABS.help]
    .forEach(function (n, i) { var t = ss.getSheetByName(n); if (t) { ss.setActiveSheet(t); ss.moveActiveSheet(i + 1); } });
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
  // 2026-10-18 price change (250,000 one way / 500,000 round trip -> 220,000 / 440,000); typed values of other amounts are left alone
  if (sh.getRange('F2').getValue() === 250000) {
    sh.getRange('F2').setValue(TRANSFER_KIP);
    if (sh.getRange('F3').getValue() === 500000) sh.getRange('F3').setValue(TRANSFER_KIP * 2);
  }
  // later the same day: transport may not be sold below 250,000 kip per person, so 220,000 / 440,000 goes back to 250,000 / 500,000
  if (sh.getRange('F2').getValue() === 220000) {
    sh.getRange('F2').setValue(TRANSFER_KIP);
    if (sh.getRange('F3').getValue() === 440000) sh.getRange('F3').setValue(TRANSFER_KIP * 2);
  }
  if (sh.getLastRow() > 0) { migrateSettings_(sh); return; }
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange(1, 1, 1, 3).setValues([['Tour', 'Name', 'Price USD (per person)']]);
  sh.getRange(2, 1, TOURS.length, 3).setValues(TOURS);
  sh.getRange('E1:F2').setValues([['Setting', 'Value'], ['Transfer kip per person, one way', TRANSFER_KIP]]);
  migrateSettings_(sh);
  sh.getRange('A1:F1').setFontWeight('bold');
  freezeRows_(sh, 1);
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
  if (String(sh.getRange('E13').getValue()) === '') sh.getRange('E13').setValue('Transport manager (name and WhatsApp number), added to the pickup message sent to guests');
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
  freezeRows_(sh, 1);
  Object.keys(formats).forEach(function (c) {
    sh.getRange(2, cols.indexOf(c) + 1, sh.getMaxRows() - 1, 1).setNumberFormat(formats[c]);
  });
  Object.keys(dropdowns).forEach(function (c) {
    if (!dropdowns[c].length) return;
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
  freezeRows_(sh, 1);
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

// "Pad Thai (Chicken)" for every shown dish and choice: the dropdown of the Takeaway lunch column in Travellers.
function lunchDishes_(ss) {
  var out = [];
  lunchMenuJson_(ss).forEach(function (d) { (d.choices.length ? d.choices : ['']).forEach(function (c) { out.push(d.dish + (c ? ' (' + c + ')' : '')); }); });
  return out.slice(0, 500);
}

/* ---------- E-receipt: pick a booking, get a receipt in the guest's language, number it from the log ---------- */

var RECEIPT_LANGS = ['English', 'ລາວ', 'ไทย', '中文', '한국어', '日本語', 'Français', 'Deutsch'];
var RECEIPT_TEXT = [   // key, then the 8 languages in RECEIPT_LANGS order
  ['receipt', 'RECEIPT', 'ໃບຮັບເງິນ', 'ใบเสร็จรับเงิน', '收据', '영수증', '領収書', 'REÇU', 'QUITTUNG'],
  ['no', 'No.', 'ເລກທີ', 'เลขที่', '编号', '번호', '番号', 'N°', 'Nr.'],
  ['name', 'Name', 'ຊື່', 'ชื่อ', '姓名', '이름', '氏名', 'Nom', 'Name'],
  ['issued', 'Date of issue', 'ວັນທີອອກ', 'วันที่ออก', '开具日期', '발행일', '発行日', 'Date d’émission', 'Ausstellungsdatum'],
  ['tourdate', 'Tour date', 'ວັນທີທົວ', 'วันที่ทัวร์', '行程日期', '투어 날짜', 'ツアー日', 'Date de l’excursion', 'Tourdatum'],
  ['payment', 'Payment method', 'ວິທີຈ່າຍ', 'วิธีชำระเงิน', '付款方式', '결제 방법', 'お支払い方法', 'Moyen de paiement', 'Zahlungsart'],
  ['tour', 'Tour', 'ທົວ', 'ทัวร์', '行程', '투어', 'ツアー', 'Excursion', 'Tour'],
  ['pickup', 'Pickup', 'ການຮັບ', 'การรับ', '接送', '픽업', '送迎', 'Prise en charge', 'Abholung'],
  ['travellers', 'Travellers', 'ຜູ້ເດີນທາງ', 'ผู้เดินทาง', '旅客', '여행자', '旅行者', 'Voyageurs', 'Reisende'],
  ['passport', 'Passport', 'ໜັງສືຜ່ານແດນ', 'หนังสือเดินทาง', '护照', '여권', 'パスポート', 'Passeport', 'Reisepass'],
  ['food', 'Food', 'ອາຫານ', 'อาหาร', '餐食', '식사', '食事', 'Repas', 'Verpflegung'],
  ['item', 'Item', 'ລາຍການ', 'รายการ', '项目', '항목', '項目', 'Article', 'Position'],
  ['details', 'Details', 'ລາຍລະອຽດ', 'รายละเอียด', '详情', '세부 내용', '詳細', 'Détails', 'Details'],
  ['transport', 'Transport', 'ການເດີນທາງ', 'การเดินทาง', '交通', '교통', '交通', 'Transport', 'Transport'],
  ['lunch', 'Takeaway lunch', 'ອາຫານທ່ຽງເອົາໄປກິນ', 'อาหารกลางวันแบบห่อ', '外带午餐', '테이크아웃 점심', 'テイクアウトランチ', 'Déjeuner à emporter', 'Lunchpaket'],
  ['people', 'people', 'ຄົນ', 'คน', '人', '명', '名', 'personnes', 'Personen'],
  ['kip', 'Kip', 'ກີບ', 'กีบ', '基普', '킵', 'キープ', 'Kip', 'Kip'],
  ['total', 'Total', 'ລວມ', 'รวม', '合计', '합계', '合計', 'Total', 'Gesamt'],
  ['deposit', 'Deposit', 'ເງິນມັດຈຳ', 'เงินมัดจำ', '订金', '보증금', '内金', 'Acompte', 'Anzahlung'],
  ['balance', 'Balance', 'ຍອດຄ້າງ', 'ยอดคงเหลือ', '余额', '잔액', '残額', 'Solde', 'Restbetrag'],
  ['rate', 'Exchange rate', 'ອັດຕາແລກປ່ຽນ', 'อัตราแลกเปลี่ยน', '汇率', '환율', '為替レート', 'Taux de change', 'Wechselkurs'],
  ['custsig', 'Customer signature', 'ລາຍເຊັນລູກຄ້າ', 'ลายเซ็นลูกค้า', '客户签名', '고객 서명', 'お客様署名', 'Signature du client', 'Unterschrift des Kunden'],
  ['issuedby', 'Issued by', 'ອອກໂດຍ', 'ออกโดย', '开具人', '발행자', '発行者', 'Émis par', 'Ausgestellt von'],
  ['thanks', 'Thank you for travelling with us!', 'ຂອບໃຈທີ່ເດີນທາງກັບພວກເຮົາ!', 'ขอบคุณที่เดินทางกับเรา!', '感谢您与我们同行！',
    '저희와 함께 여행해 주셔서 감사합니다!', 'ご利用ありがとうございました！', 'Merci d’avoir voyagé avec nous !', 'Danke, dass Sie mit uns gereist sind!'],
  ['return', 'Return', 'ການກັບ', 'ขากลับ', '返程', '복귀', '帰り', 'Retour', 'Rückfahrt'],
  ['dropoff', 'Drop-off', 'ຈຸດສົ່ງ', 'จุดส่ง', '下车地点', '하차 장소', '降車場所', 'Dépose', 'Absetzort'],
  ['citycenter', 'city center', 'ກາງເມືອງ', 'ใจกลางเมือง', '市中心', '시내 중심', '市の中心部', 'centre-ville', 'Stadtzentrum'],
  ['train', 'Luang Prabang train station', 'ສະຖານີລົດໄຟຫຼວງພະບາງ', 'สถานีรถไฟหลวงพระบาง', '琅勃拉邦火车站', '루앙프라방 기차역', 'ルアンパバーン駅', 'gare de Luang Prabang', 'Bahnhof Luang Prabang'],
  ['time', 'Time', 'ເວລາ', 'เวลา', '时间', '시간', '時間', 'Heure', 'Uhrzeit'],
  ['draft', 'DRAFT', 'ຮ່າງ', 'ฉบับร่าง', '草稿', '초안', '下書き', 'BROUILLON', 'ENTWURF'],
  ['paid', 'Paid', 'ຈ່າຍແລ້ວ', 'ชำระแล้ว', '已付款', '결제 완료', '支払済み', 'Payé', 'Bezahlt'],
  ['bookingid', 'Booking ID', 'ລະຫັດການຈອງ', 'รหัสการจอง', '预订编号', '예약 번호', '予約番号', 'N° de réservation', 'Buchungsnummer'],
  ['perperson', 'Each pays', 'ແຕ່ລະຄົນຈ່າຍ', 'แต่ละคนจ่าย', '每人应付', '1인당 금액', '1人あたり', 'Par personne', 'Pro Person']
];
var RECEIPT_LOG_COLS = ['Receipt No', 'Date of issue', 'Booking ID', 'Language', 'Total USD', 'Total kip', 'Deposit USD', 'Balance USD', 'Issued by', 'Form key'];
var RECEIPT_RATE = 22500;
var RECEIPT_MANUAL = 'I2:I11';   // typed lines of the Receipt tab: pickup, return, tour USD, transport kip, lunch text, lunch kip, name, tour date, tour, payment
var RECEIPT_TRAV = 'L16:N27';
var DROPOFFS = ['City center', 'Train station'];   // Receipt I12
var RECEIPT_TRANSPORT = 'I14';   // typed transport wording on the receipt (e.g. "Private minivan"); only this receipt
var RETURN_TIMES = ['10:00-10:30 AM', '10:30 AM', '3:30-4:30 PM'];   // Receipt I16 (typing another time is fine)
var RECEIPT_EDIT = 'I13';   // tick: the printed receipt becomes typed text (Booking ID and receipt number stay)
var RECEIPT_TYPED = ['B10', 'B11', 'B12', 'B13', 'B14', 'F11', 'C30', 'C31', 'C32', 'D30', 'E31', 'E32'];   // lines that become typed text    // travellers typed by hand (name, passport, food) for a receipt whose booking has none

// Receipt settings live in Settings E8:F12; written once, then staff-owned.
function setupReceiptSettings_(ss) {
  var sh = ss.getSheetByName(TABS.settings);
  if (String(sh.getRange('F12').getValue()) === 'https://nongkhiawlaos.com/images/logo.png') sh.getRange('F12').setValue('https://nongkhiawlaos.com/images/receipt-logo.png');
  if (String(sh.getRange('E8').getValue()) !== '') return;
  sh.getRange('E8:F12').setValues([
    ['Receipts: kip per 1 USD', RECEIPT_RATE],
    ['Receipts: business name', 'Eco Lao Adventure Trails'],
    ['Receipts: address', 'Nong Khiaw, Meuang Ngoi District, Luang Prabang, Laos'],
    ['Receipts: contact line', 'WhatsApp +856 20 5897 5057 | +856 20 2299 9917 | nongkhiawlaos@gmail.com | nongkhiawlaos.com'],
    ['Receipts: logo (link to an image)', 'https://nongkhiawlaos.com/images/receipt-logo.png']]);
  sh.getRange('F8').setNumberFormat('#,##0');
}

function receiptRate_(ss) { return Number(ss.getSheetByName(TABS.settings).getRange('F8').getValue()) || RECEIPT_RATE; }

function setupReceipt_(ss) {
  setupReceiptSettings_(ss);
  var log = ss.getSheetByName(TABS.receiptLog) || ss.insertSheet(TABS.receiptLog);
  log.getRange(1, 1, 1, RECEIPT_LOG_COLS.length).setValues([RECEIPT_LOG_COLS]).setFontWeight('bold').setBackground('#e8f0ea');
  freezeRows_(log, 1);
  log.getRange('A2:A').setNumberFormat('@'); log.getRange('B2:B').setNumberFormat('dd/mm/yyyy');
  log.getRange('E2:H').setNumberFormat('#,##0.00'); log.getRange('F2:F').setNumberFormat('#,##0');
  log.setColumnWidths(1, RECEIPT_LOG_COLS.length, 110);

  var tx = ss.getSheetByName(TABS.receiptText) || ss.insertSheet(TABS.receiptText);   // rewritten every setup
  tx.clear();
  tx.getRange(1, 1, 1, 9).setValues([['Key'].concat(RECEIPT_LANGS)]);
  tx.getRange(2, 1, RECEIPT_TEXT.length, 9).setValues(RECEIPT_TEXT);
  tx.hideSheet();

  var sh = ss.getSheetByName(TABS.receipt) || ss.insertSheet(TABS.receipt);
  var keep = sh.getRange('B1:B3').getValues(), keepTimes = [sh.getRange('D2').getValue(), sh.getRange('F2').getValue()];   // what staff picked survives a rebuild
  var keepManual = sh.getRange(RECEIPT_MANUAL).getValues(), keepTrav = sh.getRange(RECEIPT_TRAV).getValues(), keepTransport = sh.getRange(RECEIPT_TRANSPORT).getValue();
  sh.clear(); sh.clearConditionalFormatRules(); sh.setHiddenGridlines(true);
  var lang = keep[1][0] || 'English';
  var L = function (k) { return 'IFERROR(INDEX(\'' + TABS.receiptText + '\'!$B$2:$I$60,MATCH("' + k + '",\'' + TABS.receiptText + '\'!$A$2:$A$60,0),$K$2),"' + k + '")'; };
  var colOf = function (c) { return colLetter_(BOOKING_COLS.indexOf(c) + 1); };
  var bk = function (c) { return 'IF($K$1=0,"",IFERROR(INDEX(Bookings!$' + colOf(c) + '$1:$' + colOf(c) + ',$K$1),""))'; };   // K1=0: not in Bookings
  var S = function (a) { return 'Settings!' + a; };

  // controls (not printed)
  sh.getRange('A1:A3').setValues([['Booking ID'], ['Language'], ['Paid (USD)']]).setFontWeight('bold');
  sh.getRange('B1:B3').setValues([[keep[0][0] || ''], [lang], [keep[2][0] || '']]).setBackground('#fff2a8').setFontWeight('bold');
  sh.getRange('B1').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInRange(ss.getSheetByName(TABS.bookings).getRange('A2:A'), true).setAllowInvalid(true).build());
  sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(RECEIPT_LANGS, true).setAllowInvalid(false).build());
  sh.getRange('B3').setNumberFormat('#,##0.00')
    .setNote('Leave empty: the receipt takes the payment from Bookings (Status "Paid" = fully paid, otherwise "Amount paid USD"). Type here only to override it.');
  sh.getRange('C2').setValue('Pickup time').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('E2').setValue('Return time').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('D2').setValue(keepTimes[0] || '').setNumberFormat('@').setBackground('#fff2a8').setFontWeight('bold');
  sh.getRange('F2').setValue(keepTimes[1] || '').setNumberFormat('@').setBackground('#fff2a8').setFontWeight('bold');
  sh.getRange('C1:F1').merge().setValue('1) Pick the Booking ID: it gets the next receipt number (000001, 000002, ...) at once. 2) Pick the language. Payment comes from Bookings ' +
    '(Status, Amount paid USD). 3) Click "⬇ PDF" below to download or print it (or menu "Receipts" > "Download PDF" for a file named "No 000001 <name>.pdf").').setWrap(true).setFontColor('#5a665f');
  // A plain link to the PDF: no script and no permission needed, so it works for every staff member (the file gets Google's name).
  sh.getRange('C3').setFormula('=HYPERLINK("' + receiptPdfUrl_(ss, sh) + '","⬇ PDF: download / print")').setFontWeight('bold').setFontColor('#0b3d2e');
  sh.getRange('E3').setFormula('=IF($K$3>0,HYPERLINK("https://nongkhiawlaos.com/agreement/?k="&INDEX(\'' + TABS.receiptLog + '\'!$J$1:$J,$K$3),"Open agreement form"),"Agreement form: issue the receipt first")')
    .setFontWeight('bold').setFontColor('#1155cc');
  // Manual changes for this receipt (empty = taken from the booking): for anything the booking does not say, or says differently.
  sh.getRange('H1').setValue('Change this receipt by hand (empty = from the booking)').setFontWeight('bold').setWrap(true);
  sh.getRange('H2:H11').setValues([['Pickup line (replaces the whole line)'], ['Return line (replaces the whole line)'], ['Tour amount USD'],
    ['Transport amount kip'], ['Takeaway lunch (text)'], ['Takeaway lunch amount kip'], ['Name'], ['Tour date'], ['Tour (replaces the line)'], ['Payment method']])
    .setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange(RECEIPT_MANUAL).setBackground('#fff2a8').setValues(keepManual).setHorizontalAlignment('left');
  sh.getRange('I4').setNumberFormat('#,##0.00'); sh.getRange('I5').setNumberFormat('#,##0'); sh.getRange('I7').setNumberFormat('#,##0');
  sh.getRange('I2:I3').setNumberFormat('@'); sh.getRange('I6').setNumberFormat('@'); sh.getRange('I8').setNumberFormat('@');
  sh.getRange('I9').setNumberFormat('dd/mm/yyyy').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('I10:I11').setNumberFormat('@');
  sh.getRange('A5:F41').clearDataValidations();
  sh.getRange('H13').setValue('Edit on the receipt (tick, then type over any line)').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange(RECEIPT_EDIT).insertCheckboxes().setValue(false).setBackground('#cfe2a8')
    .setNote('Ticked: the receipt lines (name, date, tour, pickup, return, payment, travellers, details and amounts) become text you can type over, ' +
      'with dropdowns. Totals still add up. Untick, or pick another booking, to go back to the booking\'s details.');
  sh.getRange('H14').setValue('Transport (text, e.g. Private minivan)').setFontWeight('bold').setHorizontalAlignment('right');
  var rides = []; TRANSFERS.forEach(function (t) { if (t !== 'No') rides.push(t); });
  sh.getRange(RECEIPT_TRANSPORT).setBackground('#fff2a8').setNumberFormat('@').setValue(keepTransport)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(rides.concat(['Private minivan', 'Private minivan, round trip']), true).setAllowInvalid(true).build());
  sh.getRange('H15').setValue('Return date (changes the booking)').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('I15').setBackground('#cfe2a8').setFontWeight('bold').setNumberFormat('dd/mm/yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('H16').setValue('Return time (changes the booking)').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('I16').setBackground('#cfe2a8').setFontWeight('bold').setNumberFormat('@')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(RETURN_TIMES, true).setAllowInvalid(true).build());
  sh.getRange('H12').setValue('Drop-off in Luang Prabang (changes the booking)').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('I12').setBackground('#cfe2a8').setFontWeight('bold')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(DROPOFFS, true).setAllowInvalid(false).build())
    .setNote('Changes the booking itself: Train station adds the extra kip per person (Settings F4) to the transport amount, City center removes it. Transport and the receipt follow.');
  // Travellers by hand: used only when the booking has no travellers (a booking typed nowhere else, or not in Bookings at all)
  sh.getRange('L14').setValue('Travellers by hand (only if the booking shows none)').setFontWeight('bold');
  sh.getRange('L15:N15').setValues([['Name', 'Passport', 'Food']]).setFontWeight('bold').setBackground('#e8f0ea');
  sh.getRange(RECEIPT_TRAV).setBackground('#fff2a8').setNumberFormat('@').setValues(keepTrav);
  sh.setColumnWidth(12, 200); sh.setColumnWidth(13, 120); sh.setColumnWidth(14, 100);
  sh.getRange('I5').setNote('Type the transport amount in kip if the booking has none or an old price. Empty = the booking\'s amount (or the current price from Settings).');
  sh.setColumnWidth(7, 20); sh.setColumnWidth(8, 250); sh.setColumnWidth(9, 280);
  sh.getRange('F3').setFormula('=IF($K$3>0,HYPERLINK("https://nongkhiawlaos.com/lunch/?k="&INDEX(\'' + TABS.receiptLog + '\'!$J$1:$J,$K$3),"Lunch order link (send to the guest)"),"")')
    .setFontWeight('bold').setFontColor('#1155cc').setWrap(true);
  sh.getRange('K1').setFormula('=IFERROR(MATCH($B$1,Bookings!$A$1:$A,0),0)');
  sh.getRange('K2').setFormula('=IFERROR(MATCH($B$2,\'' + TABS.receiptText + '\'!$B$1:$I$1,0),1)');
  sh.getRange('K3').setFormula('=IFERROR(MATCH($B$1,\'' + TABS.receiptLog + '\'!$C$1:$C,0),0)');
  sh.getRange('K4').setFormula('=' + S('$F$8'));
  var rem = bk('Transport remark') + '&""';
  sh.getRange('K5').setFormula('=IF($F$2<>"",$F$2,IFERROR(REGEXEXTRACT(' + rem + ',"(?i)\\d{1,2}(?::\\d{2})?\\s*(?:-\\s*\\d{1,2}(?::\\d{2})?\\s*)?(?:AM|PM)"),"10:00 - 10:30 AM"))');   // return time: typed, else from the booking
  sh.getRange('K6').setFormula('=IF($D$2<>"",$D$2,"7:30 - 8:00 AM")');   // pickup time: typed, else the usual
  sh.getRange('J1:J6').setValues([['row'], ['lang'], ['logged'], ['rate'], ['return time'], ['pickup time']]);
  sh.hideColumns(10, 2);

  // header
  sh.getRange('A5:A7').merge().setFormula('=IFERROR(IMAGE(' + S('$F$12') + '),"")');
  sh.getRange('B5:F5').merge().setFormula('=' + S('$F$9')).setFontSize(16).setFontWeight('bold').setFontColor('#0b3d2e');
  sh.getRange('B6:F6').merge().setFormula('=' + S('$F$10')).setFontColor('#5a665f');
  sh.getRange('B7:F7').merge().setFormula('=' + S('$F$11')).setFontColor('#5a665f').setWrap(true);
  sh.getRange('A8:F8').setBorder(true, null, null, null, null, null, '#0b3d2e', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  sh.getRange('A9:D9').merge().setFormula('=' + L('receipt')).setFontSize(20).setFontWeight('bold');
  sh.getRange('E9').setFormula('=' + L('no') + '&" "').setHorizontalAlignment('right').setFontWeight('bold');
  sh.getRange('F9').setFormula('=IF($K$3>0,INDEX(\'' + TABS.receiptLog + '\'!$A$1:$A,$K$3),' + L('draft') + ')').setFontWeight('bold').setFontColor('#c0392b');
  sh.getRange('A10').setFormula('=' + L('name') + '&":"').setFontWeight('bold');
  sh.getRange('B10:D10').merge().setFormula('=IF($I$8<>"",$I$8,' + bk('Lead name') + ')');
  sh.getRange('E10').setFormula('=' + L('issued') + '&":"').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('F10').setFormula('=IF($K$3>0,INDEX(\'' + TABS.receiptLog + '\'!$B$1:$B,$K$3),TODAY())').setNumberFormat('dd/mm/yyyy').setHorizontalAlignment('left');
  sh.getRange('A11').setFormula('=' + L('tourdate') + '&":"').setFontWeight('bold');
  sh.getRange('B11:D11').merge().setFormula('=IF($I$9<>"",TEXT($I$9,"dd/mm/yyyy"),IF(N(' + bk('Tour date') + ')=0,"",TEXT(' + bk('Tour date') + ',"dd/mm/yyyy")))').setHorizontalAlignment('left');   // a missing date stays empty (not 30/12/1899)
  sh.getRange('E11').setFormula('=' + L('payment') + '&":"').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('F11').setFormula('=IF($I$11<>"",$I$11,' + bk('Payment method') + ')');
  sh.getRange('A12').setFormula('=' + L('tour') + '&":"').setFontWeight('bold');
  sh.getRange('B12:F12').breakApart();
  sh.getRange('B12:D12').merge().setFormula('=IF($I$10<>"",$I$10,IF(' + bk('Tour') + '="","",IF(' + bk('Tour') + '="' + TRANSPORT_ONLY + '",' + bk('Tour name') + ',"Code: "&' + bk('Tour') + '&" – "&' + bk('Tour name') + ')))');
  sh.getRange('E12').setFormula('=' + L('bookingid') + '&":"').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('F12').setFormula('=$B$1').setHorizontalAlignment('left');
  sh.getRange('A13').setFormula('=' + L('pickup') + '&":"').setFontWeight('bold');
  sh.getRange('B13:F13').merge().setFormula('=IF($I$2<>"",$I$2,IF(OR(' + bk('Transfer') + '="",' + bk('Transfer') + '="No"),"",' + bk('Transfer') + '&IF(' + bk('Pickups') +
    '="","","  |  "&' + bk('Pickups') + ')&IF(' + bk('Pickup date') + '="","","  |  "&TEXT(' + bk('Pickup date') + ',"dd/mm/yyyy")&" "&$K$6)))').setWrap(true);
  var back = 'OR(' + bk('Transfer') + '="Round trip",REGEXMATCH(' + bk('Transfer') + '&"","(?i)to luang prabang"))';
  sh.getRange('A14').setFormula('=IF(OR(' + back + ',$I$3<>""),' + L('return') + '&":","")').setFontWeight('bold');
  sh.getRange('B14:F14').merge().setFormula('=IF($I$3<>"",$I$3,IF(' + back + ',"Nong Khiaw → Luang Prabang  |  "&IF(' + bk('Return date') + '="","",TEXT(' + bk('Return date') +
    ',"dd/mm/yyyy")&" "&$K$5&"  |  ")&' + L('dropoff') + '&": "&IF(' + bk('Train station drop-off') + '="Yes",' + L('train') + ',' + L('citycenter') + '),""))').setWrap(true);

  // travellers
  sh.getRange('A15').setFormula('=' + L('no'));
  sh.getRange('B15').setFormula('=' + L('name'));
  sh.getRange('C15').setFormula('=' + L('passport'));
  sh.getRange('D15').setFormula('=' + L('food'));
  sh.getRange('E15').setFormula('=' + L('lunch'));
  sh.getRange('F15').setFormula('=' + L('perperson') + '&" (USD / "&' + L('kip') + '&")"');
  sh.getRange('A15:F15').setFontWeight('bold').setBackground('#e8f0ea').setWrap(true);
  writeReceiptTravellers_(ss, sh);
  sh.getRange('A16:F27').setBorder(null, null, true, null, null, true, '#cfd8d3', SpreadsheetApp.BorderStyle.SOLID).setWrap(true).setVerticalAlignment('middle');
  sh.getRange('D16:D27').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(FOODS, true).setAllowInvalid(true).build());
  var dishes = lunchDishes_(ss);
  if (dishes.length) sh.getRange('E16:E27').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList([''].concat(dishes), true).setAllowInvalid(true).build());
  sh.getRange('A5:F41').clearNote();   // a note inside the printed area becomes a [1] [2] ... marker in the PDF
  sh.getRange('H1').setNote('Food and Takeaway lunch in the traveller rows (D16:E27): type or pick there; it is saved on the traveller (Travellers tab), so the Lunch report, the reports and this receipt all follow.');

  // amounts
  sh.getRange('A29:B29').merge().setFormula('=' + L('item'));
  sh.getRange('C29').setFormula('=' + L('details'));
  sh.getRange('D29').setValue('USD');
  sh.getRange('E29').setFormula('=' + L('kip'));
  sh.getRange('A29:F29').setFontWeight('bold').setBackground('#e8f0ea');
  var rate = '$K$4';
  // Transport: typed amount, else the booking's, else worked out here (legs x travellers taking it, train station extra) at the Settings prices.
  var tr = bk('Transfer'), pp = 'Travellers!$' + colLetter_(TRAVELLER_COLS.indexOf('Pickup place') + 1) + '$2:$' + colLetter_(TRAVELLER_COLS.indexOf('Pickup place') + 1);
  var riders = 'MAX(1,N(' + bk('People') + ')-COUNTIFS(Travellers!$A$2:$A,$B$1,' + pp + ',"No transfer"))';
  var worked = 'IF(OR(' + tr + '="",' + tr + '="No"),0,(IF(' + tr + '="Round trip",Settings!$F$3,Settings!$F$2)+IF(AND(' + bk('Train station drop-off') +
    '="Yes",OR(' + tr + '="Round trip",REGEXMATCH(' + tr + '&"","(?i)to luang prabang"))),Settings!$F$4,0))*' + riders + ')';
  var lines = [
    [30, 'tour', '=IF(N(' + bk('People') + ')>0,' + bk('People') + ',COUNTA($L$16:$L$27))&" "&' + L('people'), '=IF($I$4<>"",N($I$4),N(' + bk('Est. tour USD') + '))', '=ROUND(D30*' + rate + ',0)'],
    [31, 'transport', '=IF($I$14<>"",$I$14,' + bk('Transfer') + '&IF(' + bk('Train station drop-off') + '="Yes"," + "&' + L('train') + ',""))', '=E31/' + rate,
      '=IF($I$5<>"",N($I$5),IF(N(' + bk('Est. transfer kip') + ')>0,N(' + bk('Est. transfer kip') + '),IF($B$1="",0,' + worked + ')))'],
    [32, 'lunch', '=IF($I$6<>"",$I$6,' + bk('Takeaway lunch') + ')', '=E32/' + rate, '=IF($I$7<>"",N($I$7),N(' + bk('Lunch kip') + '))']];
  lines.forEach(function (x) {
    sh.getRange('A' + x[0] + ':B' + x[0]).merge().setFormula('=' + L(x[1]));
    sh.getRange('C' + x[0]).setFormula(x[2]).setWrap(true);
    sh.getRange('D' + x[0]).setFormula(x[3]); sh.getRange('E' + x[0]).setFormula(x[4]);
  });
  sh.getRange('A33:B33').merge().setFormula('=' + L('total')); sh.getRange('D33').setFormula('=SUM(D30:D32)'); sh.getRange('E33').setFormula('=SUM(E30:E32)');
  // paid: the yellow cell if typed, else from Bookings (Status Paid = everything, otherwise Amount paid USD)
  sh.getRange('A34:B34').merge().setFormula('=IF(AND(D33>0,D35<=0.005),' + L('paid') + ',' + L('deposit') + ')');
  sh.getRange('D34').setFormula('=IF($B$3<>"",N($B$3),IF(' + bk('Status') + '="Paid",D33,N(' + bk('Amount paid USD') + ')))');
  sh.getRange('F34').setFormula('=IF(AND(D33>0,D35<=0.005),"✓ "&UPPER(' + L('paid') + '),"")').setFontWeight('bold').setFontSize(14)
    .setFontColor('#1e7a3c').setHorizontalAlignment('center'); sh.getRange('E34').setFormula('=ROUND(D34*' + rate + ',0)');
  sh.getRange('A35:B35').merge().setFormula('=' + L('balance')); sh.getRange('D35').setFormula('=D33-D34'); sh.getRange('E35').setFormula('=E33-E34');
  sh.getRange('D30:D35').setNumberFormat('#,##0.00'); sh.getRange('E30:E35').setNumberFormat('#,##0');
  sh.getRange('A33:F33').setFontWeight('bold').setBorder(true, null, null, null, null, null, '#0b3d2e', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange('A35:F35').setFontWeight('bold').setBackground('#fff2a8');
  sh.getRange('A36:E36').merge().setFormula('=' + L('rate') + '&": 1 USD = "&TEXT(' + rate + ',"#,##0")&" kip"').setFontColor('#5a665f').setFontStyle('italic');
  sh.getRange('A38:C38').merge().setFormula('=' + L('custsig') + '&": ______________________"');
  sh.getRange('D38:F38').merge().setFormula('=' + L('issuedby') + '&": ______________"');
  sh.getRange('A41:F41').merge().setFormula('=' + L('thanks')).setHorizontalAlignment('center').setFontColor('#2f6b4f').setFontWeight('bold');
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 190); sh.setColumnWidth(4, 110); sh.setColumnWidth(5, 120); sh.setColumnWidth(6, 120);
  sh.setRowHeights(5, 3, 26); sh.setRowHeights(1, 3, 24);
  sh.getRange('A5:F41').setVerticalAlignment('middle');
}

// Rows 16-27 of the receipt: traveller n = row - 15 of the picked booking (or the traveller typed by hand in L:N). Food (D) and
// Takeaway lunch (E) are formulas too, but typing in them is saved on the traveller by receiptTravellerEdit_ and the formula put back.
// F: what each person pays (tour per person + their share of the transport + their own lunch), shown for groups of 2 or more.
function receiptTravellerFormulas_(row) {
  var n = row - 15, T = function (c) { return 'Travellers!$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1) + '$2:$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var mine = '(' + T('Booking ID') + '=$B$1)*(' + T('Traveller #') + '=' + n + ')';
  var pick = function (col, fallback) { return '=IF($A' + row + '="","",IFERROR(INDEX(FILTER(' + T(col) + ',' + mine + '),1),' + fallback + '))'; };
  var people = 'COUNTIF($A$16:$A$27,">0")', riders = 'COUNTIFS(' + T('Booking ID') + ',$B$1,' + T('Pickup place') + ',"<>No transfer")';
  var ridesMe = '(COUNTIFS(' + T('Booking ID') + ',$B$1,' + T('Traveller #') + ',' + n + ',' + T('Pickup place') + ',"<>No transfer")>0)';
  var lunchMe = 'IF($K$1>0,SUMIFS(' + T('Lunch kip') + ',' + T('Booking ID') + ',$B$1,' + T('Traveller #') + ',' + n + '),IF(' + people + '>0,$E$32/' + people + ',0))';
  var kip = 'ROUND(IF(' + people + '>0,$D$30/' + people + ',0)*$K$4+IF(' + riders + '>0,IF(' + ridesMe + ',$E$31/' + riders + ',0),IF(' + people + '>0,$E$31/' + people + ',0))+' + lunchMe + ',0)';
  return [
    '=IF($B$1="","",IF(COUNTIFS(' + T('Booking ID') + ',$B$1,' + T('Traveller #') + ',' + n + ')>0,' + n + ',IF($L' + row + '<>"",' + n + ',"")))',
    pick('Full name', '$L' + row), pick('Passport no', '$M' + row), pick('Food', '$N' + row), pick('Takeaway lunch', '""'),
    '=IF(OR($A' + row + '="",' + people + '<2),"",LET(k,' + kip + ',TEXT(k/$K$4,"#,##0.00")&" / "&TEXT(k,"#,##0")))'];
}

function writeReceiptTravellers_(ss, sh) {
  var rows = [];
  for (var r = 16; r <= 27; r++) rows.push(receiptTravellerFormulas_(r));
  sh.getRange('A16:F27').setFormulas(rows);
}

// Food or Takeaway lunch typed on the receipt (D16:E27): saved on that traveller in Travellers, the booking re-counted, formula back.
function receiptTravellerEdit_(ss, range) {
  var sh = range.getSheet(), row = range.getRow(), col = range.getColumn(), typed = String(range.getValue()).trim();
  var id = String(sh.getRange('B1').getValue()).trim(), n = Number(sh.getRange(row, 1).getValue());
  var tr = ss.getSheetByName(TABS.travellers), at = -1;
  if (id && n && tr.getLastRow() > 1) {
    var v = tr.getRange(2, 1, tr.getLastRow() - 1, TRAVELLER_COLS.indexOf('Traveller #') + 1).getValues();
    for (var i = 0; i < v.length; i++) if (String(v[i][0]) === id && Number(v[i][TRAVELLER_COLS.indexOf('Traveller #')]) === n) { at = i + 2; break; }
  }
  if (at < 0) return;   // a traveller typed by hand (L:N): what was typed stays as it is
  var cell = tr.getRange(at, TRAVELLER_COLS.indexOf(col === 4 ? 'Food' : 'Takeaway lunch') + 1);
  cell.setValue(typed);
  travellerEdited_(ss, cell);   // prices the lunch, re-counts the booking's lunch / food
  range.setFormula(receiptTravellerFormulas_(row)[col - 1]);
  refreshReceiptAmounts_(ss);
  ss.toast((col === 4 ? 'Food' : 'Takeaway lunch') + ' saved for traveller ' + n + ' (Travellers, the booking, the Lunch report and this receipt follow).', 'Receipt', 6);
}

// The printable part of the Receipt tab as a PDF (Google's export link; the script adds the file name).
function receiptPdfUrl_(ss, sh) {
  return 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&gid=' + sh.getSheetId() +
    '&range=A5:F41&portrait=true&size=A4&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenumbers=false&top_margin=0.4&bottom_margin=0.4&left_margin=0.5&right_margin=0.5';
}

// "No 000002 Adam David Anthony Eistob.pdf": without characters a file name cannot hold.
function receiptFileName_(no, name) {
  return ('No ' + no + ' ' + String(name || '').trim()).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf';
}

// The receipt in the Receipt tab, numbered (once) and with current amounts, ready to export.
function readyReceipt_() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getSheetByName(TABS.receipt);
  var id = String(sh.getRange('B1').getValue()).trim(), r;
  fillMissingFor_(ss, id);
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { r = issueReceipt_(ss, id); } finally { lock.releaseLock(); }
  refreshReceiptAmounts_(ss);
  SpreadsheetApp.flush();
  return { ss: ss, sh: sh, no: r.no, name: receiptFileName_(r.no, sh.getRange('B10').getDisplayValue()) };
}

// Opening the export link in a new tab needs no extra permission: the browser shows (or saves) the PDF, and it prints from there.
var RECEIPT_OPEN = '<p><a href="<?= url ?>" target="_blank" style="display:inline-block;padding:8px 14px;background:#2f6b4f;color:#fff;border-radius:6px;text-decoration:none">' +
  '<b><?= label ?></b></a></p>';

// Menu Receipts > Download PDF: numbers the receipt if needed, then downloads it named after the receipt and the guest.
// If the named download cannot be made, the dialog says why and still offers the PDF through the plain link.
function downloadReceiptPdf() {
  var ui = SpreadsheetApp.getUi(), x;
  try { x = readyReceipt_(); } catch (e) { ui.alert(String(e.message || e)); return; }
  var url = receiptPdfUrl_(x.ss, x.sh), data = '', problem = '';
  try {
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() === 200) data = Utilities.base64Encode(res.getContent());
    else problem = 'Google answered ' + res.getResponseCode();
  } catch (e) { problem = String(e.message || e); }
  if (problem) console.error('Receipt PDF ' + x.no + ': ' + problem);
  var t = HtmlService.createTemplate('<div style="font:14px Arial">' +
    '<? if (data) { ?><p>Downloading <b><?= name ?></b>. If nothing happens: <a id="a" href="#" download="<?= name ?>"><b>download it here</b></a>.</p>' +
    '<? } else { ?><p style="color:#a33">The named download did not work (<?= problem ?>). Use the button: it opens the same receipt as a PDF to save or print.</p><? } ?>' +
    RECEIPT_OPEN + '<div id="d" data-b="<?= data ?>"></div></div>' +
    '<script>var b=document.getElementById("d").getAttribute("data-b");if(b){var s=atob(b),u=new Uint8Array(s.length);' +
    'for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);var a=document.getElementById("a");' +
    'a.href=URL.createObjectURL(new Blob([u],{type:"application/pdf"}));a.click();}</script>');
  t.name = x.name; t.data = data; t.problem = problem; t.url = url; t.label = 'Open the PDF (to print or save)';
  ui.showModalDialog(t.evaluate().setWidth(480).setHeight(170), 'Receipt ' + x.no);
}

// Menu Receipts > Print receipt: opens the receipt as an A4 PDF in a new tab; print it there (Ctrl/Cmd+P) for the guest to sign.
function printReceipt() {
  var ui = SpreadsheetApp.getUi(), x;
  try { x = readyReceipt_(); } catch (e) { ui.alert(String(e.message || e)); return; }
  var t = HtmlService.createTemplate('<div style="font:14px Arial"><p>Receipt <b><?= no ?></b> is ready. Open it, then print (Ctrl+P, or Cmd+P on a Mac). ' +
    'The guest signs on the "Customer signature" line.</p>' + RECEIPT_OPEN + '</div>');
  t.no = x.no; t.url = receiptPdfUrl_(x.ss, x.sh); t.label = 'Open the receipt to print';
  ui.showModalDialog(t.evaluate().setWidth(460).setHeight(150), 'Print receipt ' + x.no);
}

// The receipt's amounts come from the booking: fill the empty ones before it is shown or numbered.
function fillMissingFor_(ss, id) {
  var bk = ss.getSheetByName(TABS.bookings), ids = bk.getRange(1, 1, bk.getLastRow(), 1).getDisplayValues().map(function (r) { return r[0]; });
  var at = ids.indexOf(id);
  if (at > 0 && fillAmounts_(ss, at + 1, false)) SpreadsheetApp.flush();
}

function newKey_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16); }   // private code in the agreement link

// "Issued by" of a log row that records a receipt number the booking already had (Noy's imported paper receipts, or one
// typed into Bookings by hand). Such numbers are kept as they are and do not count towards the 000001, 000002, ... sequence.
var OLD_RECEIPT = 'Earlier receipt (kept)';

// Gives the booking in the Receipt tab the next receipt number (once); returns the number.
function issueReceipt_(ss, id) {
  var sh = ss.getSheetByName(TABS.receipt), log = ss.getSheetByName(TABS.receiptLog), bk = ss.getSheetByName(TABS.bookings);
  var ids = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
  var at = ids.indexOf(id);
  if (!id) throw new Error('Pick a Booking ID in the yellow cell first.');   // not in Bookings: a receipt typed by hand, numbered all the same
  var rows = log.getLastRow() > 1 ? log.getRange(2, 1, log.getLastRow() - 1, RECEIPT_LOG_COLS.length).getDisplayValues() : [];
  var next = 1, keyCol = RECEIPT_LOG_COLS.indexOf('Form key'), byCol = RECEIPT_LOG_COLS.indexOf('Issued by');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i][2] === id) {
      if (!rows[i][keyCol]) { rows[i][keyCol] = newKey_(); log.getRange(i + 2, keyCol + 1).setValue(rows[i][keyCol]); }
      // numbered while the booking was missing from Bookings (added later, e.g. imported from WhatsApp): the booking gets the number now
      if (at > 0) { var nc = bk.getRange(at + 1, BOOKING_COLS.indexOf('Receipt No') + 1); if (!nc.getDisplayValue().trim()) nc.setValue(text_(rows[i][0])); }
      return { no: rows[i][0], isNew: false, key: rows[i][keyCol] };
    }
    if (rows[i][byCol] !== OLD_RECEIPT) next = Math.max(next, (Number(rows[i][0]) || 0) + 1);
  }
  var noCell = at > 0 ? bk.getRange(at + 1, BOOKING_COLS.indexOf('Receipt No') + 1) : null;
  var had = noCell ? noCell.getDisplayValue().trim() : '';   // never renumber a booking that already has a receipt
  var no = had || ('000000' + next).slice(-6), key = newKey_();
  SpreadsheetApp.flush();
  var v = sh.getRange('D33:E35').getValues();   // total, deposit, balance (USD, kip)
  var who = OLD_RECEIPT;
  if (!had) { try { who = Session.getActiveUser().getEmail(); } catch (e) { who = ''; } }
  log.getRange(log.getLastRow() + 1, 1, 1, RECEIPT_LOG_COLS.length).setValues([[text_(no), new Date(), id, sh.getRange('B2').getValue(),
    v[0][0], v[0][1], v[1][0], v[2][0], who, key]]);
  log.getRange(log.getLastRow(), 2).setNumberFormat('dd/mm/yyyy');
  if (!had && noCell) noCell.setValue(text_(no));
  return { no: no, isNew: !had, key: key };
}

// Picking a Booking ID in the Receipt tab gives it its number at once, so the receipt never shows DRAFT for a picked booking.
function onEdit(e) {
  var r = e && e.range;
  if (!r) return;
  var tab = r.getSheet().getName();
  if (tab === TABS.transport) {
    if (r.getA1Notation() === 'B2') buildTransport_(e.source);
    else if (r.getRow() > TRANSPORT_START) saveTransportEdit_(e.source, r);
    return;
  }
  if (tab === TABS.bookings && r.getRow() > 1) { bookingEdited_(e.source, r); return; }
  if (tab === TABS.travellers && r.getRow() > 1) { travellerEdited_(e.source, r); return; }
  if (tab === TABS.arrange) {
    var a1 = r.getA1Notation();
    if (a1 === 'B2' || a1 === 'B3') fillArrange_(e.source);
    else if (a1 === AR_SAVE && r.getValue() === true) saveArrange_(e.source);
    return;
  }
  if (tab === TABS.newBooking) {
    if (r.getA1Notation() === NB_SAVE && r.getValue() === true) saveManualBooking_(e.source);
    if (r.getA1Notation() === NB_IMPORT && r.getValue() === true) importWhatsAppBooking_(e.source);
    return;
  }
  if (tab !== TABS.receipt) return;
  var a1r = r.getA1Notation();
  if (a1r === 'B1') numberPickedReceipt_(e.source);
  else if (a1r === 'I12') receiptDropoff_(e.source);
  else if (a1r === 'I15' || a1r === 'I16') receiptReturn_(e.source);
  else if (a1r === RECEIPT_EDIT) { if (r.getValue() === true) receiptUnlock_(e.source); else { setupReceipt_(e.source); refreshReceiptAmounts_(e.source); } }
  else if (r.getNumRows() === 1 && r.getNumColumns() === 1 && r.getRow() >= 16 && r.getRow() <= 27 && (r.getColumn() === 4 || r.getColumn() === 5) &&
    r.getSheet().getRange(RECEIPT_EDIT).getValue() !== true) receiptTravellerEdit_(e.source, r);   // food / lunch typed on a traveller row
  else if (r.getRow() >= 9 && r.getRow() <= 41 && r.getColumn() <= 6) refreshReceiptAmounts_(e.source);   // a typed amount on the receipt
  else if (a1r === 'B3' || a1r === 'D2' || a1r === 'F2' || (r.getColumn() === 9 && r.getRow() >= 2 && r.getRow() <= 11)) refreshReceiptAmounts_(e.source);   // typed changes
}

// Tick "Edit on the receipt": the printed lines become their own text (what they show now), with dropdowns, so Noy can type over
// anything but the Booking ID and the receipt number. Totals stay formulas. Unticking or picking a booking rebuilds the tab.
function receiptUnlock_(ss) {
  var sh = ss.getSheetByName(TABS.receipt);
  SpreadsheetApp.flush();
  RECEIPT_TYPED.forEach(function (a) {
    var c = sh.getRange(a), num = /^[DE]3[0-2]$/.test(a);
    c.setValue(num ? (Number(c.getValue()) || 0) : c.getDisplayValue());
  });
  var trav = sh.getRange('A16:F27'), v = trav.getDisplayValues();
  trav.clearContent(); trav.setValues(v);
  var list = function (items) { return SpreadsheetApp.newDataValidation().requireValueInList(items, true).setAllowInvalid(true).build(); };
  var tours = ss.getSheetByName(TABS.settings).getRange('A2:B20').getValues().filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return 'Code: ' + String(r[0]).trim() + ' – ' + r[1]; }).concat(['Transport only']);
  var rides = [];
  TRANSFERS.forEach(function (t) { rides.push(t); if (goesDown_(t)) rides.push(t + ' + Luang Prabang train station'); });
  sh.getRange('B12').setDataValidation(list(tours));
  sh.getRange('F11').setDataValidation(list(NB_PAY));
  sh.getRange('C31').setDataValidation(list(rides));
  sh.getRange('D16:D27').setDataValidation(list(FOODS));
  ss.toast('Type over any line of the receipt (Booking ID and receipt number stay). Untick or pick another booking to go back to the booking.', 'Edit on the receipt', 10);
}

// I12 shows the picked booking's drop-off (empty when it has no ride back to Luang Prabang).
function showDropoff_(ss, id) {
  var bk = ss.getSheetByName(TABS.bookings), at = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).indexOf(id);
  var cell = ss.getSheetByName(TABS.receipt).getRange('I12');
  if (at < 1 || !goesDown_(String(bk.getRange(at + 1, BOOKING_COLS.indexOf('Transfer') + 1).getValue()))) { cell.clearContent(); return; }
  cell.setValue(bk.getRange(at + 1, BOOKING_COLS.indexOf('Train station drop-off') + 1).getValue() === 'Yes' ? 'Train station' : 'City center');
}

// I15 / I16 show the picked booking's return date and time (empty when it has no ride back to Luang Prabang).
function showReturn_(ss, id) {
  var bk = ss.getSheetByName(TABS.bookings), at = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).indexOf(id);
  var sh = ss.getSheetByName(TABS.receipt);
  if (at < 1 || !goesDown_(String(bk.getRange(at + 1, BOOKING_COLS.indexOf('Transfer') + 1).getValue()))) { sh.getRange('I15:I16').clearContent(); return; }
  var d = bk.getRange(at + 1, BOOKING_COLS.indexOf('Return date') + 1).getValue();
  if (d instanceof Date) sh.getRange('I15').setValue(d); else sh.getRange('I15').clearContent();
  sh.getRange('I16').setValue(returnTime_(bk.getRange(at + 1, BOOKING_COLS.indexOf('Transport remark') + 1).getValue()));
}

// Return date / time changed on the Receipt tab: saved in the booking (Return date; the time in Transport remark), so the
// receipt, the Transport list and the minivan team message all show it.
function receiptReturn_(ss) {
  var sh = ss.getSheetByName(TABS.receipt), id = String(sh.getRange('B1').getValue()).trim();
  var bk = ss.getSheetByName(TABS.bookings), at = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).indexOf(id);
  if (at < 1) { ss.toast('Pick a booking from Bookings first.', 'Return', 6); return; }
  if (!goesDown_(String(bk.getRange(at + 1, BOOKING_COLS.indexOf('Transfer') + 1).getValue()))) {
    sh.getRange('I15:I16').clearContent(); ss.toast('This booking has no minivan back to Luang Prabang. Change its Transfer in Bookings first.', 'Return', 8); return;
  }
  var d = sh.getRange('I15').getValue(), time = String(sh.getRange('I16').getValue()).trim();
  if (d instanceof Date) bk.getRange(at + 1, BOOKING_COLS.indexOf('Return date') + 1).setValue(d);
  if (time) {
    if (!TIME_RE.test(time)) { ss.toast('Type the time like 10:30 AM or 3:30-4:30 PM.', 'Return', 8); return; }
    var rc = bk.getRange(at + 1, BOOKING_COLS.indexOf('Transport remark') + 1), was = String(rc.getValue());
    rc.setValue(TIME_RE.test(was) ? was.replace(TIME_RE, time) : (was ? was + ' | ' : '') + 'Minivan back ' + time);
  }
  sh.getRange('F2').clearContent();   // a typed return time at the top would hide the booking's
  SpreadsheetApp.flush();
  buildTransport_(ss);
  ss.toast('Return saved in the booking' + (d instanceof Date ? ': ' + Utilities.formatDate(d, TIME_ZONE, 'dd/MM/yyyy') : '') + (time ? ' ' + time : '') +
    '. Transport and the minivan message follow.', 'Return', 8);
}

// Drop-off picked on the Receipt tab: saved in the booking, the transport amount worked out again, Transport redrawn.
function receiptDropoff_(ss) {
  var sh = ss.getSheetByName(TABS.receipt), id = String(sh.getRange('B1').getValue()).trim(), want = String(sh.getRange('I12').getValue());
  var bk = ss.getSheetByName(TABS.bookings), at = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).indexOf(id);
  if (at < 1 || !want) { ss.toast('Pick a booking from Bookings first.', 'Drop-off', 6); return; }
  if (!goesDown_(String(bk.getRange(at + 1, BOOKING_COLS.indexOf('Transfer') + 1).getValue()))) {
    sh.getRange('I12').clearContent(); ss.toast('This booking has no minivan back to Luang Prabang. Change its Transfer in Bookings first.', 'Drop-off', 8); return;
  }
  bk.getRange(at + 1, BOOKING_COLS.indexOf('Train station drop-off') + 1).setValue(want === 'Train station' ? 'Yes' : 'No');
  fillAmounts_(ss, at + 1, true);   // transfer kip with or without the train extra
  SpreadsheetApp.flush();
  refreshReceiptAmounts_(ss);
  buildTransport_(ss);
  ss.toast(want === 'Train station' ? 'Drop-off: Luang Prabang train station. The extra was added to the transport amount.' : 'Drop-off: city center. The train station extra was removed.', 'Drop-off', 8);
}

// What was typed on the Receipt tab for the previous booking (paid amount, times, manual lines) does not carry to the next one.
function clearReceiptManual_(ss) {
  var sh = ss.getSheetByName(TABS.receipt);
  sh.getRange('B3').clearContent(); sh.getRange('D2').clearContent(); sh.getRange('F2').clearContent(); sh.getRange(RECEIPT_MANUAL).clearContent();
  sh.getRange(RECEIPT_TRAV).clearContent(); sh.getRange(RECEIPT_TRANSPORT).clearContent();
  writeReceiptTravellers_(ss, sh);   // a typed-over traveller row (typed travellers) goes back to formulas
}

// The number is issued when the booking is picked, usually before the deposit is typed: keep the log's amounts current.
function refreshReceiptAmounts_(ss) {
  var sh = ss.getSheetByName(TABS.receipt), log = ss.getSheetByName(TABS.receiptLog);
  var id = String(sh.getRange('B1').getValue()).trim();
  if (!id || log.getLastRow() < 2) return;
  var ids = log.getRange(2, 3, log.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] !== id) continue;
    SpreadsheetApp.flush();
    var v = sh.getRange('D33:E35').getValues();   // total, deposit, balance (USD, kip)
    log.getRange(i + 2, 5, 1, 4).setValues([[v[0][0], v[0][1], v[1][0], v[2][0]]]);
    return;
  }
}

function numberPickedReceipt_(ss) {
  var id = String(ss.getSheetByName(TABS.receipt).getRange('B1').getValue()).trim();
  if (!id) return;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    fillMissingFor_(ss, id);
    if (ss.getSheetByName(TABS.receipt).getRange(RECEIPT_EDIT).getValue() === true) setupReceipt_(ss);   // a typed receipt goes back to the booking
    clearReceiptManual_(ss);   // typed changes belong to the receipt that was open before
    showDropoff_(ss, id); showReturn_(ss, id);
    var r = issueReceipt_(ss, id);
    if (r.isNew) buildTransport_(ss);   // the team message in Transport shows the new number
    ss.toast(r.isNew ? 'Receipt ' + r.no + ' issued. Click "Download PDF" to send it.' : 'This booking has receipt ' + r.no + '.', 'Receipts', 6);
  } catch (err) {
    ss.toast(String(err.message || err), 'Receipt not numbered', 10);
  } finally { lock.releaseLock(); }
}

function issueReceipt() {
  var ss = SpreadsheetApp.getActive(), ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var id = String(ss.getSheetByName(TABS.receipt).getRange('B1').getValue()).trim();
    var r = issueReceipt_(ss, id);
    if (r.isNew) buildTransport_(ss);
    SpreadsheetApp.flush();
    ui.alert(r.isNew ? 'Receipt ' + r.no + ' issued. Click "Download PDF" in the Receipt tab.' :
      'This booking already has receipt ' + r.no + '. Nothing changed; the receipt tab shows it.');
  } catch (e) {
    ui.alert(String(e.message || e));
  } finally { lock.releaseLock(); }
}

// From the Bookings tab: click any cell in the booking's row, then this item.
function receiptForSelectedBooking() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getActiveSheet();
  if (sh.getName() !== TABS.bookings || sh.getActiveRange().getRow() < 2) {
    SpreadsheetApp.getUi().alert('Click a cell in a booking row on the Bookings tab first.'); return;
  }
  var id = sh.getRange(sh.getActiveRange().getRow(), 1).getValue();
  var r = ss.getSheetByName(TABS.receipt);
  r.getRange('B1').setValue(id);
  ss.setActiveSheet(r);
  numberPickedReceipt_(ss);   // a script write does not fire onEdit
}

// Status "Paid" in Bookings, with nothing typed on the receipt, must show the receipt as paid in full.
function receiptPaidSelfTest_(ss, sh, id) {
  var bk = ss.getSheetByName(TABS.bookings), ids = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return r[0]; });
  var st = bk.getRange(ids.indexOf(id) + 1, BOOKING_COLS.indexOf('Status') + 1), was = st.getValue();
  try {
    sh.getRange('B3').clearContent(); st.setValue('Paid'); SpreadsheetApp.flush();
    return Math.abs(sh.getRange('D35').getValue()) < 0.005 && sh.getRange('A34').getDisplayValue() === 'Bezahlt' &&
      sh.getRange('F34').getDisplayValue() === '✓ BEZAHLT';
  } finally { st.setValue(was); }
}

// Typed lines replace the booking's: transport amount, lunch, pickup and return text; return time defaults from the booking.
function receiptManualSelfTest_(ss, sh) {
  var was = sh.getRange(RECEIPT_MANUAL).getValues();
  try {
    sh.getRange('I2').setValue('Manual pickup line'); sh.getRange('I3').setValue('Manual return line'); sh.getRange('I5').setValue(123000);
    sh.getRange('I6').setValue('Pad Thai x2'); sh.getRange('I7').setValue(138000); SpreadsheetApp.flush();
    var ok = sh.getRange('B13').getDisplayValue() === 'Manual pickup line' && sh.getRange('B14').getDisplayValue() === 'Manual return line' &&
      sh.getRange('E31').getValue() === 123000 && sh.getRange('C32').getDisplayValue() === 'Pad Thai x2' && sh.getRange('E32').getValue() === 138000;
    sh.getRange('I8').setValue('Typed Name'); sh.getRange('I9').setValue(new Date(2030, 1, 3, 12)); sh.getRange('I10').setValue('Typed tour'); sh.getRange('I11').setValue('Kip cash');
    SpreadsheetApp.flush();
    ok = ok && sh.getRange('B10').getDisplayValue() === 'Typed Name' && sh.getRange('B11').getDisplayValue() === '03/02/2030' &&
      sh.getRange('B12').getDisplayValue() === 'Typed tour' && sh.getRange('F11').getDisplayValue() === 'Kip cash';
    return ok;
  } finally { sh.getRange(RECEIPT_MANUAL).setValues(was); SpreadsheetApp.flush(); }
}

function receiptEditSelfTest_(ss, sh) {
  try {
    var name = sh.getRange('B10').getDisplayValue(), total = Number(sh.getRange('E33').getValue()), was = Number(sh.getRange('E31').getValue());
    sh.getRange(RECEIPT_EDIT).setValue(true); receiptUnlock_(ss);
    if (sh.getRange('B10').getFormula() || sh.getRange('B10').getDisplayValue() !== name) return false;
    sh.getRange('B10').setValue('Typed over'); sh.getRange('E31').setValue(was + 1000); SpreadsheetApp.flush();
    var ok = Number(sh.getRange('E33').getValue()) === total + 1000 && sh.getRange('F9').getFormula() !== '' && sh.getRange('B16').getDisplayValue() !== '';
    sh.getRange(RECEIPT_EDIT).setValue(false); setupReceipt_(ss); SpreadsheetApp.flush();
    return ok && sh.getRange('B10').getDisplayValue() === name && sh.getRange('B10').getFormula() !== '' && sh.getRange(RECEIPT_EDIT).getValue() === false;
  } catch (e) { return 'error: ' + e; }
}

// A food typed on traveller 1's receipt row reaches Travellers and the booking; the cell is a formula again afterwards.
function receiptTravellerEditSelfTest_(ss, sh, id) {
  var cell = sh.getRange('D16');
  cell.setValue('No pork'); receiptTravellerEdit_(ss, cell); SpreadsheetApp.flush();
  var bk = ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[0];
  var ok = cell.getFormula() !== '' && cell.getDisplayValue() === 'No pork' && bk[BOOKING_COLS.indexOf('Food')] === 'No pork 1, Regular 1';
  cell.setValue('Vegetarian'); receiptTravellerEdit_(ss, cell); SpreadsheetApp.flush();
  return ok && cell.getDisplayValue() === 'Vegetarian';
}

// The sample booking (round trip back 18/01/2030) is moved to 20/01 at 3:30-4:30 PM from the receipt, checked in Bookings, the
// receipt and the transport text, then put back.
function receiptReturnSelfTest_(ss, sh, id) {
  var bk = ss.getSheetByName(TABS.bookings), at = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).indexOf(id);
  var dc = bk.getRange(at + 1, BOOKING_COLS.indexOf('Return date') + 1), rc = bk.getRange(at + 1, BOOKING_COLS.indexOf('Transport remark') + 1);
  var wasD = dc.getValue(), wasR = rc.getValue(), wasT = sh.getRange(RECEIPT_TRANSPORT).getValue();
  try {
    showReturn_(ss, id); if (dayKey_(sh.getRange('I15').getValue()) !== '2030-01-18' || sh.getRange('I16').getValue() !== '10:00-10:30 AM') return false;
    sh.getRange('I15').setValue(new Date(2030, 0, 20, 12)); sh.getRange('I16').setValue('3:30-4:30 PM'); receiptReturn_(ss); SpreadsheetApp.flush();
    var ok = dayKey_(dc.getValue()) === '2030-01-20' && String(rc.getValue()).indexOf('3:30-4:30 PM') !== -1 &&
      sh.getRange('B14').getDisplayValue().indexOf('20/01/2030 3:30-4:30 PM') !== -1;
    sh.getRange(RECEIPT_TRANSPORT).setValue('Private minivan'); SpreadsheetApp.flush();
    return ok && sh.getRange('C31').getDisplayValue() === 'Private minivan' && returnTime_('Minivan back 2 PM') === '2 PM';
  } finally { dc.setValue(wasD); rc.setValue(wasR); sh.getRange(RECEIPT_TRANSPORT).setValue(wasT); showReturn_(ss, id); }
}

function receiptDropoffSelfTest_(ss, sh, id) {
  var k = kipPrices_(ss), was = sh.getRange('I12').getValue();
  try {
    showDropoff_(ss, id); if (sh.getRange('I12').getValue() !== 'Train station') return false;
    sh.getRange('I12').setValue('City center'); receiptDropoff_(ss); SpreadsheetApp.flush();
    var city = sh.getRange('E31').getValue() === k.round && sh.getRange('B14').getDisplayValue().indexOf('Bahnhof') === -1;
    sh.getRange('I12').setValue('Train station'); receiptDropoff_(ss); SpreadsheetApp.flush();
    return city && sh.getRange('E31').getValue() === k.round + k.train;
  } finally { sh.getRange('I12').setValue(was); }
}

// A Booking ID that is not in Bookings: empty lines (no column headings, no 30/12/1899) and the travellers typed by hand.
function receiptNoBookingSelfTest_(sh) {
  var was = sh.getRange('B1').getValue();
  try {
    sh.getRange('B1').setValue('SELFTEST-NOBOOKING'); sh.getRange('L16:N16').setValues([['Typed Guest', 'X1', 'Regular']]); SpreadsheetApp.flush();
    return sh.getRange('B10').getDisplayValue() === '' && sh.getRange('B11').getDisplayValue() === '' && sh.getRange('B12').getDisplayValue() === '' &&
      sh.getRange('B16').getDisplayValue() === 'Typed Guest' && sh.getRange('C30').getDisplayValue().indexOf('1 ') === 0 && sh.getRange('F12').getDisplayValue() === 'SELFTEST-NOBOOKING';
  } finally { sh.getRange(RECEIPT_TRAV).clearContent(); sh.getRange('B1').setValue(was); SpreadsheetApp.flush(); }
}

function receiptSelfTest_(ss, id) {
  var sh = ss.getSheetByName(TABS.receipt), keep = sh.getRange('B1:B3').getValues(), log = ss.getSheetByName(TABS.receiptLog);
  var keepTyped = sh.getRange(RECEIPT_MANUAL).getValues(), keepTrav = sh.getRange(RECEIPT_TRAV).getValues(), keepTimes = [sh.getRange('D2').getValue(), sh.getRange('F2').getValue()];   // what staff typed on the receipt is theirs
  try {
    sh.getRange(RECEIPT_MANUAL).clearContent(); sh.getRange(RECEIPT_TRAV).clearContent(); sh.getRange('D2').clearContent(); sh.getRange('F2').clearContent();
    sh.getRange('B1').setValue(id); sh.getRange('B2').setValue('Deutsch'); sh.getRange('B3').setValue(10);
    SpreadsheetApp.flush();
    var rate = receiptRate_(ss), draft = sh.getRange('F9').getDisplayValue(), title = sh.getRange('A9').getDisplayValue();
    var r1 = issueReceipt_(ss, id), r2 = issueReceipt_(ss, id);   // second call must not issue a new number
    SpreadsheetApp.flush();
    var k = kipPrices_(ss), wantKip = Math.round(60 * rate) + (k.round + k.train) + 65000;
    var kip = sh.getRange('E33').getValue(), bal = sh.getRange('D35').getValue();
    var trav = sh.getRange('B16').getDisplayValue() + sh.getRange('C16').getDisplayValue();
    var lookup = ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[0] || [];
    var c = { draft: draft === 'ENTWURF', title: title === 'QUITTUNG', no6: /^\d{6}$/.test(r1.no), first: r1.isNew, second: !r2.isNew && r2.no === r1.no,
      shown: sh.getRange('F9').getDisplayValue() === r1.no, kip: kip === wantKip, bal: Math.abs(bal - (60 + (k.round + k.train + 65000) / rate - 10)) < 0.01,
      agree: agreementSelfTest_(ss, id, r1.key) === true, lunchLink: lunchSelfTest_(ss, id, r1.key) === true,
      eachPays: sh.getRange('F16').getDisplayValue().indexOf(' / ') !== -1 && sh.getRange('E16').getDisplayValue() === '' && sh.getRange('E17').getDisplayValue() === 'Avocado sandwich',
      ret: sh.getRange('A14').getDisplayValue() === 'Rückfahrt:' && sh.getRange('B14').getDisplayValue().indexOf('Bahnhof Luang Prabang') !== -1 &&
        sh.getRange('C31').getDisplayValue().indexOf('Bahnhof Luang Prabang') !== -1,
      all: allGuestsSelfTest_(ss, id),
      trav: trav.indexOf('Test Person') !== -1, lookup: lookup[BOOKING_COLS.indexOf('Receipt No')] === r1.no,
      dropoff: receiptDropoffSelfTest_(ss, sh, id), ret: receiptReturnSelfTest_(ss, sh, id), travEdit: receiptTravellerEditSelfTest_(ss, sh, id), edit: receiptEditSelfTest_(ss, sh), manual: receiptManualSelfTest_(ss, sh), nobooking: receiptNoBookingSelfTest_(sh), paid: receiptPaidSelfTest_(ss, sh, id), file: receiptFileName_('000002', 'Adam D/E: "X"') === 'No 000002 Adam D E X.pdf' };
    var failed = Object.keys(c).filter(function (k) { return !c[k]; });
    return failed.length ? 'failed: ' + failed.join(',') + ' | draft=' + draft + ' title=' + title + ' kip=' + kip + '/' + wantKip + ' lines=' + [sh.getRange('E30').getValue(), sh.getRange('E31').getValue(), sh.getRange('E32').getValue()].join('/') +
      ' prices=' + [k.one, k.round, k.train, rate].join('/') + ' stored=' + [lookup[BOOKING_COLS.indexOf('Est. tour USD')], lookup[BOOKING_COLS.indexOf('Est. transfer kip')], lookup[BOOKING_COLS.indexOf('Lunch kip')]].join('/') + ' bal=' + bal + ' trav=' + trav : true;
  } catch (e) {
    return 'error: ' + e;
  } finally {
    sh.getRange('B1:B3').setValues(keep); sh.getRange(RECEIPT_MANUAL).setValues(keepTyped); sh.getRange(RECEIPT_TRAV).setValues(keepTrav);
    sh.getRange('D2').setValue(keepTimes[0]); sh.getRange('F2').setValue(keepTimes[1]);
    withoutFilter_(log, function () { for (var i = log.getLastRow(); i >= 2; i--) if (String(log.getRange(i, 3).getValue()).indexOf('SELFTEST-') === 0) log.deleteRow(i); });
    var ag = ss.getSheetByName(TABS.agreements);
    withoutFilter_(ag, function () { for (var j = ag.getLastRow(); j >= 2; j--) if (String(ag.getRange(j, 2).getValue()).indexOf('SELFTEST-') === 0) ag.deleteRow(j); });
  }
}

/* ---------- Tour acknowledgment & agreement form (website page /agreement/, opened with a private link per booking) ---------- */

var AGREEMENT_COLS = ['Submitted at', 'Booking ID', 'Receipt No', 'Tour date', 'Tour', 'Traveller #', 'Full name', 'Gender', 'Nationality',
  'Passport no', 'Photo permission', 'Medical / allergies', 'Emergency contact', 'Emergency phone', 'Insurance no', 'Signed name',
  'Language', 'Form version', 'Staff checked'];
var AGREEMENT_VERSION = 'v1 2026-10-11';

function setupAgreements_(ss) {
  setupTable_(ss, TABS.agreements, AGREEMENT_COLS, {}, FORMATS.Agreements);
  var sh = ss.getSheetByName(TABS.agreements);
  sh.setColumnWidth(7, 180); sh.setColumnWidth(12, 220); sh.setColumnWidth(16, 180);
  sh.showColumns(1, sh.getMaxColumns());   // every answer of the form has its column; none stays hidden
  var pc = colLetter_(AGREEMENT_COLS.indexOf('Photo permission') + 1), no = '=$' + pc + '2="No"', yes = '=$' + pc + '2="Yes"';
  var kept = sh.getConditionalFormatRules().filter(function (r) { var b = r.getBooleanCondition(); var f = b && b.getCriteriaValues()[0]; return f !== no && f !== yes; });
  var area = sh.getRange(2, AGREEMENT_COLS.indexOf('Photo permission') + 1, sh.getMaxRows() - 1, 1);
  sh.setConditionalFormatRules(kept.concat([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(no).setBackground('#f4cccc').setFontColor('#9c1c1c').setBold(true).setRanges([area]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(yes).setBackground('#d9ead3').setRanges([area]).build()]));
  sh.getRange(1, AGREEMENT_COLS.indexOf('Photo permission') + 1).setNote('Photo permission from the form: Yes = photos/videos may be used for marketing and social media, No = not allowed (shown red).');
}

// The link's secret code -> booking (only receipts that were issued have one).
function agreementHit_(ss, key) {
  if (!/^[a-f0-9]{16}$/.test(String(key || ''))) return null;
  var log = ss.getSheetByName(TABS.receiptLog);
  if (log.getLastRow() < 2) return null;
  var rows = log.getRange(2, 1, log.getLastRow() - 1, RECEIPT_LOG_COLS.length).getDisplayValues();
  for (var i = 0; i < rows.length; i++) if (rows[i][RECEIPT_LOG_COLS.indexOf('Form key')] === key) return { receipt: rows[i][0], id: rows[i][2] };
  return null;
}

function dayText_(v) { return v instanceof Date ? Utilities.formatDate(v, TIME_ZONE, 'dd/MM/yyyy') : String(v == null ? '' : v); }

function agreementTravellers_(ss, id) {
  var sh = ss.getSheetByName(TABS.travellers);
  if (sh.getLastRow() < 2) return [];
  var ix = function (c) { return TRAVELLER_COLS.indexOf(c); };
  return sh.getRange(2, 1, sh.getLastRow() - 1, ix('Food') + 1).getValues().filter(function (r) { return r[0] === id; }).map(function (r) {
    return { n: Number(r[ix('Traveller #')]), first: String(r[ix('First name')]), last: String(r[ix('Last name')]), full: String(r[ix('Full name')]),
      gender: String(r[ix('Gender')]), nat: String(r[ix('Country')]), pass: String(r[ix('Passport no')]),
      issued: dayText_(r[ix('Passport issued')]), expires: dayText_(r[ix('Passport expires')]) };
  });
}

function agreementSigned_(ss, id) {
  var sh = ss.getSheetByName(TABS.agreements);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, AGREEMENT_COLS.indexOf('Traveller #') + 1).getValues()
    .filter(function (r) { return r[1] === id; }).map(function (r) { return Number(r[AGREEMENT_COLS.indexOf('Traveller #')]); });
}

function agreementJson_(ss, key) {
  var hit = agreementHit_(ss, key);
  if (!hit) return JSON.stringify({ error: 'invalid' });
  var bk = ss.getSheetByName(TABS.bookings), v = bk.getDataRange().getValues(), at = -1;
  for (var i = 1; i < v.length; i++) if (v[i][0] === hit.id) { at = i; break; }
  if (at < 0) return JSON.stringify({ error: 'invalid' });
  var b = function (c) { return v[at][BOOKING_COLS.indexOf(c)]; };
  return JSON.stringify({ receipt: hit.receipt, date: dayText_(b('Tour date')), tour: String(b('Tour')), tourName: String(b('Tour name')),
    travellers: agreementTravellers_(ss, hit.id), signed: agreementSigned_(ss, hit.id) });
}

// d: { key, lang, people: [{ n, photo, medical, ecName, ecPhone, insurance, signedName, accept }] }; returns how many were saved
function saveAgreement_(ss, d) {
  var hit = agreementHit_(ss, d.key);
  if (!hit) throw new Error('agreement: bad key');
  var bk = ss.getSheetByName(TABS.bookings).getDataRange().getValues().filter(function (r) { return r[0] === hit.id; })[0];
  var trav = agreementTravellers_(ss, hit.id), done = agreementSigned_(ss, hit.id), saved = 0;
  (Array.isArray(d.people) ? d.people : []).forEach(function (p) {
    var t = trav.filter(function (x) { return x.n === Number(p.n); })[0];
    if (!t || done.indexOf(t.n) !== -1) return;
    var signedName = clean_(p.signedName, 80), ecName = clean_(p.ecName, 80), ecPhone = clean_(p.ecPhone, 40);
    if (p.accept !== true || (p.photo !== 'yes' && p.photo !== 'no') || signedName.length < 2 || !ecName || !ecPhone) return;
    addRow_(ss, TABS.agreements, AGREEMENT_COLS, {
      'Submitted at': new Date(), 'Booking ID': hit.id, 'Receipt No': text_(hit.receipt), 'Tour date': bk[BOOKING_COLS.indexOf('Tour date')],
      'Tour': text_(String(bk[BOOKING_COLS.indexOf('Tour')])), 'Traveller #': t.n, 'Full name': t.full, 'Gender': t.gender, 'Nationality': t.nat,
      'Passport no': t.pass ? text_(t.pass) : '', 'Photo permission': p.photo === 'yes' ? 'Yes' : 'No', 'Medical / allergies': clean_(p.medical, 500),
      'Emergency contact': ecName, 'Emergency phone': text_(ecPhone), 'Insurance no': clean_(p.insurance, 60), 'Signed name': signedName,
      'Language': clean_(d.lang, 5), 'Form version': AGREEMENT_VERSION
    });
    saved++;
  });
  return saved;
}

// Opens the link's data, signs traveller 1 only (traveller 2 has no emergency contact), tries to sign again, and checks the rules.
function agreementSelfTest_(ss, id, key) {
  var j = JSON.parse(agreementJson_(ss, key));
  var badKey = JSON.parse(agreementJson_(ss, '0123456789abcdef')).error === 'invalid';
  var people = [{ n: 1, photo: 'yes', medical: 'none', ecName: 'Contact', ecPhone: '+856 1', insurance: '', signedName: 'Test Person', accept: true },
    { n: 2, photo: 'no', ecName: '', ecPhone: '', signedName: 'Second Person', accept: true }];
  var first = saveAgreement_(ss, { key: key, lang: 'en', people: people }), again = saveAgreement_(ss, { key: key, lang: 'en', people: people });
  var after = JSON.parse(agreementJson_(ss, key));
  var wrongKey = false;
  try { saveAgreement_(ss, { key: '0123456789abcdef', people: people }); } catch (e) { wrongKey = true; }
  return j.travellers.length === 2 && j.travellers[0].first === 'Test' && j.signed.length === 0 && badKey && first === 1 && again === 0 &&
    after.signed.length === 1 && after.signed[0] === 1 && wrongKey;
}

/* ---------- Takeaway lunch ordered after booking (website page /lunch/, same private link code as the agreement form) ----------
   The guest sees the travellers (first names) with what each has ordered, picks dishes from the Lunch menu and sends. It is saved on
   the travellers (Takeaway lunch, Lunch kip at the menu price) and the booking is re-counted, so the receipt and the Lunch report follow. */
function lunchJson_(ss, key) {
  var hit = agreementHit_(ss, key);
  if (!hit) return JSON.stringify({ error: 'invalid' });
  var bk = ss.getSheetByName(TABS.bookings), v = bk.getDataRange().getValues(), at = -1;
  for (var i = 1; i < v.length; i++) if (v[i][0] === hit.id) { at = i; break; }
  if (at < 0) return JSON.stringify({ error: 'invalid' });
  var b = function (c) { return v[at][BOOKING_COLS.indexOf(c)]; };
  var tr = ss.getSheetByName(TABS.travellers), ix = function (c) { return TRAVELLER_COLS.indexOf(c); }, people = [];
  if (tr.getLastRow() > 1) tr.getRange(2, 1, tr.getLastRow() - 1, TRAVELLER_COLS.length).getValues().forEach(function (r) {
    if (r[0] !== hit.id || String(r[ix('Status')]) === 'Cancelled') return;
    var m = /^(.*?)(?:\s*\((.*)\))?$/.exec(String(r[ix('Takeaway lunch')]).trim());
    people.push({ n: Number(r[ix('Traveller #')]), first: String(r[ix('First name')]) || String(r[ix('Full name')]), lunch: m[1], choice: m[2] || '' });
  });
  return JSON.stringify({ date: dayText_(b('Tour date')), tour: String(b('Tour')), tourName: String(b('Tour name')), menu: lunchMenuJson_(ss), travellers: people });
}

// d: { key, people: [{ n, lunch, choice }] }; a dish not on the menu (or empty) clears the order. Returns how many travellers were set.
function saveLunch_(ss, d) {
  var hit = agreementHit_(ss, d.key);
  if (!hit) throw new Error('lunch: bad key');
  var tr = ss.getSheetByName(TABS.travellers), menu = lunchMap_(ss), ix = function (c) { return TRAVELLER_COLS.indexOf(c); }, saved = 0;
  if (tr.getLastRow() < 2) return 0;
  var rows = tr.getRange(2, 1, tr.getLastRow() - 1, ix('Traveller #') + 1).getValues();
  (Array.isArray(d.people) ? d.people : []).slice(0, 30).forEach(function (p) {
    var n = Number(p.n), at = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i][0] === hit.id && Number(rows[i][ix('Traveller #')]) === n) { at = i + 2; break; }
    if (at < 0) return;
    var dish = clean_(p.lunch, 80), item = menu[dish], choice = clean_(p.choice, 40);
    var text = item ? dish + (item.choices.indexOf(choice) !== -1 ? ' (' + choice + ')' : '') : '';
    tr.getRange(at, ix('Takeaway lunch') + 1).setValue(text);
    tr.getRange(at, ix('Lunch kip') + 1).setValue(item ? item.price : '');
    saved++;
  });
  if (saved) syncLunch_(ss, hit.id);
  return saved;
}

// Orders a dish for traveller 1 through the link, reads it back, then clears it.
function lunchSelfTest_(ss, id, key) {
  var menu = lunchMap_(ss), dish = Object.keys(menu).filter(function (k) { return menu[k].choices.length; })[0];
  if (!dish) return 'no dish with choices';
  var choice = menu[dish].choices[0];
  var before = JSON.parse(lunchJson_(ss, key));
  if (!before.travellers || before.travellers.length !== 2 || !before.menu.length) return 'json';
  var n = saveLunch_(ss, { key: key, people: [{ n: 1, lunch: dish, choice: choice }] });
  var after = JSON.parse(lunchJson_(ss, key)), t1 = after.travellers.filter(function (x) { return x.n === 1; })[0];
  var bk = ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[0];
  var ok = n === 1 && t1 && t1.lunch === dish && t1.choice === choice && bk[BOOKING_COLS.indexOf('Takeaway lunch')].indexOf(dish + ' (' + choice + ') 1') !== -1 &&
    JSON.parse(lunchJson_(ss, '0123456789abcdef')).error === 'invalid';
  saveLunch_(ss, { key: key, people: [{ n: 1, lunch: '' }] });
  return ok ? true : 'order: ' + (t1 && t1.lunch) + ' / ' + bk[BOOKING_COLS.indexOf('Takeaway lunch')];
}

/* ---------- All guests: one row per traveller with the booking beside it (read-only view) ---------- */

function setupAllGuests_(ss) {
  var sh = ss.getSheetByName(TABS.allGuests) || ss.insertSheet(TABS.allGuests);
  var from = sh.getRange('B2').getValue();
  sh.clear(); sh.clearConditionalFormatRules();
  var T = function (c) { return 'Travellers!$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1) + '$2:$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var lastB = colLetter_(BOOKING_COLS.length);
  var V = function (c) { return 'ARRAYFORMULA(IFERROR(VLOOKUP(Travellers!$A$2:$A,Bookings!$A$2:$' + lastB + ',' + (BOOKING_COLS.indexOf(c) + 1) + ',FALSE),""))'; };
  var cols = [   // [header, formula part, number format]
    ['Tour date', T('Tour date'), 'dd/mm/yyyy'], ['Tour', T('Tour'), '@'], ['Name', T('Full name')], ['Country', T('Country')], ['Gender', T('Gender')],
    ['Passport no', T('Passport no'), '@'], ['Passport expires', T('Passport expires'), 'dd/mm/yyyy'], ['Food', T('Food')],
    ['Takeaway lunch', T('Takeaway lunch')], ['Pickup place', stayingPlace_(T('Pickup place'))], ['Booking ID', T('Booking ID')], ['Receipt No', T('Receipt No')],
    ['Status', T('Status')], ['People in booking', V('People')], ['Transfer', V('Transfer')], ['Pickup date', V('Pickup date'), 'dd/mm/yyyy'],
    ['Return date', V('Return date'), 'dd/mm/yyyy'], ['Train station drop-off', V('Train station drop-off')], ['Payment method', V('Payment method')],
    ['Est. tour USD', V('Est. tour USD'), '#,##0'], ['Amount paid USD', V('Amount paid USD'), '#,##0.00'], ['Source', V('Source')]];
  sh.getRange('A1').setValue('All guests: one row per traveller, with the booking details beside them. Read-only: change things in Bookings or Travellers.')
    .setFontWeight('bold').setFontSize(13);
  sh.getRange('A2').setValue('Show tours from (empty = all):').setFontWeight('bold');
  sh.getRange('B2').setValue(from || '').setNumberFormat('dd/mm/yyyy').setBackground('#fff2a8').setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange('C2').setValue('Soonest tour first; guests without a tour date at the end. Use Data > Create a filter to search or filter any column.').setFontColor('#5a665f');
  sh.getRange(4, 1, 1, cols.length).setValues([cols.map(function (c) { return c[0]; })]).setFontWeight('bold').setBackground('#e8f0ea').setWrap(true);
  var arr = '{' + cols.map(function (c) { return c[1]; }).join(',') + '}';
  var cond = '(Travellers!$A$2:$A<>"")*((($B$2="")+(ISNUMBER(' + T('Tour date') + ')*(' + T('Tour date') + '>=$B$2)))>0)';
  sh.getRange('A5').setFormula('=IFERROR(SORT(FILTER(' + arr + ',' + cond + '),1,TRUE),"No guests yet")');
  cols.forEach(function (c, i) { if (c[2]) sh.getRange(5, i + 1, Math.max(sh.getMaxRows() - 4, 1), 1).setNumberFormat(c[2]); });
  freezeRows_(sh, 4); sh.setFrozenColumns(3);
  sh.setColumnWidths(1, cols.length, 110); sh.setColumnWidth(3, 190); sh.setColumnWidth(10, 180); sh.setColumnWidth(9, 160);
}

function allGuestsSelfTest_(ss, id) {
  SpreadsheetApp.flush();
  var sh = ss.getSheetByName(TABS.allGuests), v = sh.getRange(5, 1, Math.max(sh.getLastRow() - 4, 1), 22).getDisplayValues();
  var rows = v.filter(function (r) { return r[10] === id; });
  return rows.length === 2 && rows[0][2] === 'Test Person' && rows[0][3] === 'Germany' && rows[0][13] === '2' && rows[0][14] === 'Round trip';
}

/* ---------- Trip sheet: pick a date, see everyone on tours that day ---------- */

// A traveller with no pickup place takes no minivan from Luang Prabang (walk-ins, no transfer): they stay in Nong Khiaw.
var STAYING = 'Staying in Nong Khiaw';
function stayingPlace_(rng) { return 'ARRAYFORMULA(IF(' + rng + '="","' + STAYING + '",' + rng + '))'; }

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
  var arr = '{' + cols.map(function (c) { return c === 'Pickup place' ? stayingPlace_(T(c)) : T(c); }).join(',') + '}';
  var cond = '(' + T('Tour date') + '>=$B$2)*(' + T('Tour date') + '<$B$2+1)*(' + T('Status') + '<>"Cancelled")*(' + T('Booking ID') + '<>"")';
  // Receipt No ascending (guests without a receipt yet last), then name
  sh.getRange('A16').setFormula('=IFERROR(LET(s,FILTER(' + arr + ',' + cond + '),r,INDEX(s,0,10),n,INDEX(s,0,2),SORT(s,IF(r="",1,0),TRUE,r,TRUE,n,TRUE)),"No travellers on this date")');
  sh.setColumnWidth(1, 250); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 120); sh.setColumnWidth(4, 90);
  sh.setColumnWidth(5, 110); sh.setColumnWidth(6, 200); sh.setColumnWidth(7, 210); sh.setColumnWidth(8, 260);
  sh.setColumnWidth(9, 140); sh.setColumnWidth(10, 100);
  freezeRows_(sh, 15);
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
  freezeRows_(sh, 1); sh.setFrozenColumns(2);
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
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Website').addItem('Update the website now', 'updateWebsiteNow').addToUi();
  ui.createMenu('Receipts').addItem('Receipt for the selected booking', 'receiptForSelectedBooking').addItem('Issue receipt (give it a number)', 'issueReceipt')
    .addItem('Download PDF', 'downloadReceiptPdf').addItem('Print receipt', 'printReceipt').addToUi();
  ui.createMenu('Transport').addItem('Refresh', 'refreshTransport').addToUi();
  ui.createMenu('Bookings').addItem('Sort by tour date', 'sortBookings').addItem('Recalculate amounts of the selected booking (today\'s prices)', 'recalcSelectedBookings')
    .addItem('Remove duplicate rows (saved twice)', 'removeDuplicateRows').addToUi();
  var ss = SpreadsheetApp.getActive();
  sortBookings_(ss);      // earliest tour date at the top
  buildTransport_(ss);    // the list is current whenever the sheet is opened
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
    ['RECEIPTS  (tabs "Receipt", "Receipt log"; rate, name and logo in Settings E8:F12)'],
    ['1. Receipt tab: pick the Booking ID (yellow cell). It gets the next number at once (000001, 000002, ...), saved in the Receipt log and in Bookings > Receipt No. A booking that already has a Receipt No keeps it.'],
    ['2. Pick the language. What the guest paid comes from Bookings: Status "Paid" = paid in full (the receipt shows ✓ PAID), otherwise "Amount paid USD" is the deposit. The yellow "Paid (USD)" cell is only for overriding it. (If the number still says DRAFT, use menu "Receipts" > "Issue receipt".)'],
    ['3. Menu "Receipts" > "Download PDF" saves it as "No 000001 <guest name>.pdf". Send that file to the guest. Balance = tour + transport + food - paid.'],
    ['   Quickest: click "⬇ PDF: download / print" at the top of the Receipt tab (works for everyone, also on a phone). To print for the guest to sign: open it, then Ctrl+P (Cmd+P on a Mac).'],
    ['   Change the receipt by hand: the yellow cells at the right of the Receipt tab (columns H:I) replace the pickup line, the return line, the tour amount, the transport amount (kip), the takeaway lunch text and its amount. Empty = from the booking. Pickup time and Return time (yellow, top) are filled in from the booking (7:30 - 8:00 AM; back 10:00 - 10:30 AM, or 3:30 - 4:30 PM for the 103 "after the tour" return); type to change. Everything typed is cleared when you pick another booking.'],
    ['   Food and Takeaway lunch of one traveller: type or pick them in the traveller rows of the receipt (columns D and E, dropdowns). They are saved on the traveller, so the kitchen\'s Lunch report, the reports, the booking and the amounts follow. (The yellow "Takeaway lunch (text)" cell on the right only changes the wording on this receipt: the kitchen does not see it.)'],
    ['   "Each pays": for a group of 2 or more, the last column of the traveller rows shows what each person pays (USD / kip): tour per person + their share of the transport + their own lunch.'],
    ['   Guests who forgot the takeaway lunch: send them the "Lunch order link" (F3, next to the agreement form). They pick their dishes on the website; the travellers, the booking, this receipt and the Lunch report update by themselves.'],
    ['   Or tick the green "Edit on the receipt" box (I13): every line of the receipt (name, date, tour, pickup, return, payment, travellers and food, transport details and the amounts) becomes text you can type over, with dropdowns for the tour, payment method, transport and food. Totals still add up; the Booking ID and receipt number stay. Untick it, or pick another booking, to go back to the booking. To change the booking itself (Transport, reports), change it in Bookings / Travellers.'],
    ['   Return date and time (green, I15:I16): pick the date from the calendar and the time from the list (or type one, e.g. 2 PM). It changes the booking, so Transport and the minivan message show the new day and time. (The yellow "Return line" only changes the wording on this receipt.)'],
    ['   Transport (text, I14): type or pick the wording for the transport line, e.g. "Private minivan". Only this receipt changes; type the price in "Transport amount kip".'],
    ['   The same yellow cells also replace the Name, Tour date, Tour line and Payment method. A booking that is not in Bookings at all (lost, or never sent): type its Booking ID in B1 anyway, fill the yellow cells and the travellers in "Travellers by hand" (columns L:N); it gets a receipt number like any other. Better: add it in the New booking tab with the same Booking ID, so it also reaches Transport and the reports.'],
    ['   Transport amount empty in the booking or an old price? It is worked out at today\'s prices. To change a booking\'s amounts for good: select its row in Bookings and use menu "Bookings" > "Recalculate amounts" (today\'s prices), or type the amount in Bookings (Est. transfer kip).'],
    ['4. After the receipt, "Open agreement form" (Receipt tab) opens the guests\' tour agreement on the website. Let each guest complete and sign it on a phone or tablet. The answers appear in the "Agreements" tab.'],
    ['   Each traveller can use their own phone: send them the same link (the green button on the form sends it on WhatsApp); each one taps their own name and signs only their part. Everyone on one phone also still works.'],
    [''],
    ['GUIDE REPORT  (tab "Guide report")'],
    ['Everyone on tour tomorrow, for the guide team: take a screenshot and send it. Change the yellow date for another day (empty it = tomorrow again). Pax is on the first row of each booking; the total is at the bottom.'],
    ['"Add. package date" is the day the additional package starts (Tour plans, column "Starts on day": 102 and 103 start theirs on day 2), so the guide for the 001 trip sees which date a 102 guest joins.'],
    ['Package, Day ("Day 2 of 3") and "Plan for the day" are filled in by themselves from the tab "Tour plans": a 102 guest shows on day 2 with the 001 1-Day Tour, a 103 guest on day 2 (Homestay) and day 3 (Jungle Trek). Additional package also comes from "Tour plans" (102: 001 on Day 2, 103: 2D Sopjam + Homestay); type another one, or the Viewpoint, on the booking in Bookings. Private tours say PRIVATE TOUR in Notes.'],
    [''],
    ['LUNCH REPORT  (tab "Lunch report")'],
    ['The takeaway food guests ordered for tomorrow (change the yellow date for another day): booking, name, pax, dish, how many, when it must be ready, special requests (food type, note). Right side: how many of each dish, and the message to copy to The Trio Bar team.'],
    ['A booking taken on WhatsApp: choose the dish per traveller in the New booking tab (column "Takeaway lunch").'],
    [''],
    ['COLLECT ON ARRIVAL  (tab "Collect on arrival")'],
    ['What each guest and each group pays when they arrive in Nong Khiaw: pick the arrival date (and an end date for a range). Each booking is a Group row (what the group pays now, minus what it already paid) with its guests below: tour, takeaway lunch, transport, total in USD and kip. Arrival = the pickup date in Luang Prabang, or the tour date if no minivan. Change amounts in Bookings; lunch per guest in Travellers.'],
    [''],
    ['ARRANGE TOUR  (tabs "Arrange tour", "Tour accounts", "Tour plans")'],
    ['Pick the date and the tour (yellow). Guests, receipt numbers and income come from Bookings; the cost lines (guide, boat, food, kayaks, ...) from "Tour plans", counted for the guests. Type over a quantity or price, or add a line. Tick "Save" to keep date, guests, expense, income and profit in "Tour accounts" (saving the same day and tour again replaces it).'],
    ['Change the usual costs, the day plans or the additional packages in the tab "Tour plans" (only 001 has costs so far: add the lines for 101, 102 and 103).'],
    [''],
    ['TRANSPORT  (tab "Transport")'],
    ['1. Change the yellow date: the minivan list for that day appears. "↑ ຂຶ້ນ" = pickups in Luang Prabang to Nong Khiaw, "↓ ລົງ" = Nong Khiaw back to Luang Prabang. Each list ends with the total pax.'],
    ['2. Take a screenshot and send it to the driver team. When they send the plate numbers, type them in the yellow column (also the remark, the guest\'s WhatsApp number, the Nong Khiaw pickup). It is saved in Bookings.'],
    ['   Guests of one booking picked up at different hotels: each pickup stop gets its own block and its own message for the minivan team (names at that stop, with their WhatsApp). Type a guest\'s own WhatsApp in Travellers, column "Traveller WhatsApp"; otherwise the booker\'s number is shown.'],
    ['3. Click "Message guest": WhatsApp opens with the message for that guest ("Hello Maja! Your minivan to Nong Khiaw is booked for tomorrow. Pickup at ... The plate number is ... Please wait at your hotel reception ..."). Type the transport manager\'s name and WhatsApp number in Settings F13 once: it is added to every message.'],
    ['   A guest who changes the drop-off to Luang Prabang train station (or back to the city center): on the Receipt tab pick it in the green "Drop-off" cell (I12), or in Bookings set "Train station drop-off" to Yes (or No). The extra charge is added to the transport amount, and Transport and the receipt follow at once. (A transport amount typed by hand in Bookings is replaced by the worked-out one; type it again if a special price was agreed.)'],
    ['   A guest who leaves on another day (stays longer, or earlier): type the new date in the yellow date column of their row (Pickup date / Departure date). It is saved in Bookings and the row moves to that day\'s list; the receipt follows.'],
    ['4. A guest who booked one way and now wants to go back: type the Return date in Bookings. The booking becomes "Round trip" and appears in Transport that day. The list also updates when you change dates, status or names in Bookings.'],
    [''],
    ['NEW BOOKING  (tab "New booking")'],
    ['A booking taken on WhatsApp, by phone or at the office: type the yellow cells (tour or "Transport only", dates, minivan, travellers) and tick "Save booking". It is saved like a website booking and shows in Transport, the Trip sheet, the Guide report and the Receipt.'],
    ['A booking the guest sent from the website but that is not in Bookings (the receipt shows nothing): copy the guest\'s whole WhatsApp message, paste it into the yellow box at the bottom of New booking, and tick "Import". It is saved with the guest\'s own Booking ref, with the travellers, passports, transfer and lunch.'],
    ['Guests already in Nong Khiaw who only go back: Minivan transfer "One way to Luang Prabang", the date back and their place in Nong Khiaw.'],
    ['Booking ID: type the guest\'s own reference (from their WhatsApp message) to add a website booking that did not reach the sheet; empty = a new ID. Tour price USD per person and Transport amount kip: type them to use a price agreed with the guest instead of Settings (empty = the usual prices). Pickup place in Nong Khiaw empty = our office inside The Trio Bar & Cafe.'],
    ['Tick "Private tour" for a group that has the tour to itself; it shows in Bookings (column Private tour) and in the Guide report.'],
    [''],
    ['TAKEAWAY LUNCH ADDED LATER, ONE TRAVELLER CANCELLING  (tab "Travellers")'],
    ['A guest orders takeaway food after booking (WhatsApp): in Travellers, choose the dish in the column "Takeaway lunch" on that traveller\'s row (dropdown of the Lunch menu). The price, the booking\'s Takeaway lunch / Lunch kip, the receipt and the Lunch report follow at once.'],
    ['Food for one guest ("No pork", "No fish", ...): in Travellers choose or type it in the Food column on that guest\'s row. The receipt, Trip sheet, Guide report and the booking\'s Food follow.'],
    ['One traveller of a group cancels: choose Cancelled in the column "Traveller status" (far right) on that row. The row turns red, and that person leaves the Trip sheet, Guide report, Lunch report and Transport. The column "Status" before it is automatic (it follows the booking in Bookings).'],
    [''],
    ['CANCELLING A BOOKING'],
    ['In Bookings set Status to "Cancelled". The date is added to Staff notes, the row turns grey and struck through, and the guests leave the Trip sheet, Guide report, Transport and Dashboard totals. Write the reason (e.g. "sick") in Staff notes. Nothing is deleted.'],
    [''],
    ['BOOKINGS  (tabs "Bookings", "Travellers", "Inquiries", "Dashboard")'],
    ['Set Status, Receipt No and Amount paid in "Bookings". The Dashboard updates by itself. Bookings are sorted by tour date (earliest at the top) when the sheet opens and after each website booking; menu "Bookings" > "Sort by tour date" does it any time.'],
    [''],
    ['AGENCY SHARE  (tab "Agency share")'],
    ['One row per group passed to or from another agency: date, package, guests, sending agency, receiving agency, price per person (empty = Settings price), what the sender gets per person, guide name and WhatsApp. Totals and the summary per agency (right side; type a month like 10/2026 in the yellow cell) are worked out by themselves.'],
    ['Guests with no pickup place (walk-ins, no transfer) show as "Staying in Nong Khiaw" in the Trip sheet and All guests.'],
    ['AGREEMENTS  (tab "Agreements")'],
    ['One row per traveller who signed on the website form: name, nationality, passport, Photo permission (No shows red), medical / allergies, emergency contact and phone, insurance no, signed name. It fills by itself; nothing to type.'],
    [''],
    ['A booking or guest saved twice: menu "Bookings" > "Remove duplicate rows". It removes only exact copies and keeps the first one.']
  ];
  sh.getRange(1, 1, lines.length, 1).setValues(lines).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 760);
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  lines.forEach(function (l, i) { if (/^[A-Z][A-Z ]+( {2}\(|$)/.test(l[0])) sh.getRange(i + 1, 1).setFontWeight('bold').setFontColor('#2f6b4f'); });   // section headings
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
  freezeRows_(sh, 1);
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

  freezeRows_(sh, 5);
  sh.setColumnWidths(1, 23, 110);
}

/* ---------- web endpoint ---------- */

function doPost(e) {
  var lock = LockService.getScriptLock();
  var d = JSON.parse(e.postData.contents);
  // A booking or agreement waits up to 5 minutes for another run (a rebuild or self-test takes 2-4) instead of being lost; the
  // guest's WhatsApp message goes out anyway, so a booking that gave up after 20 seconds was simply missing from the sheet.
  // Maintenance runs (selftest, rebuild) only start when nothing else is running.
  if (d.type === 'selftest' || d.type === 'rebuild') { if (!lock.tryLock(1000)) return reply_('busy: try again in a few minutes'); }
  else lock.waitLock(300000);
  try {
    if (d.website) return reply_('ok');  // honeypot field: only bots fill it
    var ss = SpreadsheetApp.getActive();
    if (ss.getSpreadsheetTimeZone() !== TIME_ZONE) ss.setSpreadsheetTimeZone(TIME_ZONE);
    if (d.type === 'booking') {
      saveBooking_(ss, d);
      // The booking is saved; a Transport redraw that fails is logged (Executions) and redone on open or by menu Transport > Refresh.
      try { sortBookings_(ss); buildTransport_(ss); } catch (err) { console.error('Bookings not sorted / Transport not redrawn after booking: ' + err); }
    }
    else if (d.type === 'inquiry') saveInquiry_(ss, d);
    else if (d.type === 'agreement') return reply_(JSON.stringify({ saved: saveAgreement_(ss, d) }));
    else if (d.type === 'lunch') return reply_(JSON.stringify({ saved: saveLunch_(ss, d) }));
    else if (d.type === 'selftest') return reply_(selfTest_(ss));
    else if (d.type === 'rebuild') { var stray = clearStrayPrivate_(ss); setup(); return reply_('rebuilt' + (stray ? ' (' + stray + ' stray private-tour marks cleared)' : '')); }  // idempotent; never touches data rows
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
  if (e && e.parameter.lunch) {
    return ContentService.createTextOutput(lunchJson_(SpreadsheetApp.getActive(), e.parameter.lunch)).setMimeType(ContentService.MimeType.JSON);
  }
  if (e && e.parameter.agreement) {
    return ContentService.createTextOutput(agreementJson_(SpreadsheetApp.getActive(), e.parameter.agreement)).setMimeType(ContentService.MimeType.JSON);
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
  var info = tour === TRANSPORT_ONLY ? { name: 'Transport only', price: 0 } : tourInfo_(ss, tour);
  var date = parseDate_(d.date);
  var transfer = clean_(d.transfer, 40) || 'No';
  var up = goesUp_(transfer), down = goesDown_(transfer);
  var legs = (up ? 1 : 0) + (down ? 1 : 0);
  var nkPickup = clean_(d.nkPickup, 120) || (!up ? clean_(d.hotel, 120) : '') || NK_OFFICE;   // way back: asked-for place, else our office
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
      place: mode === 'none' ? (legs === 0 ? '' : 'No transfer') : mode === 'other' ? clean_(p.pkPlace, 120) : up ? clean_(d.hotel, 120) : nkPickup,
      map: mode === 'none' ? '' : mode === 'other' ? clean_(p.pkMap, 300) : clean_(d.map, 300) };
  });
  var riders = pickup.filter(function (x) { return x.mode !== 'none'; }).length;   // people who take the transfer
  var train = down && d.train === true;
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
  var bk = ss.getSheetByName(TABS.bookings);
  if (bk.getLastRow() > 1 && bk.getRange(2, 1, bk.getLastRow() - 1, 1).getDisplayValues().some(function (r) { return r[0] === id; })) {
    console.warn('Booking ' + id + ' was sent twice; the second copy is not saved.');   // a repeated request must not duplicate the guests
    return;
  }

  addRow_(ss, TABS.bookings, BOOKING_COLS, {
    'Booking ID': id, 'Submitted at': new Date(), 'Tour date': date,
    'Tour month': date ? text_(Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM')) : '', 'Tour': text_(tour), 'Tour name': info.name,
    'People': people.length, 'Lead name': names[0].full, 'Traveller names': names.map(function (n) { return n.full; }).join(', '),
    'Countries': unique_(countries).join(', '), 'Food': foodText, 'Transfer': transfer,
    'Pickup date': up ? parseDate_(d.pickupDate) : '', 'Return date': down ? parseDate_(d.returnDate) : '',
    'Train station drop-off': train ? 'Yes' : '',
    'Accommodation': up ? clean_(d.hotel, 120) : '', 'Maps link': up ? clean_(d.map, 300) : '',
    'Pickups': legs ? pickupSummary_(pickup) : '', 'Takeaway lunch': lunchText, 'Lunch kip': lunchKip || '',
    'Payment method': clean_(d.payment, 40), 'WhatsApp no': text_(clean_(d.phone, 40)), 'Source': clean_(d.source, 40) || 'Not given', 'Referrer': clean_(d.referrer, 120),
    'Site language': clean_(d.lang, 5), 'Note': clean_(d.note, 1000), 'Est. tour USD': info.price * people.length,
    'Est. transfer kip': ((legs === 2 ? kipPrices_(ss).round : legs === 1 ? kipPrices_(ss).one : 0) + (train ? kipPrices_(ss).train : 0)) * riders, 'Status': 'Requested',
    'Pickup in Nong Khiaw': down ? nkPickup : '',
    'Additional package': addonFor_(ss, tour), 'Private tour': d.private === true ? 'Yes' : '',
    'Transport remark': d.returnPlan === 'end' ? 'Back after the tour, about 3:30-4:30 PM' : d.returnPlan === 'later' ? 'Back on another day, minivan about 10:30 AM' : ''
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
  // test bookings sent before this run (e.g. one sent from the website to check delivery): counted, then removed with the others
  var leftover = ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r.join('|').indexOf('SELFTEST-') !== -1; }).length;
  var booking = { id: id, tour: '101', date: '2030-01-15', transfer: 'Round trip', pickupDate: '2030-01-15', returnDate: '2030-01-18',
    train: true, hotel: 'Test hostel', map: 'https://maps.app.goo.gl/test', source: 'Other', payment: 'BCEL QR',
    travellers: [{ first: 'Test', last: 'Person', gender: 'X', nat: 'deutsch', food: 'Vegetarian', pass: 'ab123',
      issued: '2020-01-01', expires: '2030-01-01', pickup: 'same' },
      { first: 'Second', last: 'Person', gender: 'X', nat: 'german', food: 'Regular', pass: 'cd456', issued: '2020-01-01',
        expires: '2030-01-01', pickup: 'none', lunch: 'Avocado sandwich' }] };
  saveBooking_(ss, booking);
  saveBooking_(ss, booking);   // the same request again (a retry) must not add a second copy
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
    b[BOOKING_COLS.indexOf('Est. transfer kip')] === kipText_(kipPrices_(ss).round + kipPrices_(ss).train) && t[TRAVELLER_COLS.indexOf('Pickup place')] === 'Test hostel';
  var t2 = ss.getSheetByName(TABS.travellers).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[1] || [];
  out.lunchOk = b[BOOKING_COLS.indexOf('Takeaway lunch')] === 'Avocado sandwich 1' && b[BOOKING_COLS.indexOf('Lunch kip')] === '65,000' &&
    t2[TRAVELLER_COLS.indexOf('Takeaway lunch')] === 'Avocado sandwich' && t2[TRAVELLER_COLS.indexOf('Lunch kip')] === '65,000';
  out.onceOk = ss.getSheetByName(TABS.travellers).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; }).length === 2 &&
    ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; }).length === 1;
  out.tripOk = tripSelfTest_(ss);
  out.transportOk = transportSelfTest_(ss, id);
  out.guideOk = guideSelfTest_(ss, id);
  out.agencyOk = agencySelfTest_(ss);
  out.lunchReportOk = lunchReportSelfTest_(ss, id);
  out.arrangeOk = arrangeSelfTest_(ss);
  out.collectOk = collectSelfTest_(ss, id);
  out.newBookingOk = newBookingSelfTest_(ss);
  out.importOk = importSelfTest_(ss);
  out.receiptOk = receiptSelfTest_(ss, id);
  out.travellerLunchOk = travellerLunchSelfTest_(ss, id);
  out.reviewsOk = JSON.parse(reviewsJson_()).length > 0;
  out.contentOk = contentSelfTest_(ss);
  var cleaned = [];
  var testIds = {};  // booking IDs of test bookings (a site test has an NK... ID and SELFTEST- as lead name)
  [TABS.bookings, TABS.travellers, TABS.inquiries].forEach(function (name) { withoutFilter_(ss.getSheetByName(name), function (sh) {
    var values = sh.getDataRange().getDisplayValues();
    for (var r = values.length - 1; r >= 1; r--) {
      var row = values[r].join('|');
      if (row.indexOf(id) !== -1) out[name] = true;
      var isTest = row.indexOf('SELFTEST-') !== -1 || (name === TABS.travellers && testIds[values[r][0]]);
      if (name === TABS.bookings && isTest) testIds[values[r][0]] = true;
      if (!isTest) continue;
      // Re-read the row first: the sheet may have been sorted since the snapshot (opening the sheet sorts Bookings), and a stale row
      // number must never delete a guest's row. Only a row that is still a test row goes.
      var now = sh.getRange(r + 1, 1, 1, values[r].length).getDisplayValues()[0];
      if (now[0] !== values[r][0] || !(now.join('|').indexOf('SELFTEST-') !== -1 || (name === TABS.travellers && testIds[now[0]]))) {
        console.warn('selftest cleanup: row ' + (r + 1) + ' of ' + name + ' changed since it was read; not deleted'); continue;
      }
      sh.deleteRow(r + 1);  // also clears leftovers of earlier runs
      if (name === TABS.bookings) cleaned.push(r + 1 + ':' + now[0]);
    }
  }); });
  out.testBookingsFoundBefore = leftover;
  out.tabsOk = ss.getSheets().length >= 6;
  out.frozenOk = [TABS.bookings, TABS.travellers, TABS.inquiries].every(function (n) { return ss.getSheetByName(n).getFrozenRows() === 1; });
  return JSON.stringify(out);
}

// A lunch typed for traveller 1 in Travellers is added to the booking (text and kip); one traveller cancelled leaves the Pax count.
function travellerLunchSelfTest_(ss, id) {
  var tr = ss.getSheetByName(TABS.travellers), bk = ss.getSheetByName(TABS.bookings), g = ss.getSheetByName(TABS.guide);
  var rows = tr.getRange(1, 1, tr.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }), first = rows.indexOf(id) + 1;
  var cell = function (c) { return tr.getRange(first, TRAVELLER_COLS.indexOf(c) + 1); };
  var bids = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }), brow = bids.indexOf(id) + 1;
  var bcell = function (c) { return bk.getRange(brow, BOOKING_COLS.indexOf(c) + 1); };
  var menu = lunchMap_(ss), dish = Object.keys(menu)[0];
  try {
    if (first < 2 || brow < 2 || !dish) return 'missing';
    cell('Takeaway lunch').setValue(dish); travellerEdited_(ss, cell('Takeaway lunch'));
    var text = String(bcell('Takeaway lunch').getValue()), kip = Number(bcell('Lunch kip').getValue());
    if (text.indexOf(dish + ' 1') === -1 || text.indexOf('Avocado sandwich 1') === -1 || kip !== menu[dish].price + menu['Avocado sandwich'].price) return 'booking lunch: ' + text;
    var food = cell('Food'), was = food.getValue();
    food.setValue('No pork'); travellerEdited_(ss, food);
    var summary = String(bcell('Food').getValue());
    food.setValue(was); syncFood_(ss, id);
    if (summary !== 'No pork 1, Regular 1') return 'food summary: ' + summary;
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { cell('Takeaway lunch').clearContent(); cell('Lunch kip').clearContent(); syncLunch_(ss, id); }
}

// Points the trip sheet at the sample booking's date, checks the list and the totals, then puts the date back.
function tripSelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.trip), cell = sh.getRange('B2'), saved = cell.getValue(), ok = false;
  try {
    cell.setValue(new Date(2030, 0, 15, 12)); SpreadsheetApp.flush();
    var rows = sh.getRange(16, 1, 4, 10).getDisplayValues();
    var people = Number(sh.getRange('B5').getValue()), riders = Number(sh.getRange('B6').getValue());
    ok = !rows.some(function (r) { return r[1] === 'Test Person' && r[6] === 'Test hostel'; }) ? (sh.getRange('A16').getFormula() ? 'first traveller' : 'list formula missing') :
      !rows.some(function (r) { return r[1] === 'Second Person' && r[6] === 'No transfer' && r[5] === 'Avocado sandwich'; }) ? 'second traveller' :
      people < 2 || riders < 1 ? 'totals' : Number(sh.getRange('B13').getValue()) < 65000 ? 'lunch kip' : true;   // which part failed, never the data
  } catch (err) { console.error('trip selftest: ' + err); ok = 'error'; }
  finally { cell.setValue(saved); }
  return ok;
}

/* ---------- Tour plans: each tour's days (Guide report), the package added by itself, and the costs (Arrange tour) ----------
   Seeded once from Noy's notes; after that the tab belongs to staff and is never overwritten. */
var PLAN_DAYS = [   // tour, day, plan for that day
  ['101', 1, 'Camping above the clouds'], ['101', 2, 'Sunrise, trek down, boat back to Nong Khiaw (about 9:00-9:30)'],
  ['102', 1, 'Camping above the clouds'], ['102', 2, '001 1-Day Tour: Sopkong, waterfall, Muang Ngoi, kayak'],
  ['103', 1, 'Camping'], ['103', 2, 'Homestay (2D Sopjam + Homestay)'], ['103', 3, 'Jungle Trek, kayak to Nong Khiaw'],
  ['001', 1, '001 1-Day Tour: Sopkong, waterfall, Muang Ngoi, kayak']];
var PLAN_ADDONS = [['102', '001 1-Day Tour (Day 2)', 2], ['103', '2D Sopjam + Homestay', 2]];   // tour, package, the tour day it starts on
var PLAN_COSTS = [   // tour, item, unit kip, counted per ("group", "person" or "N people"), qty for a group item
  ['001', 'Guide', 500000, 'group', 1], ['001', 'Boat', 900000, 'group', 1], ['001', 'Food', 50000, 'person', ''],
  ['001', 'Water (pack)', 35000, '4 people', ''], ['001', 'Fruits (mango)', 30000, 'group', 2], ['001', 'Cave & view', 20000, 'person', ''],
  ['001', 'Waterfall', 20000, 'person', ''], ['001', 'Kayak', 80000, '2 people', ''], ['001', 'Parking kayak', 20000, 'group', 1]];
var PLAN_ROW = 3;   // first data row of the three tables (A:C days, E:F packages, H:L costs)

function setupPlans_(ss) {
  var had = ss.getSheetByName(TABS.plans);
  if (had) {   // 2026-10-22: the add-on table gets "Starts on day" (G); existing 102 / 103 rows start on day 2
    if (String(had.getRange('G2').getValue()) === '') {
      had.getRange('G2').setValue('Starts on day').setFontWeight('bold').setBackground('#e8f0ea');
      var codes = had.getRange(PLAN_ROW, 5, Math.max(had.getLastRow() - PLAN_ROW + 1, 1), 1).getValues();
      codes.forEach(function (r, i) { if (String(r[0]).trim() === '102' || String(r[0]).trim() === '103') had.getRange(PLAN_ROW + i, 7).setValue(2); });
      had.setColumnWidth(7, 90);
    }
    return;
  }
  var sh = ss.insertSheet(TABS.plans);
  sh.getRange('A:A').setNumberFormat('@'); sh.getRange('E:E').setNumberFormat('@'); sh.getRange('H:H').setNumberFormat('@');
  sh.getRange('A1').setValue('Tour days (Guide report: what each guest does that day)');
  sh.getRange('E1').setValue('Additional package (added to every booking of the tour)');
  sh.getRange('H1').setValue('Tour costs (Arrange tour). Counted per: group, person, or "2 people" (one per 2 guests, e.g. kayaks)');
  sh.getRange('A1:L1').setFontWeight('bold').setWrap(true).setVerticalAlignment('top');
  sh.getRange(2, 1, 1, 3).setValues([['Tour', 'Day', 'Plan for the day']]);
  sh.getRange(2, 5, 1, 3).setValues([['Tour', 'Additional package', 'Starts on day']]);
  sh.getRange(2, 8, 1, 5).setValues([['Tour', 'Item', 'Unit kip', 'Counted per', 'Qty (group items)']]);
  sh.getRange('A2:L2').setFontWeight('bold').setBackground('#e8f0ea');
  sh.getRange(PLAN_ROW, 1, PLAN_DAYS.length, 3).setValues(PLAN_DAYS);
  sh.getRange(PLAN_ROW, 5, PLAN_ADDONS.length, 3).setValues(PLAN_ADDONS);
  sh.getRange(PLAN_ROW, 8, PLAN_COSTS.length, 5).setValues(PLAN_COSTS);
  sh.getRange('J:J').setNumberFormat('#,##0');
  sh.setRowHeight(1, 48);
  sh.setColumnWidth(1, 60); sh.setColumnWidth(2, 50); sh.setColumnWidth(3, 330); sh.setColumnWidth(4, 20); sh.setColumnWidth(5, 60);
  sh.setColumnWidth(6, 220); sh.setColumnWidth(7, 90); sh.setColumnWidth(8, 60); sh.setColumnWidth(9, 180); sh.setColumnWidth(10, 100);
  sh.setColumnWidth(11, 110); sh.setColumnWidth(12, 120);
  freezeRows_(sh, 2);
}

function addonFor_(ss, tour) {
  var sh = ss.getSheetByName(TABS.plans);
  if (!sh || sh.getLastRow() < PLAN_ROW) return '';
  var rows = sh.getRange(PLAN_ROW, 5, sh.getLastRow() - PLAN_ROW + 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]).trim() === tour) return String(rows[i][1]).trim();
  return '';
}

/* ---------- Guide report: everyone on tour on a date (tomorrow by default), in Noy's layout, for the guide team ----------
   Formulas only, so it follows Bookings, Travellers, the Receipt log and Tour plans by itself. A guest is listed on every day
   of their tour (Day 1 of 3, Day 2 of 3, ...) with that day's plan from Tour plans; the Additional package comes from Tour plans
   unless one is typed on the booking in Bookings. */
function setupGuide_(ss) {
  var sh = ss.getSheetByName(TABS.guide) || ss.insertSheet(TABS.guide);
  sh.clear(); sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).getMergedRanges().forEach(function (m) { m.breakApart(); });
  sh.showColumns(1, sh.getMaxColumns());   // columns hidden for the old layout would hide other data now
  var col = function (c) { return colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var T = function (c) { return 'Travellers!$' + col(c) + '$2:$' + col(c); };
  var lastB = colLetter_(BOOKING_COLS.length);
  var V = function (c) { return 'IFERROR(VLOOKUP(Travellers!$A$2:$A,Bookings!$A$2:$' + lastB + ',' + (BOOKING_COLS.indexOf(c) + 1) + ',FALSE),"")'; };
  var A = function (x) { return 'ARRAYFORMULA(' + x + ')'; };
  var P = "'" + TABS.plans + "'!";
  var day = 'IF($D$2="",TODAY()+1,$D$2)';
  var dayNo = '(INT(' + day + ')-IFERROR(INT(' + T('Tour date') + '),0)+1)';   // 1 on the tour date, 2 the next day, ...
  var keys = 'ARRAYFORMULA(' + P + '$A$' + PLAN_ROW + ':$A&"|"&' + P + '$B$' + PLAN_ROW + ':$B)';
  var key = T('Tour') + '&"|"&' + dayNo;
  var noRide = '((' + T('Pickup place') + '="")+(' + T('Pickup place') + '="No transfer"))';
  var privateTour = '(' + V('Private tour') + '="Yes")';
  var cols = [   // [header, formula part, number format]
    ['Date of issue', A('IFERROR(VLOOKUP(Travellers!$A$2:$A,{\'' + TABS.receiptLog + '\'!$C$2:$C,\'' + TABS.receiptLog + '\'!$B$2:$B},2,FALSE),"")'), 'dd/mm/yyyy'],
    ['Receipt No', T('Receipt No'), '@'],
    ['Booking ID', 'Travellers!$A$2:$A'],
    ['Contact name', T('Full name')],
    ['Pax', A('COUNTIFS(Travellers!$A$2:$A,Travellers!$A$2:$A,' + T('Status') + ',"<>Cancelled")')],
    ['Package', A(T('Tour') + '&IF(' + privateTour + '," Private","")'), '@'],
    ['Day', A('"Day "&' + dayNo + '&" of "&COUNTIF(' + keys + ',' + T('Tour') + '&"|*")')],
    ['Plan for the day', A('IFERROR(VLOOKUP(' + key + ',{' + keys + ',' + P + '$C$' + PLAN_ROW + ':$C},2,FALSE),"")')],
    ['Viewpoint', A(V('Viewpoint'))],
    ['Additional package', A('IF(' + V('Additional package') + '<>"",' + V('Additional package') + ',IFERROR(VLOOKUP(' + T('Tour') + ',' + P + '$E$' + PLAN_ROW + ':$F,2,FALSE),""))')],
    ['Add. package date', A('IFERROR(IF(VLOOKUP(' + T('Tour') + ',' + P + '$E$' + PLAN_ROW + ':$G,3,FALSE)>0,' + T('Tour date') + '+VLOOKUP(' + T('Tour') + ',' + P + '$E$' + PLAN_ROW + ':$G,3,FALSE)-1,""),"")'), 'dd/mm/yyyy'],
    ['Food type', T('Food')],
    ['Pickup date (from LPB)', A('IF(' + noRide + '+(' + V('Pickup date') + '=""),"' + STAYING + '",' + V('Pickup date') + ')'), 'dd/mm/yyyy'],
    ['Tour start date', T('Tour date'), 'dd/mm/yyyy'],
    ['Pick-up location', stayingPlace_(T('Pickup place'))],
    ['Departure date', A('IF(' + V('Return date') + '<>"",' + V('Return date') + ',IF(REGEXMATCH(' + V('Transfer') + '&"","(?i)one way"),"one way","n/a"))'), 'dd/mm/yyyy'],
    ['Notes', A('TRIM(IF(' + privateTour + ',"PRIVATE TOUR"&IF((' + V('Note') + '&' + V('Staff notes') + ')<>""," | ",""),"")&' + V('Note') +
      '&IF((' + V('Note') + '<>"")*(' + V('Staff notes') + '<>"")," | ","")&' + V('Staff notes') + ')')]];
  var n = cols.length, last = colLetter_(n + 1), pax = 5, plan = 8;   // Pax (5th of cols) is shown once per booking
  sh.getRange('A1').setValue('Guide report').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2:C2').merge().setValue('Date (tomorrow unless you change it; empty it to go back to tomorrow):').setFontWeight('bold');
  sh.getRange('D2').setFormula('=TODAY()+1').setNumberFormat('ddd dd/mm/yyyy').setBackground('#fff2a8').setFontWeight('bold').setHorizontalAlignment('left')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());   // double-click: calendar
  sh.getRange('E2:' + last + '2').merge().setValue('Everyone on tour that day (cancelled bookings left out), grouped by what they do: a guest of a 2- or 3-day tour shows on each day ' +
    '("Day 2 of 3") with that day\'s plan. Package, Day, Plan and Additional package come from the "Tour plans" tab; type a different Additional package or the Viewpoint on the booking in Bookings. Pax is on the first row of each booking, the total at the bottom.')
    .setFontColor('#5a665f').setWrap(true);
  sh.setRowHeight(2, 48);
  sh.getRange('F1').setFormula('=IF(D2="","",TEXT(D2,"dd/mm")&" Tour")').setFontWeight('bold').setFontSize(13);
  sh.getRange('A4:M4').merge().setValue('GUEST & TOUR DETAILS').setBackground('#e6cf5c');
  sh.getRange('N4:P4').merge().setValue('ARRIVAL INFORMATION').setBackground('#cfe2a8');
  sh.getRange('Q4').setValue('DEPARTURE INFORMATION').setBackground('#9fc5e8');
  sh.getRange('A4:' + last + '4').setFontWeight('bold').setHorizontalAlignment('center');
  var head = ['No'].concat(cols.map(function (c) { return c[0]; }));
  sh.getRange(5, 1, 1, head.length).setValues([head]).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  sh.getRange('A5:M5').setBackground('#e6cf5c'); sh.getRange('N5:P5').setBackground('#cfe2a8'); sh.getRange('Q5').setBackground('#9fc5e8');
  var cond = 'ISNUMBER(MATCH(' + key + ',' + keys + ',0))*(' + T('Status') + '<>"Cancelled")*(Travellers!$A$2:$A<>"")';
  var arr = '{' + cols.map(function (c) { return c[1]; }).join(',') + ',Travellers!$A$2:$A,' + T('Traveller #') + '}';
  var total = ['""', '""', '""', '""', '"Total"', 'ROWS(s)'];
  while (total.length < n + 1) total.push('""');
  sh.getRange('A6').setFormula('=IFERROR(LET(s,SORT(FILTER(' + arr + ',' + cond + '),' + plan + ',TRUE,' + (n + 1) + ',TRUE,' + (n + 2) + ',TRUE),' +
    'k,CHOOSECOLS(s,' + (n + 1) + '),r,SEQUENCE(ROWS(s)),' +
    'VSTACK({r,CHOOSECOLS(s,SEQUENCE(1,' + (pax - 1) + ')),ARRAYFORMULA(IF(MATCH(k,k,0)=r,CHOOSECOLS(s,' + pax + '),"")),' +
    'CHOOSECOLS(s,SEQUENCE(1,' + (n - pax) + ',' + (pax + 1) + '))},{' + total.join(',') + '})),"Nobody on tour this day")');
  sh.getRange('F6:H' + sh.getMaxRows()).setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$E6="Total"')
    .setBold(true).setBackground('#e6cf5c').setRanges([sh.getRange('A6:' + last + sh.getMaxRows())]).build()]);
  cols.forEach(function (c, i) { if (c[2]) sh.getRange(6, i + 2, Math.max(sh.getMaxRows() - 5, 1), 1).setNumberFormat(c[2]); });
  sh.getRange('A6:' + last + sh.getMaxRows()).setBorder(null, null, null, null, true, true, '#cfd8d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, n + 1, 110); sh.setColumnWidth(1, 40); sh.setColumnWidth(4, 130); sh.setColumnWidth(5, 200); sh.setColumnWidth(6, 45);
  sh.setColumnWidth(7, 80); sh.setColumnWidth(8, 90); sh.setColumnWidth(9, 260); sh.setColumnWidth(10, 150); sh.setColumnWidth(11, 190);
  sh.setColumnWidth(16, 190); sh.setColumnWidth(18, 220);
  freezeRows_(sh, 5);
}

// The sample booking (tour 101 on 15/01/2030, 2 guests) on its first day and on day 2.
function guideSelfTest_(ss, id) {
  var sh = ss.getSheetByName(TABS.guide), cell = sh.getRange('D2');
  try {
    var bk = ss.getSheetByName(TABS.bookings), ids = bk.getRange(1, 1, bk.getLastRow(), 1).getDisplayValues().map(function (r) { return r[0]; });
    bk.getRange(ids.indexOf(id) + 1, BOOKING_COLS.indexOf('Viewpoint') + 1).setValue('1- Phou Khao Mok');
    cell.setValue(new Date(2030, 0, 15, 12)); SpreadsheetApp.flush();
    var rows = sh.getRange(6, 1, 6, 18).getDisplayValues();
    var a = rows.filter(function (r) { return r[4] === 'Test Person'; })[0], b = rows.filter(function (r) { return r[4] === 'Second Person'; })[0];
    var t = rows.filter(function (r) { return r[4] === 'Total'; })[0];
    if (!a || !b) return 'rows';
    if (a[0] !== '1' || a[3] !== id || a[5] !== '2' || a[6] !== '101' || a[7] !== 'Day 1 of 2' || a[8] !== 'Camping above the clouds' ||
      a[9] !== '1- Phou Khao Mok' || a[13] !== '15/01/2030' || a[15] !== 'Test hostel' || a[16] !== '18/01/2030') return 'first row: ' + a.slice(5, 9).join('/');
    if (b[0] !== '2' || b[5] !== '' || b[13] !== STAYING) return 'second row';
    if (!t || t[5] !== '2') return 'total';
    cell.setValue(new Date(2030, 0, 16, 12)); SpreadsheetApp.flush();
    var d2 = sh.getRange(6, 1, 6, 18).getDisplayValues().filter(function (r) { return r[4] === 'Test Person'; })[0];
    if (!d2 || d2[7] !== 'Day 2 of 2' || d2[8].indexOf('Sunrise') !== 0) return 'day 2';
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { cell.setFormula('=TODAY()+1'); }
}

/* ---------- Lunch report: takeaway food ordered with the booking, for The Trio Bar & Cafe kitchen ----------
   Formulas only. The day is the tour date (or the minivan date of a transport-only booking); tomorrow by default. */
function setupLunchReport_(ss) {
  var sh = ss.getSheetByName(TABS.lunchReport) || ss.insertSheet(TABS.lunchReport);
  sh.clear(); sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).getMergedRanges().forEach(function (m) { m.breakApart(); });
  var col = function (c) { return colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var T = function (c) { return 'Travellers!$' + col(c) + '$2:$' + col(c); };
  var lastB = colLetter_(BOOKING_COLS.length);
  var V = function (c) { return 'IFERROR(VLOOKUP(Travellers!$A$2:$A,Bookings!$A$2:$' + lastB + ',' + (BOOKING_COLS.indexOf(c) + 1) + ',FALSE),"")'; };
  var A = function (x) { return 'ARRAYFORMULA(' + x + ')'; };
  var day = 'IF($D$2="",TODAY()+1,$D$2)';
  var when = A('IF(' + T('Tour date') + '<>"",' + T('Tour date') + ',' + V('Pickup date') + ')');
  var rides = '(' + T('Pickup place') + '<>"")*(' + T('Pickup place') + '<>"No transfer")';
  var cols = [   // [header, formula part, number format]
    ['Booking ID', 'Travellers!$A$2:$A'],
    ['Tour date', when, 'dd/mm/yyyy'],
    ['Tour', T('Tour'), '@'],
    ['Customer name', T('Full name')],
    ['Pax', A('COUNTIFS(Travellers!$A$2:$A,Travellers!$A$2:$A,' + T('Status') + ',"<>Cancelled")')],
    ['Food item', A('TRIM(SUBSTITUTE(SUBSTITUTE(' + T('Takeaway lunch') + ',"(",""),")",""))')],
    ['Qty', A('IF(' + T('Takeaway lunch') + '<>"",1,"")')],
    ['Ready by (pickup time)', A('IF(' + rides + '*(' + V('Pickup date') + '<>"")*(IFERROR(INT(' + V('Pickup date') + '),0)=IFERROR(INT(' + when + '),-1)),' +
      '"When the minivan from Luang Prabang arrives","Before the tour starts")&IF(' + V('Transport remark') + '<>""," ("&' + V('Transport remark') + '&")","")')],
    ['Special requests', A('TRIM(IF((' + T('Food') + '<>"")*(' + T('Food') + '<>"Regular"),' + T('Food') + '&IF(' + V('Note') + '<>""," | ",""),"")&' + V('Note') + ')')],
    ['Price kip', T('Lunch kip'), '#,##0']];
  var n = cols.length, last = colLetter_(n + 1), pax = 5;
  sh.getRange('A1').setValue('Lunch report (takeaway food)').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2:C2').merge().setValue('Date (tomorrow unless you change it; empty it to go back to tomorrow):').setFontWeight('bold');
  sh.getRange('D2').setFormula('=TODAY()+1').setNumberFormat('ddd dd/mm/yyyy').setBackground('#fff2a8').setFontWeight('bold').setHorizontalAlignment('left')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());   // double-click: calendar
  sh.getRange('E2:' + last + '2').merge().setValue('Takeaway food the guests ordered with their booking, for the kitchen. Copy the message on the right to The Trio Bar team. ' +
    'Cancelled bookings are left out. Dishes and prices: tab "Lunch menu".').setFontColor('#5a665f').setWrap(true);
  sh.setRowHeight(2, 40);
  var head = ['No'].concat(cols.map(function (c) { return c[0]; }));
  sh.getRange(4, 1, 1, head.length).setValues([head]).setFontWeight('bold').setWrap(true).setBackground('#e6cf5c');
  var cond = '(' + T('Takeaway lunch') + '<>"")*(IFERROR(INT(' + when + '),0)=INT(' + day + '))*(' + T('Status') + '<>"Cancelled")*(Travellers!$A$2:$A<>"")';
  var arr = '{' + cols.map(function (c) { return c[1]; }).join(',') + ',' + T('Traveller #') + '}';
  var total = ['""', '""', '""', '""', '"Total"', '""', '""', 'ROWS(s)', '""', '""', 'SUM(CHOOSECOLS(s,' + n + '))'];
  sh.getRange('A5').setFormula('=IFERROR(LET(s,SORT(FILTER(' + arr + ',' + cond + '),1,TRUE,' + (n + 1) + ',TRUE),' +
    'k,CHOOSECOLS(s,1),r,SEQUENCE(ROWS(s)),' +
    'VSTACK({r,CHOOSECOLS(s,SEQUENCE(1,' + (pax - 1) + ')),ARRAYFORMULA(IF(MATCH(k,k,0)=r,CHOOSECOLS(s,' + pax + '),"")),' +
    'CHOOSECOLS(s,SEQUENCE(1,' + (n - pax) + ',' + (pax + 1) + '))},{' + total.join(',') + '})),"No takeaway food ordered for this day")');
  cols.forEach(function (c, i) { if (c[2]) sh.getRange(5, i + 2, Math.max(sh.getMaxRows() - 4, 1), 1).setNumberFormat(c[2]); });
  sh.setConditionalFormatRules([SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$E5="Total"')
    .setBold(true).setBackground('#e6cf5c').setRanges([sh.getRange('A5:' + last + sh.getMaxRows())]).build()]);
  sh.getRange('A5:' + last + sh.getMaxRows()).setBorder(null, null, null, null, true, true, '#cfd8d3', SpreadsheetApp.BorderStyle.SOLID);
  // Right: how many of each dish, and the message for the kitchen in Noy's format ("1.) Pad Thai Chicken x1 : Rut Cinthio").
  var items = 'FILTER($G$5:$G,$G$5:$G<>"",$E$5:$E<>"Total")', names = 'FILTER($E$5:$E,$G$5:$G<>"",$E$5:$E<>"Total")';
  sh.getRange('N4:O4').setValues([['Kitchen: dish', 'How many']]).setFontWeight('bold').setBackground('#e8f0ea');
  sh.getRange('N5').setFormula('=IFERROR(LET(i,' + items + ',u,SORT(UNIQUE(i)),HSTACK(u,MAP(u,LAMBDA(x,SUM(--(i=x)))))),"")');
  sh.getRange('Q4').setValue('Message for The Trio Bar (copy)').setFontWeight('bold').setBackground('#e8f0ea');
  sh.getRange('Q5').setFormula('=IFERROR(LET(i,' + items + ',m,' + names + ',TEXT(' + day + ',"dd/mm")&CHAR(10)&' +
    'TEXTJOIN(CHAR(10),TRUE,ARRAYFORMULA(SEQUENCE(ROWS(i))&".) "&i&" x1 : "&m))),"")').setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidths(1, n + 1, 110); sh.setColumnWidth(1, 40); sh.setColumnWidth(2, 130); sh.setColumnWidth(4, 50); sh.setColumnWidth(5, 190);
  sh.setColumnWidth(6, 45); sh.setColumnWidth(7, 220); sh.setColumnWidth(8, 45); sh.setColumnWidth(9, 260); sh.setColumnWidth(10, 220);
  sh.setColumnWidth(12, 20); sh.setColumnWidth(13, 20); sh.setColumnWidth(14, 220); sh.setColumnWidth(15, 80); sh.setColumnWidth(16, 20); sh.setColumnWidth(17, 330);
  freezeRows_(sh, 4);
}

// The sample booking's second guest ordered an avocado sandwich for 15/01/2030 and takes no minivan.
function lunchReportSelfTest_(ss, id) {
  var sh = ss.getSheetByName(TABS.lunchReport), cell = sh.getRange('D2');
  try {
    cell.setValue(new Date(2030, 0, 15, 12)); SpreadsheetApp.flush();
    var rows = sh.getRange(5, 1, 6, 11).getDisplayValues();
    var a = rows.filter(function (r) { return r[1] === id; })[0], t = rows.filter(function (r) { return r[4] === 'Total'; })[0];
    if (!a) return 'row';
    if (a[4] !== 'Second Person' || a[5] !== '2' || a[6] !== 'Avocado sandwich' || a[7] !== '1' || a[8] !== 'Before the tour starts' || a[10] !== '65,000') return 'columns';
    if (!t || t[7] !== '1') return 'total';
    if (sh.getRange('N5').getDisplayValue() !== 'Avocado sandwich' || String(sh.getRange('O5').getValue()) !== '1') return 'kitchen';
    if (sh.getRange('Q5').getDisplayValue() !== '15/01\n1.) Avocado sandwich x1 : Second Person') return 'message';
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { cell.setFormula('=TODAY()+1'); }
}

/* ---------- Collect on arrival: what each guest and each group pays when they arrive in Nong Khiaw ----------
   Formulas only. Arrival = the pickup date in Luang Prabang (guests riding up) or else the tour date. Pick a From date (and a To date
   for a range; empty = the same day). Per booking a Group row (what the group pays, minus what it already paid) with its guests
   under it: tour, takeaway lunch, transport and the total, in USD and kip. Cancelled bookings and travellers are left out. */
function setupCollect_(ss) {
  var sh = ss.getSheetByName(TABS.collect) || ss.insertSheet(TABS.collect);
  var from = sh.getRange('B2').getValue(), fromF = sh.getRange('B2').getFormula(), to = sh.getRange('D2').getValue();
  sh.clear(); sh.clearConditionalFormatRules();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).getMergedRanges().forEach(function (m) { m.breakApart(); });
  var col = function (c) { return colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var T = function (c) { return 'Travellers!$' + col(c) + '$2:$' + col(c); };
  var lastB = colLetter_(BOOKING_COLS.length), BR = 'Bookings!$A$2:$' + lastB;
  var bi = function (c) { return BOOKING_COLS.indexOf(c) + 1; };
  var V = function (c) { return 'IFERROR(VLOOKUP(Travellers!$A$2:$A,' + BR + ',' + bi(c) + ',FALSE),"")'; };
  var A = function (x) { return 'ARRAYFORMULA(' + x + ')'; };
  var K = function (n) { return 'INDEX(' + n + ',0,'; };
  var f =
    '=IFERROR(LET(' +
    'rate,IF(Settings!$F$8>0,Settings!$F$8,' + RECEIPT_RATE + '),' +
    'dFrom,IF($B$2="",TODAY(),$B$2),dTo,IF($D$2="",dFrom,$D$2),id,Travellers!$A$2:$A,' +
    'arrive,' + A('IF(' + V('Pickup date') + '<>"",' + V('Pickup date') + ',' + T('Tour date') + ')') + ',' +
    'tourUsd,' + A('IFERROR(1*' + V('Est. tour USD') + '/' + V('People') + ',0)') + ',' +
    'lunch,' + A('IFERROR(1*' + T('Lunch kip') + ',0)') + ',' +
    'trans,' + A('IF(' + T('Pickup place') + '="No transfer",0,ROUND(IFERROR(1*' + V('Est. transfer kip') + '/COUNTIFS(id,id,' + T('Pickup place') + ',"<>No transfer",' + T('Status') + ',"<>Cancelled"),0),0))') + ',' +
    'ok,' + A('(id<>"")*ISNUMBER(arrive)*(' + T('Status') + '<>"Cancelled")*(IFERROR(arrive,0)>=INT(dFrom))*(IFERROR(arrive,0)<INT(dTo)+1)') + ',' +
    's,FILTER(HSTACK(arrive,id,' + T('Traveller #') + ',' + T('Full name') + ',' + T('Receipt No') + ',tourUsd,lunch,trans,' + T('Tour') + '&""),ok=1),' +
    'sId,INDEX(s,0,2),u,UNIQUE(sId),' +
    'gArrive,MAP(u,LAMBDA(x,XLOOKUP(x,sId,INDEX(s,0,1)))),' +
    'gName,MAP(u,LAMBDA(x,IFERROR(VLOOKUP(x,' + BR + ',' + bi('Lead name') + ',FALSE),"")&" (group)")),' +
    'gReceipt,MAP(u,LAMBDA(x,XLOOKUP(x,sId,INDEX(s,0,5)))),gCode,MAP(u,LAMBDA(x,XLOOKUP(x,sId,INDEX(s,0,9)))),' +
    'gPax,MAP(u,LAMBDA(x,ROWS(FILTER(sId,sId=x)))),' +
    'gTour,MAP(u,LAMBDA(x,SUM(FILTER(INDEX(s,0,6),sId=x)))),' +
    'gLunch,MAP(u,LAMBDA(x,SUM(FILTER(INDEX(s,0,7),sId=x)))),' +
    'gTrans,MAP(u,LAMBDA(x,SUM(FILTER(INDEX(s,0,8),sId=x)))),' +
    'gPaid,MAP(u,LAMBDA(x,IF(IFERROR(VLOOKUP(x,' + BR + ',' + bi('Status') + ',FALSE),"")="Paid",-1,IFERROR(1*VLOOKUP(x,' + BR + ',' + bi('Amount paid USD') + ',FALSE),0)))),' +
    'base,VSTACK(HSTACK(gArrive,u,gReceipt,MAP(u,LAMBDA(x,"Group")),gName,gPax,gTour,gLunch,gTrans,gPaid,MAP(u,LAMBDA(x,"")),gCode),' +
    'HSTACK(INDEX(s,0,1),sId,INDEX(s,0,5),MAP(sId,LAMBDA(x,"Guest")),INDEX(s,0,4),MAP(sId,LAMBDA(x,1)),INDEX(s,0,6),INDEX(s,0,7),INDEX(s,0,8),MAP(sId,LAMBDA(x,"")),INDEX(s,0,3),INDEX(s,0,9))),' +
    'q,SORT(base,1,TRUE,2,TRUE,4,TRUE,11,TRUE),' +
    'ty,INDEX(q,0,4),tUsd,INDEX(q,0,7),tKip,ARRAYFORMULA(ROUND(tUsd*rate,0)),lu,INDEX(q,0,8),tr,INDEX(q,0,9),pd,INDEX(q,0,10),' +
    'total,ARRAYFORMULA(tKip+lu+tr),isG,ARRAYFORMULA(ty="Group"),' +
    'paidUsd,ARRAYFORMULA(IF(isG,IF(pd<0,total/rate,pd),"")),' +
    'dueKip,ARRAYFORMULA(IF(isG,MAX(0,total-IF(pd<0,total,pd*rate)),"")),' +
    'out,HSTACK(INDEX(q,0,1),INDEX(q,0,2),INDEX(q,0,3),INDEX(q,0,12),ty,INDEX(q,0,5),INDEX(q,0,6),tUsd,tKip,lu,tr,total,ARRAYFORMULA(total/rate),paidUsd,dueKip,ARRAYFORMULA(IF(isG,dueKip/rate,"")),INDEX(q,0,11)),' +
    'VSTACK(out,HSTACK("","","","","TOTAL",""' + [7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map(function (k) { return ',SUM(FILTER(INDEX(out,0,' + k + '),ty="Group"))'; }).join('') + ',""))' +
    '),"Nobody arrives in this period")';
  var head = ['Arrival date', 'Booking ID', 'Receipt No', 'Tour', 'Type', 'Name', 'Pax', 'Tour USD', 'Tour kip', 'Takeaway lunch kip', 'Transport kip',
    'Total kip', 'Total USD', 'Paid USD', 'To collect kip', 'To collect USD', 'Guest #'];
  sh.getRange('A1').setValue('Collect on arrival').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Arrivals from (change the yellow date):').setFontWeight('bold');
  if (from instanceof Date && !fromF) sh.getRange('B2').setValue(from); else sh.getRange('B2').setFormula('=TODAY()');
  sh.getRange('B2').setNumberFormat('ddd dd/mm/yyyy').setBackground('#fff2a8').setFontWeight('bold').setHorizontalAlignment('left')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('C2').setValue('to (empty = that day only):').setFontWeight('bold').setHorizontalAlignment('right');
  sh.getRange('D2').setNumberFormat('ddd dd/mm/yyyy').setBackground('#fff2a8').setFontWeight('bold').setHorizontalAlignment('left')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
  if (to instanceof Date) sh.getRange('D2').setValue(to);
  sh.getRange('E2:Q2').merge().setValue('Arrival = the pickup date in Luang Prabang (guests taking the minivan up), otherwise the tour date. Each booking is a Group row ' +
    '(what the group pays, minus what it already paid or the deposit) with its guests below. Tour, lunch and transport come from the booking: change them in Bookings (or Travellers for lunch). ' +
    'Cancelled bookings and travellers are left out. USD at the receipt rate (Settings F8).').setWrap(true).setFontColor('#5a665f');
  sh.setRowHeight(2, 60);
  sh.getRange(5, 1, 1, head.length).setValues([head]).setFontWeight('bold').setWrap(true).setBackground('#e6cf5c').setVerticalAlignment('middle');
  sh.getRange('A6').setFormula(f);
  var rows = Math.max(sh.getMaxRows() - 5, 1);
  sh.getRange(6, 1, rows, 1).setNumberFormat('dd/mm/yyyy'); sh.getRange(6, 3, rows, 2).setNumberFormat('@');
  sh.getRange(6, 7, rows, 1).setNumberFormat('0'); sh.getRange(6, 8, rows, 1).setNumberFormat('#,##0.00'); sh.getRange(6, 9, rows, 4).setNumberFormat('#,##0');
  sh.getRange(6, 13, rows, 2).setNumberFormat('#,##0.00'); sh.getRange(6, 15, rows, 1).setNumberFormat('#,##0'); sh.getRange(6, 16, rows, 1).setNumberFormat('#,##0.00');
  var last = colLetter_(head.length), area = sh.getRange('A6:' + last + sh.getMaxRows());
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$E6="Group"').setBold(true).setBackground('#e8f0ea').setRanges([area]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$E6="TOTAL"').setBold(true).setBackground('#e6cf5c').setRanges([area]).build()]);
  area.setBorder(null, null, null, null, true, true, '#cfd8d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidths(1, head.length, 105); sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 80); sh.setColumnWidth(4, 50); sh.setColumnWidth(5, 60);
  sh.setColumnWidth(6, 220); sh.setColumnWidth(7, 45); sh.setColumnWidth(17, 60);
  freezeRows_(sh, 5);
}

// The sample booking (2 guests: tour 101, one lunch, one minivan rider) arriving on 15/01/2030: group and guest rows and the total.
function collectSelfTest_(ss, id) {
  var sh = ss.getSheetByName(TABS.collect), b2 = sh.getRange('B2'), d2 = sh.getRange('D2'), keepF = b2.getFormula(), keepB = b2.getValue(), keepD = d2.getValue();
  try {
    b2.setValue(new Date(2030, 0, 15, 12)); d2.clearContent(); SpreadsheetApp.flush();
    var rows = sh.getRange(6, 1, 12, 17).getDisplayValues().filter(function (r) { return r[1] === id; }).map(function (r) { return [r[0], r[1], r[2]].concat(r.slice(4)).concat([r[3]]); });   // Tour (col D) moved to the end for the checks
    var g = rows.filter(function (r) { return r[3] === 'Group'; })[0], one = rows.filter(function (r) { return r[4] === 'Test Person'; })[0],
      two = rows.filter(function (r) { return r[4] === 'Second Person'; })[0];
    if (g && (g[16] !== '101' || one[16] !== '101')) return 'tour code: ' + g[16];
    if (!g || !one || !two) return 'rows: ' + rows.length;
    var k = kipPrices_(ss), rate = receiptRate_(ss), trip = k.round + k.train, tour = tourInfo_(ss, '101').price, lunch = lunchMap_(ss)['Avocado sandwich'].price;
    var n = kipText_, tourKip = tour * rate;
    if (g[5] !== '2' || g[9] !== n(trip) || g[8] !== n(lunch) || g[7] !== n(2 * tourKip) || g[10] !== n(2 * tourKip + trip + lunch) || g[13] !== n(2 * tourKip + trip + lunch)) return 'group: ' + g.join('|');
    if (one[9] !== n(trip) || one[10] !== n(tourKip + trip) || two[9] !== '0' || two[8] !== n(lunch) || two[10] !== n(tourKip + lunch) || one[13] !== '') return 'guests';
    if (sh.getRange(6, 5, 12, 1).getDisplayValues().map(function (r) { return r[0]; }).indexOf('TOTAL') === -1) return 'total row';
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { if (keepF) b2.setFormula(keepF); else b2.setValue(keepB); if (keepD instanceof Date) d2.setValue(keepD); else d2.clearContent(); }
}

/* ---------- Arrange tour: the costs of one tour day (guide, boat, food, kayaks, ...), the income and the profit ----------
   Pick the date and the tour: the guests and income come from Bookings, the cost lines from Tour plans (written by the
   script, so quantities and prices can be typed over). Tick the box to keep the result in "Tour accounts". */
var AR_ITEMS = 11, AR_ROWS = 30, AR_SAVE = 'E8';
var ACCOUNT_COLS = ['Tour date', 'Tour', 'Guests', 'Receipt No', 'Booking IDs', 'Expense kip', 'Income kip', 'Profit kip', 'Costs', 'Saved at'];

function setupArrange_(ss) {
  var sh = ss.getSheetByName(TABS.arrange) || ss.insertSheet(TABS.arrange);
  var date = sh.getRange('B2').getValue(), tour = String(sh.getRange('B3').getValue()).trim(), guests = sh.getRange('B5').getValue();
  var income = sh.getRange('E3').getValue();
  var keep = sh.getLastRow() >= AR_ITEMS ? sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).getValues() : null;   // typed costs survive a rebuild
  var keepF = sh.getLastRow() >= AR_ITEMS ? sh.getRange(AR_ITEMS, 3, AR_ROWS, 1).getFormulas() : null;
  sh.clear(); sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).getMergedRanges().forEach(function (m) { m.breakApart(); });
  var bc = function (c) { return 'Bookings!$' + colLetter_(BOOKING_COLS.indexOf(c) + 1) + '$2:$' + colLetter_(BOOKING_COLS.indexOf(c) + 1); };
  var tc = function (c) { return 'Travellers!$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1) + '$2:$' + colLetter_(TRAVELLER_COLS.indexOf(c) + 1); };
  var bCond = '(' + bc('Tour') + '=$B$3)*(IFERROR(INT(' + bc('Tour date') + '),0)=INT($B$2))*(' + bc('Status') + '<>"Cancelled")';
  var tCond = '(' + tc('Tour') + '=$B$3)*(IFERROR(INT(' + tc('Tour date') + '),0)=INT($B$2))*(' + tc('Status') + '<>"Cancelled")';
  var tours = ss.getSheetByName(TABS.settings).getRange('A2:A20').getDisplayValues().map(function (r) { return r[0].trim(); }).filter(String);
  var yellow = '#fff2a8';
  sh.getRange('A1').setValue('Arrange tour').setFontSize(16).setFontWeight('bold');
  sh.getRange('C1:H1').merge().setValue('Pick the date and the tour (yellow). Guests and income come from Bookings, the cost lines from the "Tour plans" tab: ' +
    'type over a quantity or price, or add a line in an empty row. Tick "Save" to keep the result in "Tour accounts".').setWrap(true).setFontColor('#5a665f');
  sh.setRowHeight(1, 48);
  var left = [['Tour date', ''], ['Tour', ''], ['Guests (booked)', '=SUMPRODUCT(' + tCond + ')'], ['Guests, if different (type)', ''],
    ['Guests counted', '=IF(B5<>"",B5,B4)'], ['Receipt No', '=IFERROR(TEXTJOIN(", ",TRUE,UNIQUE(FILTER(' + bc('Receipt No') + ',' + bCond + '))),"")'],
    ['Booking IDs', '=IFERROR(TEXTJOIN(", ",TRUE,FILTER(' + bc('Booking ID') + ',' + bCond + ')),"")']];
  left.forEach(function (r, i) {
    sh.getRange(2 + i, 1).setValue(r[0]).setFontWeight('bold');
    if (r[1]) sh.getRange(2 + i, 2).setFormula(r[1]);
  });
  sh.getRange('B2').setValue(date instanceof Date ? date : new Date(new Date().getTime() + 864e5)).setNumberFormat('ddd dd/mm/yyyy')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('B3').setNumberFormat('@').setValue(tour || '001')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(tours, true).setAllowInvalid(false).build());
  sh.getRange('B5').setValue(guests);
  [sh.getRange('B2:B3'), sh.getRange('B5')].forEach(function (r) { r.setBackground(yellow).setFontWeight('bold').setHorizontalAlignment('left'); });
  sh.getRange('B4:B8').setHorizontalAlignment('left');
  var right = [['Income kip (from bookings)', '=SUMPRODUCT(' + bCond + ',IFERROR(1*' + bc('Est. tour USD') + ',0))*' + "'" + TABS.settings + "'!$F$8"],
    ['Income kip, if different (type)', ''], ['Income kip', '=IF(E3<>"",E3,E2)'],
    ['Expense kip', '=SUM(E' + AR_ITEMS + ':E' + (AR_ITEMS + AR_ROWS - 1) + ')'], ['Profit kip', '=E4-E5']];
  right.forEach(function (r, i) {
    sh.getRange(2 + i, 4).setValue(r[0]).setFontWeight('bold');
    if (r[1]) sh.getRange(2 + i, 5).setFormula(r[1]);
  });
  sh.getRange('E3').setValue(income).setBackground(yellow);
  sh.getRange('E2:E6').setNumberFormat('#,##0').setFontWeight('bold');
  sh.getRange('E6').setBackground('#cfe2a8');
  sh.getRange(AR_SAVE).offset(0, -1).setValue('Save to "Tour accounts" →').setFontWeight('bold');
  sh.getRange(AR_SAVE).insertCheckboxes().setValue(false).setBackground('#cfe2a8');
  sh.getRange(AR_ITEMS - 1, 1, 1, 5).setValues([['Item', 'Counted per', 'Qty', 'Unit kip', 'Total kip']]).setFontWeight('bold').setBackground('#e6cf5c');
  sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).setBackground(yellow);
  sh.getRange(AR_ITEMS, 4, AR_ROWS, 2).setNumberFormat('#,##0');
  sh.getRange(AR_ITEMS, 5, AR_ROWS, 1).setFormulas(Array.apply(null, Array(AR_ROWS)).map(function (_, i) {
    var r = AR_ITEMS + i; return ['=IF(OR(C' + r + '="",D' + r + '=""),"",C' + r + '*D' + r + ')']; }));
  sh.getRange(AR_ITEMS, 1, AR_ROWS, 5).setBorder(true, true, true, true, true, true, '#cfd8d3', SpreadsheetApp.BorderStyle.SOLID);
  sh.setColumnWidth(1, 200); sh.setColumnWidth(2, 220); sh.setColumnWidth(3, 70); sh.setColumnWidth(4, 210); sh.setColumnWidth(5, 120);
  freezeRows_(sh, 1);
  if (keep && keep.some(function (r) { return String(r[0]).trim(); })) {
    sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).setValues(keep);
    keepF.forEach(function (f, i) { if (f[0]) sh.getRange(AR_ITEMS + i, 3).setFormula(f[0]); });
  } else fillArrange_(ss);
  var acc = ss.getSheetByName(TABS.accounts) || ss.insertSheet(TABS.accounts);
  addMissingColumns_(acc, ACCOUNT_COLS);
  if (acc.getLastRow() === 0) acc.getRange(1, 1, 1, ACCOUNT_COLS.length).setValues([ACCOUNT_COLS]);
  acc.getRange(1, 1, 1, ACCOUNT_COLS.length).setFontWeight('bold').setBackground('#e8f0ea');
  acc.getRange('A:A').setNumberFormat('dd/mm/yyyy'); acc.getRange('B:B').setNumberFormat('@'); acc.getRange('F:H').setNumberFormat('#,##0');
  acc.getRange('J:J').setNumberFormat('dd/mm/yyyy hh:mm');
  acc.setColumnWidth(5, 220); acc.setColumnWidth(9, 420);
  freezeRows_(acc, 1);
}

// The cost lines of the chosen tour from Tour plans. A per-person line counts the guests, "2 people" one per 2 guests.
function fillArrange_(ss) {
  var sh = ss.getSheetByName(TABS.arrange), plans = ss.getSheetByName(TABS.plans), tour = String(sh.getRange('B3').getValue()).trim();
  var rows = plans && plans.getLastRow() >= PLAN_ROW ? plans.getRange(PLAN_ROW, 8, plans.getLastRow() - PLAN_ROW + 1, 5).getValues()
    .filter(function (r) { return String(r[0]).trim() === tour && String(r[1]).trim(); }).slice(0, AR_ROWS) : [];
  sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).clearContent();
  rows.forEach(function (r, i) {
    var row = AR_ITEMS + i, per = String(r[3]).trim().toLowerCase(), m = /^(\d+)\s*(people|persons?|pax)$/.exec(per);
    sh.getRange(row, 1, 1, 2).setValues([[r[1], r[3]]]);
    sh.getRange(row, 4).setValue(r[2]);
    if (/^(person|pax|guest)/.test(per)) sh.getRange(row, 3).setFormula('=$B$6');
    else if (m) sh.getRange(row, 3).setFormula('=ROUNDUP($B$6/' + m[1] + ',0)');
    else sh.getRange(row, 3).setValue(Number(r[4]) || 1);
  });
}

function kipText_(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

// The ticked Save box: one row per tour date and tour in "Tour accounts" (saving again replaces it).
function saveArrange_(ss) {
  var sh = ss.getSheetByName(TABS.arrange), box = sh.getRange(AR_SAVE), msg = box.offset(0, 1);
  try {
    SpreadsheetApp.flush();
    var date = sh.getRange('B2').getValue(), tour = String(sh.getRange('B3').getValue()).trim();
    if (!(date instanceof Date) || !tour) { box.setValue(false); msg.setValue('Pick the date and the tour first.').setFontColor('#a33'); return; }
    var costs = sh.getRange(AR_ITEMS, 1, AR_ROWS, 5).getValues().filter(function (r) { return String(r[0]).trim() && r[4] !== ''; })
      .map(function (r) { return r[0] + ' ' + r[2] + ' x ' + kipText_(r[3]) + ' = ' + kipText_(r[4]); }).join('; ');
    var e = sh.getRange('E4:E6').getValues();
    var row = [date, tour, sh.getRange('B6').getValue(), sh.getRange('B7').getValue(), sh.getRange('B8').getValue(), e[1][0], e[0][0], e[2][0], costs, new Date()];
    var acc = ss.getSheetByName(TABS.accounts), at = acc.getLastRow() + 1;
    if (acc.getLastRow() > 1) {
      var have = acc.getRange(2, 1, acc.getLastRow() - 1, 2).getValues();
      for (var i = 0; i < have.length; i++) if (dayKey_(have[i][0]) === dayKey_(date) && String(have[i][1]) === tour) { at = i + 2; break; }
    }
    acc.getRange(at, 1, 1, ACCOUNT_COLS.length).setValues([row]);
    box.setValue(false);
    msg.setValue('Saved in "Tour accounts" (row ' + at + ').').setFontColor('#2f6b4f');
    ss.toast('Tour ' + tour + ' on ' + Utilities.formatDate(date, TIME_ZONE, 'dd/MM/yyyy') + ' saved. Profit: ' + kipText_(e[2][0]) + ' kip', 'Arrange tour', 8);
  } catch (err) {
    box.setValue(false); msg.setValue('Not saved: ' + (err.message || err)).setFontColor('#a33');
    throw err;
  }
}

// Points Arrange tour at the sample booking (tour 101, 2 guests), adds one cost line, saves, then puts everything back.
function arrangeSelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.arrange), acc = ss.getSheetByName(TABS.accounts);
  var saved = sh.getRange('A2:B8').getValues(), savedItems = sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).getValues();
  var savedF = sh.getRange(AR_ITEMS, 3, AR_ROWS, 1).getFormulas(), income = sh.getRange('E3').getValue(), accRows = acc.getLastRow();
  try {
    sh.getRange('B2').setValue(new Date(2030, 0, 15, 12)); sh.getRange('B3').setValue('101'); sh.getRange('B5').setValue(''); sh.getRange('E3').setValue('');
    sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).clearContent();
    sh.getRange(AR_ITEMS, 1, 1, 4).setValues([['SELFTEST item', 'person', '', 1000]]); sh.getRange(AR_ITEMS, 3).setFormula('=$B$6');
    SpreadsheetApp.flush();
    if (Number(sh.getRange('B4').getValue()) !== 2) return 'guests';
    var kip = tourInfo_(ss, '101').price * 2 * receiptRate_(ss);
    if (Number(sh.getRange('E2').getValue()) !== kip) return 'income';
    if (Number(sh.getRange('E5').getValue()) !== 2000 || Number(sh.getRange('E6').getValue()) !== kip - 2000) return 'expense/profit';
    sh.getRange(AR_SAVE).setValue(true); saveArrange_(ss);
    var last = acc.getRange(acc.getLastRow(), 1, 1, ACCOUNT_COLS.length).getValues()[0];
    if (acc.getLastRow() !== accRows + 1 || last[1] !== '101' || last[5] !== 2000 || String(last[8]).indexOf('SELFTEST item 2 x 1,000 = 2,000') !== 0) return 'saved row: ' + [acc.getLastRow() - accRows, typeof last[1], last[5], String(last[8]).slice(0, 40)].join('/');
    return true;
  } catch (err) { return 'error: ' + err; }
  finally {
    if (acc.getLastRow() > accRows && String(acc.getRange(acc.getLastRow(), 9).getValue()).indexOf('SELFTEST') === 0) acc.deleteRow(acc.getLastRow());
    sh.getRange('B2').setValue(saved[0][1]); sh.getRange('B3').setValue(saved[1][1]); sh.getRange('B5').setValue(saved[3][1]); sh.getRange('E3').setValue(income);
    sh.getRange(AR_ITEMS, 1, AR_ROWS, 4).setValues(savedItems);
    savedF.forEach(function (f, i) { if (f[0]) sh.getRange(AR_ITEMS + i, 3).setFormula(f[0]); });
    sh.getRange(AR_SAVE).offset(0, 1).clearContent();
  }
}

/* ---------- Transport: the day's minivan list for the driver team (pickups in Luang Prabang, departures to Luang Prabang) ----------
   Written by the script, not formulas, so the yellow columns can be typed in: what staff type there (plate numbers, remark,
   WhatsApp number, Nong Khiaw pickup) is saved in Bookings at once and shown again whenever the list is rebuilt. */
var TRANSPORT_START = 5;   // first row of the lists
var TRANSPORT_ARR = ['Booking date', 'Booking ID', 'Receipt No', 'WhatsApp no', 'Name', 'Pax', 'Pickup date (Luang Prabang)', 'Pickup location',
  'Map', 'Vehicle / plate no (to Nong Khiaw)', 'Remark', 'Message guest', 'Message for the minivan team (copy)'];
var TRANSPORT_DEP = ['Booking date', 'Booking ID', 'Receipt No', 'WhatsApp no', 'Name', 'Pax', 'Departure date (to Luang Prabang)',
  'Pickup location (Nong Khiaw)', 'Vehicle / plate no (to Luang Prabang)', 'Drop-off', 'Remark', 'Message guest', 'Message for the minivan team (copy)'];
// Typed columns of each list (1-based) -> the Bookings column they are saved in.
var TRANSPORT_EDIT = { arr: { 4: 'WhatsApp no', 7: 'Pickup date', 10: 'Vehicle to Nong Khiaw', 11: 'Transport remark' },
  dep: { 4: 'WhatsApp no', 7: 'Return date', 8: 'Pickup in Nong Khiaw', 9: 'Vehicle to Luang Prabang', 11: 'Transport remark' } };
// The date columns (7) are typed too: a guest who stays a day longer gets the new date here, saved in Bookings, and moves to that day's list.
var TRANSPORT_WIDTH = 14;  // 13 visible columns + a hidden one saying which list the row belongs to

function dayKey_(v) {   // 'yyyy-MM-dd' for a date or a dd/mm/yyyy text; '' otherwise
  if (v instanceof Date) return Utilities.formatDate(v, TIME_ZONE, 'yyyy-MM-dd');
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : '';
}

function setupTransport_(ss) {
  var sh = ss.getSheetByName(TABS.transport) || ss.insertSheet(TABS.transport);
  var date = sh.getRange('B2').getValue();
  sh.getRange('A1').setValue('Transport').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2').setValue('Date (change the yellow cell):').setFontWeight('bold');
  sh.getRange('B2').setValue(date instanceof Date ? date : new Date()).setNumberFormat('ddd dd/mm/yyyy').setBackground('#fff2a8')
    .setFontWeight('bold').setHorizontalAlignment('left')
    .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
  sh.getRange('C1:L2').merge().setValue('Type in the yellow columns (WhatsApp no, plate numbers, remark, Nong Khiaw pickup): it is saved in Bookings. ' +
    '"Message for the minivan team" is the text to copy for the team. "Message guest" opens WhatsApp with the minivan details for the guest. New bookings appear when you change the date or use menu "Transport" > "Refresh".')
    .setWrap(true).setFontColor('#5a665f').setVerticalAlignment('top');
  sh.setColumnWidths(1, 13, 120); sh.setColumnWidth(13, 260); sh.setColumnWidth(5, 200); sh.setColumnWidth(8, 220); sh.setColumnWidth(10, 170); sh.setColumnWidth(11, 200);
  sh.setColumnWidth(12, 120); sh.setRowHeight(1, 30);
  sh.showColumns(1, TRANSPORT_WIDTH - 1); sh.hideColumns(TRANSPORT_WIDTH);   // the last column only says which list a row is in
  freezeRows_(sh, 2);
  buildTransport_(ss);
}

function receiptNumbers_(ss) {
  var log = ss.getSheetByName(TABS.receiptLog), map = {};
  if (!log || log.getLastRow() < 2) return map;
  log.getRange(2, 1, log.getLastRow() - 1, 3).getDisplayValues().forEach(function (r) { if (r[2] && r[0]) map[r[2]] = r[0]; });
  return map;
}

function transportData_(ss) {
  var bk = ss.getSheetByName(TABS.bookings), tr = ss.getSheetByName(TABS.travellers);
  var B = bk.getDataRange().getValues(), T = tr.getDataRange().getValues();
  var bi = {}; BOOKING_COLS.forEach(function (c) { bi[c] = B[0].indexOf(c); });
  var ti = {}; TRAVELLER_COLS.forEach(function (c) { ti[c] = T[0].indexOf(c); });
  var riders = {};   // booking ID -> its travellers who take the minivan, in traveller order
  for (var r = 1; r < T.length; r++) {
    var id = String(T[r][ti['Booking ID']]);
    if (!id || String(T[r][ti['Pickup place']]) === 'No transfer' || String(T[r][ti['Status']]) === 'Cancelled') continue;
    (riders[id] = riders[id] || []).push({ n: Number(T[r][ti['Traveller #']]) || 0, name: String(T[r][ti['Full name']]), first: String(T[r][ti['First name']]),
      place: String(T[r][ti['Pickup place']]), map: String(T[r][ti['Pickup map']]),
      phone: ti['Traveller WhatsApp'] === -1 ? '' : String(T[r][ti['Traveller WhatsApp']] || '').replace(/^'/, '') });
  }
  Object.keys(riders).forEach(function (k) { riders[k].sort(function (a, b) { return a.n - b.n; }); });
  return { B: B, bi: bi, riders: riders };
}

// What Noy sends the minivan team for a booking, in her words: pax, the guest and their WhatsApp (a wa.me link the driver can
// tap), up date, pickup (place + map), down date and drop-off.
// "Back after the tour, about 3:30-4:30 PM" -> 3:30-4:30 PM; "...about 10:30 AM" -> 10:30 AM; otherwise the usual 10:00-10:30 AM.
var TIME_RE = /\d{1,2}(?::\d{2})?\s*(?:-\s*\d{1,2}(?::\d{2})?\s*)?(?:AM|PM)/i;   // "10:30 AM", "3:30-4:30 PM", "2 PM"
function returnTime_(remark) {
  var m = TIME_RE.exec(String(remark || ''));
  return m ? m[0].replace(/\s*-\s*/, '-') : '10:00-10:30 AM';
}

// The riders of a booking grouped by pickup place (and map), in traveller order.
function pickupStops_(people) {
  var at = {}, out = [];
  people.forEach(function (p) {
    var k = String(p.place).trim().toLowerCase() + '|' + String(p.map).trim();
    if (at[k] === undefined) { at[k] = out.length; out.push([]); }
    out[at[k]].push(p);
  });
  return out;
}

// Team message for one pickup stop of a booking whose guests are picked up at several places: who is at this stop (with their
// own WhatsApp when staff typed it in Travellers), the booker's WhatsApp, the date and the place.
function stopMessage_(g, si, n, up, id, receipt, lead, phone) {
  var wa = function (num) { var d = String(num || '').replace(/\D/g, '').replace(/^00/, ''); return d.length >= 7 ? '  WhatsApp: ' + String(num).trim() + ' https://wa.me/' + d : ''; };
  var no = String(receipt || '').replace(/^'/, '').trim();
  if (/^\d+$/.test(no)) no = ('00' + Number(no)).slice(-Math.max(3, String(Number(no)).length));
  var leadKey = String(lead || '').trim().toLowerCase(), leadHere = g.some(function (p) { return String(p.name).trim().toLowerCase() === leadKey; });
  return ['Booking id: ' + id, 'Receipt no: ' + no, 'ຈຸດຮັບ ' + (si + 1) + '/' + n + ': ' + g.length + 'pax']
    .concat(g.map(function (p) {
      var own = p.phone || (String(p.name).trim().toLowerCase() === leadKey ? phone : '');
      return '- ' + p.name + wa(own);
    }))
    .concat(leadHere ? [] : ['ຕິດຕໍ່ (booked by ' + lead + ')' + wa(phone)])
    .concat(['ຂຶ້ນ: ' + (up instanceof Date ? Utilities.formatDate(up, TIME_ZONE, 'dd/MM') : String(up || '')),
      'ບ່ອນຮັບ: ' + (g[0].place + ' ' + g[0].map).trim()]).join('\n');
}

function teamMessage_(people, up, down, train, guest, phone, id, receipt, nk, remark) {
  var dm = function (v) { return v instanceof Date ? Utilities.formatDate(v, TIME_ZONE, 'dd/MM') : String(v || ''); };
  var places = [], seen = {};
  people.forEach(function (p) { var k = p.place + ' ' + p.map; if (!seen[k]) { seen[k] = true; places.push((p.place + ' ' + p.map).trim()); } });
  var digits = String(phone || '').replace(/\D/g, '').replace(/^00/, '');
  var no = String(receipt || '').replace(/^'/, '').trim();
  if (/^\d+$/.test(no)) no = ('00' + Number(no)).slice(-Math.max(3, String(Number(no)).length));   // 000007 -> 007, as Noy writes it
  var lead = String(guest || '').trim().toLowerCase();
  var others = people.map(function (p) { return p.name; }).filter(function (n) { return n && n.trim().toLowerCase() !== lead; });
  return ['Booking id: ' + id, 'Receipt no: ' + no, (up && down ? 'ໄປກັບ ' : '') + people.length + 'pax',   // ໄປກັບ = round trip
    'ລູກຄ້າ: ' + guest + (digits.length >= 7 ? '  WhatsApp: ' + String(phone).trim() + ' https://wa.me/' + digits : '')]
    .concat(others.length ? ['ຜູ້ຕິດຕາມ: ' + others.join(', ')] : [])   // the other guests (followers), so the driver can check everyone
    .concat(up ? ['ຂຶ້ນ: ' + dm(up), 'ບ່ອນຮັບ: ' + places.join(' / ')] : [])
    .concat(up && down ? ['**'] : [])   // between the way up and the way back, easier for the team to read
    .concat(down ? ['ລົງ: ' + dm(down) + ' ' + returnTime_(remark) + ' ' + (train ? 'ສົ່ງສະຖານີລົດໄຟ' : 'ສົ່ງຕົວເມືອງ ໃກ້ຕະຫຼາດມືດ')] : [])
    .concat(down ? ['ບ່ອນຮັບໜອງຂຽວ: ' + (nk || NK_OFFICE)] : []).join('\n');
}

// "Message guest": WhatsApp with Noy's words. The day is worked out by the sheet when the link is clicked (Tomorrow / Today /
// On dd/mm/yyyy, from the yellow date), so a list made yesterday still says the right thing today. lines[0] follows "you have".
function waLink_(phone, text) {   // text: lines joined by \n, with {day} where "tomorrow" / "today" / "on dd/mm/yyyy" goes
  var digits = String(phone || '').replace(/\D/g, '').replace(/^00/, '');
  var q = function (t) { return '"' + String(t).replace(/"/g, '""').replace(/\n/g, '"&CHAR(10)&"') + '"'; };
  var day = 'IF(INT($B$2)=TODAY()+1,"tomorrow",IF(INT($B$2)=TODAY(),"today","on "&TEXT($B$2,"dd/mm/yyyy")))';
  return digits.length < 7 ? '' : '=HYPERLINK("https://wa.me/' + digits + '?text="&ENCODEURL(' + text.split('{day}').map(q).join('&' + day + '&') + '),"Message guest")';
}

// "Hello Maja! Your minivan to Nong Khiaw is booked for tomorrow. ..." (Noy's wording), ending with the transport manager's contact.
function guestMessage_(first, to, place, time, plate, extra, manager) {
  return 'Hello ' + (first || 'there') + '! Your minivan to ' + to + ' is booked for {day}.\n' +
    'Pickup at ' + place + (time ? ' between ' + time : '') + '.\n' +
    'The plate number is ' + (plate || '(we send it soon)') + '.\n' + extra +
    (manager ? '\nIf you need help with your pickup, please contact our transport manager: ' + manager + '.' : '');
}

function buildTransport_(ss) {
  var sh = ss.getSheetByName(TABS.transport), date = sh.getRange('B2').getValue(), day = dayKey_(date);
  var d = transportData_(ss), B = d.B, bi = d.bi, shown = date instanceof Date ? Utilities.formatDate(date, TIME_ZONE, 'dd/MM/yyyy') : '';
  var V = function (row, c) { return bi[c] === -1 ? '' : row[bi[c]]; };
  var logNo = receiptNumbers_(ss);   // a receipt issued from the Receipt tab always shows, even if Bookings lost it
  var manager = String(ss.getSheetByName(TABS.settings).getRange('F13').getValue()).trim();
  var arr = [], dep = [];
  for (var r = 1; r < B.length; r++) {
    var row = B[r], id = String(V(row, 'Booking ID')), status = String(V(row, 'Status')), transfer = String(V(row, 'Transfer'));
    var up = goesUp_(transfer), back = goesDown_(transfer) || dayKey_(V(row, 'Return date')) !== '';   // a return date typed later counts too
    if (!id || status === 'Cancelled' || (!up && !back)) continue;
    var people = d.riders[id] || [{ n: 1, name: String(V(row, 'Lead name')), first: '', place: String(V(row, 'Accommodation')), map: String(V(row, 'Maps link')) }];
    var phone = V(row, 'WhatsApp no'), receipt = String(V(row, 'Receipt No') || logNo[id] || '');
    var team = teamMessage_(people, up ? V(row, 'Pickup date') : '', back ? V(row, 'Return date') : '', V(row, 'Train station drop-off') === 'Yes',
      V(row, 'Lead name') || people[0].name, phone, id, receipt, String(V(row, 'Pickup in Nong Khiaw')), String(V(row, 'Transport remark')));
    var base = function (p, i) { return [i ? '' : V(row, 'Submitted at'), id, text_(receipt), i ? '' : text_(String(phone)), p.name, i ? '' : people.length]; };
    if (up && dayKey_(V(row, 'Pickup date')) === day) {
      var plate = String(V(row, 'Vehicle to Nong Khiaw'));
      var first = people[0].first || String(people[0].name).split(' ')[0];
      var msg = guestMessage_(first, 'Nong Khiaw', people[0].place || 'your hotel', '7:30 and 8:00 AM', plate, 'Please wait at your hotel reception for the driver to pick you up.', manager);
      // Guests of one booking picked up at different places: one block and one team message per pickup stop.
      var stops = pickupStops_(people), lead = V(row, 'Lead name') || people[0].name;
      stops.forEach(function (g, si) {
        var teamS = stops.length === 1 ? team : stopMessage_(g, si, stops.length, V(row, 'Pickup date'), id, receipt, lead, phone);
        var msgS = stops.length === 1 ? msg : guestMessage_(first, 'Nong Khiaw', g[0].place || 'your hotel', '7:30 and 8:00 AM', plate,
          'Please wait at your hotel reception for the driver to pick you up.', manager);
        arr.push({ key: g[0].place + '|' + id + '|' + si, rows: g.map(function (p, i) {
          return [i ? '' : V(row, 'Submitted at'), id, text_(receipt), i ? '' : text_(String(phone)), p.name, i ? '' : g.length]
            .concat([V(row, 'Pickup date'), p.place, p.map ? '=HYPERLINK("' + p.map.replace(/"/g, '%22') + '","Map")' : '',
              i ? '' : plate, i ? '' : V(row, 'Transport remark'), i ? '' : waLink_(phone, msgS), i ? '' : teamS, 'arr']);
        }) });
      });
    }
    if (back && dayKey_(V(row, 'Return date')) === day) {
      var plate2 = String(V(row, 'Vehicle to Luang Prabang')), nk = String(V(row, 'Pickup in Nong Khiaw')) || NK_OFFICE;
      var drop = V(row, 'Train station drop-off') === 'Yes' ? 'Luang Prabang train station' : 'City center';
      var first2 = people[0].first || String(people[0].name).split(' ')[0];
      var msg2 = guestMessage_(first2, 'Luang Prabang', nk, returnTime_(V(row, 'Transport remark')).replace('-', ' and '), plate2, 'Please be ready a few minutes before. Drop-off: ' + drop + '.', manager);
      dep.push({ key: (V(row, 'Train station drop-off') === 'Yes' ? '1' : '0') + '|' + nk + '|' + id, rows: people.map(function (p, i) {
        return base(p, i).concat([V(row, 'Return date'), i ? '' : nk, i ? '' : plate2, drop, i ? '' : V(row, 'Transport remark'),
          i ? '' : waLink_(phone, msg2), i ? '' : team, 'dep']);
      }) });
    }
  }
  // Bookings grouped by pickup place, each booking's travellers together and in order.
  var flat = function (groups) { return groups.sort(function (a, b) { return a.key.localeCompare(b.key); })
    .reduce(function (all, g) { return all.concat(g.rows); }, []); };
  arr = flat(arr); dep = flat(dep);

  var last = Math.max(sh.getLastRow(), TRANSPORT_START);
  sh.getRange(TRANSPORT_START - 1, 1, last - TRANSPORT_START + 2, TRANSPORT_WIDTH).clear().clearDataValidations();
  var out = [], formats = [];
  var line = function (start) { while (start.length < TRANSPORT_WIDTH) start.push(''); return start; };   // a full-width row
  var section = function (title, head, rows, kind, colour) {
    out.push(line([title + '   (' + rows.length + ' pax)']));
    formats.push(['title', colour]);
    out.push(head.concat([''])); formats.push(['head', colour]);
    if (!rows.length) { out.push(line(['Nobody on this date'])); formats.push(['none']); }
    rows.forEach(function (x) { out.push(x); formats.push(['row', kind]); });
    if (rows.length) { out.push(line(['', '', '', '', 'Total', rows.length + ' pax'])); formats.push(['total', colour]); }
    out.push(line([])); formats.push(['gap']);
  };
  section('↑ ຂຶ້ນ ' + shown + '  (Luang Prabang → Nong Khiaw)', TRANSPORT_ARR, arr, 'arr', '#f6e7a1');
  section('↓ ລົງ ' + shown + '  (Nong Khiaw → Luang Prabang)', TRANSPORT_DEP, dep, 'dep', '#c9daf8');
  var top = TRANSPORT_START - 1;
  sh.getRange(top, 1, out.length, TRANSPORT_WIDTH).setValues(out.map(function (x) { return x.map(function (v) { return typeof v === 'string' && v.charAt(0) === '=' ? '' : v; }); }));
  out.forEach(function (x, i) { x.forEach(function (v, j) { if (typeof v === 'string' && v.charAt(0) === '=') sh.getRange(top + i, j + 1).setFormula(v); }); });
  formats.forEach(function (f, i) {
    var line = sh.getRange(top + i, 1, 1, TRANSPORT_WIDTH - 1);
    if (f[0] === 'title') line.setFontWeight('bold').setFontSize(12).setBackground(f[1]);
    if (f[0] === 'head') line.setFontWeight('bold').setBackground(f[1]).setWrap(true);
    if (f[0] === 'none') line.setFontColor('#5a665f').setFontStyle('italic');
    if (f[0] === 'total') { line.setFontWeight('bold').setBackground(f[1]); sh.getRange(top + i, 6).setHorizontalAlignment('right'); }
    if (f[0] === 'row') {
      sh.getRange(top + i, 13).setWrap(true).setVerticalAlignment('top');
      line.setBorder(true, null, null, null, null, null, '#cfd8d3', SpreadsheetApp.BorderStyle.SOLID);
      sh.getRange(top + i, 1).setNumberFormat('dd/mm/yyyy'); sh.getRange(top + i, 7).setNumberFormat('dd/mm/yyyy');
      sh.getRange(top + i, 3, 1, 2).setNumberFormat('@');
      Object.keys(TRANSPORT_EDIT[f[1]]).forEach(function (c) { sh.getRange(top + i, Number(c)).setBackground('#fff2a8'); });
    }
  });
}

// A typed yellow cell on the Transport tab: save it in Bookings (for the whole booking), then redraw the list.
function saveTransportEdit_(ss, range) {
  var sh = range.getSheet(), cols = BOOKING_COLS, changed = false;
  var bk = ss.getSheetByName(TABS.bookings), ids = bk.getRange(1, 1, bk.getLastRow(), 1).getDisplayValues().map(function (r) { return r[0]; });
  for (var r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) {
    var meta = sh.getRange(r, 1, 1, TRANSPORT_WIDTH).getValues()[0], kind = meta[TRANSPORT_WIDTH - 1], at = ids.indexOf(String(meta[1]));
    if (!TRANSPORT_EDIT[kind] || at < 1) continue;
    for (var c = range.getColumn(); c < range.getColumn() + range.getNumColumns(); c++) {
      var target = TRANSPORT_EDIT[kind][c];
      if (!target) continue;
      var v = sh.getRange(r, c).getValue();
      if (target === 'Pickup date' || target === 'Return date') {
        var day = v instanceof Date ? v : (dayKey_(v) ? parseDate_(dayKey_(v)) : null);   // a date, or typed dd/mm/yyyy
        if (!day) { ss.toast('Type the date as dd/mm/yyyy (for example 24/10/2026).', 'Transport', 8); continue; }
        bk.getRange(at + 1, cols.indexOf(target) + 1).setValue(day);
        ss.toast(meta[4] + ': ' + target.toLowerCase() + ' is now ' + Utilities.formatDate(day, TIME_ZONE, 'dd/MM/yyyy') + ' (saved in Bookings). Change the yellow date at the top to see that day\'s list.', 'Transport', 8);
      } else bk.getRange(at + 1, cols.indexOf(target) + 1).setValue(target === 'WhatsApp no' ? text_(String(v)) : clean_(v, 200));
      changed = true;
    }
  }
  buildTransport_(ss);   // also puts back anything typed outside the yellow columns
  if (!changed) ss.toast('Only the yellow columns can be typed in here; the others come from Bookings.', 'Transport', 6);
}

// Menu Bookings > Remove duplicate rows: a booking or traveller saved twice. Only exact copies go (same Booking ID and the
// same lead name / same traveller name and passport); the first copy stays, with whatever staff typed on it.
function removeDuplicateRows() {
  var ss = SpreadsheetApp.getActive(), lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var n = dropDuplicates_(ss, TABS.bookings, function (r, h) { return [r[h['Booking ID']], r[h['Lead name']]]; }) +
      ' booking(s) and ' + dropDuplicates_(ss, TABS.travellers, function (r, h) { return [r[h['Booking ID']], r[h['Full name']], r[h['Passport no']]]; }) + ' traveller(s)';
    ss.toast('Removed ' + n + ' that were saved twice.', 'Duplicates', 8);
  } finally { lock.releaseLock(); }
}

function dropDuplicates_(ss, name, keyOf) {
  var sh = ss.getSheetByName(name), v = sh.getDataRange().getDisplayValues(), h = {}, seen = {}, gone = [];
  v[0].forEach(function (c, i) { h[c] = i; });
  for (var r = 1; r < v.length; r++) {
    var k = keyOf(v[r], h).map(function (x) { return String(x).trim().toLowerCase(); });
    if (!k[0]) continue;
    k = k.join('|');
    if (seen[k]) gone.push(r + 1); else seen[k] = true;
  }
  withoutFilter_(sh, function () { for (var i = gone.length - 1; i >= 0; i--) sh.deleteRow(gone[i]); });   // rows hidden by a filter would not go
  return gone.length;
}

function refreshTransport() { buildTransport_(SpreadsheetApp.getActive()); }

// Bookings in tour date order, earliest at the top (then by when they came in); rows without a tour date go last.
// Whole rows move, with any colour staff gave them; everything else finds a booking by its ID, never by its row.
function sortBookings_(ss) {
  var lock = LockService.getScriptLock(), mine = false;
  if (!lock.hasLock()) { mine = lock.tryLock(15000); if (!mine) { console.warn('Bookings not sorted: another run is busy'); return; } }
  try { sortBookingsLocked_(ss); } finally { if (mine) lock.releaseLock(); }
}

function sortBookingsLocked_(ss) {
  var sh = ss.getSheetByName(TABS.bookings), n = sh.getLastRow() - 1;
  if (n < 2) return;
  var date = BOOKING_COLS.indexOf('Tour date') + 1, came = BOOKING_COLS.indexOf('Submitted at') + 1, filter = sh.getFilter();
  if (filter) filter = widenFilter_(sh, filter);   // a filter that leaves columns out would sort them apart from their rows
  if (filter) { filter.sort(came, true); filter.sort(date, true); }   // staff use a filter on this tab: sort through it (stable, so two passes)
  else sh.getRange(2, 1, n, sh.getLastColumn()).sort([{ column: date, ascending: true }, { column: came, ascending: true }]);
}

// Runs fn(sh) with the tab's filter taken off, then puts the same filter back. A row hidden by a filter cannot be deleted
// (deleteRow silently does nothing), so deleting rows goes through here.
function withoutFilter_(sh, fn) {
  var f = sh.getFilter();
  if (!f) return fn(sh);
  var fr = f.getRange(), a1 = fr.getA1Notation(), crit = [];
  for (var c = fr.getColumn(); c <= fr.getLastColumn(); c++) { var k = f.getColumnFilterCriteria(c); if (k) crit.push([c, k.copy().build()]); }
  f.remove();
  try { return fn(sh); }
  finally {
    var nf = sh.getRange(a1).createFilter();
    crit.forEach(function (x) { nf.setColumnFilterCriteria(x[0], x[1]); });
  }
}

// A staff filter made before a column was added does not cover it: put the filter back over every column and row, same criteria.
function widenFilter_(sh, filter) {
  var fr = filter.getRange();
  if (fr.getRow() === 1 && fr.getColumn() === 1 && fr.getLastColumn() >= sh.getLastColumn() && fr.getLastRow() >= sh.getLastRow()) return filter;
  var crit = [];
  for (var c = fr.getColumn(); c <= fr.getLastColumn(); c++) {
    var k = filter.getColumnFilterCriteria(c);
    if (k) crit.push([c, k.copy().build()]);
  }
  filter.remove();
  var f = sh.getRange(1, 1, sh.getMaxRows(), sh.getLastColumn()).createFilter();
  crit.forEach(function (x) { f.setColumnFilterCriteria(x[0], x[1]); });
  console.warn(sh.getName() + ': filter widened from ' + fr.getA1Notation() + ' to all columns');
  return f;
}

// 2026-10-15: "Private tour" was added after the staff filter on Bookings, and sorting through that filter left the self-test's
// "Yes" behind on other rows. No booking could be private yet except one typed in the New booking tab on that day, so a "Yes" on any
// other row is cleared, once. Returns how many were cleared.
function clearStrayPrivate_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('strayPrivateCleared')) return 0;
  var sh = ss.getSheetByName(TABS.bookings), n = sh.getLastRow() - 1, cleared = 0;
  if (n > 0) {
    var col = BOOKING_COLS.indexOf('Private tour') + 1, lang = BOOKING_COLS.indexOf('Site language') + 1, at = BOOKING_COLS.indexOf('Submitted at') + 1;
    var v = sh.getRange(2, col, n, 1).getValues(), l = sh.getRange(2, lang, n, 1).getValues(), t = sh.getRange(2, at, n, 1).getValues();
    var since = new Date(2026, 9, 15);   // the day the column was added
    for (var i = 0; i < n; i++) {
      var typedToday = l[i][0] === 'Staff' && t[i][0] instanceof Date && t[i][0] >= since;
      if (v[i][0] !== '' && !typedToday) { sh.getRange(i + 2, col).clearContent(); cleared++; }
    }
  }
  props.setProperty('strayPrivateCleared', String(cleared));
  return cleared;
}

function sortBookings() { sortBookings_(SpreadsheetApp.getActive()); }

/* ---------- Agency share: guests passed between tour agencies and how the price is split ----------
   One row per group, typed by staff. Example: package 001 sells at $30; Noy sends 2 guests to Agency A, Noy (the sender)
   gets $10 a person, Agency A (the receiver) keeps $20 a person. The totals and the per-agency summary are formulas. */
var AGENCY_START = 5;   // header row of the list; rows below it are typed
var AGENCY_COLS = ['Tour date', 'Booking ID', 'Tour package', 'Guests', 'Sending agency', 'Receiving agency', 'Price per person USD',
  'Sender gets per person USD', 'Guide name', 'Guide WhatsApp', 'Notes', 'Accommodation', 'Remark', 'Total USD', 'Sender gets USD', 'Receiver keeps USD', 'Chat guide'];
var AGENCY_TYPED = 13;   // A:M are typed by staff (Accommodation and Remark were added where Noy was already typing them)

function setupAgency_(ss) {
  var sh = ss.getSheetByName(TABS.agency) || ss.insertSheet(TABS.agency);
  var H = AGENCY_START, from = H + 1, col = function (c) { return colLetter_(AGENCY_COLS.indexOf(c) + 1); };
  var R = function (c) { return '$' + col(c) + '$' + from + ':$' + col(c); };
  // Staff may have merged cells up here: undo merges in the heading rows so ours fit (the typed rows below are not touched).
  sh.getRange(1, 1, H, sh.getMaxColumns()).getMergedRanges().forEach(function (m) { if (m.getLastRow() <= H || m.getRow() <= H) m.breakApart(); });
  sh.getRange(1, AGENCY_TYPED + 1, 3, sh.getMaxColumns() - AGENCY_TYPED).clear();   // heading rows right of the typed columns: rewritten below
  sh.getRange(H, AGENCY_TYPED + 1, 1, sh.getMaxColumns() - AGENCY_TYPED).clear();
  sh.getRange('A1').setValue('Agency share').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2:K3').merge().setValue('One row per group passed between agencies: type the yellow columns. Price per person: leave it empty to use ' +
    'the tour price in Settings. "Sender gets" is what the agency that sends the guests receives per person; the receiving agency keeps the rest. ' +
    'Totals and the summary on the right are worked out by themselves. Summary month: type it in the yellow cell (e.g. 10/2026), empty = all.')
    .setWrap(true).setFontColor('#5a665f').setVerticalAlignment('top');
  sh.getRange(H, 1, 1, AGENCY_COLS.length).setValues([AGENCY_COLS]).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle').setBackground('#e8f0ea');
  sh.getRange(H, 1, 1, AGENCY_TYPED).setBackground('#fff2a8');
  var price = 'IF(' + R('Price per person USD') + '<>"",' + R('Price per person USD') + ',IFERROR(VLOOKUP(' + R('Tour package') + '&"",{Settings!$A$2:$A$20&"",Settings!$C$2:$C$20},2,FALSE),0))';
  var has = '(' + R('Guests') + '<>"")';
  sh.getRange(H, AGENCY_COLS.indexOf('Total USD') + 1, 1, 4).setFormulas([[
    '={"Total USD";ARRAYFORMULA(IF(' + has + ',' + R('Guests') + '*' + price + ',""))}',
    '={"Sender gets USD";ARRAYFORMULA(IF(' + has + ',' + R('Guests') + '*IFERROR(' + R('Sender gets per person USD') + '*1,0),""))}',
    '={"Receiver keeps USD";ARRAYFORMULA(IF(' + has + ',' + R('Guests') + '*(' + price + '-IFERROR(' + R('Sender gets per person USD') + '*1,0)),""))}',
    '={"Chat guide";ARRAYFORMULA(IF(LEN(REGEXREPLACE(' + R('Guide WhatsApp') + '&"","\\D",""))>=7,HYPERLINK("https://wa.me/"&REGEXREPLACE(REGEXREPLACE(' +
      R('Guide WhatsApp') + '&"","\\D",""),"^00",""),"WhatsApp"),""))}']]);
  var last = sh.getMaxRows() - H;
  sh.getRange(from, 1, last, 1).setNumberFormat('dd/mm/yyyy');
  sh.getRange(from, 2, last, 2).setNumberFormat('@'); sh.getRange(from, 10, last, 1).setNumberFormat('@');
  sh.getRange(from, 7, last, 2).setNumberFormat('#,##0.00'); sh.getRange(from, AGENCY_COLS.indexOf('Total USD') + 1, last, 3).setNumberFormat('#,##0.00');
  sh.getRange(from, 3, last, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss.getSheetByName(TABS.settings).getRange('A2:A20'), true).setAllowInvalid(true).build());
  sh.getRange(from, 1, last, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());

  // Summary per agency (right of the list): guests and money as sender and as receiver, for the month in the yellow cell.
  var S = colLetter_(AGENCY_COLS.length + 2), S2 = colLetter_(AGENCY_COLS.length + 3);
  sh.getRange(S + '1').setValue('Summary per agency').setFontSize(13).setFontWeight('bold');
  sh.getRange(S + '2').setValue('Month (mm/yyyy):').setFontWeight('bold');
  sh.getRange(S2 + '2').setNumberFormat('@').setBackground('#fff2a8').setFontWeight('bold');
  var inMonth = '(($' + S2 + '$2="")+(TEXT(' + R('Tour date') + ',"mm/yyyy")=TRIM($' + S2 + '$2)))';
  var sum = function (what, side) { return 'SUMPRODUCT((' + R(side) + '=a)*' + inMonth + '*IFERROR(' + R(what) + '*1,0))'; };
  var per = function (what, side) { return 'MAP(ag,LAMBDA(a,' + sum(what, side) + '))'; };
  var head = '{"Agency","Guests sent","Guests received","Gets as sender USD","Keeps as receiver USD","Total for agency USD"}';
  sh.getRange(S + H).setFormula('=IFERROR(LET(ag,SORT(UNIQUE(FILTER({' + R('Sending agency') + ';' + R('Receiving agency') + '},{' + R('Sending agency') + ';' +
    R('Receiving agency') + '}<>""))),g,' + per('Sender gets USD', 'Sending agency') + ',k,' + per('Receiver keeps USD', 'Receiving agency') + ',' +
    'VSTACK(' + head + ',HSTACK(ag,' + per('Guests', 'Sending agency') + ',' + per('Guests', 'Receiving agency') + ',g,k,MAP(g,k,LAMBDA(x,y,x+y))))),' + head + ')');
  sh.getRange(S + H + ':' + colLetter_(AGENCY_COLS.length + 7) + H).setFontWeight('bold').setBackground('#e8f0ea').setWrap(true);
  sh.getRange(colLetter_(AGENCY_COLS.length + 3) + from + ':' + colLetter_(AGENCY_COLS.length + 4)).setNumberFormat('0');
  sh.getRange(colLetter_(AGENCY_COLS.length + 5) + from + ':' + colLetter_(AGENCY_COLS.length + 7)).setNumberFormat('#,##0.00');
  sh.setColumnWidths(1, AGENCY_COLS.length, 110); sh.setColumnWidth(5, 150); sh.setColumnWidth(6, 150); sh.setColumnWidth(9, 140); sh.setColumnWidth(11, 180);
  sh.setColumnWidth(12, 180); sh.setColumnWidth(13, 200);
  sh.setColumnWidth(AGENCY_COLS.length + 1, 30); sh.setColumnWidth(AGENCY_COLS.length + 2, 160);
  freezeRows_(sh, H);
}

// Freezes the top n rows. A merge staff made across that line would stop it, so such a merge is split first (and logged).
function freezeRows_(sh, n) {
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).getMergedRanges().forEach(function (m) {
    if (m.getRow() <= n && m.getLastRow() > n) {
      console.warn(sh.getName() + ': split merged ' + m.getA1Notation() + ' to freeze ' + n + ' rows');
      try { m.breakApart(); } catch (e) { throw new Error(sh.getName() + ' ' + m.getA1Notation() + ': ' + e.message); }
    }
  });
  try { sh.setFrozenRows(n); } catch (e) {
    throw new Error(sh.getName() + ' (freeze ' + n + ', merges ' + sh.getRange(1, 1, Math.min(sh.getMaxRows(), n + 3), sh.getMaxColumns()).getMergedRanges()
      .map(function (m) { return m.getA1Notation(); }).join(' ') + '): ' + e.message);
  }
}

// Adds a sample group, reads the totals and the summary back, then removes it.
function agencySelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.agency), S = AGENCY_COLS.length + 2;
  var typed = sh.getRange(AGENCY_START + 1, 1, sh.getMaxRows() - AGENCY_START, AGENCY_TYPED).getValues(), row = AGENCY_START + 1;
  typed.forEach(function (r, i) { if (r.join('') !== '') row = AGENCY_START + i + 2; });   // first row after the last typed one
  if (row > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 10);
  try {
    sh.getRange(row, 1, 1, 10).setValues([[new Date(2030, 0, 15, 12), '', '001', 2, 'SELFTEST-Sender', 'SELFTEST-Receiver', 30, 10, 'Guide', "'+856 20 1111 2222"]]);
    SpreadsheetApp.flush();
    var v = sh.getRange(row, AGENCY_COLS.indexOf('Total USD') + 1, 1, 4).getDisplayValues()[0];
    if (v[0] !== '60.00' || v[1] !== '20.00' || v[2] !== '40.00' || v[3] !== 'WhatsApp') return 'totals ' + v.join('/');
    var sum = sh.getRange(AGENCY_START + 1, S, Math.max(sh.getLastRow() - AGENCY_START, 1), 6).getDisplayValues();
    var a = sum.filter(function (r) { return r[0] === 'SELFTEST-Sender'; })[0], b = sum.filter(function (r) { return r[0] === 'SELFTEST-Receiver'; })[0];
    if (!a || !b || a[1] !== '2' || a[3] !== '20.00' || b[2] !== '2' || b[4] !== '40.00' || b[5] !== '40.00') return 'summary';
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { sh.getRange(row, 1, 1, AGENCY_TYPED).clearContent(); }
}

/* ---------- New booking: staff type a booking taken on WhatsApp or at the office ----------
   Same result as the website form (Bookings + Travellers rows, so Transport, Trip sheet, Guide report and the receipt see it),
   saved by ticking the box. It runs as a simple edit trigger: nothing to approve. */
var NB_FIELDS = [   // [label, kind]; the value is typed in column B from row 4
  ['Tour', 'tour'], ['Tour date (empty for transport only)', 'date'], ['Minivan transfer', 'transfer'],
  ['Pickup date in Luang Prabang (to Nong Khiaw)', 'date'], ['Pickup place in Luang Prabang (hotel)', 'text'], ['Google Maps link of that place', 'text'],
  ['Date back to Luang Prabang (from Nong Khiaw)', 'date'], ['Pickup place in Nong Khiaw (for the way back)', 'text'],
  ['Drop at Luang Prabang train station', 'check'], ['Guest WhatsApp no', 'phone'], ['Payment method', 'pay'], ['Status', 'status'], ['Note', 'text'],
  ['Private tour (only this group)', 'check'],
  ['Booking ID (from the guest\'s WhatsApp message; empty = a new one)', 'id'],
  ['Tour price USD per person (empty = Settings price)', 'usd'], ['Transport amount kip, whole booking (empty = worked out)', 'kip']];
var NB_PASTE = 'B40', NB_IMPORT = 'B48';   // a pasted WhatsApp booking message, and its Import tick box
var NB_FIRST = 4, NB_TRAV = 24, NB_TRAV_ROWS = 10, NB_TRAV_COLS = 6, NB_SAVE = 'B36', NB_PAY = ['USD cash', 'Kip cash', 'Card (USD only, 3% bank fee)', 'BCEL QR'];

function setupNewBooking_(ss) {
  var sh = ss.getSheetByName(TABS.newBooking) || ss.insertSheet(TABS.newBooking);
  // A half-typed booking survives a rebuild: fields are matched by their label, travellers by the "Traveller" heading (rows can move).
  var keep = {};
  if (sh.getLastRow() >= NB_FIRST) sh.getRange(NB_FIRST, 1, Math.min(sh.getLastRow() - NB_FIRST + 1, 40), 2).getValues().forEach(function (r) { if (r[0]) keep[String(r[0])] = r[1]; });
  var head = sh.getLastRow() > 1 ? sh.getRange(1, 1, Math.min(sh.getLastRow(), 60), 1).getValues().map(function (r) { return r[0]; }).indexOf('Traveller') + 1 : 0;
  var keepTrav = head > 0 ? sh.getRange(head + 1, 2, NB_TRAV_ROWS, NB_TRAV_COLS).getValues() : null;
  var keepPaste = String(sh.getRange(NB_PASTE).getValue());
  sh.clear(); sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  sh.getRange('A1').setValue('New booking (WhatsApp, phone or office)').setFontSize(16).setFontWeight('bold');
  sh.getRange('A2:F2').merge().setValue('Type the yellow cells, then tick "Save booking". It is saved in Bookings and Travellers like a website booking ' +
    '(Source "WhatsApp"), so it appears in Transport, the Trip sheet, the Guide report and the Receipt. The form is then emptied for the next one.')
    .setWrap(true).setFontColor('#5a665f');
  sh.setRowHeight(2, 48);
  var tours = ss.getSheetByName(TABS.settings).getRange('A2:B20').getValues().filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return String(r[0]).trim() + ' · ' + r[1]; }).concat([TRANSPORT_ONLY + ' · Transport only (no tour)']);
  var rule = function (list) { return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build(); };
  NB_FIELDS.forEach(function (f, i) {
    var row = NB_FIRST + i, cell = sh.getRange(row, 2);
    sh.getRange(row, 1).setValue(f[0]).setFontWeight('bold');
    cell.setBackground('#fff2a8');
    if (f[1] === 'tour') cell.setDataValidation(rule(tours));
    if (f[1] === 'transfer') cell.setDataValidation(rule(TRANSFERS));
    if (f[1] === 'pay') cell.setDataValidation(rule(NB_PAY));
    if (f[1] === 'status') cell.setDataValidation(rule(STATUSES));
    if (f[1] === 'date') cell.setNumberFormat('dd/mm/yyyy').setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build());
    if (f[1] === 'phone' || f[1] === 'id') cell.setNumberFormat('@');
    if (f[1] === 'usd') cell.setNumberFormat('#,##0.00');
    if (f[1] === 'kip') cell.setNumberFormat('#,##0');
    if (f[1] === 'check') cell.insertCheckboxes();
    var was = keep.hasOwnProperty(f[0]) ? keep[f[0]] : '';
    cell.setValue(was !== '' ? was : f[1] === 'transfer' ? 'No' : f[1] === 'status' ? 'Confirmed' : f[1] === 'check' ? false : '');
  });
  sh.getRange(NB_TRAV - 1, 1, 1, 7).setValues([['Traveller', 'First name', 'Last name', 'Nationality', 'Food', 'Passport no (optional)', 'Takeaway lunch (optional)']])
    .setFontWeight('bold').setBackground('#e8f0ea');
  for (var t = 0; t < NB_TRAV_ROWS; t++) sh.getRange(NB_TRAV + t, 1).setValue(t + 1).setHorizontalAlignment('left');
  sh.getRange(NB_TRAV, 2, NB_TRAV_ROWS, NB_TRAV_COLS).setBackground('#fff2a8');
  var dishes = [];   // "Pad Thai (Chicken)", as in Travellers
  lunchMenuJson_(ss).forEach(function (d) { (d.choices.length ? d.choices : ['']).forEach(function (c) { dishes.push(d.dish + (c ? ' (' + c + ')' : '')); }); });
  if (dishes.length) sh.getRange(NB_TRAV, 7, NB_TRAV_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(dishes.slice(0, 500), true).setAllowInvalid(false).build());
  sh.getRange(NB_TRAV, 5, NB_TRAV_ROWS, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Regular', 'Vegetarian', 'Vegan', 'Gluten-free'], true).setAllowInvalid(true).build());
  sh.getRange(NB_TRAV, 6, NB_TRAV_ROWS, 1).setNumberFormat('@');
  if (keepTrav) sh.getRange(NB_TRAV, 2, NB_TRAV_ROWS, NB_TRAV_COLS).setValues(keepTrav);
  sh.getRange(NB_SAVE).offset(0, -1).setValue('Save booking →').setFontWeight('bold').setFontSize(12);
  sh.getRange(NB_SAVE).insertCheckboxes().setValue(false).setBackground('#cfe2a8');
  // A website booking that did not reach the sheet: paste the guest's WhatsApp message (it holds everything) and tick Import.
  sh.getRange('A38:F38').merge().setValue('WEBSITE BOOKING MISSING FROM THE SHEET? Paste the guest\'s whole WhatsApp booking message ("Hello! I would like to book: ...") ' +
    'into the yellow box below and tick "Import". It is saved with the guest\'s own Booking ref, like a website booking.').setFontWeight('bold').setWrap(true).setFontColor('#2f6b4f');
  sh.setRowHeight(38, 40);
  sh.getRange('A40').setValue('WhatsApp message →').setFontWeight('bold').setVerticalAlignment('top');
  var box = sh.getRange('B40:F46');
  box.getMergedRanges().forEach(function (m) { m.breakApart(); });
  box.merge().setBackground('#fff2a8').setWrap(true).setVerticalAlignment('top').setNumberFormat('@').setValue(keepPaste);
  sh.getRange(NB_IMPORT).offset(0, -1).setValue('Import →').setFontWeight('bold').setFontSize(12);
  sh.getRange(NB_IMPORT).insertCheckboxes().setValue(false).setBackground('#cfe2a8');
  sh.setColumnWidth(1, 330); sh.setColumnWidths(2, 6, 170); sh.setColumnWidth(2, 260); sh.setColumnWidth(7, 230);
  freezeRows_(sh, 2);
}

// The ticked box on the New booking tab: check the form, save it as a booking, empty the form.
function saveManualBooking_(ss) {
  var sh = ss.getSheetByName(TABS.newBooking), box = sh.getRange(NB_SAVE), msg = box.offset(0, 1);
  var f = sh.getRange(NB_FIRST, 2, NB_FIELDS.length, 1).getValues().map(function (r) { return r[0]; });
  var get = function (label) { for (var i = 0; i < NB_FIELDS.length; i++) if (NB_FIELDS[i][0] === label) return f[i]; return ''; };
  var ymd = function (v) { return v instanceof Date ? Utilities.formatDate(v, TIME_ZONE, 'yyyy-MM-dd') : ''; };
  var stop = function (why) { box.setValue(false); msg.setValue(why).setFontColor('#a33'); ss.toast(why, 'Not saved', 10); };
  var tour = String(get('Tour')).split(' · ')[0].trim(), transfer = String(get('Minivan transfer') || 'No');
  var trav = sh.getRange(NB_TRAV, 2, NB_TRAV_ROWS, NB_TRAV_COLS).getValues().filter(function (r) { return String(r[0]).trim() || String(r[1]).trim(); });
  if (!tour) return stop('Choose the tour (or "Transport only").');
  if (!trav.length) return stop('Type at least one traveller\'s name.');
  if (tour !== TRANSPORT_ONLY && !(get('Tour date (empty for transport only)') instanceof Date)) return stop('Type the tour date.');
  if (tour === TRANSPORT_ONLY && transfer === 'No') return stop('Transport only: choose the minivan transfer.');
  if (goesUp_(transfer) && !(get('Pickup date in Luang Prabang (to Nong Khiaw)') instanceof Date)) return stop('Type the pickup date in Luang Prabang.');
  if (goesDown_(transfer) && !(get('Date back to Luang Prabang (from Nong Khiaw)') instanceof Date)) return stop('Type the date back to Luang Prabang.');
  var typedId = String(get('Booking ID (from the guest\'s WhatsApp message; empty = a new one)')).trim().toUpperCase();
  if (typedId && !/^[A-Z0-9-]{4,20}$/.test(typedId)) return stop('Booking ID: letters, numbers and - only (like NK261019-ZX50).');
  var bkIds = ss.getSheetByName(TABS.bookings).getRange('A:A').getDisplayValues().map(function (r) { return r[0]; });
  if (typedId && bkIds.indexOf(typedId) !== -1) return stop('Booking ' + typedId + ' is already in Bookings: change it there instead.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var id = typedId || ('NK' + Utilities.formatDate(new Date(), TIME_ZONE, 'yyMMdd') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 4).toUpperCase());
    var up = goesUp_(transfer), nkPlace = String(get('Pickup place in Nong Khiaw (for the way back)')).trim();
    saveBooking_(ss, {
      id: id, tour: tour, date: ymd(get('Tour date (empty for transport only)')), transfer: transfer,
      pickupDate: ymd(get('Pickup date in Luang Prabang (to Nong Khiaw)')), returnDate: ymd(get('Date back to Luang Prabang (from Nong Khiaw)')),
      hotel: up ? get('Pickup place in Luang Prabang (hotel)') : nkPlace, map: up ? get('Google Maps link of that place') : '',
      train: get('Drop at Luang Prabang train station') === true, payment: get('Payment method'), phone: String(get('Guest WhatsApp no')),
      source: 'WhatsApp', lang: 'Staff', note: get('Note'), private: get('Private tour (only this group)') === true,
      travellers: trav.map(function (r) {
        var lunch = /^(.*?)(?: \((.*)\))?$/.exec(String(r[5]).trim());   // "Pad Thai (Chicken)" -> dish, choice
        return { first: r[0], last: r[1], nat: r[2], food: r[3] || 'Regular', pass: r[4], pickup: 'same', lunch: lunch[1], lunchChoice: lunch[2] || '' };
      })
    });
    var bk = ss.getSheetByName(TABS.bookings), ids = bk.getRange(1, 1, bk.getLastRow(), 1).getDisplayValues().map(function (r) { return r[0]; });
    var row = ids.lastIndexOf(id) + 1, col = function (c) { return BOOKING_COLS.indexOf(c) + 1; };
    if (row > 1) {
      bk.getRange(row, col('Status')).setValue(get('Status') || 'Confirmed');
      if (up && nkPlace) bk.getRange(row, col('Pickup in Nong Khiaw')).setValue(nkPlace);
      // prices agreed with the guest instead of the Settings prices
      var usd = Number(get('Tour price USD per person (empty = Settings price)')), kip = get('Transport amount kip, whole booking (empty = worked out)');
      if (usd > 0) bk.getRange(row, col('Est. tour USD')).setValue(usd * trav.length);
      if (kip !== '' && Number(kip) >= 0) bk.getRange(row, col('Est. transfer kip')).setValue(Number(kip));
    }
    sh.getRange(NB_FIRST, 2, NB_FIELDS.length, 1).setValues(NB_FIELDS.map(function (x) {
      return [x[1] === 'transfer' ? 'No' : x[1] === 'status' ? 'Confirmed' : x[1] === 'check' ? false : '']; }));
    sh.getRange(NB_TRAV, 2, NB_TRAV_ROWS, NB_TRAV_COLS).clearContent();
    box.setValue(false);
    msg.setValue('Saved: ' + id + ' (' + trav.length + ' pax). Pick it in the Receipt tab for the receipt.').setFontColor('#2f6b4f');
    sortBookings_(ss); buildTransport_(ss);
    ss.toast('Booking ' + id + ' saved.', 'New booking', 8);
  } catch (err) {
    box.setValue(false);
    msg.setValue('Not saved: ' + (err.message || err)).setFontColor('#a33');
    throw err;   // also listed under Apps Script > Executions
  } finally { lock.releaseLock(); }
}

// The website's WhatsApp message (js/main.js builds it) back into the booking it describes. Copied from WhatsApp, lines may start
// with "• " or "- ". Returns { d: booking for saveBooking_ } or { error }.
function parseWhatsAppBooking_(text) {
  var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/^[\s\u2022\u00b7*-]+/, '').trim(); }).filter(String);
  var find = function (re) { for (var i = 0; i < lines.length; i++) { var m = re.exec(lines[i]); if (m) return m; } return null; };
  var ymd = function (dmy) {   // dd/mm/yy or dd/mm/yyyy -> yyyy-mm-dd
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(dmy || '').trim());
    if (!m) return '';
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  };
  var ref = find(/^Booking ref:\s*([A-Za-z0-9-]+)/), tour = find(/^(?:Package|Tour)\s+(\d{3})\b/);
  var only = find(/^Transport only/i);
  if (!ref) return { error: 'No "Booking ref" in the message: paste the whole message, from "Hello! I would like to book".' };
  if (!tour && !only) return { error: 'The tour (Package 101, 102, 103, Tour 001 or Transport only) is missing in the message.' };
  var date = find(/^Date:\s*(\S+)/), transfer = find(/^Minivan transfer:\s*(.+)$/);
  var t = transfer ? transfer[1].trim() : 'No';
  if (TRANSFERS.indexOf(t) === -1) t = 'No';
  var back = find(/^Date back[^:]*:\s*(\S+)(.*)$/), pick = find(/^Pickup date[^:]*:\s*(\S+)/);
  var hotel = find(/^Accommodation(?: in Nong Khiaw)?:\s*(.+)$/), map = find(/^Google Maps:\s*(\S+)/);
  var nk = find(/^Pickup in Nong Khiaw \(way back\):\s*(.+)$/), drop = find(/^Drop-off in Luang Prabang:\s*(.+)$/);
  var pay = find(/^Payment method:\s*(.+)$/), noteAt = String(text).search(/\n\s*Note:\s*/);
  var people = [], cur = null;
  lines.forEach(function (l) {
    var head = /^Traveller (\d+):\s*(.*)$/.exec(l);
    if (head) { cur = { name: head[2], first: '', last: '', gender: '', nat: '', pass: '', issued: '', expires: '', food: 'Regular', pickup: 'same', lunch: '', lunchChoice: '' }; people.push(cur); return; }
    if (!cur) return;
    var m;
    if ((m = /^First name:\s*(.*)$/.exec(l))) cur.first = m[1];
    else if ((m = /^Last name:\s*(.*)$/.exec(l))) cur.last = m[1];
    else if ((m = /^Gender:\s*(.*)$/.exec(l))) cur.gender = m[1];
    else if ((m = /^Nationality:\s*(.*)$/.exec(l))) cur.nat = m[1];
    else if ((m = /^Passport:\s*(\S*)\s*\(issued\s*(\S+),\s*expires\s*([^)\s]+)\)/.exec(l))) { cur.pass = m[1]; cur.issued = ymd(m[2]); cur.expires = ymd(m[3]); }
    else if ((m = /^Food:\s*(.*)$/.exec(l))) cur.food = m[1] || 'Regular';
    else if ((m = /^Takeaway lunch:\s*(.+?)(?:\s*\((.+)\))?,\s*[\d,.]+\s*kip$/i.exec(l))) { cur.lunch = m[1]; cur.lunchChoice = m[2] || ''; }
    else if (/^(Takeaway lunch total|Note):/.test(l)) cur = null;
  });
  if (!people.length) return { error: 'No travellers ("Traveller 1: ...") in the message.' };
  var dt = ymd(date && date[1]);
  if (!only && !dt) return { error: 'The tour date ("Date: dd/mm/yy") is missing in the message.' };
  var plan = back && /last day of the tour/i.test(back[2]) ? 'end' : back && /10:30/.test(back[2]) ? 'later' : '';
  return { d: {
    type: 'booking', id: ref[1].toUpperCase(), tour: only ? TRANSPORT_ONLY : tour[1], date: only ? '' : dt, transfer: t,
    pickupDate: ymd(pick && pick[1]), returnDate: ymd(back && back[1]), returnPlan: plan,
    private: !!find(/^PRIVATE TOUR/), nkPickup: nk && !/^our office/i.test(nk[1]) ? nk[1] : '',
    hotel: hotel ? hotel[1] : '', map: map ? map[1] : '', train: !!(drop && /train/i.test(drop[1])),
    payment: pay ? pay[1] : '', phone: '', source: 'Website (from WhatsApp)', lang: 'Staff',
    note: noteAt >= 0 ? String(text).slice(noteAt).replace(/^\s*Note:\s*/, '').trim() : '',
    travellers: people } };
}

// Import tick on the New booking tab: the pasted message becomes the booking (same Booking ref), form emptied.
function importWhatsAppBooking_(ss) {
  var sh = ss.getSheetByName(TABS.newBooking), box = sh.getRange(NB_IMPORT), msg = box.offset(0, 1);
  var stop = function (why) { box.setValue(false); msg.setValue(why).setFontColor('#a33'); ss.toast(why, 'Not imported', 10); };
  var p = parseWhatsAppBooking_(sh.getRange(NB_PASTE).getValue());
  if (p.error) return stop(p.error);
  var ids = ss.getSheetByName(TABS.bookings).getRange('A:A').getDisplayValues().map(function (r) { return r[0]; });
  if (ids.indexOf(p.d.id) !== -1) return stop('Booking ' + p.d.id + ' is already in Bookings.');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    saveBooking_(ss, p.d);
    sh.getRange(NB_PASTE).clearContent(); box.setValue(false);
    msg.setValue('Imported ' + p.d.id + ' (' + p.d.travellers.length + ' pax). Pick it in the Receipt tab for the receipt.').setFontColor('#2f6b4f');
    sortBookings_(ss); buildTransport_(ss);
    ss.toast('Booking ' + p.d.id + ' imported (' + p.d.travellers.length + ' pax).', 'New booking', 8);
  } catch (err) {
    box.setValue(false); msg.setValue('Not imported: ' + (err.message || err)).setFontColor('#a33');
    throw err;
  } finally { lock.releaseLock(); }
}

// A message exactly as the website writes it (5 lines of travellers, lunch with a choice, round trip, Nong Khiaw office) is imported.
function importSelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.newBooking), paste = sh.getRange(NB_PASTE), keep = paste.getValue();
  var id = ('SELFTEST-I' + new Date().getTime().toString(36).slice(-6)).toUpperCase(), menu = lunchMap_(ss);   // refs are saved in capitals
  var dish = Object.keys(menu).filter(function (k) { return menu[k].choices.length; })[0];
  var text = ['Hello! I would like to book:', 'Package 101: Overnight Camping Above the Clouds 360° Viewpoint (USD 30)', 'Booking ref: ' + id,
    'Date: 25/02/30', 'People: 2', 'Payment method: Kip cash', 'Minivan transfer: Round trip', 'Pickup date (Luang Prabang to Nong Khiaw): 25/02/30',
    'Date back (Nong Khiaw to Luang Prabang): 26/02/30', 'Drop-off in Luang Prabang: city centre near the night market', 'Accommodation: SELFTEST Elephant',
    'Google Maps: https://maps.app.goo.gl/x', 'Pickup in Nong Khiaw (way back): our office inside The Trio Bar & Cafe', '',
    'Traveller 1: SELFTEST-Aden Alsop', '• First name: SELFTEST-Aden', '• Last name: Alsop', '• Gender: Male', '• Nationality: Australian',
    '• Passport: RA8392450 (issued 18/02/25, expires 18/02/35)', '• Food: Regular', '• Takeaway lunch: ' + dish + ' (' + menu[dish].choices[0] + '), 69,000 kip', '',
    'Traveller 2: Heine Brunborg', '• First name: Heine', '• Last name: Brunborg', '• Gender: Male', '• Nationality: Norway',
    '• Passport: CFC647265 (issued 27/06/24, expires 27/06/34)', '• Food: Vegetarian', '', 'Note: no peanuts'].join('\n');
  try {
    paste.setValue(text); sh.getRange(NB_IMPORT).setValue(true); importWhatsAppBooking_(ss);
    var b = ss.getSheetByName(TABS.bookings).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; })[0];
    var t = ss.getSheetByName(TABS.travellers).getDataRange().getDisplayValues().filter(function (r) { return r[0] === id; });
    if (!b) return 'not saved: ' + sh.getRange(NB_IMPORT).offset(0, 1).getDisplayValue();
    var c = function (n) { return b[BOOKING_COLS.indexOf(n)]; };
    if (c('Tour') !== '101' || c('Tour date') !== '25/02/2030' || c('Transfer') !== 'Round trip' || c('Return date') !== '26/02/2030' ||
      c('People') !== '2' || c('Accommodation') !== 'SELFTEST Elephant' || c('Payment method') !== 'Kip cash' || c('Note') !== 'no peanuts' ||
      c('Pickup in Nong Khiaw') !== NK_OFFICE) return 'booking: ' + [c('Tour'), c('Tour date'), c('Transfer'), c('Return date'), c('People'), c('Note')].join('/');
    if (t.length !== 2 || t[0][TRAVELLER_COLS.indexOf('Passport no')] !== 'RA8392450' || t[0][TRAVELLER_COLS.indexOf('Passport expires')] !== '18/02/2035' ||
      t[0][TRAVELLER_COLS.indexOf('Takeaway lunch')] !== dish + ' (' + menu[dish].choices[0] + ')' || t[1][TRAVELLER_COLS.indexOf('Food')] !== 'Vegetarian') return 'travellers';
    if (parseWhatsAppBooking_('Hello').error === undefined) return 'bad text accepted';
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { paste.setValue(keep); sh.getRange(NB_IMPORT).setValue(false); }
}

// Saves a transport-only booking back to Luang Prabang through the New booking tab and checks Bookings and the Transport
// message; whatever staff had half-typed in the form is put back. The SELFTEST rows are removed by selfTest_.
function newBookingSelfTest_(ss) {
  var sh = ss.getSheetByName(TABS.newBooking), tp = ss.getSheetByName(TABS.transport), tDate = tp.getRange('B2').getValue();
  var form = sh.getRange(NB_FIRST, 2, NB_FIELDS.length, 1), trav = sh.getRange(NB_TRAV, 2, NB_TRAV_ROWS, NB_TRAV_COLS);
  var savedForm = form.getValues(), savedTrav = trav.getValues();
  try {
    var back = new Date(2030, 0, 20, 12);
    form.setValues(NB_FIELDS.map(function (f) {
      return [{ 'Tour': TRANSPORT_ONLY + ' · Transport only (no tour)', 'Minivan transfer': 'One way to Luang Prabang', 'Date back to Luang Prabang (from Nong Khiaw)': back,
        'Pickup place in Nong Khiaw (for the way back)': 'SELFTEST hostel', 'Status': 'Confirmed', 'Payment method': 'USD cash', 'Drop at Luang Prabang train station': false,
        'Private tour (only this group)': true, 'Tour price USD per person (empty = Settings price)': '',
        'Transport amount kip, whole booking (empty = worked out)': 333000 }[f[0]] || ''];
    }));
    trav.clearContent();
    var dish = lunchDishes_(ss)[0] || '';   // the first dish on the menu now
    sh.getRange(NB_TRAV, 2, 2, NB_TRAV_COLS).setValues([['SELFTEST-Lead', 'Person', 'France', 'Regular', '', ''], ['Second', 'Guest', 'France', 'Vegan', '', dish]]);
    saveManualBooking_(ss);
    var bk = ss.getSheetByName(TABS.bookings), v = bk.getDataRange().getValues(), h = v[0];
    var b = v.filter(function (r) { return r[h.indexOf('Lead name')] === 'SELFTEST-Lead Person'; }).pop();
    if (!b) return 'not saved';
    if (b[h.indexOf('Transfer')] !== 'One way to Luang Prabang' || dayKey_(b[h.indexOf('Return date')]) !== '2030-01-20' || b[h.indexOf('Pickup date')] !== '' ||
      b[h.indexOf('Est. transfer kip')] !== 333000 || b[h.indexOf('Pickup in Nong Khiaw')] !== 'SELFTEST hostel' || b[h.indexOf('Status')] !== 'Confirmed') return 'booking row: ' + ['Transfer', 'Return date', 'Pickup date', 'Est. transfer kip', 'Pickup in Nong Khiaw', 'Status']
      .map(function (c) { var x = b[h.indexOf(c)]; return c + '=' + (x instanceof Date ? dayKey_(x) : x); }).join(' / ');
    if (b[h.indexOf('Private tour')] !== 'Yes' || b[h.indexOf('Takeaway lunch')] !== (dish ? dish + ' 1' : '')) return 'private tour / lunch: ' + b[h.indexOf('Private tour')] + '/' + b[h.indexOf('Takeaway lunch')];
    tp.getRange('B2').setValue(back); buildTransport_(ss);
    var rows = tp.getRange(TRANSPORT_START, 1, tp.getLastRow() - TRANSPORT_START + 1, TRANSPORT_WIDTH).getValues();
    var dep = rows.filter(function (r) { return r[1] === b[0] && r[TRANSPORT_WIDTH - 1] === 'dep' && r[12]; })[0];
    if (!dep) return 'transport row';
    if (dep[12].indexOf('ຜູ້ຕິດຕາມ: Second Guest') === -1 || dep[12].indexOf('ບ່ອນຮັບໜອງຂຽວ: SELFTEST hostel') === -1 || dep[12].indexOf('ຂຶ້ນ') !== -1) return 'team message';
    if (rows.some(function (r) { return r[1] === b[0] && r[TRANSPORT_WIDTH - 1] === 'arr'; })) return 'went up';
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { form.setValues(savedForm); trav.setValues(savedTrav); tp.getRange('B2').setValue(tDate); buildTransport_(ss); }
}

// A typed cell in Travellers. Takeaway lunch: the traveller's price follows the Lunch menu, and the booking's Takeaway lunch /
// Lunch kip (what the receipt shows) are added up again, so a lunch ordered on WhatsApp after booking just goes in here.
// Traveller status: the Transport list and the reports leave that traveller out.
function travellerEdited_(ss, range) {
  var sh = range.getSheet(), at = function (c) { return TRAVELLER_COLS.indexOf(c) + 1; };
  var first = range.getColumn(), last = first + range.getNumColumns() - 1, hit = function (c) { return at(c) >= first && at(c) <= last; };
  if (hit('Takeaway lunch')) {
    var menu = lunchMap_(ss), ids = {}, n = Math.min(range.getNumRows(), 200);
    for (var i = 0; i < n; i++) {
      var row = range.getRow() + i, id = String(sh.getRange(row, 1).getValue());
      if (!id) continue;
      var m = /^(.*?)(?:\s*\((.*)\))?$/.exec(String(sh.getRange(row, at('Takeaway lunch')).getValue()).trim()), item = menu[m[1].trim()];
      sh.getRange(row, at('Lunch kip')).setValue(item ? item.price : '');
      ids[id] = true;
    }
    var done = Object.keys(ids).filter(function (id) { return syncLunch_(ss, id); });
    if (done.length) ss.toast('Takeaway lunch added up for ' + done.join(', ') + ' (Bookings and the receipt follow).', 'Travellers', 6);
  }
  if (hit('Traveller status')) buildTransport_(ss);
  if (hit('Food')) {   // "No pork" for one guest: the booking's Food summary ("Regular 1, No pork 1") follows; the receipt and reports read Travellers
    var fids = {};
    for (var f = 0; f < Math.min(range.getNumRows(), 200); f++) { var fid = String(sh.getRange(range.getRow() + f, 1).getValue()); if (fid) fids[fid] = true; }
    Object.keys(fids).forEach(function (id) { syncFood_(ss, id); });
  }
}

function syncFood_(ss, id) {
  var tr = ss.getSheetByName(TABS.travellers), bk = ss.getSheetByName(TABS.bookings);
  var at = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }).indexOf(id);
  if (at < 1 || tr.getLastRow() < 2) return;
  var count = {};
  tr.getRange(2, 1, tr.getLastRow() - 1, TRAVELLER_COLS.length).getValues().forEach(function (r) {
    if (String(r[0]) !== id) return;
    var f = String(r[TRAVELLER_COLS.indexOf('Food')]).trim() || 'Regular'; count[f] = (count[f] || 0) + 1;
  });
  bk.getRange(at + 1, BOOKING_COLS.indexOf('Food') + 1).setValue(Object.keys(count).map(function (f) { return f + ' ' + count[f]; }).join(', '));
}

// The booking's Takeaway lunch text ("Pad Thai (Chicken) 1; Avocado sandwich 2") and Lunch kip from its travellers' rows.
function syncLunch_(ss, id) {
  var tr = ss.getSheetByName(TABS.travellers), bk = ss.getSheetByName(TABS.bookings);
  var bids = bk.getRange(1, 1, bk.getLastRow(), 1).getValues().map(function (r) { return String(r[0]); }), at = bids.indexOf(id);
  if (at < 1 || tr.getLastRow() < 2) return false;
  var rows = tr.getRange(2, 1, tr.getLastRow() - 1, TRAVELLER_COLS.length).getValues(), count = {}, kip = 0;
  rows.forEach(function (r) {
    if (String(r[0]) !== id) return;
    var txt = String(r[TRAVELLER_COLS.indexOf('Takeaway lunch')]).trim();
    if (!txt) return;
    count[txt] = (count[txt] || 0) + 1; kip += Number(r[TRAVELLER_COLS.indexOf('Lunch kip')]) || 0;
  });
  var text = Object.keys(count).map(function (k) { return k + ' ' + count[k]; }).join('; ');
  bk.getRange(at + 1, BOOKING_COLS.indexOf('Takeaway lunch') + 1).setValue(text);
  bk.getRange(at + 1, BOOKING_COLS.indexOf('Lunch kip') + 1).setValue(kip || '');
  return true;
}

// Menu Bookings > Recalculate amounts: for the selected booking rows, tour USD, transfer kip and lunch kip again at today's prices
// (old bookings keep the price they were made at; this is how to bring one to the current price).
function recalcSelectedBookings() {
  var ss = SpreadsheetApp.getActive(), sh = ss.getActiveSheet();
  if (sh.getName() !== TABS.bookings) { SpreadsheetApp.getUi().alert('Select the booking row(s) on the Bookings tab first.'); return; }
  var range = sh.getActiveRange(), n = 0;
  for (var r = Math.max(range.getRow(), 2); r < range.getRow() + range.getNumRows() && n < 50; r++) {
    var id = String(sh.getRange(r, 1).getValue());
    if (!id) continue;
    sh.getRange(r, BOOKING_COLS.indexOf('Est. tour USD') + 1).clearContent();
    fillAmounts_(ss, r, true);
    syncLunch_(ss, id);
    n++;
  }
  ss.toast(n + ' booking(s) recalculated at today\'s prices.', 'Bookings', 6);
}

// Bookings columns the Transport list shows: typing in one of them redraws the list at once.
var TRANSPORT_SOURCES = ['Booking ID', 'Lead name', 'Transfer', 'Pickup date', 'Return date', 'Train station drop-off', 'Accommodation',
  'Maps link', 'Status', 'Receipt No', 'WhatsApp no', 'Pickup in Nong Khiaw', 'Vehicle to Nong Khiaw', 'Vehicle to Luang Prabang', 'Transport remark'];

// A typed cell in Bookings. A return date added to a one-way booking makes it a round trip (the transfer estimate follows),
// so a guest who decides later to ride back appears on the Transport list for that day.
function bookingEdited_(ss, range) {
  var bk = range.getSheet(), first = range.getColumn(), last = first + range.getNumColumns() - 1;
  var at = function (c) { return BOOKING_COLS.indexOf(c) + 1; };
  if (range.getNumRows() === 1 && first <= at('Return date') && last >= at('Return date')) {
    var row = range.getRow(), transfer = bk.getRange(row, at('Transfer'));
    if (bk.getRange(row, at('Return date')).getValue() instanceof Date && /one way/i.test(String(transfer.getValue())) && !/luang prabang/i.test(String(transfer.getValue()))) {
      var id = String(bk.getRange(row, 1).getValue()), k = kipPrices_(ss), tr = ss.getSheetByName(TABS.travellers);
      var riders = tr.getLastRow() < 2 ? [] : tr.getRange(2, 1, tr.getLastRow() - 1, TRAVELLER_COLS.length).getValues().filter(function (t) {
        var place = String(t[TRAVELLER_COLS.indexOf('Pickup place')]);
        return String(t[0]) === id && place !== 'No transfer';
      });
      var n = riders.length || Number(bk.getRange(row, at('People')).getValue()) || 1;
      var train = bk.getRange(row, at('Train station drop-off')).getValue() === 'Yes';
      transfer.setValue('Round trip');
      bk.getRange(row, at('Est. transfer kip')).setValue((k.round + (train ? k.train : 0)) * n);
      ss.toast('Transfer changed to "Round trip" and the transfer estimate updated. The Transport tab shows the return on that day.', 'Bookings', 8);
    }
  }
  var hit = function (c) { return at(c) >= first && at(c) <= last; };
  if (range.getNumRows() === 1 && (hit('Transfer') || hit('Train station drop-off') || hit('People'))) {
    fillAmounts_(ss, range.getRow(), true);   // the transfer estimate follows the new choice
  }
  if (hit('Takeaway lunch') || hit('Lunch kip')) {
    ss.toast('Takeaway lunch is kept per traveller: type it in the Travellers tab (column Takeaway lunch) and the booking and receipt follow. Typed here, the Lunch report will not see it.', 'Bookings', 10);
  }
  if (hit('Status')) {
    for (var r = range.getRow(); r < range.getRow() + range.getNumRows(); r++) {
      if (String(bk.getRange(r, at('Status')).getValue()) !== 'Cancelled') continue;
      var notes = bk.getRange(r, at('Staff notes')), was = String(notes.getValue());
      if (was.indexOf('Cancelled ') === -1) notes.setValue((was ? was + ' | ' : '') + 'Cancelled ' + Utilities.formatDate(new Date(), TIME_ZONE, 'dd/MM/yyyy'));
      ss.toast('Booking cancelled (date saved in Staff notes). It is left out of the Trip sheet, Guide report, Transport and Dashboard totals.', 'Bookings', 8);
    }
  }
  if (TRANSPORT_SOURCES.some(hit)) buildTransport_(ss);
}

// Fills a booking's amounts the receipt uses when they are empty (bookings typed by hand or imported): tour price x people,
// transfer by type x travellers taking it, takeaway lunch from the Lunch menu. transferToo recomputes the transfer even
// when it is set (the Transfer choice changed). Returns true when something was written.
function fillAmounts_(ss, row, transferToo) {
  var bk = ss.getSheetByName(TABS.bookings), at = function (c) { return BOOKING_COLS.indexOf(c) + 1; };
  var v = bk.getRange(row, 1, 1, BOOKING_COLS.length).getValues()[0], V = function (c) { return v[at(c) - 1]; };
  var id = String(V('Booking ID')), people = Number(V('People')) || 0, changed = false;
  if (!id) return false;
  var set = function (c, x) { bk.getRange(row, at(c)).setValue(x); changed = true; };
  var tour = String(V('Tour')).replace(/^'/, '');
  if (V('Est. tour USD') === '' && tour && tour !== TRANSPORT_ONLY && people) set('Est. tour USD', tourInfo_(ss, tour).price * people);
  var transfer = String(V('Transfer'));
  if (transferToo || V('Est. transfer kip') === '') {
    var k = kipPrices_(ss), legs = (goesUp_(transfer) ? 1 : 0) + (goesDown_(transfer) ? 1 : 0);
    var tr = ss.getSheetByName(TABS.travellers), riders = tr.getLastRow() < 2 ? [] : tr.getRange(2, 1, tr.getLastRow() - 1, TRAVELLER_COLS.length).getValues()
      .filter(function (t) { return String(t[0]) === id && String(t[TRAVELLER_COLS.indexOf('Pickup place')]) !== 'No transfer'; });
    var n = riders.length || people;
    var kip = legs ? ((legs === 2 ? k.round : k.one) + (V('Train station drop-off') === 'Yes' && goesDown_(transfer) ? k.train : 0)) * n : 0;
    if (kip !== V('Est. transfer kip') && (kip || V('Est. transfer kip') !== '')) set('Est. transfer kip', kip || '');
  }
  if (V('Lunch kip') === '' && String(V('Takeaway lunch')).trim()) {   // "Pad Thai (Chicken) 1; Avocado sandwich 2"
    var menu = lunchMap_(ss), total = 0;
    String(V('Takeaway lunch')).split(';').forEach(function (part) {
      var m = /^(.*?)(?:\s*\((.*)\))?\s+(\d+)$/.exec(part.trim());
      if (m && menu[m[1].trim()]) total += menu[m[1].trim()].price * Number(m[3]);
    });
    if (total) set('Lunch kip', total);
  }
  return changed;
}

// Cancelled bookings show grey and struck through in Bookings (the row and its colour stay; reports leave them out).
function greyCancelled_(ss) {
  var sh = ss.getSheetByName(TABS.bookings), c = colLetter_(BOOKING_COLS.indexOf('Status') + 1);
  var formula = '=$' + c + '2="Cancelled"';
  var rules = sh.getConditionalFormatRules().filter(function (r) {
    var b = r.getBooleanCondition(); return !(b && b.getCriteriaValues()[0] === formula); });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setFontColor('#9aa39e').setStrikethrough(true)
    .setRanges([sh.getRange(2, 1, sh.getMaxRows() - 1, BOOKING_COLS.length)]).build());
  sh.setConditionalFormatRules(rules);
}

function transportSelfTest_(ss, id) {
  var sh = ss.getSheetByName(TABS.transport), cell = sh.getRange('B2'), saved = cell.getValue();
  var find = function (kind) {
    var v = sh.getRange(TRANSPORT_START, 1, Math.max(sh.getLastRow() - TRANSPORT_START + 1, 1), TRANSPORT_WIDTH).getValues();
    for (var i = 0; i < v.length; i++) if (v[i][1] === id && v[i][TRANSPORT_WIDTH - 1] === kind) return { row: TRANSPORT_START + i, v: v[i] };
    return null;
  };
  try {
    cell.setValue(new Date(2030, 0, 15, 12)); buildTransport_(ss);
    var a = find('arr');
    if (!a || a.v[4] !== 'Test Person' || a.v[7] !== 'Test hostel' || a.v[5] !== 1) return 'arrival row';
    sh.getRange(a.row, 4).setValue('+856 20 1234 5678'); sh.getRange(a.row, 10).setValue('ກກ 5696');
    saveTransportEdit_(ss, sh.getRange(a.row, 4, 1, 7));
    a = find('arr');
    var f = sh.getRange(a.row, 12).getFormula();
    if (a.v[12].indexOf('Booking id: ' + id + '\nReceipt no: ') !== 0 || a.v[12].indexOf('\nໄປກັບ 1pax\n') === -1 || a.v[12].indexOf('ສົ່ງສະຖານີລົດໄຟ') === -1) return 'team message';
    var totals = sh.getRange(a.row, 5, sh.getLastRow() - a.row + 1, 2).getValues().filter(function (v) { return v[0] === 'Total'; });
    if (String(sh.getRange(TRANSPORT_START - 1, 1).getValue()).indexOf('↑ ຂຶ້ນ') !== 0 || !totals.length || totals[0][1] !== '1 pax') return 'labels/total';
    if (a.v[12].indexOf('\n**\nລົງ:') === -1) return 'separator';
    var st = pickupStops_([{ name: 'A', place: 'X', map: '' }, { name: 'B', place: 'Y', map: '' }, { name: 'C', place: 'x', map: '' }]);
    var sm = stopMessage_(st[1], 1, 2, new Date(2030, 0, 15, 12), 'SELFTEST-S', '7', 'A', '+856 20 1234 5678');
    if (st.length !== 2 || st[0].length !== 2 || sm.indexOf('ຈຸດຮັບ 2/2: 1pax\n- B') === -1 || sm.indexOf('booked by A)  WhatsApp: +856 20 1234 5678') === -1) return 'pickup stops';
    if (returnTime_('Back after the tour, about 3:30-4:30 PM') !== '3:30-4:30 PM' || a.v[12].indexOf('ລົງ: 18/01 10:00-10:30 AM ສົ່ງສະຖານີລົດໄຟ') === -1) return 'return time in message';
    if (a.v[12].indexOf('ລູກຄ້າ: Test Person  WhatsApp: +856 20 1234 5678 https://wa.me/8562012345678') === -1) return 'team whatsapp';
    if (a.v[9] !== 'ກກ 5696' || f.indexOf('wa.me/8562012345678') === -1 || f.indexOf('plate number is ກກ 5696') === -1 || f.indexOf('wait at your hotel reception') === -1 || f.indexOf('Hello Test!') === -1 || f.indexOf('Pickup at Test hostel between 7:30 and 8:00 AM') === -1) return 'plate saved / guest message';
    cell.setValue(new Date(2030, 0, 18, 12)); buildTransport_(ss);
    var dRow = find('dep');
    if (!dRow || dRow.v[9] !== 'Luang Prabang train station' || dRow.v[6] instanceof Date === false) return 'departure row';
    // the guest stays a day longer: the date typed in the list goes to Bookings and the row moves to the 19th
    sh.getRange(dRow.row, 7).setValue(new Date(2030, 0, 19, 12)); saveTransportEdit_(ss, sh.getRange(dRow.row, 7));
    var bk = ss.getSheetByName(TABS.bookings), ids = bk.getRange(1, 1, bk.getLastRow(), 1).getDisplayValues().map(function (r) { return r[0]; });
    var retCell = bk.getRange(ids.indexOf(id) + 1, BOOKING_COLS.indexOf('Return date') + 1);
    if (dayKey_(retCell.getValue()) !== '2030-01-19' || find('dep')) return 'date typed in the list';
    cell.setValue(new Date(2030, 0, 19, 12)); buildTransport_(ss);
    if (!find('dep')) return 'moved row';
    retCell.setValue(new Date(2030, 0, 18, 12));
    return true;
  } catch (err) { return 'error: ' + err; }
  finally { cell.setValue(saved); buildTransport_(ss); }
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
