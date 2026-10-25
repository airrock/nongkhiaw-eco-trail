# Working memory for Claude Code (and any developer)

`CLAUDE.md` is the map of the code. This file is the working knowledge around it: how the work arrives, how to deploy and check
it, the traps already hit, and what is still open. Keep it current: change it in the same commit as the thing it describes.

## People and how requests arrive

- **Noy**: owner of the business and of this repository (GitHub `airrock`). Not a developer; uses the Google Sheet "Report" every
  day (receipts, Transport, Guide report, Lunch report, New booking). Her words and paper forms are the source of truth.
- **Jeevesh**: the developer. Relays Noy's requests as numbered items ("61.) …"), as WhatsApp screenshots or an `.xlsx` in
  `~/Downloads` (text in `xl/sharedStrings.xml`, screenshots in `xl/media/`; unzip it to read both). Items are numbered across
  batches; a new file often repeats earlier items, so check what is already done first.
- Expectation: implement everything asked, deploy, verify, push, then report briefly per item, with a short message to forward to
  Noy. Translations are AI-written: say so, Lao in particular.
- Many requests are "how do I…" for something the sheet already does. Answer with the exact tab / column / cell; change code only
  when it does not exist, or when she keeps hitting the same wall (e.g. editing a script-drawn tab, see Traps).

## Working setup

