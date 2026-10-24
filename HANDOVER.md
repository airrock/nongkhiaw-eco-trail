# Handover: who owns what, and how to work on it

For Noy (the owner of Nong Khiaw Eco-Trail / Eco Lao Adventure Trails) and for any developer who takes over.
Last checked: 24 October 2026.

## What the business runs on

| Part | What it is | Where it lives | Owner on 24/10/2026 |
|---|---|---|---|
| Website nongkhiawlaos.com | The pages, booking form, agreement form (`/agreement/`), lunch order page (`/lunch/`) | This GitHub repository, published by GitHub Pages from `main` | **Noy** (GitHub account `airrock`) |
| Booking sheet "Report" | Every booking, traveller, receipt, report tab (Transport, Guide report, Lunch report, ...) | Google Drive | **Jeevesh** (`verma.jeevesh1998@gmail.com`); `xayasith8856@gmail.com` can edit |
| Sheet script ("Nong Khiaw bookings") | The code inside the sheet: saves website bookings, builds the reports, receipts | Inside the sheet (Extensions > Apps Script); a copy of the code is in `apps-script/` here | Moves with the sheet |
| Booking endpoint | The web address the website sends bookings, agreements and lunch orders to (`SHEET_URL` in `js/main.js`, `js/agreement.js`, `js/lunch.js`) | The sheet script's web app deployment | **Runs as Jeevesh** (the account that deployed it last) |
| Domain nongkhiawlaos.com | The name people type | Registered at Hostinger | Check which Hostinger account holds it |

## Still to move from Jeevesh to Noy

1. **Close the public link on the sheet first.** The sheet is shared as "Anyone with the link can view" and holds passport numbers.
   In the sheet: Share > General access > **Restricted**. Nothing (website, receipts, PDF link) needs the public link.
2. **Sheet ownership.** In the sheet: Share > add Noy's Google account as Editor (if not there) > next to her name choose
   **Transfer ownership**. Noy accepts the request from her Gmail. The script inside the sheet moves with it.
3. **Booking endpoint.** After Noy owns the sheet, she opens Extensions > Apps Script > Deploy > **Manage deployments**, edits the
   existing deployment (pencil), chooses **New version**, keeps "Execute as: Me" and "Who has access: Anyone", clicks Deploy and
   approves Google's permission screen. It then runs under her account. If Google gives a new web address, it must be put in
   `js/main.js`, `js/agreement.js` and `js/lunch.js` (`SHEET_URL`) and in `apps-script/README.md`.
   Check afterwards with the self-test (below): it must answer with all `...Ok: true`.
4. **Domain and DNS (Hostinger).** If the domain is in Jeevesh's Hostinger account, move it with Hostinger's "transfer to another
   Hostinger account". Change the DNS record `www` (CNAME) from `jeeveshverma.github.io` to **`airrock.github.io`**. The four `A`
   records for `nongkhiawlaos.com` (185.199.108.153, .109, .110, .111) are GitHub's and stay.
5. **GitHub Pages check (Noy).** Repository Settings > Pages: custom domain `nongkhiawlaos.com`, "Enforce HTTPS" ticked.

## Giving a new developer access

- Website: GitHub repository Settings > Collaborators > add their GitHub account.
- Sheet and script: share the sheet with their Google account as Editor. They deploy with `clasp` (steps in `apps-script/README.md`).
  Note: whoever deploys the web app last is the account it runs as; if that person later loses access, bookings stop saving.
  After a developer deploys, Noy can redeploy (step 3 above) so it runs as her again.

## How changes are made and checked

- Website: plain HTML/CSS/JS, no build step. Every push to `main` is live within a minute or two. See `CLAUDE.md` for the map and rules.
- Sheet script: edit `apps-script/Code.gs` here, copy it into the script project (clasp), update the existing deployment, then
  POST `{"type":"rebuild"}` and `{"type":"selftest"}` to the endpoint. The self-test writes sample bookings, checks every report
  and the receipt, and removes them again. Run it outside busy hours: it holds the sheet for 2-4 minutes (bookings wait for it).
- Commit messages: a plain sentence about the change. No test commits: every push is a live deploy.

## If a booking is missing from the sheet

The guest's WhatsApp message holds everything. Paste the whole message into the yellow box at the bottom of the **New booking** tab
and tick **Import**: the booking is saved under the guest's own Booking ref.
