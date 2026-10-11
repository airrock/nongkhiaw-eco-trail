/* Tour agreement page: loads the booking by the private code in the link (?k=...), shows each traveller's details, and saves
   what the guest fills in to the Agreements tab of the report (Apps Script). Nothing is stored in the browser except the language. */
(function () {
  'use strict';
  var SHEET_URL = 'https://script.google.com/macros/s/AKfycbxq9ET0sZ-Vbdy5VMLahGd_qS71e-mVIeDFgBc-wJCVUYRUNQDGth4ddnQ6j24rYpPf/exec';
  var NAMES = { en: 'English', lo: 'ລາວ', th: 'ไทย', zh: '中文', ko: '한국어', ja: '日本語', fr: 'Français', de: 'Deutsch' };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var key = '', lang = 'en', data = null;
  try { key = new URLSearchParams(location.search).get('k') || ''; } catch (e) { key = ''; }

  function pickLang() {
    var q = '';
    try { q = new URLSearchParams(location.search).get('lang') || ''; } catch (e) { q = ''; }
    if (!q) { try { q = localStorage.getItem('nke-lang') || ''; } catch (e) { q = ''; } }
    if (!q) q = (navigator.language || 'en').slice(0, 2);
    return window.AG[q] ? q : 'en';
  }
  function t(k, n) { var s = (window.AG[lang] && window.AG[lang][k]) || window.AG.en[k] || k; return n == null ? s : s.replace('{n}', n); }

  function applyText() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-ag]').forEach(function (el) { el.textContent = t(el.getAttribute('data-ag'), el.getAttribute('data-n')); });
    document.querySelectorAll('[data-ag-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-ag-ph')); });
    document.title = t('title');
  }

  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.keys(attrs || {}).forEach(function (a) { if (a === 'text') e.textContent = attrs[a]; else e.setAttribute(a, attrs[a]); });
    return e;
  }
  function field(card, tag, k, name, extra) {   // label + input/textarea
    var l = el('label', 'ag-f');
    l.appendChild(el('span', '', { 'data-ag': k }));
    var i = el(tag, '', Object.assign({ name: name }, extra || {}));
    l.appendChild(i); card.appendChild(l);
    return i;
  }

  function info(tr, dt, dd, wide) {
    var d = el('div', wide ? 'wide' : '');
    d.appendChild(el('dt', '', { 'data-ag': dt }));
    d.appendChild(el('dd', '', { text: dd || '-' }));
    return d;
  }

  function buildTravellers() {
    var box = $('#travellers'); box.innerHTML = '';
    data.travellers.forEach(function (tr, idx) {
      var done = data.signed.indexOf(tr.n) !== -1;
      var card = el('section', 'ag-card ag-trav' + (done ? ' signed' : ''), { 'data-n': tr.n });
      var h = el('h3'); h.appendChild(el('span', '', { 'data-ag': 'traveller', 'data-n': tr.n }));
      if (done) h.appendChild(el('span', 'ag-signed', { 'data-ag': 'signed' }));
      card.appendChild(h);
      var dl = el('dl', 'ag-info');
      dl.appendChild(info(tr, 'f_name', tr.full, true));
      dl.appendChild(info(tr, 'f_date', data.date));
      dl.appendChild(info(tr, 'f_receipt', data.receipt));
      dl.appendChild(info(tr, 'f_tour', data.tourName, true));
      dl.appendChild(info(tr, 'f_gender', tr.gender));
      dl.appendChild(info(tr, 'f_nat', tr.nat));
      dl.appendChild(info(tr, 'f_passport', tr.pass));
      dl.appendChild(info(tr, 'f_issue', tr.issued));
      dl.appendChild(info(tr, 'f_expiry', tr.expires));
      card.appendChild(dl);
      if (!done) {
        var ph = el('div', 'ag-sec'); ph.appendChild(el('h2', '', { 'data-ag': 'h_photo' }));
        ['yes', 'no'].forEach(function (v) {
          var l = el('label', 'ag-radio');
          l.appendChild(el('input', '', { type: 'radio', name: 'photo' + tr.n, value: v }));
          l.appendChild(el('span', '', { 'data-ag': 'photo_' + v }));
          ph.appendChild(l);
        });
        card.appendChild(ph);
        var em = el('div', 'ag-sec'); em.appendChild(el('h2', '', { 'data-ag': 'h_emerg' }));
        field(em, 'textarea', 'f_med', 'med' + tr.n, { maxlength: '500' });
        em.appendChild(el('h2', '', { 'data-ag': 'h_contact' }));
        if (idx > 0) {
          var same = el('label', 'ag-check'); same.appendChild(el('input', '', { type: 'checkbox', name: 'same' + tr.n }));
          same.appendChild(el('span', '', { 'data-ag': 'same_ec' })); em.appendChild(same);
        }
        field(em, 'input', 'f_ecname', 'ecn' + tr.n, { type: 'text', autocomplete: 'off', maxlength: '80' });
        field(em, 'input', 'f_ecphone', 'ecp' + tr.n, { type: 'tel', autocomplete: 'off', maxlength: '40' });
        field(em, 'input', 'f_ins', 'ins' + tr.n, { type: 'text', autocomplete: 'off', maxlength: '60' });
        card.appendChild(em);
        var ag = el('div', 'ag-sec'); ag.appendChild(el('h2', '', { 'data-ag': 'h_agree' }));
        var c = el('label', 'ag-check'); c.appendChild(el('input', '', { type: 'checkbox', name: 'agree' + tr.n }));
        c.appendChild(el('span', '', { 'data-ag': 'agree' })); ag.appendChild(c);
        var sg = field(ag, 'input', 'f_sign', 'sign' + tr.n, { type: 'text', autocomplete: 'off', maxlength: '80' });
        ag.appendChild(el('small', '', { 'data-ag': 'hint_sign', style: 'color:#5a665f' }));
        card.appendChild(ag);
      }
      box.appendChild(card);
    });
  }

  function val(name) { var e = $('[name="' + name + '"]'); return e ? e.value.trim() : ''; }

  function syncSame() {   // "same emergency contact as traveller 1" copies and locks the three fields
    data.travellers.forEach(function (tr, idx) {
      var box = $('[name="same' + tr.n + '"]'); if (!box) return;
      ['ecn', 'ecp', 'ins'].forEach(function (p) {
        var f = $('[name="' + p + tr.n + '"]'), src = $('[name="' + p + data.travellers[0].n + '"]');
        if (box.checked && src) { f.value = src.value; f.readOnly = true; } else f.readOnly = false;
      });
    });
  }

  function collect() {
    var people = [], bad = 0;
    data.travellers.forEach(function (tr) {
      if (data.signed.indexOf(tr.n) !== -1) return;
      var photo = ($('[name="photo' + tr.n + '"]:checked') || {}).value;
      var p = { n: tr.n, photo: photo, medical: val('med' + tr.n), ecName: val('ecn' + tr.n), ecPhone: val('ecp' + tr.n),
        insurance: val('ins' + tr.n), signedName: val('sign' + tr.n), accept: !!$('[name="agree' + tr.n + '"]').checked };
      if (!p.photo || !p.ecName || !p.ecPhone || !p.accept || p.signedName.length < 2) { if (!bad) bad = tr.n; }
      people.push(p);
    });
    return { people: people, bad: bad };
  }

  function showError(msg) { var e = $('#err'); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }

  function load() {
    return fetch(SHEET_URL + '?agreement=' + encodeURIComponent(key)).then(function (r) { return r.json(); });
  }

  function show(d) {
    data = d;
    var all = d.travellers.length && d.travellers.every(function (x) { return d.signed.indexOf(x.n) !== -1; });
    $('#state').hidden = true;
    $('#form').hidden = all; $('#done').hidden = !all;
    if (!all) buildTravellers();
    applyText();
  }

  function submit(ev) {
    ev.preventDefault();
    showError('');
    syncSame();
    var c = collect();
    if (c.bad) { showError(t('err_fill', c.bad)); return; }
    if (!c.people.length) return;
    var btn = $('#send'); btn.disabled = true; btn.textContent = t('sending');
    var body = JSON.stringify({ type: 'agreement', key: key, lang: lang, people: c.people });
    var post = fetch(SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body }).catch(function () { /* checked below */ });
    post.then(function () { return load(); }).then(function (d) {
      var mine = c.people.every(function (p) { return d.signed.indexOf(p.n) !== -1; });
      btn.disabled = false; btn.textContent = t('submit');
      if (!mine) { showError(t('neterr')); return; }
      show(d); window.scrollTo(0, 0);
    }).catch(function () { btn.disabled = false; btn.textContent = t('submit'); showError(t('neterr')); });
  }

  function init() {
    lang = pickLang();
    var sel = $('#lang');
    Object.keys(NAMES).forEach(function (c) { var o = el('option', '', { value: c, text: NAMES[c] }); if (c === lang) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { lang = sel.value; try { localStorage.setItem('nke-lang', lang); } catch (e) { /* private mode */ } applyText(); });
    applyText();
    $('#form').addEventListener('submit', submit);
    $('#form').addEventListener('input', function (e) { if (/^(same|ecn|ecp|ins)/.test(e.target.name || '')) syncSame(); });
    if (!/^[a-f0-9]{16}$/.test(key)) { var s = $('#state'); s.className = 'ag-state bad'; s.setAttribute('data-ag', 'invalid'); applyText(); return; }
    load().then(function (d) {
      if (d.error || !d.travellers) { var s = $('#state'); s.className = 'ag-state bad'; s.setAttribute('data-ag', 'invalid'); applyText(); return; }
      show(d);
    }).catch(function () { var s = $('#state'); s.className = 'ag-state bad'; s.setAttribute('data-ag', 'neterr'); applyText(); });
  }
  init();
})();