- Keep the clone **outside** any temp folder (`~/nongkhiaw-work/` on Jeevesh's Mac). A session scratchpad under `/private/tmp` was
  wiped by macOS twice and took `.git` and the clasp settings with it; one deploy then silently failed.
- Push as Jeevesh's personal GitHub account `jeeveshverma` (write access to `airrock/nongkhiaw-eco-trail`). The default gh account on
  that Mac is a work account without access; use:
  `git -c credential.helper= -c "credential.helper=!f(){ echo username=jeeveshverma; echo password=\$(gh auth token --user jeeveshverma); }; f" push -q origin main`
- Commit identity: name `jeeveshverma`, email `67497634+jeeveshverma@users.noreply.github.com` (set per clone; the Mac's global
  git email is a work address that must not appear here).
- Commits: one plain sentence about the change. **No `Co-Authored-By` or any AI attribution line. No test commits** (no "." in a
  README to check something): every push to `main` is live on nongkhiawlaos.com within a minute or two.
- `git pull` before working: Noy and Jeevesh sometimes edit README files on github.com.

## Deploying the sheet script

- clasp folder (`~/nongkhiaw-work/clasp/`): `.clasp.json` with the script ID from `apps-script/README.md`, plus `appsscript.json`.
  Copy `apps-script/Code.gs` → `Code.js` and `ContentSeed.gs` → `ContentSeed.js`, then
  `npx -y @google/clasp@3.4.1 push --force` and
  `npx -y @google/clasp@3.4.1 update-deployment <deployment id> --description "..."` (same URL, new version).
- Then `curl -sL -m 590 -H 'Content-Type: application/json' -d '{"type":"rebuild"}' <exec URL>` (answers `rebuilt`) and the same
  with `{"type":"selftest"}` (answers JSON; every key must be `true`; a string says which check failed).
- If curl prints nothing, run it again with `-w '\nHTTP %{http_code} %{time_total}s\n'` saved to a file before assuming anything.
- The self-test holds the sheet's lock for 2-4 minutes (bookings wait up to 5 minutes, then fail). Do not loop it during the day.
  `rebuild` / `selftest` refuse with `busy` while anything else runs.
- The self-test reports pass/fail only (the endpoint is public): never add business data to its output. Debug output goes in a
  temporary deploy that is replaced right after.
- The deployed web app runs **as the account that deployed it last**. Today that is Jeevesh. See Open items.
- After changing text in `js/i18n*.js` or the section order of `index.html`: `node apps-script/build-seed.js` (regenerates
  `ContentSeed.gs`; never edit that file by hand).
- Deployed code and `apps-script/Code.gs` in `main` must match. If you deploy, commit the same file.

## Checking website changes

- No build. `python3 -m http.server` in the repo, Playwright (`playwright-core` with the cached Chromium in
  `~/Library/Caches/ms-playwright/chromium-*/`), route `script.google.com` to a stub so nothing reaches the live sheet, stub
  `window.open` to read the WhatsApp message, set `localStorage['nke-lang']` for a language.
- Check at 390 px wide and in Lao (`scrollWidth` must equal the width).
- Check what is **visible** (`offsetHeight`, computed `display`), not the `hidden` property: see Traps.

## Traps already hit (do not repeat)

- **Hidden form rows showed anyway.** Form rows are `<label>` with `display:grid`, which beats the `hidden` attribute.
  `[hidden]{display:none !important}` is in both stylesheets now; keep it.
- **Bookings lost on phones.** The site saves the booking and opens WhatsApp at the same moment; a phone can freeze the tab before
  a plain request goes out. `saveToSheet` uses `navigator.sendBeacon` (fallback `fetch` keepalive). Recovery: New booking tab →
  paste the guest's WhatsApp message → Import (`parseWhatsAppBooking_`). Not yet tested on real phones (see Open items).
- **Bookings lost while the sheet was busy.** A booking used to give up after 20 s waiting for the lock; long self-test runs
  during the day lost a booking. Now 5 minutes; maintenance runs only start when idle.
- **Staff filters.** Noy keeps a filter on Bookings. Sorting through a filter that does not cover every column moves rows but
  leaves the other columns behind (`widenFilter_` fixes the range before sorting). `deleteRow` on a row hidden by a filter
  silently does nothing (`withoutFilter_` for any deleting). Re-read a row before deleting it; never delete by a stale index.
- **Receipt cells that change the booking vs. only the receipt.** Green cells (drop-off I12, return date/time I15:I16) write
  Bookings, so Transport follows; yellow cells (I2:I11, I14) only change the printed receipt. Noy mixes them up: point her to the green ones.
- **Script-drawn tabs** (Transport, the receipt rows, Arrange tour) are rewritten from Bookings: typing there is lost unless that
  column is listed as editable and saved back (`TRANSPORT_EDIT`, `receiptTravellerEdit_`). When Noy says "I changed it but it
  doesn't change", this is usually why.
- **Receipt PDF**: a cell note inside the printed area A5:F41 prints as a `[n]` footnote marker. Keep notes outside it.
- **Formulas**: `INDEX(range, 0)` returns the whole column (a missing booking showed the column headings on the receipt; the
  receipt lookups test `$K$1=0` first). `SUMIF` / `COUNTIF` need a cell range, not a computed array inside `LET` (use
  `SUM(FILTER(...))`). A blank date through `TEXT()` shows 30/12/1899.
- **Self-tests that depend on Noy's data** break when she edits it (the Lunch menu lost "Avocado sandwich"). Use whatever is on
  the menu now; set aside and restore anything she typed in the cells a test uses (receipt yellow cells).
- **Prices**: transfer 250,000 kip one way / 500,000 round trip / +70,000 train station (a legal minimum, 2026-10-18). Never write
  prices into page text; the transfer price is shown only inside the booking form.
- **Guest data** (passports, names, phones) never goes into the repo, test files, or chat output. Test data uses `SELFTEST-` names
  so the self-test removes it.

## Open items (24/10/2026)

- Ownership move from Jeevesh to Noy, steps in `HANDOVER.md`: sheet ownership, redeploying the booking endpoint as Noy, the domain's
  Hostinger account. **The sheet is still shared "anyone with the link can view" and holds passport numbers: close it first.**
- DNS: `www.nongkhiawlaos.com` CNAME must point to `airrock.github.io` (still `jeeveshverma.github.io` on 24/10; Hostinger edit
  not yet saved). Check with `dig +short CNAME www.nongkhiawlaos.com @ns1.dns-parking.com`.
- Proposed, not built: the site keeps a copy of a sent booking and resends it when the guest comes back to the page (the sheet
  ignores duplicates); then one test booking from Noy's phone with first name `SELFTEST-Noy`.
- Waiting for Noy: private tour details, private minivan and train details, transport manager contact (Settings F13), costs for
  tours 101-103 in Tour plans.
