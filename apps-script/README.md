# Bookings database (Google Sheet + Apps Script)

The booking and question forms send each submission to a Google Sheet, which also holds the dashboard.
Passport numbers are never sent; they stay in the WhatsApp message.

## Install (once, about 5 minutes)
1. In the Google Sheet: **Share > General access > Restricted** (customer data must not be public).
2. **Extensions > Apps Script**. Delete what is there, paste all of `Code.gs`, press **Save**.
3. Pick `setup` in the function list, press **Run**. Allow access (Advanced > Go to project > Allow).
   This creates the tabs Bookings, Travellers, Inquiries, Settings and Dashboard.
4. **Deploy > New deployment > Select type: Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy.
5. Copy the Web app URL (ends in `/exec`) into `js/main.js`: `var SHEET_URL = '...';`

## Daily use
- **Bookings**: one row per booking request. Staff set **Status** (Requested, Confirmed, Paid, Cancelled, No-show)
  and **Amount paid USD**. Add WhatsApp bookings that did not come through the form by hand.
- **Travellers**: one row per person (country, gender, food). Status follows the booking.
- **Inquiries**: one row per question. Set Status to Replied / Booked / Closed.
- **Settings**: tour prices and the transfer price. New bookings use them.
- **Dashboard**: updates by itself.

## Changing Code.gs later (clasp, signed in as the sheet owner)
Script ID `1upOpEpN2-5CgcaIbcE7RPDpj_J96eq51JTkbO_dn9nY4lgh9GFKux0LZ`, deployment
`AKfycbxq9ET0sZ-Vbdy5VMLahGd_qS71e-mVIeDFgBc-wJCVUYRUNQDGth4ddnQ6j24rYpPf` (the URL in js/main.js).
```
npx @google/clasp clone <script id>            # once, in an empty folder
cp apps-script/Code.gs apps-script/appsscript.json <that folder>
npx @google/clasp push --force
npx @google/clasp update-deployment <deployment id>   # same URL, new version
```
Then POST `{"type":"rebuild"}` to the URL if the tabs or dashboard changed (never touches data rows), and
POST `{"type":"selftest"}` to write, read back and delete a sample booking and inquiry.

Failed saves show under **Apps Script > Executions**. The customer's WhatsApp message is sent either way.

## Editing the website from the sheet (Content, Settings, Reviews)
- **Content tab**: every piece of text on the site, in 8 languages, in page order. Staff edit the English cell; the
  other languages are translated by Google Translate on the next refresh (`LanguageApp`, no extra permission). A cell
  that differs from the shipped text (tab "Content base", hidden) is an edit and is served by `?config=1`; the site
  merges it over its built-in text (`applyConfig` in `js/main.js`) and keeps a copy in localStorage (`nke-config`).
  Putting the English back restores the original in every language. Typing over a translation keeps it until the
  English is changed again.
- **Prices**: Settings tab (tour prices A2:C5, one way F2, round trip F3, train station F4). Strings carry placeholders
  `{p101} {p102} {p103} {p001} {pmin} {kip1} {kip2} {kipTrain}` that `fill()` in `js/main.js` replaces; card prices
  (`.price-num[data-price]`) and the WhatsApp tour line use the same numbers.
- **Menu "Website > Update the website now"** clears the cache and translates everything pending at once.
- The page only shows `<br>` and `<em>` from sheet text (`safeHtml`); anything else is plain text.

### When the built-in text in `js/i18n*.js` or the order in `index.html` changes
1. `node apps-script/build-seed.js` (rewrites `ContentSeed.gs`)
2. copy `Code.gs`, `ContentSeed.gs`, `appsscript.json` to the clasp folder, `clasp push --force`,
   `clasp update-deployment <deployment id>`
3. POST `{"type":"rebuild"}`: new text reaches every cell staff have not edited; their edits are kept.
Do not put text with prices directly in a string: use the placeholders above.

## Trip sheet, pickups and train station
- **Trip sheet tab**: change the yellow date; it lists every non-cancelled traveller of tours on that date (name, country,
  food, pickup place and map link, booking, receipt) with totals: travellers, people taking the transfer, food counts,
  USD still to collect, transfer kip.
- **Pickups**: from the second traveller on, the form offers "same as the group" (default), "a different place" (own
  accommodation + Maps link) or "no transfer". Bookings gets "Pickups" ("Sunset Hostel: 1, 3; Villa Maly: 2; No transfer: 4")
  and Travellers gets "Pickup place" / "Pickup map". The transfer estimate counts only the people who take it.
- **Train station drop-off** (round trips only): tick box in the form, "Train station drop-off" column in Bookings; the
  fee is Settings F4 per person taking the transfer.

