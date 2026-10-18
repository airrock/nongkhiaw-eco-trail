(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var LANGS = window.LANGS || [];
  var DICT = window.I18N || {};
  var current = 'en';

  /* Prices live in the sheet's Settings tab; strings carry placeholders such as {p102} or {kip1}. These are the
     fallback values used until (or unless) the sheet answers. */
  var CONFIG = { prices: { '101': 30, '102': 60, '103': 90, '001': 30 }, kip: { one: 250000, round: 500000, train: 70000 } };
  // 2026-12-07 -> 07/12/26 (the WhatsApp message uses Day/Month/Year)
  function dmy(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : (iso || ''); }
  function fmtNum(n) {
    var sep = current === 'fr' ? ' ' : (current === 'de' ? '.' : ',');
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }
  function fill(v) {
    return v.replace(/\{(p101|p102|p103|p001|pmin|kip1|kip2|kipTrain)\}/g, function (m, k) {
      if (k === 'pmin') return String(Math.min.apply(null, Object.keys(CONFIG.prices).map(function (c) { return CONFIG.prices[c]; })));
      if (k === 'kip1') return fmtNum(CONFIG.kip.one);
      if (k === 'kip2') return fmtNum(CONFIG.kip.round);
      if (k === 'kipTrain') return fmtNum(CONFIG.kip.train);
      return String(CONFIG.prices[k.slice(1)]);
    });
  }
  function t(key) {
    var d = DICT[current] || {};
    if (d[key] != null && d[key] !== '') return fill(d[key]);
    return fill((DICT.en && DICT.en[key]) || '');
  }
  // Text from the sheet may only carry line breaks and emphasis; everything else is shown as plain text.
  function safeHtml(v) {
    return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/&lt;(\/?)(em|br)\s*\/?&gt;/g, function (m, close, tag) { return tag === 'br' ? '<br>' : '<' + close + 'em>'; });
  }

  /* Overrides written in the sheet (Content and Settings tabs). Cached in the browser so a repeat visit shows
     them at once; if the sheet cannot be reached the built-in text stays. */
  // Takeaway lunch from The Trio Bar & Cafe. The sheet's "Lunch menu" tab replaces this list; this one is the fallback.
  var MENU = [
    { group: 'Lao-Asian dishes', dish: 'Stir fried ginger', choices: ['Chicken', 'Pork', 'Tofu'], price: 69000 },
    { group: 'Lao-Asian dishes', dish: 'Stir fried holy basil', choices: ['Chicken', 'Pork', 'Tofu'], price: 69000 },
    { group: 'Lao-Asian dishes', dish: 'Fried cashew nut', choices: ['Chicken', 'Pork', 'Tofu'], price: 79000 },
    { group: 'Lao-Asian dishes', dish: 'Green curry', choices: ['Chicken', 'Pork', 'Tofu'], price: 79000 },
    { group: 'Lao-Asian dishes', dish: 'Yellow curry', choices: ['Chicken', 'Pork', 'Tofu'], price: 79000 },
    { group: 'Lao-Asian dishes', dish: 'Red curry', choices: ['Chicken', 'Pork', 'Tofu'], price: 79000 },
    { group: 'Lao-Asian dishes', dish: 'Pad Thai', choices: ['Chicken', 'Pork', 'Tofu'], price: 69000 },
    { group: 'Lao-Asian dishes', dish: 'Classic fried rice', choices: ['Chicken', 'Pork', 'Bacon', 'Egg', 'Tofu'], price: 69000 },
    { group: 'Sandwiches', dish: 'Lemongrass chicken sandwich', choices: [], price: 80000 },
    { group: 'Sandwiches', dish: 'Lemongrass tofu sandwich', choices: [], price: 70000 },
    { group: 'Sandwiches', dish: 'Chicken sandwich', choices: [], price: 70000 },
    { group: 'Sandwiches', dish: 'Bacon sandwich', choices: [], price: 70000 },
    { group: 'Sandwiches', dish: 'Tuna sandwich', choices: [], price: 70000 },
    { group: 'Sandwiches', dish: 'Avocado sandwich', choices: [], price: 65000 },
    { group: 'Sandwiches', dish: 'Omelette or scrambled eggs sandwich', choices: ['Omelette', 'Scrambled eggs'], price: 70000 },
    { group: 'Sandwiches', dish: 'Chilli tamarind tofu sandwich', choices: [], price: 65000 },
    { group: 'Sandwiches', dish: 'Pumpkin caramelised sandwich', choices: [], price: 80000 },
    { group: 'Sandwiches', dish: 'Vegetable sandwich', choices: [], price: 60000 }
  ];
  function menuItem(dish) { return MENU.filter(function (m) { return m.dish === dish; })[0]; }

  function applyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    if (Array.isArray(cfg.menu) && cfg.menu.length) {
      MENU = cfg.menu.filter(function (m) { return m && m.dish && Number(m.price) > 0; }).map(function (m) {
        return { group: String(m.group || 'Menu'), dish: String(m.dish), price: Number(m.price), choices: Array.isArray(m.choices) ? m.choices.map(String) : [] };
      });
    }
    if (cfg.prices) Object.keys(cfg.prices).forEach(function (c) { var n = Number(cfg.prices[c]); if (n > 0) CONFIG.prices[c] = n; });
    if (cfg.kip) ['one', 'round', 'train'].forEach(function (k) { var n = Number(cfg.kip[k]); if (n > 0) CONFIG.kip[k] = n; });
    if (cfg.content) Object.keys(cfg.content).forEach(function (lang) {
      if (!DICT[lang]) return;
      Object.keys(cfg.content[lang]).forEach(function (key) {
        var v = cfg.content[lang][key];
        if (typeof v === 'string' && v.trim()) DICT[lang][key] = v;
      });
    });
  }

  /* ---------- language ---------- */
  function applyLang(code) {
    if (!DICT[code]) code = 'en';
    current = code;
    document.documentElement.lang = code;

    $$('.price-num[data-price]').forEach(function (el) { el.textContent = 'USD ' + CONFIG.prices[el.getAttribute('data-price')]; });
    $$('[data-i18n]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n'));
      if (v) el.textContent = v;
    });
    $$('[data-i18n-html]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-html'));
      if (v) el.innerHTML = safeHtml(v);
    });
    $$('[data-i18n-ph]').forEach(function (el) {
      var v = t(el.getAttribute('data-i18n-ph'));
      if (v) el.setAttribute('placeholder', v);
    });

    document.title = t('meta_title');
    var md = $('meta[name="description"]');
    if (md) md.setAttribute('content', t('meta_desc'));

    var meta = LANGS.filter(function (l) { return l.code === code; })[0];
    $('#langLabel').textContent = meta ? meta.name : code;
    $$('#langMenu button').forEach(function (b) {
      b.setAttribute('aria-current', b.getAttribute('data-code') === code ? 'true' : 'false');
    });
    $('#formHint').textContent = '';
    var cb = $('#copyBtn');
    if (cb) cb.textContent = t('copy');
    if (typeof refillLunch === 'function') refillLunch();
    try { localStorage.setItem('nke-lang', code); } catch (e) {}
  }

  function detectLang() {
    var fromUrl = null;
    try { fromUrl = new URLSearchParams(location.search).get('lang'); } catch (e) {}
    if (fromUrl && DICT[fromUrl]) return fromUrl;
    try {
      var saved = localStorage.getItem('nke-lang');
      if (saved && DICT[saved]) return saved;
    } catch (e) {}
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    var base = String(nav).toLowerCase().split('-')[0];
    return DICT[base] ? base : 'en';
  }

  function buildLangMenu() {
    var menu = $('#langMenu'), btn = $('#langBtn');
    LANGS.forEach(function (l) {
      var li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('data-code', l.code);
      b.setAttribute('lang', l.code);
      b.innerHTML = '<span></span><small></small>';
      b.firstChild.textContent = l.name;
      b.lastChild.textContent = l.hint;
      b.addEventListener('click', function () {
        applyLang(l.code);
        closeMenu();
      });
      li.appendChild(b);
      menu.appendChild(li);
    });
    function openMenu() { menu.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    function closeMenu() { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    window.closeLangMenu = closeMenu;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.contains('open') ? closeMenu() : openMenu();
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('#lang')) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---------- header, burger, back-to-top ---------- */
  var header = $('.site-header'), toTop = $('#toTop');
  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    header.classList.toggle('solid', y > 40);
    toTop.classList.toggle('show', y > 700);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  var burger = $('#burger'), nav = $('#nav');
  function setNav(open) {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) header.classList.add('solid'); else onScroll();
  }
  burger.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });

  /* ---------- reveal on scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- lightbox ---------- */
  var items = $$('.g'), lb = $('#lightbox'), lbImg = $('#lbImg'), idx = 0, lastFocus = null;
  function show(i) {
    idx = (i + items.length) % items.length;
    lbImg.src = items[idx].getAttribute('data-full');
    lbImg.alt = items[idx].querySelector('img').alt;
  }
  function openLb(i) { lastFocus = document.activeElement; show(i); lb.hidden = false; document.body.style.overflow = 'hidden'; $('#lbClose').focus(); }
  function closeLb() { lb.hidden = true; lbImg.src = ''; document.body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
  items.forEach(function (b, i) { b.addEventListener('click', function () { openLb(i); }); });
  $('#lbClose').addEventListener('click', closeLb);
  $('#lbPrev').addEventListener('click', function () { show(idx - 1); });
  $('#lbNext').addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
  var tx = null;
  lb.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (tx == null) return;
    var dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    tx = null;
  });

  /* ---------- in-page jumps ----------
     A jump to a section far down the page ends short on iPhones: images, reviews and sheet text above the target
     are still loading, so the target moves away after the jump (iPhone browsers have no scroll anchoring to undo
     that). Load the images first, jump in one step, then keep the target in place while the layout settles (and
     stop at once if the visitor starts scrolling). Used for clicks and for links that arrive with a #section. */
  function pageTop(el) {   // ignores the .reveal slide-in transform, which getBoundingClientRect would include
    var y = 0;
    for (var n = el; n; n = n.offsetParent) y += n.offsetTop;
    return y;
  }
  function jumpTo(el) {
    var header = $('.site-header');
    var offset = (header ? header.offsetHeight : 70) + 6;
    var stopped = false, ro = null;
    var stop = function () { stopped = true; if (ro) ro.disconnect(); };
    ['touchstart', 'wheel', 'keydown'].forEach(function (ev) { window.addEventListener(ev, stop, { once: true, passive: true }); });
    var target = function () { return Math.max(0, pageTop(el) - offset); };
    var go = function () {   // 'auto' would follow the CSS scroll-behavior:smooth; switch it off for one step
      var root = document.documentElement, was = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, target());
      root.style.scrollBehavior = was;
    };
    var check = function () { if (!stopped && Math.abs(window.pageYOffset - target()) > 6) go(); };
    $$('img[loading="lazy"]').forEach(function (img) { img.loading = 'eager'; });
    go();
    if ('ResizeObserver' in window) { ro = new ResizeObserver(check); ro.observe(document.body); }
    [120, 350, 800, 1500, 2500, 4000, 6000].forEach(function (ms) { setTimeout(check, ms); });
    setTimeout(stop, 8000);
  }
  function jumpToHash() {
    var id = location.hash.slice(1);
    try { id = decodeURIComponent(id); } catch (err) { /* malformed: use as typed */ }
    var el = id && document.getElementById(id);
    if (el) jumpTo(el);
  }
  window.addEventListener('hashchange', jumpToHash);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.hasAttribute('data-tour') ? 'booking-form' : a.getAttribute('href').slice(1);
    var el = id && document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    jumpTo(el);
    try { history.replaceState(null, '', '#' + id); } catch (err) { /* private mode: the jump still worked */ }
  });

  /* ---------- booking form -> WhatsApp ---------- */
  var WA = '8562058975057';
  // Google Apps Script web app that saves submissions to the bookings sheet (apps-script/Code.gs); '' = off
  var SHEET_URL = 'https://script.google.com/macros/s/AKfycbxq9ET0sZ-Vbdy5VMLahGd_qS71e-mVIeDFgBc-wJCVUYRUNQDGth4ddnQ6j24rYpPf/exec';
  function saveToSheet(data) {
    if (!SHEET_URL) return;
    data.lang = current;
    data.referrer = referrer();
    fetch(SHEET_URL, { method: 'POST', mode: 'no-cors', keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) })
      .catch(function (err) { console.error('Saving to the bookings sheet failed', err); });
  }
  function referrer() {
    var q = new URLSearchParams(location.search);
    if (q.get('utm_source')) return q.get('utm_source') + (q.get('utm_campaign') ? ' / ' + q.get('utm_campaign') : '');
    try { return document.referrer ? new URL(document.referrer).hostname : 'direct'; } catch (e) { return 'direct'; }
  }
  function bookingRef() {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    return 'NK' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }
  var dateInput = $('#fDate');
  (function () {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
    dateInput.min = d.getFullYear() + '-' + m + '-' + day;
  })();
  var TOUR_NAMES = {
    '101': 'Package 101: Overnight Camping Above the Clouds 360° Viewpoint',
    '102': 'Package 102: 2 Days 1 Night Overnight Camping & Full Day Adventure',
    '103': 'Package 103: 3D2N Camping Above the Clouds, Homestay & Full-Day Adventure',
    '001': 'Tour 001: 1-day boat trip to Muang Ngoi',
    'T00': 'Transport only (no tour)'
  };
  function tourLabel(code) {
    return TOUR_NAMES[code] ? TOUR_NAMES[code] + (CONFIG.prices[code] ? ' (USD ' + CONFIG.prices[code] + ')' : '') : code;
  }
  $$('[data-tour]').forEach(function (a) {
    a.addEventListener('click', function () {
      var sel = $('#fTour');
      if (sel) { sel.value = a.getAttribute('data-tour'); sel.dispatchEvent(new Event('change')); }
      var pv = $('#fPrivate'); if (pv && !pv.closest('[hidden]')) pv.checked = a.hasAttribute('data-private');
      showTab('book');
      // focusing a date field on a phone opens the picker over the page, so only do it with a mouse
      if (window.matchMedia('(hover: hover)').matches) setTimeout(function () { dateInput.focus({ preventScroll: true }); }, 700);
    });
  });
  /* one block of passport fields per guest; typed values survive count changes */
  var travBox = $('#travellers');
  function field(key, html) {
    return '<label><span data-i18n="' + key + '">' + t(key) + '</span>' + html + '</label>';
  }
  function travBlock(n) {
    var f = document.createElement('fieldset');
    f.className = 'trav';
    f.innerHTML =
      '<legend><span data-i18n="trav">' + t('trav') + '</span> ' + n + '</legend>' +
      '<div class="row2">' +
        field('lbl_first', '<input type="text" data-k="first" autocomplete="off" required>') +
        field('lbl_last', '<input type="text" data-k="last" autocomplete="off" required>') +
      '</div>' +
      '<div class="row2">' +
        field('lbl_gender', '<select data-k="gender" required><option value="" data-i18n="g_sel">' + t('g_sel') + '</option>' +
          '<option value="Female" data-i18n="g_f">' + t('g_f') + '</option><option value="Male" data-i18n="g_m">' + t('g_m') + '</option>' +
          '<option value="X" data-i18n="g_x">' + t('g_x') + '</option></select>') +
        field('lbl_nat', '<input type="text" data-k="nat" data-i18n-ph="ph_nat" placeholder="' + t('ph_nat') + '" required>') +
      '</div>' +
      field('lbl_pass', '<input type="text" data-k="pass" autocomplete="off" autocapitalize="characters" spellcheck="false" required>') +
      '<div class="row2">' +
        field('lbl_issue', '<input type="date" data-k="issued" required>') +
        field('lbl_expiry', '<input type="date" data-k="expires" required>') +
      '</div>' +
      field('lbl_food', '<select data-k="food"><option value="Regular" data-i18n="food_reg">' + t('food_reg') +
        '</option><option value="Vegetarian" data-i18n="food_veg">' + t('food_veg') +
        '</option><option value="Vegan" data-i18n="food_vegan">' + t('food_vegan') +
        '</option><option value="Gluten-free" data-i18n="food_gf">' + t('food_gf') + '</option></select>') +
      // From the second traveller on: pickup at the group's place (default), somewhere else, or no transfer at all.
      (n > 1 ? '<div class="pk" hidden>' +
        field('lbl_pickup_who', '<select data-k="pickup"><option value="same" data-i18n="pk_same">' + t('pk_same') +
          '</option><option value="other" data-i18n="pk_other">' + t('pk_other') + '</option><option value="none" data-i18n="pk_none">' +
          t('pk_none') + '</option></select>') +
        '<div class="pk-other" hidden>' +
          field('lbl_pk_place', '<input type="text" data-k="pkplace" autocomplete="off">') +
          field('lbl_pk_map', '<input type="url" data-k="pkmap" inputmode="url" placeholder="https://maps.app.goo.gl/…">') +
          '<a class="btn btn-line btn-sm" data-k="pkfind" href="https://www.google.com/maps/search/?api=1&amp;query=Luang+Prabang" ' +
          'target="_blank" rel="noopener" data-i18n="btn_findmap">' + t('btn_findmap') + '</a>' +
        '</div></div>' : '') +
      field('lbl_lunch', '<select data-k="lunch"></select>') +
      '<div class="lunch-choice" hidden>' + field('lbl_lunch_choice', '<select data-k="lunchchoice"></select>') + '</div>';
    fillLunch(f);
    return f;
  }
  // Dish list (grouped, with prices) and, for dishes that have options, the choice list. Built with DOM calls because the
  // names come from the sheet. Keeps what the guest already picked.
  function option(value, label) { var o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
  function fillLunch(f) {
    var sel = $('[data-k="lunch"]', f), keep = sel.value, groups = [];
    sel.textContent = '';
    sel.appendChild(option('', t('lunch_none')));
    MENU.forEach(function (m) {
      var g = groups.filter(function (x) { return x.label === m.group; })[0];
      if (!g) { g = document.createElement('optgroup'); g.label = m.group; groups.push(g); sel.appendChild(g); }
      g.appendChild(option(m.dish, m.dish + ' – ' + fmtNum(m.price) + ' ' + t('unit_kip')));
    });
    if (keep && menuItem(keep)) sel.value = keep;
    fillChoice(f);
  }
  function fillChoice(f) {
    var item = menuItem($('[data-k="lunch"]', f).value), box = $('.lunch-choice', f), cs = $('[data-k="lunchchoice"]', f), keep = cs.value;
    cs.textContent = '';
    box.hidden = !(item && item.choices.length);
    if (box.hidden) return;
    cs.appendChild(option('', t('g_sel')));
    item.choices.forEach(function (c) { cs.appendChild(option(c, c)); });
    if (keep && item.choices.indexOf(keep) !== -1) cs.value = keep;
  }
  function refillLunch() { $$('.trav', travBox).forEach(fillLunch); }

  function syncTravellers() {
    var want = Math.min(Math.max(parseInt($('#fGuests').value, 10) || 1, 1), 30);
    var have = $$('.trav', travBox);
    for (var i = have.length; i < want; i++) travBox.appendChild(travBlock(i + 1));
    for (var j = have.length - 1; j >= want; j--) travBox.removeChild(have[j]);
    if (transferSel) syncPickups();
  }
  // Pickup choices only matter when a transfer is booked; "a different place" shows that traveller's own address fields.
  function syncPickups() {
    var on = transferSel.value !== 'No';
    $$('.trav', travBox).forEach(function (f) {
      var pk = $('.pk', f); if (!pk) return;
      pk.hidden = !on;
      $('.pk-other', f).hidden = !on || $('[data-k="pickup"]', f).value !== 'other';
    });
  }
  travBox.addEventListener('change', function (e) {
    if (e.target.matches('[data-k="pickup"]')) syncPickups();
    if (e.target.matches('[data-k="lunch"]')) fillChoice(e.target.closest('.trav'));
  });
  travBox.addEventListener('input', function (e) {
    if (!e.target.matches('[data-k="pkplace"]')) return;
    $('[data-k="pkfind"]', e.target.closest('.trav')).href =
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.target.value.trim() + ' Luang Prabang');
  });
  $('#fGuests').addEventListener('input', syncTravellers);
  $('#fGuests').addEventListener('change', function () {
    this.value = Math.min(Math.max(parseInt(this.value, 10) || 1, 1), 30);
    syncTravellers();
  });
  syncTravellers();

  /* first Google Maps URL in the pasted text (Share often adds the place name), or '' */
  function mapsLink(text) {
    var m = text.match(/https?:\/\/\S+/);
    var ok = m && /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)/i.test(m[0]);
    return ok ? m[0] : '';
  }
  /* pickup map: search Google Maps for the typed name, paste the shared link, preview the pin */
  var mapInput = $('#fMap'), mapOk = $('#mapOk'), pasteBtn = $('#pasteMap');
  function syncFindMap() {
    var q = ($('#fHotel').value.trim() + ' Luang Prabang').trim();
    $('#findMap').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function syncMapOk() {
    var link = mapsLink(mapInput.value);
    mapOk.hidden = !link;
    if (link) mapOk.href = link;
  }
  $('#fHotel').addEventListener('input', syncFindMap);
  mapInput.addEventListener('input', syncMapOk);
  if (navigator.clipboard && navigator.clipboard.readText) {
    pasteBtn.hidden = false;
    pasteBtn.addEventListener('click', function () {
      navigator.clipboard.readText().then(function (txt) {
        mapInput.value = mapsLink(txt) || txt.trim();
        syncMapOk();
        if (!mapsLink(txt)) $('#formHint').textContent = t('hint_map');
      }, function () { mapInput.focus(); $('#formHint').textContent = t('paste_fail'); });
    });
  }
  var transferSel = $('#fTransfer');
  var pickupInput = $('#fPickup'), returnInput = $('#fReturn');
  pickupInput.min = returnInput.min = dateInput.min;
  // Transfer legs: up = Luang Prabang -> Nong Khiaw, down = back. "One way to Luang Prabang" is for guests already in Nong Khiaw.
  function legs() {
    var v = transferSel.value;
    return { none: v === 'No', round: v === 'Round trip', down: v === 'Round trip' || v === 'One way to Luang Prabang',
      up: v === 'Round trip' || v === 'One way to Nong Khiaw', onlyDown: v === 'One way to Luang Prabang' };
  }
  // Package 103: back on the last tour day (afternoon minivan, date follows the tour) or on a later day (10:30 am minivan).
  function backAfterTour() { var g = legs(); return g.round && $('#fTour').value === '103' && $('#fRet103').value === 'end'; }
  function syncTransfer() {
    var g = legs(), only = $('#fTour').value === 'T00';
    $('#hotelRow').hidden = g.none;
    $('#transferDates').hidden = g.none || (!g.up && backAfterTour());
    $('#pickupRow').hidden = !g.up;
    $('#ret103Row').hidden = !(g.round && $('#fTour').value === '103');
    $('#returnRow').hidden = !g.down || backAfterTour();
    $('#trainRow').hidden = !g.down;
    if (!g.down) $('#fTrain').checked = false;
    var lbl = $('#hotelLbl'), key = g.onlyDown ? 'lbl_hotel_nk' : 'lbl_hotel';
    lbl.setAttribute('data-i18n', key); lbl.textContent = t(key);
    $('#findMap').href = 'https://www.google.com/maps/search/?api=1&query=' + (g.onlyDown ? 'Nong+Khiaw' : 'Luang+Prabang');
    $('#dateRow').hidden = only;
    $('#privateRow').hidden = only;
    if (only) $('#fPrivate').checked = false;
    dateInput.required = !only;
    syncPickups();
    if (g.up && !pickupInput.value) pickupInput.value = dateInput.value;  // usually the same day as the tour
  }
  transferSel.addEventListener('change', syncTransfer);
  $('#fTour').addEventListener('change', syncTransfer);
  $('#fRet103').addEventListener('change', syncTransfer);
  // yyyy-mm-dd plus n days
  function addDays(ymd, n) {
    var d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // keep the pickup date following the tour date until the guest sets their own
  var lastTourDate = '';
  dateInput.addEventListener('change', function () {
    if (!pickupInput.value || pickupInput.value === lastTourDate) pickupInput.value = transferSel.value === 'No' ? '' : dateInput.value;
    lastTourDate = dateInput.value;
  });
  pickupInput.addEventListener('change', function () { returnInput.min = pickupInput.value || dateInput.min; });

  $('#bookForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var date = dateInput.value;
    var note = $('#fNote').value.trim();
    var tour = $('#fTour').value;
    var transfer = transferSel.value;
    var hotel = $('#fHotel').value.trim();
    var mapLink = mapsLink($('#fMap').value);
    var hint = $('#formHint');
    var only = tour === 'T00', g = legs();   // transport only: no tour date
    if (only) date = '';
    var missing = (date || only ? [] : [dateInput]).concat($$('.trav [required]', travBox).filter(function (el) { return !el.value.trim(); }));
    if (missing.length) { hint.textContent = t('hint'); missing[0].focus(); return; }
    if (!only && date < dateInput.min) { hint.textContent = t('hint_past'); dateInput.focus(); return; }
    if (only && g.none) { hint.textContent = t('hint_trn'); transferSel.focus(); return; }
    var badPass = passportProblem(date);
    if (badPass) { hint.textContent = t(badPass.key).replace('{n}', badPass.n); badPass.el.focus(); return; }
    var pay = $('#fPay').value;
    if (!pay) { hint.textContent = t('hint_pay'); $('#fPay').focus(); return; }
    var pickup = g.up ? pickupInput.value : '', ret = backAfterTour() ? addDays(date, 2) : (g.down ? returnInput.value : '');
    var plan = g.round && tour === '103' ? $('#fRet103').value : '';
    if (g.up && (!pickup || pickup < dateInput.min)) { hint.textContent = t('hint_pickup'); pickupInput.focus(); return; }
    if (g.down && (!ret || ret < (pickup || dateInput.min))) { hint.textContent = t('hint_return'); returnInput.focus(); return; }
    if (!g.none && !hotel) { hint.textContent = t('hint_hotel'); $('#fHotel').focus(); return; }
    if (g.up && !mapLink) { hint.textContent = t('hint_map'); $('#fMap').focus(); return; }   // a Nong Khiaw pickup may go without
    var blocks = $$('.trav', travBox);
    var modes = blocks.map(function (f, i) { return transfer === 'No' || i === 0 ? 'same' : $('[data-k="pickup"]', f).value; });
    for (var q = 0; q < blocks.length; q++) {
      if (modes[q] !== 'other') continue;
      var pl = $('[data-k="pkplace"]', blocks[q]), pm = $('[data-k="pkmap"]', blocks[q]);
      if (!pl.value.trim() || !mapsLink(pm.value)) { hint.textContent = t('hint_pk').replace('{n}', q + 1); (pl.value.trim() ? pm : pl).focus(); return; }
    }
    for (var w = 0; w < blocks.length; w++) {
      var dishItem = menuItem($('[data-k="lunch"]', blocks[w]).value);
      if (dishItem && dishItem.choices.length && !$('[data-k="lunchchoice"]', blocks[w]).value) {
        hint.textContent = t('hint_lunch').replace('{n}', w + 1); $('[data-k="lunchchoice"]', blocks[w]).focus(); return;
      }
    }
    var train = g.down && $('#fTrain').checked;
    var priv = !only && $('#fPrivate').checked;
    hint.textContent = '';
    if (!lockSubmit(this)) return;
    var ref = bookingRef();
    var source = $('#fSource').value;
    saveToSheet({
      type: 'booking', id: ref, website: $('#bookForm [name=website]').value, tour: tour, date: date,
      transfer: transfer, pickupDate: pickup, returnDate: ret, returnPlan: plan, private: priv,
      hotel: hotel, map: mapLink, train: train, payment: pay, phone: $('#fPhone').value.trim(), source: source, note: note,
      travellers: blocks.map(function (f, i) {
        var v = function (k) { return $('[data-k="' + k + '"]', f).value.trim(); };
        return { name: v('first') + ' ' + v('last'), first: v('first'), last: v('last'), gender: v('gender'), nat: v('nat'),
          pass: v('pass').toUpperCase(), issued: v('issued'), expires: v('expires'), food: v('food'), pickup: modes[i],
          pkPlace: modes[i] === 'other' ? v('pkplace') : '', pkMap: modes[i] === 'other' ? mapsLink(v('pkmap')) : '',
          lunch: v('lunch'), lunchChoice: v('lunchchoice') };
      })
    });
    // Pickups listed by place so the driver sees the stops at a glance (only when someone differs from the group).
    var pickupLines = '';
    if (transfer !== 'No' && modes.indexOf('other') !== -1 || modes.indexOf('none') !== -1) {
      var stops = [], none = [], groupAt = [];
      blocks.forEach(function (f, i) {
        if (modes[i] === 'none') none.push(i + 1);
        else if (modes[i] === 'other') stops.push('- ' + $('[data-k="pkplace"]', f).value.trim() + ' (Traveller ' + (i + 1) + '): ' + mapsLink($('[data-k="pkmap"]', f).value));
        else groupAt.push(i + 1);
      });
      var nums = function (a) { return (a.length > 1 ? 'Travellers ' : 'Traveller ') + a.join(', '); };
      pickupLines = '\nPickups:' + (groupAt.length ? '\n- ' + hotel + ' (' + nums(groupAt) + '): ' + mapLink : '') +
        (stops.length ? '\n' + stops.join('\n') : '') + (none.length ? '\n- No transfer: ' + nums(none) : '');
    }
    var lunchKip = 0;
    var people = blocks.map(function (f, i) {
      var v = function (k) { return $('[data-k="' + k + '"]', f).value.trim(); };
      var dish = menuItem(v('lunch')), lunchLine = '';
      if (dish) {
        lunchKip += dish.price;
        lunchLine = '\n- Takeaway lunch: ' + dish.dish + (v('lunchchoice') ? ' (' + v('lunchchoice') + ')' : '') + ', ' +
          String(dish.price).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' kip';
      }
      return '\nTraveller ' + (i + 1) + ': ' + v('first') + ' ' + v('last') +
        '\n- First name: ' + v('first') + '\n- Last name: ' + v('last') +
        '\n- Gender: ' + v('gender') + '\n- Nationality: ' + v('nat') +
        '\n- Passport: ' + v('pass').toUpperCase() + ' (issued ' + dmy(v('issued')) + ', expires ' + dmy(v('expires')) + ')' +
        '\n- Food: ' + v('food') + lunchLine;
    });
    var msg = 'Hello! I would like to book:\n' + tourLabel(tour) + '\nBooking ref: ' + ref + '\n' +
      (only ? '' : 'Date: ' + dmy(date) + '\n') + (priv ? 'PRIVATE TOUR (only our group, please confirm the price)\n' : '') + 'People: ' + people.length +
      '\nPayment method: ' + pay +
      '\nMinivan transfer: ' + transfer +
      (g.up ? '\nPickup date (Luang Prabang to Nong Khiaw): ' + dmy(pickup) : '') +
      (g.down ? '\nDate back (Nong Khiaw to Luang Prabang): ' + dmy(ret) +
        (plan === 'end' ? ' (last day of the tour, minivan about 3:30-4:30 pm)' : plan === 'later' ? ' (minivan about 10:30 am)' : '') : '') +
      (g.down ? '\nDrop-off in Luang Prabang: ' + (train ? 'Luang Prabang train station (+' +
        String(CONFIG.kip.train).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' kip per person)' : 'city centre near the night market') : '') +
      (!g.none ? (g.onlyDown ? '\nAccommodation in Nong Khiaw: ' : '\nAccommodation: ') + hotel + (mapLink ? '\nGoogle Maps: ' + mapLink : '') : '') + pickupLines + '\n' +
      people.join('\n') +
      (lunchKip ? '\n\nTakeaway lunch total: ' + String(lunchKip).replace(/\B(?=(\d{3})+(?!\d))/g, ',') +
        ' kip (not included in the tour price, paid separately)' : '') +
      (note ? '\n\nNote: ' + note : '');
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  });

  // Issue date not in the future, expiry after issue, and passport still valid on the tour date (dates are yyyy-mm-dd).
  function passportProblem(tourDate) {
    var blocks = $$('.trav', travBox);
    for (var i = 0; i < blocks.length; i++) {
      var issued = $('[data-k="issued"]', blocks[i]), expires = $('[data-k="expires"]', blocks[i]);
      if (issued.value > dateInput.min || expires.value <= issued.value) return { key: 'hint_pass_dates', n: i + 1, el: issued };
      if (expires.value <= tourDate) return { key: 'hint_pass_exp', n: i + 1, el: expires };
    }
    return null;
  }
  // One send per click: a double click must not create two bookings.
  function lockSubmit(form) {
    var btn = $('button[type=submit]', form);
    if (btn.disabled) return false;
    btn.disabled = true;
    setTimeout(function () { btn.disabled = false; }, 4000);
    return true;
  }

  /* ---------- book / ask tabs ---------- */
  function showTab(which) {
    var ask = which === 'ask';
    $('#bookForm').hidden = ask;
    $('#askForm').hidden = !ask;
    $('#tabBook').setAttribute('aria-selected', String(!ask));
    $('#tabAsk').setAttribute('aria-selected', String(ask));
  }
  $('#tabBook').addEventListener('click', function () { showTab('book'); });
  $('#tabAsk').addEventListener('click', function () { showTab('ask'); });

  $('#askForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('#qName').value.trim(), contact = $('#qContact').value.trim();
    var question = $('#qText').value.trim(), tour = $('#qTour').value;
    var missing = [$('#qName'), $('#qContact'), $('#qText')].filter(function (el) { return !el.value.trim(); });
    if (missing.length) { $('#askHint').textContent = t('ask_hint'); missing[0].focus(); return; }
    $('#askHint').textContent = '';
    if (!lockSubmit(this)) return;
    saveToSheet({ type: 'inquiry', website: $('#askForm [name=website]').value, name: name, contact: contact,
      tour: tour, question: question, source: $('#qSource').value });
    var msg = 'Hello! I have a question' + (tour ? ' about ' + tourLabel(tour) : '') + ':\n' + question +
      '\n\nName: ' + name + '\nContact: ' + contact;
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
  });

  function loadConfig() {
    if (!SHEET_URL || !window.fetch) return;
    fetch(SHEET_URL + '?config=1')
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        applyConfig(cfg);
        try { localStorage.setItem('nke-config', JSON.stringify(cfg)); } catch (e) { /* private mode */ }
        applyLang(current);
      })
      .catch(function (err) { console.error('Website content from the sheet could not be loaded; showing the built-in text', err); });
  }

  /* ---------- reviews: the ones staff tick in the sheet's Reviews tab; the reviews in the HTML stay if that fails ---------- */
  function loadReviews() {
    if (!SHEET_URL || !window.fetch) return;
    fetch(SHEET_URL + '?reviews=1')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!Array.isArray(list) || !list.length) return;
        var grid = $('.rev-grid');
        grid.textContent = '';
        list.forEach(function (rv) {
          var fig = document.createElement('figure'), q = document.createElement('blockquote');
          var cap = document.createElement('figcaption'), who = document.createElement('strong'), src = document.createElement('span');
          fig.className = 'rev';
          q.textContent = rv.text;
          who.textContent = rv.name;
          src.setAttribute('data-i18n', 'rev_src');
          src.textContent = t('rev_src');
          cap.appendChild(who); cap.appendChild(document.createTextNode(' ')); cap.appendChild(src);
          fig.appendChild(q); fig.appendChild(cap); grid.appendChild(fig);
        });
      })
      .catch(function (err) { console.error('Reviews from the sheet could not be loaded; showing the built-in ones', err); });
  }

  /* ---------- copy phone number ---------- */
  var copyBtn = $('#copyBtn');
  copyBtn.addEventListener('click', function () {
    var num = '+856 20 5897 5057';
    function done() {
      copyBtn.textContent = t('copied');
      setTimeout(function () { copyBtn.textContent = t('copy'); }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(num).then(done, done);
    } else {
      var ta = document.createElement('textarea');
      ta.value = num; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(ta); done();
    }
  });

  /* ---------- init ---------- */
  $('#year').textContent = new Date().getFullYear();
  buildLangMenu();
  try { applyConfig(JSON.parse(localStorage.getItem('nke-config'))); } catch (e) { /* no cached copy */ }
  applyLang(detectLang());
  loadConfig();
  loadReviews();
  jumpToHash();   // a shared link such as nongkhiawlaos.com/#booking-form
})();
