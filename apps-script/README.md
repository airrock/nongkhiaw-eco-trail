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
- Menu **Receipts > Issue receipt** gives the booking the next number (`000001`, `000002`, ...; a booking never gets two) and writes it to
  Bookings > Receipt No. **Receipts > Receipt for the selected booking** opens it from the Bookings tab.
- Amounts come from the booking: tour (Est. tour USD), transport (Est. transfer kip) and food (Lunch kip), shown in USD and kip at
  Settings F8 (22,500 kip per USD; staff can change it). Balance = total - deposit. Business name, address, contact and logo link: Settings F9:F12.
- "Download PDF" is a Google export link (works for anyone with edit access to the sheet); no extra script permission is needed.
