/* Takeaway lunch ordered after booking (lunch/index.html): the private code in the link (?k=..., the same one as the agreement
   form) opens the booking's travellers; each picks a dish from the Lunch menu and the order is saved on the booking in the sheet.
   Text comes from the site's js/i18n*.js (keys lunch_*, lunch_none, lbl_lunch_choice, hint_lunch, unit_kip). */
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
    return window.I18N[q] ? q : 'en';
  }
  function t(k, n) { var s = (window.I18N[lang] && window.I18N[lang][k]) || window.I18N.en[k] || k; return n == null ? s : s.replace('{n}', n); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function applyText() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n'), el.getAttribute('data-n')); });
    document.title = t('lunch_title') + ' | Nong Khiaw Eco-Trail';
  }
  function el(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    Object.keys(attrs || {}).forEach(function (a) { if (a === 'text') e.textContent = attrs[a]; else e.setAttribute(a, attrs[a]); });
    return e;
  }
  function item(dish) { return (data.menu || []).filter(function (m) { return m.dish === dish; })[0]; }

  function build() {
    var box = $('#people'); box.innerHTML = '';
    data.travellers.forEach(function (tr) {
      var card = el('div', 'ln-trav');
      var h = el('h3'); h.textContent = t('lunch_for', tr.n) + ': ' + tr.first; card.appendChild(h);
      var row = el('div', 'ln-row');
      var sel = el('select', '', { name: 'dish' + tr.n });
      sel.appendChild(el('option', '', { value: '', text: t('lunch_none') }));
      var groups = {};
      (data.menu || []).forEach(function (m) {
        if (!groups[m.group]) { groups[m.group] = el('optgroup', '', { label: m.group }); sel.appendChild(groups[m.group]); }
        groups[m.group].appendChild(el('option', '', { value: m.dish, text: m.dish + ' – ' + fmt(m.price) + ' ' + t('unit_kip') }));
      });
      sel.value = item(tr.lunch) ? tr.lunch : '';
      var choice = el('select', '', { name: 'choice' + tr.n, hidden: '' });
      row.appendChild(sel); row.appendChild(choice); card.appendChild(row);
      var sync = function () {
        var m = item(sel.value);
        choice.innerHTML = '';
        if (m && m.choices.length) {
          choice.appendChild(el('option', '', { value: '', text: t('lbl_lunch_choice') + '…' }));
          m.choices.forEach(function (c) { choice.appendChild(el('option', '', { value: c, text: c })); });
          choice.hidden = false;
          if (m.dish === tr.lunch && m.choices.indexOf(tr.choice) !== -1) choice.value = tr.choice;
        } else choice.hidden = true;
        total();
      };
      sel.addEventListener('change', sync); sync();
      box.appendChild(card);
    });
    total();
  }
  function total() {
    var sum = 0;
    data.travellers.forEach(function (tr) { var m = item(($('[name="dish' + tr.n + '"]') || {}).value); if (m) sum += m.price; });
    $('#total').textContent = fmt(sum) + ' ' + t('unit_kip');
  }
  function collect() {
    var people = [], bad = 0;
    data.travellers.forEach(function (tr) {
      var dish = $('[name="dish' + tr.n + '"]').value, ch = $('[name="choice' + tr.n + '"]').value, m = item(dish);
      if (m && m.choices.length && !ch && !bad) bad = tr.n;
      people.push({ n: tr.n, lunch: dish, choice: ch });
    });
    return { people: people, bad: bad };
  }
  function showError(msg) { var e = $('#err'); e.textContent = msg; e.hidden = !msg; }
  function load() { return fetch(SHEET_URL + '?lunch=' + encodeURIComponent(key)).then(function (r) { return r.json(); }); }

  function show(d, saved) {
    data = d;
    $('#state').hidden = true;
    $('#form').hidden = !!saved; $('#done').hidden = !saved;
    if (saved) {
      var sm = $('#summary'); sm.innerHTML = '';
      var any = false, ul = el('ul');
      d.travellers.forEach(function (tr) {
        if (!tr.lunch) return;
        any = true; ul.appendChild(el('li', '', { text: tr.first + ': ' + tr.lunch + (tr.choice ? ' (' + tr.choice + ')' : '') }));
      });
      sm.appendChild(any ? ul : el('p', '', { text: t('lunch_none_yet') }));
    } else build();
    applyText();
  }

  function submit(ev) {
    ev.preventDefault(); showError('');
    var c = collect();
    if (c.bad) { showError(t('hint_lunch', c.bad)); return; }
    var btn = $('#send'); btn.disabled = true; btn.textContent = t('lunch_sending');
    var body = JSON.stringify({ type: 'lunch', key: key, people: c.people });
    fetch(SHEET_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body }).catch(function () { /* checked by reloading */ })
      .then(function () { return load(); }).then(function (d) {
        btn.disabled = false; btn.textContent = t('lunch_save');
        var mine = c.people.every(function (p) { var tr = d.travellers.filter(function (x) { return x.n === p.n; })[0]; return tr && (tr.lunch || '') === (item(p.lunch) ? p.lunch : ''); });
        if (!mine) { showError(t('lunch_neterr')); return; }
        show(d, true); window.scrollTo(0, 0);
      }).catch(function () { btn.disabled = false; btn.textContent = t('lunch_save'); showError(t('lunch_neterr')); });
  }

  function init() {
    lang = pickLang();
    var sel = $('#lang');
    Object.keys(NAMES).forEach(function (c) { var o = el('option', '', { value: c, text: NAMES[c] }); if (c === lang) o.selected = true; sel.appendChild(o); });
    sel.addEventListener('change', function () { lang = sel.value; try { localStorage.setItem('nke-lang', lang); } catch (e) { /* private mode */ } if (data) show(data, !$('#done').hidden); else applyText(); });
    applyText();
    $('#form').addEventListener('submit', submit);
    $('#again').addEventListener('click', function (e) { e.preventDefault(); show(data, false); });
    var bad = function (k) { var s = $('#state'); s.className = 'ag-state bad'; s.textContent = t(k); };
    if (!/^[a-f0-9]{16}$/.test(key)) { bad('lunch_invalid'); return; }
    $('#state').textContent = '…';
    load().then(function (d) { if (d.error || !d.travellers) { bad('lunch_invalid'); return; } show(d, false); }).catch(function () { bad('lunch_neterr'); });
  }
  init();
})();