## Takeaway lunch (The Trio Bar & Cafe)
Each traveller can order a takeaway lunch in the form (dish from the **Lunch menu** tab, plus a choice such as the meat
for dishes that have one). Not part of the tour price; paid separately. The page shows the dish with its price, the
WhatsApp message lists each order and the total, and the script prices the order **from the Lunch menu tab** (the page's
price is never trusted) into Bookings ("Takeaway lunch", "Lunch kip") and Travellers; the Trip sheet shows each person's
lunch and the day's lunch total. The Lunch menu tab is seeded once (18 dishes from the menu photos) and then belongs to
staff: Show tick, Group, Dish, Choices (comma separated), Price kip. The site reads it through `?config=1` (`menu`) and
falls back to the list built into `js/main.js` (`MENU`) if the sheet cannot be reached.

## Dates and the old guest list
- All dates in the report are Day/Month/Year (`dd/mm/yyyy`); the spreadsheet locale is en_GB, so `11/10/2026` typed by hand means 11 October.
  Passport issued/expires are real dates (older text values are converted by `setup`).
- 2026-10-10: Noy's old guest sheet was imported once (838 bookings, 1,643 travellers; rows have Booking ID `IMP-0001…`, Source "Imported",
  Status "Confirmed", her receipt numbers). Her old package numbers other than 1/101/102/103 are kept as typed in Tour; the old tour
  start date is only known for some rows; Staff notes says "CHECK tour date" where the date came from her "Date of issue" column.
  The importer was temporary and is not in this repo (it held passport data and a write endpoint).

## E-receipt
- Tabs **Receipt** (the printable receipt, yellow cells = Booking ID, Language, Deposit USD), **Receipt log** (one row per issued
  receipt: number, date, booking, totals) and a hidden **Receipt text** (the labels in 8 languages, rewritten by `setup`).
