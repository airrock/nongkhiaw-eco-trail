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
- Tab **Guide report**: everyone on tour on the yellow date (`=TODAY()+1`, tomorrow; staff may type another date, empty = tomorrow),
  cancelled bookings left out, numbered. A guest is listed on **every day of their tour**: day n = date - tour date + 1, kept while
  `Tour plans` has a row for that tour and day (101: 2 days, 102: 2, 103: 3, 001: 1). Rows are grouped by the plan for the day, so
  on any date the 001 group (001 guests + 102 guests on day 2) is together.
- Columns: No, Date of issue (Receipt log), Receipt No, Booking ID, Contact name, Pax (on the booking's first row only; a bold Total
  row ends the list), Package (tour code, "Private" added for private tours), Day ("Day 2 of 3"), Plan for the day, Viewpoint,
  Additional package, Food, Pickup date from LPB (or "Staying in Nong Khiaw"), Tour start date, Pick-up location, Departure date,
  Notes ("PRIVATE TOUR" + Note + Staff notes).
- Additional package: what staff typed on the booking in Bookings, otherwise the tour's package from `Tour plans` (102: "001 1-Day
  Tour (Day 2)", 103: "2D Sopjam + Homestay"). New bookings also get it written into Bookings when saved.
- One `LET(SORT(FILTER(...)))` formula in A6. `setup` unhides all its columns (columns hidden for an older layout would hide other data).

