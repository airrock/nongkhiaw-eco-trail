/* Nong Khiaw Eco-Trail staff dashboard. Talks to ../api/admin.php; the server decides what each role may do. */
(function () {
  'use strict';
  var API = '../api/admin.php';
  var app = document.getElementById('app');
  var state = { user: null, tab: 'bookings', filters: { from: '', to: '', q: '', status: '' }, cfg: null };
  var STATUSES = ['Requested', 'Confirmed', 'Paid', 'Cancelled', 'No-show'];
  var TRANSFERS = ['No', 'One way to Nong Khiaw', 'One way to Luang Prabang', 'Round trip'];
  var PAYS = ['USD cash', 'Kip cash', 'Card (USD only, 3% bank fee)', 'BCEL QR'];
  var FOODS = ['Regular', 'Vegetarian', 'Vegan', 'Gluten-free', 'No pork', 'No fish', 'No beef', 'No seafood', 'Halal', 'No spicy'];
  var LANGS = ['en', 'lo', 'th', 'zh', 'ko', 'ja', 'fr', 'de'];

  /* ---------- helpers ---------- */
  // h('div', {class: 'x', onclick: fn}, child, child...) builds an element; text is never parsed as HTML.
  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { add(el, x); });
    else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function toast(msg, bad) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.className = ''; }, bad ? 6000 : 2500);
  }
  // Every failure is shown to the user; the promise rejects so the caller stops.
  function api(action, body) {
    return fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-NK': '1' },
      body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json().catch(function () { return { error: 'The server did not answer properly (' + r.status + ').' }; }).then(function (d) { return { status: r.status, d: d }; }); },
        function () { return { status: 0, d: { error: 'No connection. Nothing was saved.' } }; })
      .then(function (x) {
        if (x.status === 401 && action !== 'login') { state.user = null; render(); }
        if (x.d && x.d.error) { toast(x.d.error, true); throw new Error(x.d.error); }
        return x.d;
      });
  }
  function isAdmin() { return state.user && state.user.role === 'admin'; }
  function money(n, d) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function day(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
  function field(label, input) { return h('label', { class: 'f' }, label, input); }
  function input(name, value, attrs) { return h('input', Object.assign({ name: name, value: value == null ? '' : value }, attrs || {})); }
  function select(name, options, value, attrs) {
    var s = h('select', Object.assign({ name: name }, attrs || {}));
    if (value && options.indexOf(value) === -1) options = options.concat([value]);
    options.forEach(function (o) { var op = h('option', { value: o }, o === '' ? '(none)' : o); if (o === (value || '')) op.selected = true; s.appendChild(op); });
    return s;
  }
  function yesno(name, v) {
    var s = h('select', { name: name });
    [['0', 'No'], ['1', 'Yes']].forEach(function (o) { var op = h('option', { value: o[0] }, o[1]); if (String(Number(v) ? 1 : 0) === o[0]) op.selected = true; s.appendChild(op); });
    return s;
  }
  // Values of the named inputs inside el that differ from what was loaded.
  function changed(el, original) {
    var out = {};
    el.querySelectorAll('[name]').forEach(function (i) {
      var v = i.type === 'checkbox' ? (i.checked ? 1 : 0) : i.value;
      var was = original[i.name]; was = was === null || was === undefined ? '' : was;
      if (String(v) !== String(was)) out[i.name] = v;
    });
    return out;
  }

  /* ---------- sign in ---------- */
  function viewLogin() {
    var email = input('email', '', { type: 'email', autocomplete: 'username', required: true });
    var pass = input('password', '', { type: 'password', autocomplete: 'current-password', required: true });
    return h('div', { class: 'login' }, h('div', { class: 'card' },
      h('h1', {}, 'Nong Khiaw Eco-Trail'), h('p', { class: 'muted' }, 'Staff dashboard. Sign in with your own account.'),
      h('form', { onsubmit: function (e) {
        e.preventDefault();
        api('login', { email: email.value, password: pass.value }).then(function (d) { state.user = d.user; render(); }, function () {});
      } }, field('Email', email), h('p'), field('Password', pass), h('p'), h('button', { class: 'btn', type: 'submit' }, 'Sign in'))));
  }
  function viewPassword(forced) {
    var oldP = input('old', '', { type: 'password', autocomplete: 'current-password', required: true });
    var newP = input('new', '', { type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
    return h('div', { class: forced ? 'login' : '' }, h('div', { class: 'card' },
      h('h1', {}, forced ? 'Choose your own password' : 'Change my password'),
      forced ? h('p', { class: 'muted' }, 'You signed in with a temporary password. Choose a new one (8 characters or more) to continue.') : null,
      h('form', { onsubmit: function (e) {
        e.preventDefault();
        api('change_password', { old: oldP.value, 'new': newP.value }).then(function () {
          state.user.must_change_password = false; toast('Password changed'); state.tab = 'bookings'; render();
        }, function () {});
      } }, field(forced ? 'Temporary password' : 'Current password', oldP), h('p'), field('New password', newP), h('p'),
        h('button', { class: 'btn', type: 'submit' }, 'Save password'))));
  }

  /* ---------- frame ---------- */
  function render() {
    app.textContent = '';
    if (!state.user) { app.appendChild(viewLogin()); return; }
    if (state.user.must_change_password) { app.appendChild(viewPassword(true)); return; }
    var tabs = [['bookings', 'Bookings'], ['transport', 'Pickups'], ['new', 'New booking']];
    if (isAdmin()) tabs.push(['settings', 'Prices and settings'], ['users', 'Users']);
    tabs.push(['account', 'My account']);
    var main = h('main', {});
    app.appendChild(h('div', { class: 'top' },
      h('div', { class: 'row' }, h('strong', {}, 'Nong Khiaw Eco-Trail'),
        h('div', { class: 'who' }, state.user.name, h('br'), isAdmin() ? 'Admin' : 'Office staff')),
      h('div', { class: 'tabs' }, tabs.map(function (t) {
        return h('button', { class: state.tab === t[0] || (state.tab === 'booking' && t[0] === 'bookings') ? 'on' : '', onclick: function () { state.tab = t[0]; render(); } }, t[1]);
      }))));
    app.appendChild(main);
    ({ bookings: viewBookings, transport: viewTransport, booking: viewBooking, 'new': viewNew, settings: viewSettings, users: viewUsers, account: viewAccount })[state.tab](main);
  }

  /* ---------- bookings list ---------- */
  function viewBookings(main) {
    var f = state.filters, list = h('ul', { class: 'list' }), count = h('p', { class: 'muted' }, 'Loading…');
    var q = input('q', f.q, { type: 'search', placeholder: 'Name, booking ID, receipt no, passport, WhatsApp' });
    var from = input('from', f.from, { type: 'date' }), to = input('to', f.to, { type: 'date' });
    var status = select('status', [''].concat(STATUSES), f.status);
    var deleted = h('input', { type: 'checkbox' });
    function load() {
      state.filters = { q: q.value, from: from.value, to: to.value, status: status.value };
      api('bookings', Object.assign({ deleted: deleted.checked }, state.filters)).then(function (d) {
        list.textContent = '';
        count.textContent = d.bookings.length + (d.bookings.length === 500 ? '+ (first 500 shown: narrow the dates)' : '') + ' booking' + (d.bookings.length === 1 ? '' : 's');
        d.bookings.forEach(function (b) {
          list.appendChild(h('li', {}, h('button', { class: 'item', onclick: function () { state.tab = 'booking'; state.id = b.id; render(); } },
            h('strong', {}, (b.lead_name || '(no name)') + (b.people > 1 ? ' + ' + (b.people - 1) : '')), h('span', { class: 'pill ' + b.status }, b.status),
            h('span', { class: 'sub' }, [day(b.tour_date) || 'no date', b.tour + ' ' + b.tour_name, b.transfer === 'No' ? null : b.transfer, b.id,
              b.receipt_no ? 'Receipt ' + b.receipt_no : null, Number(b.paid_usd) ? 'paid $' + money(b.paid_usd, 2) : null].filter(Boolean).join(' · ')))));
        });
      }, function () { count.textContent = 'Could not load the bookings.'; });
    }
    main.appendChild(h('div', { class: 'card' },
      h('form', { class: 'bar', onsubmit: function (e) { e.preventDefault(); load(); } },
        h('div', { style: 'flex:2 1 240px' }, field('Search', q)), field('Tour date from', from), field('to', to), field('Status', status),
        isAdmin() ? h('label', { class: 'f' }, 'Deleted', h('br'), deleted) : null,
        h('button', { class: 'btn', type: 'submit' }, 'Show')),
      count, list));
    load();
  }

  /* ---------- pickups and minivan lists for one day ---------- */
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(done); }, function () { toast('Could not copy. Select the text and copy it by hand.', true); });
    else toast('Could not copy. Select the text and copy it by hand.', true);
  }
  function viewTransport(main) {
    var t = new Date(Date.now() + 7 * 3600 * 1000 + 24 * 3600 * 1000);   // tomorrow in Laos (UTC+7)
    var date = input('date', state.transportDate || t.toISOString().slice(0, 10), { type: 'date' });
    var body = h('div', {});
    function section(title, list, pax, up) {
      var card = h('div', { class: 'card' }, h('div', { class: 'bar' }, h('h2', { style: 'margin:0' }, title + ' (' + pax + ' pax)'),
        list.length ? h('button', { class: 'btn ghost small', onclick: function () { copyText(list.map(function (x) { return x.team; }).join('\n\n'), 'All team messages copied'); } }, 'Copy all team messages') : null));
      if (!list.length) card.appendChild(h('p', { class: 'muted' }, 'Nobody on this date.'));
      list.forEach(function (x) {
        var vehicle = input(up ? 'vehicle_to_nk' : 'vehicle_to_lpb', x.vehicle), remark = input('transport_remark', x.remark), time = input(up ? 'pickup_time' : 'return_time', x.time);
        var phone = input('whatsapp', x.whatsapp);
        var msg = h('details', {}, h('summary', {}, 'Message for the minivan team'), h('pre', { style: 'white-space:pre-wrap;font:inherit;margin:8px 0' }, x.team));
        card.appendChild(h('div', { class: 'trav' },
          h('div', { class: 'bar', style: 'margin-bottom:6px' }, h('strong', {}, x.names.join(', ')), h('span', { class: 'pill' }, x.pax + ' pax'), x.stop ? h('span', { class: 'pill' }, 'stop ' + x.stop) : null),
          h('p', { style: 'margin:0 0 8px' }, (up ? 'Pickup: ' : 'Pickup in Nong Khiaw: ') + (x.place || '(no place)') + (x.drop ? ' · drop-off: ' + x.drop : ''),
            x.map ? [' · ', h('a', { href: x.map, target: '_blank', rel: 'noopener' }, 'Map')] : null,
            h('br'), h('button', { class: 'btn ghost small', style: 'margin-top:6px', onclick: function () { state.tab = 'booking'; state.id = x.booking_id; render(); } }, x.booking_id + (x.receipt_no ? ' · receipt ' + x.receipt_no : ''))),
          h('div', { class: 'grid' }, field('Vehicle / plate no', vehicle), field(up ? 'Pickup time' : 'Time back', time), field('WhatsApp', phone), field('Remark', remark)),
          h('div', { class: 'bar', style: 'margin-top:10px' },
            h('button', { class: 'btn small', onclick: function () {
              var f = {}; [vehicle, time, phone, remark].forEach(function (i) { f[i.name] = i.value; });
              api('booking_save', { id: x.booking_id, fields: f }).then(function () { toast('Saved'); load(); }, function () {});
            } }, 'Save'),
            x.wa.length >= 7 ? h('a', { class: 'btn ghost small', target: '_blank', rel: 'noopener', href: 'https://wa.me/' + x.wa + '?text=' + encodeURIComponent(x.guest) }, 'Message guest on WhatsApp')
              : h('span', { class: 'muted' }, 'No WhatsApp number for the guest'),
            h('button', { class: 'btn ghost small', onclick: function () { copyText(x.team, 'Team message copied'); } }, 'Copy team message')),
          msg));
      });
      return card;
    }
    function load() {
      state.transportDate = date.value;
      api('transport', { date: date.value }).then(function (d) {
        body.textContent = '';
        body.appendChild(section('↑ ຂຶ້ນ ' + day(d.date) + ' · Luang Prabang → Nong Khiaw', d.up, d.up_pax, true));
        body.appendChild(section('↓ ລົງ ' + day(d.date) + ' · Nong Khiaw → Luang Prabang', d.down, d.down_pax, false));
      }, function () {});
    }
    date.addEventListener('change', load);
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'bar' }, h('h1', {}, 'Pickups and minivan'), field('Date', date)),
      h('p', { class: 'muted', style: 'margin:0' }, 'Everyone riding the minivan on this day. Plate numbers, times and remarks typed here are saved on the booking.')));
    main.appendChild(body);
    load();
  }

  /* ---------- one booking ---------- */
  function viewBooking(main) {
    main.appendChild(h('p', { class: 'muted' }, 'Loading…'));
    api('booking', { id: state.id }).then(function (d) { drawBooking(main, d); }, function () { state.tab = 'bookings'; render(); });
  }
  function drawBooking(main, d) {
    main.textContent = '';
    var b = d.booking, t = d.totals, gone = !!b.deleted_at;
    function redraw(x) { toast('Saved'); drawBooking(main, x); }
    main.appendChild(h('p', { class: 'noprint' }, h('button', { class: 'btn ghost small', onclick: function () { state.tab = 'bookings'; render(); } }, '← All bookings')));

    // details
    var form = h('div', { class: 'grid' },
      field('Tour date', input('tour_date', b.tour_date, { type: 'date' })),
      field('Tour code', input('tour', b.tour)), field('Tour name', input('tour_name', b.tour_name)),
      field('Status', select('status', STATUSES, b.status)),
      field('Minivan transfer', select('transfer', TRANSFERS, b.transfer)),
      field('Pickup date (Luang Prabang)', input('pickup_date', b.pickup_date, { type: 'date' })),
      field('Pickup time', input('pickup_time', b.pickup_time)),
      field('Pickup place (Luang Prabang)', input('accommodation', b.accommodation)),
      field('Map link', input('maps_link', b.maps_link)),
      field('Date back', input('return_date', b.return_date, { type: 'date' })),
      field('Time back', input('return_time', b.return_time)),
      field('Pickup place in Nong Khiaw', input('nk_pickup', b.nk_pickup)),
      field('Train station drop-off', yesno('train_dropoff', b.train_dropoff)),
      field('Vehicle to Nong Khiaw', input('vehicle_to_nk', b.vehicle_to_nk)), field('Vehicle to Luang Prabang', input('vehicle_to_lpb', b.vehicle_to_lpb)),
      field('Transport remark', input('transport_remark', b.transport_remark)),
      field('WhatsApp', input('whatsapp', b.whatsapp)), field('Payment method', select('payment_method', [''].concat(PAYS), b.payment_method)),
      field('Tour amount USD', input('est_tour_usd', b.est_tour_usd, { type: 'number', step: '0.01', min: '0' })),
      field('Transport amount kip', input('est_transfer_kip', b.est_transfer_kip, { type: 'number', step: '1', min: '0' })),
      field('Viewpoint', input('viewpoint', b.viewpoint)), field('Additional package', input('addon_package', b.addon_package)),
      field('Private tour', yesno('private_tour', b.private_tour)));
    var notes = h('div', { class: 'grid', style: 'margin-top:10px' },
      field('Guest note', h('textarea', { name: 'note' }, b.note)), field('Staff notes', h('textarea', { name: 'staff_notes' }, b.staff_notes)));
    var box = h('div', {}, form, notes);
    main.appendChild(h('div', { class: 'card noprint' },
      h('div', { class: 'bar' }, h('h1', {}, d.summary.lead_name || b.id), h('span', { class: 'pill ' + b.status }, b.status), gone ? h('span', { class: 'pill Cancelled' }, 'Deleted') : null),
      h('p', { class: 'muted' }, b.id + ' · booked ' + day(b.submitted_at.slice(0, 10)) + (b.source ? ' · ' + b.source : '') + (b.site_language ? ' · ' + b.site_language : '')),
      box,
      h('div', { class: 'bar', style: 'margin-top:12px' },
        gone ? null : h('button', { class: 'btn', onclick: function () {
          var f = changed(box, b);
          if (!Object.keys(f).length) { toast('Nothing changed'); return; }
          api('booking_save', { id: b.id, fields: f }).then(redraw, function () {});
        } }, 'Save booking'),
        isAdmin() && !gone ? h('button', { class: 'btn warn', onclick: function () {
          if (!window.confirm('Delete booking ' + b.id + '? It is hidden from the lists; an admin can restore it.')) return;
          api('booking_delete', { id: b.id }).then(function () { toast('Booking deleted'); state.tab = 'bookings'; render(); }, function () {});
        } }, 'Delete booking') : null,
        isAdmin() && gone ? h('button', { class: 'btn', onclick: function () {
          api('booking_restore', { id: b.id }).then(function () { return api('booking', { id: b.id }); }).then(redraw, function () {});
        } }, 'Restore booking') : null)));

    // travellers
    var menu = (state.cfg && state.cfg.menu) || [];
    var dishes = [''].concat(menu.filter(function (m) { return Number(m.price_kip) > 0; }).map(function (m) { return m.dish; }));
    var tcard = h('div', { class: 'card noprint' }, h('h2', { style: 'margin-top:0' }, 'Travellers (' + d.travellers.length + ')'));
    d.travellers.forEach(function (tr) {
      var signed = d.agreements.some(function (a) { return a.n === tr.n; });
      var g = h('div', { class: 'grid', style: 'margin-top:8px' },
        field('First name', input('first_name', tr.first_name)), field('Last name', input('last_name', tr.last_name)),
        field('Full name', input('full_name', tr.full_name)), field('Nationality', input('country', tr.country)),
        field('Gender', input('gender', tr.gender)), field('Passport no', input('passport_no', tr.passport_no)),
        field('Passport issued', input('passport_issued', tr.passport_issued)), field('Passport expires', input('passport_expires', tr.passport_expires)),
        field('Food', select('food', [''].concat(FOODS), tr.food)),
        field('Pickup place', input('pickup_place', tr.pickup_place)), field('Pickup map', input('pickup_map', tr.pickup_map)),
        field('Takeaway lunch', select('lunch_dish', dishes, tr.lunch_dish)), field('Lunch choice', input('lunch_choice', tr.lunch_choice)),
        field('Traveller status', select('status', ['', 'Cancelled', 'No-show'], tr.status)), field('Traveller WhatsApp', input('whatsapp', tr.whatsapp)));
      tcard.appendChild(h('details', { class: 'trav' },
        h('summary', {}, tr.n + '. ' + (tr.full_name || '(no name)') + (tr.status ? ' · ' + tr.status : '') + (signed ? ' · agreement signed' : '')),
        g, gone ? null : h('div', { class: 'bar', style: 'margin-top:10px' },
          h('button', { class: 'btn small', onclick: function () {
            var f = changed(g, tr);
            if (!Object.keys(f).length) { toast('Nothing changed'); return; }
            if ('lunch_choice' in f && !('lunch_dish' in f)) f.lunch_dish = g.querySelector('[name=lunch_dish]').value;
            if ('lunch_dish' in f) f.lunch_choice = g.querySelector('[name=lunch_choice]').value;
            api('traveller_save', { booking_id: b.id, n: tr.n, fields: f }).then(redraw, function () {});
          } }, 'Save traveller'),
          d.travellers.length > 1 ? h('button', { class: 'btn warn small', onclick: function () {
            if (!window.confirm('Remove ' + (tr.full_name || 'traveller ' + tr.n) + ' from this booking?')) return;
            api('traveller_remove', { booking_id: b.id, n: tr.n }).then(redraw, function () {});
          } }, 'Remove') : null)));
    });
    if (!gone) tcard.appendChild(h('button', { class: 'btn ghost small', onclick: function () {
      api('traveller_add', { booking_id: b.id, fields: {} }).then(redraw, function () {});
    } }, '+ Add a traveller'));
    main.appendChild(tcard);

    // money
    var amount = input('amount', '', { type: 'number', step: '0.01', placeholder: 'Amount' });
    var cur = select('currency', ['USD', 'LAK'], 'USD'), method = select('method', PAYS, b.payment_method || 'USD cash');
    var paidOn = input('paid_on', '', { type: 'date' }), note = input('note', '', { placeholder: 'Note (optional)' });
    main.appendChild(h('div', { class: 'card noprint' }, h('h2', { style: 'margin-top:0' }, 'Payments'),
      h('div', { class: 'totals' },
        h('span', {}, 'Tour'), h('span', { class: 'right' }, '$' + money(t.tour_usd, 2)), h('span', {}),
        h('span', {}, 'Transport'), h('span', {}), h('span', { class: 'right' }, money(t.transfer_kip) + ' kip'),
        h('span', {}, 'Takeaway lunch'), h('span', {}), h('span', { class: 'right' }, money(t.lunch_kip) + ' kip'),
        h('span', { class: 'b' }, 'Total'), h('span', { class: 'right b' }, '$' + money(t.total_usd, 2)), h('span', { class: 'right b' }, money(t.total_kip) + ' kip'),
        h('span', {}, 'Paid'), h('span', { class: 'right' }, '$' + money(t.paid_usd, 2)), h('span', {}),
        h('span', { class: 'b' }, 'Still to pay'), h('span', { class: 'right b' }, '$' + money(t.balance_usd, 2)), h('span', { class: 'right b' }, money(Math.round(t.balance_usd * t.rate)) + ' kip')),
      h('p', { class: 'muted' }, '1 USD = ' + money(t.rate) + ' kip'),
      d.payments.length ? h('div', { class: 'scroll' }, h('table', {}, h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'num' }, 'Amount'), h('th', {}, 'Method'), h('th', {}, 'Taken by'), h('th', {}, 'Note'), h('th', {})),
        d.payments.map(function (p) {
          return h('tr', {}, h('td', {}, day(p.paid_on)), h('td', { class: 'num' }, (p.currency === 'USD' ? '$' + money(p.amount, 2) : money(p.amount) + ' kip')),
            h('td', {}, p.method), h('td', {}, p.taken_by_name), h('td', {}, p.note),
            h('td', {}, isAdmin() ? h('button', { class: 'btn warn small', onclick: function () {
              if (!window.confirm('Remove this payment of ' + p.amount + ' ' + p.currency + '?')) return;
              api('payment_delete', { id: p.id }).then(redraw, function () {});
            } }, 'Remove') : null));
        }))) : h('p', { class: 'muted' }, 'No payment recorded yet.'),
      gone ? null : h('form', { class: 'bar', style: 'margin-top:12px', onsubmit: function (e) {
        e.preventDefault();
        api('payment_add', { booking_id: b.id, amount: amount.value, currency: cur.value, method: method.value, note: note.value, paid_on: paidOn.value }).then(redraw, function () {});
      } }, field('Amount received', amount), field('Currency', cur), field('Method', method), field('Date (today if empty)', paidOn),
        h('div', { style: 'flex:1 1 160px' }, field('Note', note)), h('button', { class: 'btn', type: 'submit' }, 'Record payment'))));

    // receipt
    var r = d.receipt, lang = select('language', LANGS, r ? r.language : (LANGS.indexOf(b.site_language) !== -1 ? b.site_language : 'en'));
    var rc = h('div', { class: 'card' }, h('div', { class: 'bar noprint' }, h('h2', { style: 'margin:0' }, r ? 'Receipt ' + r.no : 'Receipt'),
      gone ? null : field('Language', lang),
      gone ? null : h('button', { class: 'btn', onclick: function () { api('receipt_issue', { booking_id: b.id, language: lang.value }).then(redraw, function () {}); } },
        r ? 'Update receipt amounts' : 'Issue receipt'),
      r ? h('button', { class: 'btn ghost', onclick: function () { window.print(); } }, 'Print / save as PDF') : null));
    if (r) {
      var site = location.origin + location.pathname.replace(/admin\/.*$/, '');
      rc.appendChild(h('p', { class: 'noprint muted' }, 'Links for the guest: ',
        h('a', { href: site + 'agreement/?k=' + r.form_key + '&lang=' + r.language, target: '_blank', rel: 'noopener' }, 'agreement form'), ' · ',
        h('a', { href: site + 'lunch/?k=' + r.form_key + '&lang=' + r.language, target: '_blank', rel: 'noopener' }, 'takeaway lunch')));
      rc.appendChild(receiptPaper(d));
    } else rc.appendChild(h('p', { class: 'muted noprint' }, 'No receipt number yet. Issuing gives this booking the next number; it keeps that number for good.'));
    main.appendChild(rc);

    // history
    var hist = h('div', { class: 'card noprint' }, h('button', { class: 'btn ghost small', onclick: function () {
      api('history', { id: b.id }).then(function (x) {
        hist.textContent = ''; hist.appendChild(h('h2', { style: 'margin-top:0' }, 'History'));
        hist.appendChild(x.history.length ? h('div', { class: 'scroll' }, h('table', {}, x.history.map(function (e) {
          return h('tr', {}, h('td', {}, e.at + ' UTC'), h('td', {}, e.user_name), h('td', {}, e.action + ' ' + e.row_id),
            h('td', {}, e.new_values ? Object.keys(JSON.parse(e.new_values)).join(', ') : ''));
        }))) : h('p', { class: 'muted' }, 'No changes yet.'));
      }, function () {});
    } }, 'Show history of changes'));
    main.appendChild(hist);
  }

  // The printed receipt (labels in English for now; the other languages come with the receipt texts).
  function receiptPaper(d) {
    var b = d.booking, t = d.totals, r = d.receipt, s = (state.cfg && state.cfg.settings) || {};
    var paid = t.total_usd > 0 && t.balance_usd <= 0.005;
    return h('div', { class: 'receipt' },
      h('div', { class: 'head' }, h('div', {}, h('h2', {}, s.business_name || 'Nong Khiaw Eco-Trail'), h('div', { class: 'muted' }, s.business_address || ''), h('div', { class: 'muted' }, s.business_contact || '')),
        h('div', { class: 'right' }, h('strong', {}, 'RECEIPT No ' + r.no), h('div', {}, 'Date: ' + day(r.issued_on)), h('div', {}, 'Booking: ' + b.id))),
      h('p', {}, h('strong', {}, b.tour_name), b.tour_date ? ' · ' + day(b.tour_date) : '', b.private_tour ? ' · Private tour' : ''),
      b.transfer !== 'No' ? h('p', {}, 'Minivan: ' + b.transfer + (b.train_dropoff ? ' + train station drop-off' : '') +
        (b.pickup_date ? ' · pickup ' + day(b.pickup_date) + (b.pickup_time ? ' ' + b.pickup_time : '') + (b.accommodation ? ' at ' + b.accommodation : '') : '') +
        (b.return_date ? ' · back ' + day(b.return_date) + (b.return_time ? ' ' + b.return_time : '') : '')) : null,
      h('div', { class: 'scroll' }, h('table', {}, h('tr', {}, h('th', {}, 'No'), h('th', {}, 'Name'), h('th', {}, 'Passport'), h('th', {}, 'Food'), h('th', {}, 'Takeaway lunch')),
        d.travellers.filter(function (x) { return x.status !== 'Cancelled'; }).map(function (x) {
          return h('tr', {}, h('td', {}, x.n), h('td', {}, x.full_name), h('td', {}, x.passport_no), h('td', {}, x.food || 'Regular'),
            h('td', {}, x.lunch_dish + (x.lunch_choice ? ' (' + x.lunch_choice + ')' : '')));
        }))),
      h('div', { class: 'scroll' }, h('table', { style: 'margin-top:12px' }, h('tr', {}, h('th', {}, ''), h('th', { class: 'num' }, 'USD'), h('th', { class: 'num' }, 'Kip')),
        h('tr', {}, h('td', {}, 'Tour, ' + d.summary.people + ' people'), h('td', { class: 'num' }, money(t.tour_usd, 2)), h('td', { class: 'num' }, money(Math.round(t.tour_usd * t.rate)))),
        t.transfer_kip ? h('tr', {}, h('td', {}, 'Transport'), h('td', { class: 'num' }, money(t.transfer_kip / t.rate, 2)), h('td', { class: 'num' }, money(t.transfer_kip))) : null,
        t.lunch_kip ? h('tr', {}, h('td', {}, 'Takeaway lunch'), h('td', { class: 'num' }, money(t.lunch_kip / t.rate, 2)), h('td', { class: 'num' }, money(t.lunch_kip))) : null,
        h('tr', {}, h('td', {}, h('strong', {}, 'Total')), h('td', { class: 'num' }, h('strong', {}, money(t.total_usd, 2))), h('td', { class: 'num' }, h('strong', {}, money(t.total_kip)))),
        h('tr', {}, h('td', {}, paid ? 'Paid' : 'Deposit'), h('td', { class: 'num' }, money(t.paid_usd, 2)), h('td', { class: 'num' }, money(Math.round(t.paid_usd * t.rate)))),
        h('tr', {}, h('td', {}, h('strong', {}, 'Balance')), h('td', { class: 'num' }, h('strong', {}, money(t.balance_usd, 2))), h('td', { class: 'num' }, h('strong', {}, money(Math.round(t.balance_usd * t.rate))))))),
      h('p', { class: 'muted' }, 'Exchange rate: 1 USD = ' + money(t.rate) + ' kip'),
      paid ? h('p', { class: 'paid' }, '✓ PAID') : null,
      h('p', { style: 'margin-top:28px' }, 'Customer signature: ______________________      Issued by: ' + (r.issued_by || '______________')));
  }

  /* ---------- new booking ---------- */
  function viewNew(main) {
    var tours = ((state.cfg && state.cfg.tours) || []).map(function (t) { return t.code; }).concat(['T00']);
    var g = h('div', { class: 'grid' },
      field('Tour', select('tour', tours, tours[0])), field('Tour date', input('date', '', { type: 'date' })),
      field('Minivan transfer', select('transfer', TRANSFERS, 'No')), field('Pickup date in Luang Prabang', input('pickupDate', '', { type: 'date' })),
      field('Pickup place', input('hotel', '')), field('Map link', input('map', '')), field('Date back', input('returnDate', '', { type: 'date' })),
      field('Pickup place in Nong Khiaw', input('nkPickup', '')), field('Train station drop-off', select('train', ['No', 'Yes'], 'No')),
      field('WhatsApp', input('phone', '')), field('Payment method', select('payment', PAYS, 'USD cash')), field('Status', select('status', STATUSES, 'Confirmed')),
      field('Private tour', select('private', ['No', 'Yes'], 'No')), field('Booking ID (empty = automatic)', input('id', '')),
      field('Tour price USD per person (empty = price list)', input('priceUsd', '', { type: 'number', step: '0.01' })),
      field('Transport kip in total (empty = price list)', input('transferKip', '', { type: 'number', step: '1' })));
    var note = field('Note', h('textarea', { name: 'note' }));
    var people = h('div', {});
    function addPerson() {
      var n = people.children.length + 1;
      people.appendChild(h('div', { class: 'trav' }, h('strong', {}, 'Traveller ' + n), h('div', { class: 'grid', style: 'margin-top:8px' },
        field('First name', input('first', '')), field('Last name', input('last', '')), field('Nationality', input('nat', '')),
        field('Food', select('food', FOODS, 'Regular')), field('Passport no', input('pass', '')))));
    }
    addPerson();
    main.appendChild(h('div', { class: 'card' }, h('h1', {}, 'New booking'), h('p', { class: 'muted' }, 'For a guest at the office or on WhatsApp. Website bookings arrive by themselves.'),
      g, h('p'), note, h('h2', {}, 'Travellers'), people,
      h('div', { class: 'bar' }, h('button', { class: 'btn ghost small', onclick: addPerson }, '+ Add a traveller'),
        h('button', { class: 'btn', onclick: function () {
          var v = {}; g.querySelectorAll('[name]').forEach(function (i) { v[i.name] = i.value; });
          var bk = { tour: v.tour, date: v.date, transfer: v.transfer, pickupDate: v.pickupDate, hotel: v.hotel, map: v.map, returnDate: v.returnDate, nkPickup: v.nkPickup,
            train: v.train === 'Yes', phone: v.phone, payment: v.payment, status: v.status, 'private': v['private'] === 'Yes', id: v.id.trim().toUpperCase(),
            note: note.querySelector('textarea').value, source: 'Walk-in', travellers: [] };
          if (v.priceUsd !== '') bk.priceUsd = Number(v.priceUsd);
          if (v.transferKip !== '') bk.transferKip = Number(v.transferKip);
          people.querySelectorAll('.trav').forEach(function (p) {
            var t = {}; p.querySelectorAll('[name]').forEach(function (i) { t[i.name] = i.value; });
            if (t.first.trim() || t.last.trim()) bk.travellers.push(t);
          });
          if (!bk.travellers.length) { toast('Type the name of at least one traveller.', true); return; }
          api('booking_new', { booking: bk }).then(function (d) { toast('Booking saved'); state.tab = 'booking'; state.id = d.booking.id; render(); }, function () {});
        } }, 'Save booking'))));
  }

  /* ---------- prices and settings (admin) ---------- */
  function viewSettings(main) {
    api('settings').then(function (d) {
      state.cfg = d; var s = d.settings;
      var g = h('div', { class: 'grid' },
        field('Minivan one way, kip per person', input('transfer_one_kip', s.transfer_one_kip, { type: 'number' })),
        field('Minivan round trip, kip per person', input('transfer_round_kip', s.transfer_round_kip, { type: 'number' })),
        field('Train station extra, kip per person', input('train_extra_kip', s.train_extra_kip, { type: 'number' })),
        field('Kip for 1 USD', input('kip_per_usd', s.kip_per_usd, { type: 'number' })),
        field('Office pickup place in Nong Khiaw', input('nk_office', s.nk_office)), field('Business name (receipt)', input('business_name', s.business_name)),
        field('Address (receipt)', input('business_address', s.business_address)), field('Contact line (receipt)', input('business_contact', s.business_contact)),
        field('Transport manager name and WhatsApp', input('transport_manager', s.transport_manager)));
      main.appendChild(h('div', { class: 'card' }, h('h1', {}, 'Prices and settings'), h('p', { class: 'muted' }, 'Changes apply to new bookings and new payments. Saved bookings keep their amounts.'), g, h('p'),
        h('button', { class: 'btn', onclick: function () {
          var f = changed(g, s);
          if (!Object.keys(f).length) { toast('Nothing changed'); return; }
          api('settings_save', { settings: f }).then(function () { toast('Saved'); state.tab = 'settings'; render(); }, function () {});
        } }, 'Save settings')));

      var tt = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Tours and prices'));
      d.tours.concat([{ code: '', name: '', price_usd: '', sort: d.tours.length + 1, isNew: true }]).forEach(function (t) {
        var row = h('div', { class: 'bar' }, field('Code', input('code', t.code, { disabled: !t.isNew, style: 'width:90px' })),
          h('div', { style: 'flex:1 1 200px' }, field('Name', input('name', t.name))), field('USD per person', input('price_usd', t.price_usd, { type: 'number', step: '0.01', style: 'width:130px' })));
        row.appendChild(h('button', { class: 'btn small', onclick: function () {
          var v = {}; row.querySelectorAll('[name]').forEach(function (i) { v[i.name] = i.value; });
          api('tour_save', { code: v.code, name: v.name, price_usd: v.price_usd, sort: t.sort }).then(function () { toast('Saved'); render(); }, function () {});
        } }, t.isNew ? 'Add tour' : 'Save'));
        tt.appendChild(row);
      });
      main.appendChild(tt);

      var mm = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Takeaway lunch menu'));
      d.menu.concat([{ id: 0, show: 1, grp: '', dish: '', choices: '', price_kip: '', sort: d.menu.length + 1 }]).forEach(function (m) {
        var show = h('input', { type: 'checkbox', name: 'show' }); show.checked = !!Number(m.show);
        var row = h('div', { class: 'bar' }, h('label', { class: 'f' }, 'Show', h('br'), show), field('Group', input('grp', m.grp, { style: 'width:120px' })),
          h('div', { style: 'flex:1 1 160px' }, field('Dish', input('dish', m.dish))), h('div', { style: 'flex:1 1 160px' }, field('Choices, comma separated', input('choices', m.choices))),
          field('Kip', input('price_kip', m.price_kip, { type: 'number', style: 'width:120px' })));
        row.appendChild(h('button', { class: 'btn small', onclick: function () {
          var v = {}; row.querySelectorAll('[name]').forEach(function (i) { v[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
          api('menu_save', Object.assign({ id: m.id, sort: m.sort }, v)).then(function () { toast('Saved'); render(); }, function () {});
        } }, m.id ? 'Save' : 'Add dish'));
        if (m.id) row.appendChild(h('button', { class: 'btn warn small', onclick: function () {
          if (!window.confirm('Remove ' + m.dish + ' from the menu?')) return;
          api('menu_delete', { id: m.id }).then(function () { toast('Removed'); render(); }, function () {});
        } }, 'Remove'));
        mm.appendChild(row);
      });
      main.appendChild(mm);
    }, function () {});
  }

  /* ---------- users (admin) ---------- */
  function viewUsers(main) {
    api('users').then(function (d) {
      var card = h('div', { class: 'card' }, h('h1', {}, 'Users'),
        h('p', { class: 'muted' }, 'Admin: everything, including users, prices and deleting bookings. Office staff: bookings, payments and receipts.'));
      d.users.forEach(function (u) {
        var role = select('role', ['admin', 'staff'], u.role), name = input('name', u.name);
        var active = h('input', { type: 'checkbox' }); active.checked = !!Number(u.active);
        card.appendChild(h('div', { class: 'bar' }, h('div', { style: 'flex:1 1 160px' }, field('Name', name)), h('div', { style: 'flex:1 1 200px' }, field('Email', input('email', u.email, { disabled: true }))),
          field('Role (staff = office staff)', role), h('label', { class: 'f' }, 'Active', h('br'), active),
          h('button', { class: 'btn small', onclick: function () {
            api('user_save', { id: u.id, name: name.value, role: role.value, active: active.checked }).then(function () { toast('Saved'); render(); }, function () { render(); });
          } }, 'Save'),
          h('button', { class: 'btn ghost small', onclick: function () {
            var p = window.prompt('New temporary password for ' + u.name + ' (8 characters or more). They must change it when they sign in.');
            if (p) api('user_password', { id: u.id, password: p }).then(function () { toast('Temporary password set'); }, function () {});
          } }, 'Reset password')));
      });
      main.appendChild(card);
      var n = input('name', ''), e = input('email', '', { type: 'email' }), r = select('role', ['staff', 'admin'], 'staff'), p = input('password', '', { type: 'text', minlength: 8 });
      main.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Add a team member'),
        h('form', { class: 'bar', onsubmit: function (ev) {
          ev.preventDefault();
          api('user_add', { name: n.value, email: e.value, role: r.value, password: p.value }).then(function () { toast('User added'); render(); }, function () {});
        } }, field('Name', n), field('Email', e), field('Role', r), field('Temporary password', p), h('button', { class: 'btn', type: 'submit' }, 'Add user')),
        h('p', { class: 'muted' }, 'Tell them the temporary password yourself. They choose their own at the first sign-in.')));
    }, function () {});
  }

  function viewAccount(main) {
    main.appendChild(h('div', { class: 'card' }, h('h1', {}, state.user.name), h('p', { class: 'muted' }, state.user.email + ' · ' + (isAdmin() ? 'Admin' : 'Office staff')),
      h('button', { class: 'btn ghost', onclick: function () { api('logout').then(function () { state.user = null; render(); }, function () {}); } }, 'Sign out')));
    main.appendChild(viewPassword(false));
  }

  /* ---------- start ---------- */
  function loadConfig() { return api('settings').then(function (d) { state.cfg = d; }, function () {}); }
  api('me').then(function (d) {
    state.user = d.user;
    return state.user ? loadConfig() : null;
  }, function () {}).then(render);
  var baseRender = render;
  render = function () { if (state.user && !state.cfg && !state.user.must_change_password) { loadConfig().then(baseRender); } else baseRender(); };
})();
