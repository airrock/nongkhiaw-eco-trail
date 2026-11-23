# Booking system (PHP + MySQL, for Hostinger)

Replaces the Google Sheet and `apps-script/Code.gs`. The website keeps its pages; only the address it sends to changes.

| Part | Where | What |
|---|---|---|
| Database | `schema/001_schema.sql`, `002_countries.sql` | Bookings, travellers, payments, receipts, agreements, prices, users, change log |
| Rules | `lib/rules.php`, `transport.php`, `reports.php`, `auth.php` | Amounts, receipt numbers, pickups and messages, reports, logins and roles |
| Website endpoint | `public/api/exec.php` | Same requests and answers as the old Apps Script `/exec` URL |
| Dashboard endpoint | `public/api/admin.php` | What the staff pages call; decides what each role may do |
| Dashboard pages | `../admin/` | Plain HTML and JavaScript, no build step |
| Import | `tools/import_sheet.py` | The Sheet (.xlsx) to SQL, with a check report |

## Roles

- **Admin:** everything, including users, prices and settings, tour costs and agency share, deleting or restoring a booking,
  correcting or removing a payment.
- **Office staff:** bookings, travellers, recording payments, receipts, pickups, daily lists, agreements, inquiries.

A new user gets a temporary password from an admin and must choose their own at the first sign-in.

## Run it on your computer

    docker compose -f server/docker-compose.yml up -d        # http://localhost:8787/admin/
    docker compose -f server/docker-compose.yml exec -T web php -- "Name" you@example.com 'temporary password' < server/tools/create_admin.php
    python3 server/tests/test_api.py                          # empties the local database first: local only

## Bring the Sheet's data over

1. In the Sheet: File > Download > Microsoft Excel. Save it outside this repository (it holds passport numbers).
2. `uv run --with openpyxl python3 server/tools/import_sheet.py report.xlsx import.sql`
   prints the counts and sums on the Sheet's side and what was left out and why.
3. Load `import.sql` into the database (locally: `docker compose ... exec -T db mariadb -unongkhiaw -plocalonly nongkhiaw < import.sql`;
   on Hostinger: phpMyAdmin > Import). It empties the booking tables first, so it can be repeated until the switch. It never touches users.
4. Compare the counts in the database with the report.

## Put it on Hostinger (not done yet)

1. hPanel > Databases: create a MySQL database and user. Import `schema/001_schema.sql`, then `002_countries.sql`.
2. Upload `public/api/` to `public_html/api/`, `lib/` to a folder **beside** `public_html` named `lib/` (not inside it), `../admin/` to `public_html/admin/`.
3. Create `lib/config.local.php` on the server (never in the repository):
   `<?php return ['host' => 'localhost', 'name' => '…', 'user' => '…', 'pass' => '…'];`
4. Create the first admin from hPanel's terminal or SSH: `php create_admin.php "Name" email 'temporary password'`.
5. Import the Sheet's data (above), on the night of the switch.
6. Point the website at the new endpoint: `SHEET_URL` in `js/main.js`, `js/agreement.js`, `js/lunch.js`.
7. Keep the old Apps Script endpoint running for a week (a cached page can still send there) and check its "Website inbox" tab daily.