## Tour plans, Arrange tour, Tour accounts
- Tab **Tour plans** (seeded once, then staff-owned, never rewritten): A:C each tour's days and the plan for each day (Guide report),
  E:F the additional package added to every booking of a tour, H:L the usual costs of a tour (Arrange tour): item, unit kip, counted
  per `group` / `person` / `N people` (one per N guests, rounded up, e.g. kayaks per 2), and the quantity of a group item. Only 001 was
  seeded with costs (Noy's 25/09 sheet: 7 pax = 2,500,000 kip); 101/102/103 costs are for staff to add.
- Tab **Arrange tour**: yellow tour date and tour. Guests booked, Receipt No and Booking IDs come from Bookings / Travellers (that tour
  starting that day, not cancelled); "Guests, if different" overrides the count. Income kip = Est. tour USD x the receipt rate (Settings
  F8), or the typed "Income, if different". Picking a date or tour (simple `onEdit`) writes the cost lines from Tour plans: quantity is a
  formula on the guest count, so typing over it or the price is kept until the date or tour changes. Expense, Income, Profit at E4:E6.
- Ticking **Save** writes one row per tour date + tour into **Tour accounts** (saving again replaces it): date, tour, guests, receipts,
  bookings, expense, income, profit, the cost lines as text, saved at. That tab is a log: setup never clears it.

## Lunch report (takeaway food for The Trio Bar kitchen)
- Tab **Lunch report**: travellers with a Takeaway lunch whose tour date (or minivan date for transport only) is the yellow date
  (tomorrow by default): Booking ID, Tour date, Tour, Customer name, Pax (once per booking), Food item, Qty, Ready by ("When the minivan
  from Luang Prabang arrives" when the guest rides up that day, else "Before the tour starts", plus the Transport remark), Special
  requests (food type other than Regular + Note), Price kip; a Total row.
- N:O count each dish for the kitchen; Q5 is the message for The Trio Bar group in Noy's format (`15/10` then `1.) Pad Thai Chicken x1 : Name`).
- Bookings typed by staff get a lunch per traveller from the New booking tab's "Takeaway lunch" column (dropdown of the shown dishes).

## Round of 2026-10-18 (Noy's requests 43-58)
- **Prices:** transfer one way 250,000 kip, round trip 500,000 (`TRANSFER_KIP`, Settings F2:F3; train +70,000). Briefly 220,000 / 440,000 on
  2026-10-18, then back to 250,000 (a legal minimum per person); `setupSettings_` moves 220,000 / 440,000 to 250,000 / 500,000 (other typed values are left alone). The website shows the transfer price only in the booking
  form's Transfer choices (and the WhatsApp message): the Transport card, Good to know and the FAQ no longer name it, so competitors cannot read it.
  Old bookings keep the price they were booked at; menu **Bookings > Recalculate amounts** brings the selected rows to today's prices.
- **Transport:** the "To Luang Prabang" list is ordered City center first, Luang Prabang train station second (`dep` sort key). The team message
  takes the receipt number from the Receipt log when Bookings has none, and the list is redrawn when a receipt number is issued.
  Travellers marked cancelled are not listed.
- **Receipt tab:** pickup time and return time come from the booking (return: "3:30 - 4:30 PM" for the 103 return after the tour, "10:30 AM" for
  a later day, else "10:00 - 10:30 AM"; pickup "7:30 - 8:00 AM"); typing in D2 / F2 overrides. Columns H:I (I2:I7) are typed changes that replace
  the pickup line, return line, tour USD, transport kip, lunch text and lunch kip. The transport amount is the typed one, else the booking's,
  else worked out from Settings (legs x travellers taking it, train extra). Everything typed is cleared when another booking is picked.
- **Travellers:** `Takeaway lunch` has a dropdown of the Lunch menu; editing it prices the traveller and `syncLunch_` adds the booking's Takeaway
  lunch and Lunch kip up again (a lunch ordered after booking). New column `Traveller status` (Cancelled / No-show for one person): the `Status`
  formula shows it, else the booking's status; Guide report and Lunch report Pax count travellers who are not cancelled.
- **Trip sheet** is sorted by Receipt No ascending (no receipt yet = last), then name.
- **Agreements:** all columns are unhidden on setup; Photo permission is red for No, green for Yes.
- Website: Private tour section (`#private`, button ticks the Private tour box in the form), luggage note and the 1-3 days notice in Transport.

## Private tour
- Website: a "Private tour" tick under the date (hidden for transport only); sent as `private: true`, and the WhatsApp message says
  PRIVATE TOUR. No price is added: staff confirm it with the guest. Bookings column **Private tour** = Yes; the New booking tab has the
  same tick. The Guide report shows it in Package and Notes.

## Agency share (guests passed between agencies)
- Tab **Agency share**: one typed row per group from row 6 (yellow headers): Tour date, Booking ID (optional), Tour package (dropdown
  from Settings), Guests, Sending agency, Receiving agency, Price per person USD (empty = the Settings price of that package), Sender
  gets per person USD, Guide name, Guide WhatsApp, Notes. Formulas in the header row give Total USD, Sender gets USD, Receiver keeps
  USD (total - sender's share) and a WhatsApp link to the guide.
- The summary to the right (one `LET`/`MAP` formula) lists every agency with guests sent and received and the money as sender and as
  receiver, for the month typed in its yellow cell (mm/yyyy; empty = all). `agencySelfTest_` adds a sample row, checks it, clears it.

## Bookings order
- `sortBookings_` sorts Bookings rows by Tour date, then Submitted at (whole rows, colours included) on open, after each website
  booking and from menu **Bookings > Sort by tour date**. Nothing refers to a booking by its row number.
- The Receipt tab's C3 is a plain `HYPERLINK` to the PDF export (no script, no permission prompt), the fallback when the menu download
  cannot run for a staff member.
- `setup` takes staff filters off the formula tabs (Trip sheet, All guests, Guide report, Dashboard, Agency share, Lunch report) while it rewrites
  them and puts a filter back on the same range afterwards (the chosen filter values reset). With a filter on, the list formula is
  not written and the tab comes out empty.

## Transfers, transport only and bookings typed by staff
- Transfer choices (`TRANSFERS`): No, One way to Nong Khiaw (up), One way to Luang Prabang (down only, for guests already in Nong
  Khiaw), Round trip. `goesUp_` / `goesDown_` decide the legs everywhere (booking save, Transport lists, team message, receipt
  return line); Bookings > Transfer has the same dropdown. Down-only bookings have no Pickup date; their Nong Khiaw place is saved in
  `Pickup in Nong Khiaw`, which the team message shows as `ບ່ອນຮັບໜອງຂຽວ`.
- Tour `T00` = transport only (website "Transport" section and tour dropdown, New booking tab): no tour date, tour price 0, so it never
  appears in the Trip sheet or Guide report.
- Package 103 + round trip: the website asks "back on the last day of the tour" (return date = tour date + 2, minivan ~3:30-4:30 pm)
  or "another day" (minivan ~10:30 am); the choice is written to `Transport remark`.
- Tab **New booking**: yellow form + "Save booking" checkbox (`saveManualBooking_`, run by the simple `onEdit`, so no authorisation)
  builds the same payload as the website and calls `saveBooking_` (Source "WhatsApp", Site language "Staff"), sets the chosen
  Status, sorts Bookings and redraws Transport. `newBookingSelfTest_` saves a SELFTEST booking through it and restores the form.
- The minivan team message lists the lead guest with WhatsApp and the other travellers on a `ຜູ້ຕິດຕາມ` (followers) line.
- Receipt: Booking ID in E12/F12. Picking a booking (or Download/Print) first fills its empty amounts (`fillAmounts_`): tour price x
  people, transfer by type x travellers taking it, takeaway lunch from the Lunch menu. Changing Transfer, Train station drop-off or
  People in Bookings recomputes the transfer estimate.
- Status "Cancelled": `bookingEdited_` adds "Cancelled dd/mm/yyyy" to Staff notes; a conditional format greys the row
  (`greyCancelled_`, keeps staff's own rules).
- `setup` splits merges staff made across a frozen-row line (`freezeRows_`) and in the Agency share heading rows, which otherwise stop
  the rebuild. Agency share has typed Accommodation and Remark columns (L, M) because staff were already using them.

- **Receipt** Tour line reads `Code: 101 – Overnight camping above the clouds`. The minivan team message's ລົງ line carries the return time: 3:30-4:30 PM (103 back after the tour), 10:30 AM (another day), else 10:00-10:30 AM.

## Collect on arrival (2026-10-19)
- Tab **Collect on arrival**: arrivals from the yellow date (`=TODAY()` until typed) to an optional end date. Arrival = the booking's Pickup
  date (guests riding up from Luang Prabang), otherwise the traveller's tour date. One formula in A6 (`setupCollect_`): per booking a
  **Group** row (pax, tour USD and kip, takeaway lunch kip, transport kip, total, paid USD, to collect) with its **Guest** rows under it
  (tour = Est. tour USD / People, lunch = the traveller's Lunch kip, transport = Est. transfer kip shared by the travellers taking the
  minivan), and a TOTAL row of the groups. Paid = Amount paid USD, or everything when Status is Paid. Cancelled bookings and travellers
  are left out. Note: SUMIF / COUNTIF need a cell range, so the formula sums computed lists with `SUM(FILTER(...))`.

## Self-test and filters
- A row hidden by a staff filter cannot be deleted (`deleteRow` silently does nothing). The self-test cleanup and "Remove duplicate rows"
  go through `withoutFilter_` (filter taken off, rows deleted, the same filter and criteria put back), and re-read each row before
  deleting it so a sort in between can never remove a guest's row. `sortBookings_` waits for the script lock (a booking or the self-test
  in progress) instead of moving rows under it.

## Round of 2026-10-21 (requests 61-67)
- **Bookings waiting for the lock:** `doPost` lets a booking or agreement wait up to 5 minutes for the script lock (it was 20 s, and a
  booking that arrived during a rebuild or self-test, which take 2-4 minutes, failed silently: the guest's WhatsApp went out but the
  sheet never got the row). `selftest` / `rebuild` only start when nothing else is running (`tryLock`) and otherwise answer "busy".
- **Agreement form:** "Who is filling in?" buttons (everyone on this phone, or one traveller; `?n=<traveller #>` in the link picks one)
  and a button that shares the link (system share sheet, else WhatsApp). Only the travellers shown are checked and sent, so each guest
  signs their own part on their own phone; "same emergency contact as traveller 1" shows only when traveller 1 is on the page.
- **Receipt:** I8:I11 replace Name, Tour date, Tour line, Payment method; L16:N27 "Travellers by hand" are used when the booking has no
  travellers. A Booking ID not in Bookings shows empty lines (it showed the Bookings column headings: INDEX with row 0 returns the whole
  column) and still gets a receipt number in the log. A missing tour date stays empty (it showed 30/12/1899).
- **New booking tab:** optional Booking ID (re-enter a website booking under the guest's own reference; refused if it already exists),
  tour price USD per person and transport amount kip for prices agreed with the guest. The travellers block moved to row 24 and the save
  box to B36; typed fields survive a rebuild by label.
- **Transport:** the team message says `ໄປກັບ Npax` only for round trips (one way: `Npax`), and `ບ່ອນຮັບໜອງຂຽວ` on every way back, our
  office (`NK_OFFICE`) when no other place is given. Website: an optional "Pickup in Nong Khiaw for the way back" field (`nkPickup`);
  the Luang Prabang hotel and map are asked only for a ride up.
- **Collect on arrival:** Tour code column (D).

## 2026-10-21 (requests 68-69)
- Team message: a `**` line between the way up (ຂຶ້ນ) and the way back (ລົງ) of a round trip.
- Bookings `Train station drop-off` is a Yes / No dropdown. Changing it recalculates `Est. transfer kip` (with the train extra) and redraws
  Transport through `bookingEdited_`; the receipt reads the booking, so the drop-off line and amount follow.

## 2026-10-22 (requests 70-71)
- Travellers `Food` is a dropdown (`FOODS`: Regular, Vegetarian, Vegan, Gluten-free, No pork, No fish, ...) that also takes typed text;
  editing it re-counts the booking's `Food` summary (`syncFood_`). The receipt, Trip sheet and Guide report read Travellers.
- Receipt `I12` (green): Drop-off in Luang Prabang, City center / Train station. Picking a booking shows its drop-off; changing it writes
  `Train station drop-off` (Yes / No) in Bookings, recalculates `Est. transfer kip` (train extra per rider, Settings F4), refreshes the
  receipt log amounts and redraws Transport. Bookings with no ride back are refused with a message.
- Booking form: `[hidden]{display:none !important}` (form rows are labels with display:grid, which kept hidden rows on screen; the 103
  "back after the tour" choice showed for every package).

## 2026-10-22 (requests 72-73)
- Receipt `I13` "Edit on the receipt": ticking turns the printed lines (`RECEIPT_TYPED`: name, tour date, tour, pickup, return, payment,
  details, tour USD, transport kip, lunch kip) and the travellers A16:D27 into typed text, with dropdowns (tours, `NB_PAY`, `TRANSFERS`
  with the train station, `FOODS`). F9 (receipt no), F12 (Booking ID) and the totals stay formulas, so the total and the log amounts
  follow. Unticking, or picking another booking, runs `setupReceipt_` (formulas back; validations of A5:F41 cleared there).

## 2026-10-22 (requests 74-78, Noy's "Website 22.10.26" sheet)
- **Lunch after booking (74):** website page `/lunch/?k=<form key>` (`lunch/index.html`, `js/lunch.js`, text from `js/i18n*.js`
  keys `lunch_*`), the same private code as the agreement form (Receipt log "Form key", so the receipt must be issued first). `doGet
  ?lunch=` → `lunchJson_` (travellers' first names + current order, the Lunch menu); `doPost {type:'lunch'}` → `saveLunch_` writes
  Travellers Takeaway lunch / Lunch kip at the menu price and `syncLunch_` re-counts the booking, so the receipt and the Lunch report
  follow. Receipt F3 is the link to send to the guest.
- **Each pays (75):** receipt traveller rows are one formula row each (`receiptTravellerFormulas_`, A16:F27): No, Name, Passport, Food,
  Takeaway lunch, "Each pays (USD / Kip)" = tour USD / people × rate + their share of the transport (riders only) + their own lunch kip,
  shown for groups of 2+. Travellers typed by hand (L:N) are the fallback for each row.
- **Food / lunch on the receipt (78):** typing in D16:E27 (dropdowns `FOODS` / `lunchDishes_`) is saved on the traveller by
  `receiptTravellerEdit_` (→ `travellerEdited_` → `syncLunch_` / `syncFood_`) and the formula put back, so the kitchen's Lunch report
  sees it. The yellow "Takeaway lunch (text)" cell stays a receipt-only override. `clearReceiptManual_` rewrites the rows' formulas.
- **Lao (76):** ລົງ line says `ສົ່ງຕົວເມືອງ ໃກ້ຕະຫຼາດມືດ` for the city centre drop-off.
- **Luggage (77):** `trn_luggage` and the sentence in `inf2p` now say large luggage can be left at the Nong Khiaw office (the Luang
  Prabang office sentence of request 50 was withdrawn).

- 2026-10-22 (79): Transport column 7 (Pickup date / Departure date) is a typed column too (`TRANSPORT_EDIT`): a Date or dd/mm/yyyy text is
  saved in Bookings `Pickup date` / `Return date` and the list redrawn, so a guest who stays longer moves to the new day's list.

## 2026-10-22 (requests 80-82)
- **80:** no cell notes inside the receipt's printed area A5:F41 (the PDF export prints each note as a `[n]` footnote marker); the
  food / lunch explanation is a note on H1 and `setupReceipt_` clears notes in the printed area.
- **81:** Tour plans add-on table has a third column `Starts on day` (migration fills 2 for 102 / 103); Guide report column
  "Add. package date" = tour date + that day - 1. Header merges / widths / self-test indexes shifted by one column.
- **82:** "Message guest" uses `guestMessage_` (Noy's wording: Hello <first name>! Your minivan to ... is booked for tomorrow /
  today / on dd/mm/yyyy, pickup place and time, plate number, hotel reception, and the transport manager from Settings F13 when
  typed). `waLink_` now takes one text with a `{day}` placeholder.

## 2026-10-24: bookings lost on phones, import from WhatsApp
- A website booking (NK261024-1JNI) reached WhatsApp but not the sheet. The endpoint itself was fine (a test booking of the same shape
  saved in 24 s): the request was lost in the guest's browser, which opens WhatsApp at the same moment. `saveToSheet` (js/main.js) now
  sends with `navigator.sendBeacon` (delivered even when the page is left; checked end to end), falling back to `fetch` keepalive.
- New booking tab, rows 38-48: paste the guest's WhatsApp booking message into B40 and tick B48 "Import". `parseWhatsAppBooking_` reads
  the website's message format (ref, tour, date, payment, transfer, dates, drop-off, accommodation, map, Nong Khiaw pickup, private,
  each traveller with passport dates, food and takeaway lunch, note) and `saveBooking_` saves it under the guest's own ref (refused if
  it exists). Self-test `importOk` imports a sample message; `testBookingsFoundBefore` counts test bookings left from earlier checks.