- Picking a Booking ID in the Receipt tab (`onEdit` on B1, or **Receipts > Receipt for the selected booking** from the Bookings tab) gives
  the booking the next number (`000001`, `000002`, ...; a booking never gets two) and writes it to Bookings > Receipt No; **Receipts > Issue
  receipt** does the same by hand. A booking that already has a Receipt No (Noy's imported receipts, or typed by hand) keeps it: it is logged
  with Issued by "Earlier receipt (kept)" and does not count towards the sequence. Changing the deposit (B3) updates that booking's log amounts.
- Amounts come from the booking: tour (Est. tour USD), transport (Est. transfer kip) and food (Lunch kip), shown in USD and kip at
  Settings F8 (22,500 kip per USD; staff can change it). Balance = total - deposit. Business name, address, contact and logo link: Settings F9:F12.
- **Paid** comes from Bookings, nothing is typed on the receipt: Status "Paid" = paid in full, otherwise "Amount paid USD" is the
  deposit. When nothing is left to pay the receipt says "Paid" instead of "Deposit" and shows "✓ PAID" in its language. The yellow
  "Paid (USD)" cell (B3) only overrides that.
- **Receipts > Download PDF** downloads the receipt named `No 000002 <lead name>.pdf` (numbering it first if needed). It fetches Google's
  PDF export with the user's token, so the script needs `drive.readonly`, `script.external_request` and `script.container.ui`; each
  person who uses it approves that once. After a scope change, the owner approves it (run any menu item) **before**
  `clasp update-deployment`, or the web app's saves fail until they do. If that fetch fails the dialog says why and still offers
  **Open the PDF**: the plain export link opened in a new tab (no extra permission; the file then has Google's name).
- **Receipts > Print receipt** numbers the receipt and opens that same A4 PDF in a new tab to print (the guest signs the "Customer
  signature" line). Custom menus exist only in Sheets on a computer, not in the phone app.

## Tour agreement form (/agreement/)
- Static page `agreement/index.html` (+ `js/agreement.js`, `js/agreement-i18n.js`, `css/agreement.css`), 8 languages, not indexed.
  It opens with a private 16-character code (`?k=...`) that the script creates when a receipt is issued (Receipt log > Form key);
  the Receipt tab shows it as "Open agreement form". Without a valid code the page shows nothing about any guest.
- `?agreement=<code>` returns the booking's travellers (name, passport, dates) and who already signed; `{"type":"agreement"}` saves
  one row per traveller in the **Agreements** tab (photo permission, medical, emergency contact, insurance no, typed name as
  signature, language, form version). The script checks everything again; a traveller signs once.
- Wording = Noy's paper form (version stamp in `AGREEMENT_VERSION`); to change it edit `js/agreement-i18n.js` and bump the version.

## All guests tab, return trip on the receipt
- **All guests**: one row per traveller with the booking beside them (receipt, status, transfer, dates, payment, amounts). It is one
  formula in A5 (read-only; edit in Bookings/Travellers). Yellow cell B2 = show tours from this date on; soonest first, undated guests last.
- **Receipt** tab: yellow cells D2 (pickup time) and F2 (return time) are shown on the receipt; the Return line shows Nong Khiaw >
  Luang Prabang, the return date and the drop-off ("city center", or the Luang Prabang train station when the booking ticked it).

## How to book (website)
Seven cards in `index.html` (`#how`), each with an inline SVG drawing (no text in the drawings, so every language works) and text keys
`hs1t`..`hs7p` in `js/i18n-tours.js` (editable from the Content tab).

## Transport (daily minivan list for the driver team)
- Tab **Transport**: change the yellow date. Two lists: **To Nong Khiaw** (pickups in Luang Prabang that day, from Bookings > Pickup date)
  and **To Luang Prabang** (round trips leaving that day, from Return date; drop-off city center or the train station). One row per
  traveller taking the minivan (not "No transfer"), cancelled bookings left out, grouped by pickup place.
- The tab is written by the script (`buildTransport_`), not formulas, so its yellow columns can be typed in: WhatsApp no, plate to Nong Khiaw,
  Nong Khiaw pickup, plate to Luang Prabang, remark. `onEdit` saves them in Bookings (`WhatsApp no`, `Vehicle to Nong Khiaw`,
  `Pickup in Nong Khiaw`, `Vehicle to Luang Prabang`, `Transport remark`) for the whole booking and redraws the list; anything typed
  elsewhere is put back. A hidden last column says which list a row belongs to.
- **Message guest** opens WhatsApp (wa.me) with Noy's text: "Hello my friend! Tomorrow you have minivan to Nong Khiaw! The minivan plate no: …
  The driver will come to you, please wait at the reception." (departures: to Luang Prabang, with the Nong Khiaw pickup and drop-off).
  Tomorrow / Today / On dd/mm/yyyy is worked out by the sheet (`TODAY()` vs the yellow date) when the link is clicked. The booking form asks for the
  guest's WhatsApp number (optional) and saves it in Bookings > WhatsApp no.
- The list is redrawn when the sheet is opened, after each website booking, and when a Transport-related Bookings column is typed in
  (`bookingEdited_`, `TRANSPORT_SOURCES`); menu **Transport > Refresh** does it by hand. Headings are Lao for the team (↑ ຂຶ້ນ up to
  Nong Khiaw, ↓ ລົງ back to Luang Prabang) and each list ends with a Total pax row.
- A Return date typed on a one-way booking turns its Transfer into "Round trip" and recomputes Est. transfer kip (round price, plus the
  train drop-off if set, times the travellers taking the minivan); the departure list also uses any Return date, whatever the Transfer says.
- **Message for the minivan team** (column M): Noy's Lao text for the team, ready to copy: `Booking id: <ID> / Receipt no: 007 / ໄປກັບ 2pax / ລູກຄ້າ: <lead name>  WhatsApp: <number> https://wa.me/<digits> / ຂຶ້ນ: 11/10 / ບ່ອນຮັບ: <place + map> /
  ລົງ: 12/10 ສົ່ງສະຖານີລົດໄຟ` (or ສົ່ງກາງເມືອງ for the city center).

## Duplicates and walk-ins
- A booking ID is saved once: a repeated request with the same ID is ignored (`saveBooking_`). Menu **Bookings > Remove duplicate rows**
  deletes rows saved twice (same Booking ID + lead name in Bookings; same Booking ID + name + passport in Travellers), keeping the first.
- A traveller with no pickup place (walk-ins, bookings without transfer) shows as "Staying in Nong Khiaw" in the Trip sheet and All
  guests (`stayingPlace_`); the stored data is unchanged.

## Guide report (for the guide team)
- Tab **Guide report**: everyone on the tour on the yellow date (`=TODAY()+1`, tomorrow; staff may type another date, empty = tomorrow),
  cancelled bookings left out, each booking's travellers together, numbered. Noy's layout: No, Date of issue (Receipt log), Receipt No,
  Booking ID, Contact name, Pax (on the booking's first row only: a formula cannot merge cells; a bold Total row ends the list), Tour, Viewpoint, Additional package, Food, Pickup date from LPB (or "Staying in Nong Khiaw"), Tour start date,
  Pick-up location, Departure date (the Return date if any / one way / n/a), Notes (Note + Staff notes).
- One `LET(SORT(FILTER(...)))` formula in A6, so it updates by itself. Viewpoint and Additional package are Bookings columns staff type.

