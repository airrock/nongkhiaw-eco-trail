# Nong Khiaw Eco-Trail — Claude Code guide

Booking site for a locally run tour company in Nong Khiaw, Laos (https://nongkhiawlaos.com), plus the Google
Sheet back office its forms write to. Owner-facing operating detail lives in `README.md` and
`apps-script/README.md`; read the relevant one before changing behaviour. This file is the map.

## Shape

- **Static site, no build step, no framework, no package.json.** Plain HTML/CSS/ES5-style JS (IIFEs, `var`,
  no modules). Deployed by GitHub Pages from `main` / root, so **every push to `main` is a production deploy**.
- `index.html` — the whole site on one page (sections: hero, `#tour` cards t101/t102/t103/t001, `#info`, story,
  gallery, reviews, `#how`, `#faq`, `#policy`, `#book` form, footer). Loads `js/i18n.js` → `js/i18n-tours.js`
  → `js/main.js`, in that order.
- `js/i18n.js` — `window.LANGS` + `window.I18N` (8 languages: en, lo, th, zh, ko, ja, fr, de). English is the source.
  `js/i18n-tours.js` merges tour/booking/FAQ keys into `window.I18N`. Elements bind via `data-i18n`,
  `data-i18n-html`, `data-i18n-ph`.
- `js/main.js` — language switching, nav, lightbox, booking + inquiry forms (build the WhatsApp message and POST
  to the sheet), price placeholders (`fill()`), sheet overrides (`applyConfig`, cached in localStorage `nke-config`),
  fallback lunch `MENU`, `SHEET_URL`, WhatsApp number `WA`.
- `agreement/` + `js/agreement*.js` + `css/agreement.css` — per-booking tour agreement e-form, opened with a private
  `?k=<16-char key>`; `noindex`. Wording version is `AGREEMENT_VERSION` in `Code.gs` — bump it when the text changes.
- `trekking/`, `contact/`, `bar_cafe/`, … — 5-line redirect stubs for old WordPress URLs. Keep them.
- `archive/old-site/` — backup of the old WordPress site. Not linked, disallowed in `robots.txt`. Don't edit.

## Back office (`apps-script/`)

- `Code.gs` — a bound Apps Script web app on the bookings Google Sheet. `doPost` handles
  `{"type": booking|inquiry|agreement|selftest|rebuild}` (under a script lock, honeypot field `website`);
  `doGet` serves `?config=1`, `?reviews=1`, `?agreement=<key>`. `setup()` builds/migrates every tab idempotently
  and **must never touch data rows** — add columns with `addMissingColumns_` / `RENAMES`, not by rewriting sheets.
- `ContentSeed.gs` is **generated** — never hand-edit. After changing any text in `js/i18n*.js` or the section
  order in `index.html`, run `node apps-script/build-seed.js`.
- Deploying the script is a separate step from pushing the site (clasp push + `update-deployment` to keep the same
  `/exec` URL, then POST `{"type":"rebuild"}` and `{"type":"selftest"}`). Exact IDs and commands:
  `apps-script/README.md`. Ask before deploying — it changes the live booking endpoint.

## Rules that are easy to break

- **Prices never go literally into strings.** Use placeholders (`{p101} {p102} {p103} {p001} {pmin} {kip1} {kip2}
  {kipTrain}`), which `fill()` resolves from the Settings tab via `?config=1` (defaults in `CONFIG` in `main.js`).
  Server-side amounts (lunch, transfer) are recomputed from the sheet; the page's prices are never trusted.
- **Every user-visible string exists in all 8 languages.** Add the key to each language block, not just `en`.
  Sheet text is rendered through `safeHtml` (only `<br>` and `<em>`) — keep it that way.
- **Privacy:** passport numbers are never sent to the sheet from the booking form (they stay in the WhatsApp
  message). The agreement endpoint reveals nothing without a valid key. Don't commit guest data, import scripts
  holding passport data, or any write endpoint other than the deployed `/exec` URL.
- **Dates are Day/Month/Year** everywhere shown to people (`dd/mm/yyyy` in the sheet, DD/MM/YY in the WhatsApp
  message); the sheet locale is en_GB and time zone `Asia/Vientiane`.
- Errors in `Code.gs` are logged and re-thrown so they show under Apps Script > Executions; don't swallow them.
  The customer's WhatsApp message goes out regardless, so a silent sheet failure loses a booking record.
- The WhatsApp number `8562058975057` appears in both `index.html` and `js/main.js`; change both.

## Checking a change

No tests or linter. Serve the folder (`python3 -m http.server`) and open it; check at phone width and in at least
one non-Latin language (Lao/Thai) since text lengths differ a lot. For script changes, the `selftest` POST writes,
reads back and deletes a sample booking/inquiry/receipt/agreement.

## Conventions

- Commit messages: plain sentence describing the user-visible change (see `git log`), no prefixes.
- Translations are AI-written; flag Lao in particular for native review when adding text.
- "Noy" in commits and docs is the business owner; her paper forms and PDFs are the source of truth for tour
  facts, policy and agreement wording.
