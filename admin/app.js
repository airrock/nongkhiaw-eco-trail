/* Nong Khiaw Eco-Trail staff dashboard. Talks to ../api/admin.php; the server decides what each role may do. */
(function () {
  'use strict';
  var API = '../api/admin.php';
  var app = document.getElementById('app');
  var state = { user: null, tab: 'bookings', filters: { from: new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10), to: '', q: '', status: '' }, cfg: null };   // from today in Laos
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
    var tabs = [['bookings', 'Bookings'], ['transport', 'Pickups'], ['new', 'New booking'], ['reports', 'Daily lists'], ['agreements', 'Agreements'], ['inquiries', 'Inquiries']];
    if (isAdmin()) tabs.push(['overview', 'Overview'], ['money', 'Tour costs'], ['plans', 'Tour plans'], ['settings', 'Prices and settings'], ['website', 'Website'], ['users', 'Users']);
    tabs.push(['account', 'My account']);
    var main = h('main', {});
    app.appendChild(h('div', { class: 'top' },
      h('div', { class: 'row' }, h('strong', {}, 'Nong Khiaw Eco-Trail'),
        h('div', { class: 'who' }, state.user.name, h('br'), isAdmin() ? 'Admin' : 'Office staff')),
      h('div', { class: 'tabs' }, tabs.map(function (t) {
        return h('button', { class: state.tab === t[0] || (state.tab === 'booking' && t[0] === 'bookings') ? 'on' : '', onclick: function () { state.tab = t[0]; render(); } }, t[1]);
      }))));
    app.appendChild(main);
    ({ bookings: viewBookings, transport: viewTransport, reports: viewReports, agreements: viewAgreements, inquiries: viewInquiries, money: viewMoney, booking: viewBooking, 'new': viewNew, settings: viewSettings, users: viewUsers, overview: viewOverview, plans: viewPlans, website: viewWebsite, account: viewAccount })[state.tab](main);
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
      // a search looks through every booking, whatever the dates say
      api('bookings', Object.assign({ deleted: deleted.checked }, state.filters, q.value.trim() ? { from: '', to: '' } : {})).then(function (d) {
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
      h('p', { class: 'muted', style: 'margin:0 0 6px' }, 'The list starts from today. A search looks through all bookings, old ones too. Old bookings without a tour date only show in a search or with the date emptied.'),
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
    // The day's list in one direction, as it goes to the minivan manager: one row per guest, the plate number for all of them.
    function dayList(d, upWay) {
      var rows = upWay ? d.up_rows : d.down_rows, short = day(d.date).slice(0, 5);
      var title = upWay ? short + ' ຂຶ້ນ (Luang Prabang - Nong Khiaw)' : short + ' ລົງ (Nong Khiaw - Luang Prabang)';
      var pkg = function (r) { return r.tour === 'T00' ? 'Transport only' : 'Package ' + r.tour; };
      var cols = upWay ? [['No', 'no'], ['Booking ID', 'booking_id'], ['Package', pkg], ['Receipt No', 'receipt_no'], ['Name', 'name'], ['Pax', 'pax'], ['Food type', 'food'],
          ['Pickup date', function (r) { return day(r.date); }], ['Pickup time', 'time'], ['Pick-up location', 'place'], ['Map', 'map'], ['Menu', 'lunch'], ['Qty', 'lunch_qty'], ['Food date', function (r) { return day(r.lunch_date); }], ['Plate no', 'vehicle']]
        : [['No', 'no'], ['Booking ID', 'booking_id'], ['Package', pkg], ['Receipt No', 'receipt_no'], ['Name', 'name'], ['Pax', 'pax'], ['Departure date', function (r) { return day(r.date); }],
          ['Notes', 'notes'], ['Pickup in Nong Khiaw', 'place'], ['Plate no', 'vehicle']];
      var lines = upWay ? ['Pick up in Luang Prabang: ' + rows.length + 'pax']
        : d.down_slots.map(function (x) { return 'Leave ' + x.time + ': ' + x.pax + 'pax' + (x.train ? ' (' + x.train + ' drop off at the train)' : ''); }).concat(d.down_slots.length > 1 ? ['Total: ' + rows.length + 'pax'] : []);
      var plates = []; rows.forEach(function (r) { if (r.vehicle && plates.indexOf(r.vehicle) === -1) plates.push(r.vehicle); });
      var plate = input('plate', plates.length === 1 ? plates[0] : '', { placeholder: 'e.g. ກກ 7519' });
      var card = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, title + ' · ' + rows.length + ' pax'));
      if (!rows.length) { card.appendChild(h('p', { class: 'muted' }, 'Nobody on this date.')); return card; }
      card.appendChild(table(cols, rows, title.replace(/[()]/g, '').replace('/', '.'), lines.map(function (x) { return ['', '', '', '', x]; })));
      card.appendChild(h('div', {}, lines.map(function (x) { return h('p', { style: 'margin:2px 0;font-weight:700' }, x); })));
      card.appendChild(h('div', { class: 'bar noprint', style: 'margin-top:10px' },
        h('button', { class: 'btn ghost small', onclick: function () {
          copyText((upWay ? 'ຂຶ້ນ ' : 'ລົງ ') + day(d.date) + (upWay ? ' Luang Prabang - Nong Khiaw' : ' Nong Khiaw - Luang Prabang') + '\n' + lines.join('\n') + '\n\n' +
            rows.map(function (r) { return r.no + '. ' + r.name + ' · ' + (upWay ? [r.time, r.place, r.map].filter(Boolean).join(' · ') : r.notes + ' · pickup: ' + r.place); }).join('\n'), 'List copied');
        } }, 'Copy the list for the minivan manager'),
        field('Plate number for this whole list', plate),
        h('button', { class: 'btn small', onclick: function () {
          api('transport_plate', { date: d.date, dir: upWay ? 'up' : 'down', plate: plate.value.trim() }).then(function (x) { toast('Plate number saved on ' + x.bookings + ' booking' + (x.bookings === 1 ? '' : 's')); load(); }, function () {});
        } }, 'Save plate for everyone')));
      if (plates.length > 1) card.appendChild(h('p', { class: 'muted' }, 'This list has more than one plate number (' + plates.join(', ') + '). Saving one here replaces them all; a single booking can be changed below.'));
      return card;
    }
    function load() {
      state.transportDate = date.value;
      api('transport', { date: date.value }).then(function (d) {
        body.textContent = '';
        body.appendChild(dayList(d, false));
        body.appendChild(dayList(d, true));
        body.appendChild(h('h2', { class: 'noprint', style: 'margin:18px 4px 6px' }, 'One booking at a time: messages, plate, time'));
        body.appendChild(section('↑ ຂຶ້ນ ' + day(d.date) + ' · Luang Prabang → Nong Khiaw', d.up, d.up_pax, true));
        body.appendChild(section('↓ ລົງ ' + day(d.date) + ' · Nong Khiaw → Luang Prabang', d.down, d.down_pax, false));
      }, function () {});
    }
    date.addEventListener('change', load);
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'bar' }, h('h1', {}, 'Pickups and minivan'), field('Date', date)),
      h('p', { class: 'muted', style: 'margin:0' }, 'Everyone riding the minivan on this day. The two lists at the top go to the minivan manager; type the plate number he sends back once and it is saved for everyone on that list, then message each guest from the blocks below.')));
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
        field('Lunch before the tour', select('lunch_dish', dishes, tr.lunch_dish)), field('Lunch choice', input('lunch_choice', tr.lunch_choice)),
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
        h('span', {}, 'Lunch before the tour'), h('span', {}), h('span', { class: 'right' }, money(t.lunch_kip) + ' kip'),
        h('span', { class: 'b' }, 'Total'), h('span', { class: 'right b' }, '$' + money(t.total_usd, 2)), h('span', { class: 'right b' }, money(t.total_kip) + ' kip'),
        h('span', {}, 'Paid'), h('span', { class: 'right' }, '$' + money(t.paid_usd, 2)), h('span', {}),
        h('span', { class: 'b' }, 'Still to pay'), h('span', { class: 'right b' }, '$' + money(t.balance_usd, 2)), h('span', { class: 'right b' }, money(t.balance_kip) + ' kip')),
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
      r ? h('button', { class: 'btn ghost', onclick: function () { window.print(); } }, 'Print / save as PDF') : null,
      r && !gone ? h('button', { class: 'btn ghost', onclick: function () { wording.hidden = !wording.hidden; } }, 'Edit wording') : null));
    var wording = h('div', { class: 'noprint', hidden: true });
    if (r) {
      var o = receiptWording(r), wf = h('div', { class: 'grid' },
        field('Tour line (empty = ' + b.tour_name + ')', input('tour', o.tour)), field('Transport line (empty = automatic)', input('transport', o.transport)),
        field('Extra note on the receipt', input('note', o.note)), field('Issued by (empty = ' + (r.issued_by || 'blank') + ')', input('issued_by', o.issued_by)),
        field('Closing line (empty = thank-you line)', input('thanks', o.thanks)));
      wording.appendChild(h('p', { class: 'muted' }, 'These change the wording of this receipt only. The booking, the amounts and the lists stay as they are. Empty a field to go back to the automatic text.'));
      wording.appendChild(wf);
      wording.appendChild(h('p', {}, h('button', { class: 'btn small', onclick: function () {
        var ov = {}; wf.querySelectorAll('[name]').forEach(function (i) { ov[i.name] = i.value.trim(); });
        api('receipt_save', { no: r.no, overrides: ov }).then(function () { return api('booking', { id: b.id }); }).then(redraw, function () {});
      } }, 'Save wording')));
      rc.appendChild(wording);
    }
    if (r) {
      var site = guestSite();
      // the minivan message for the guest (pickup, then the way back), the same text as on the Pickups tab
      var vans = (d.minivan || []).map(function (m) {
        var label = (m.dir === 'up' ? 'minivan pickup ' : 'minivan back ') + day(m.date) + (m.stop ? ' (stop ' + m.stop + ')' : '');
        return [m.wa.length >= 7 ? h('a', { href: 'https://wa.me/' + m.wa + '?text=' + encodeURIComponent(m.guest), target: '_blank', rel: 'noopener', title: m.guest }, label)
          : h('a', { href: '#', title: m.guest, onclick: function (e) { e.preventDefault(); copyText(m.guest, 'Minivan message copied (no WhatsApp number on the booking)'); } }, label), ' · '];
      });
      rc.appendChild(h('p', { class: 'noprint muted' }, 'Links for the guest: ', vans,
        h('a', { href: site + 'agreement/?k=' + r.form_key + '&lang=' + r.language, target: '_blank', rel: 'noopener' }, 'agreement form'), ' · ',
        h('a', { href: site + 'lunch/?k=' + r.form_key + '&lang=' + r.language, target: '_blank', rel: 'noopener' }, 'lunch before the tour')));
      if (vans.length) rc.appendChild(h('p', { class: 'noprint muted', style: 'margin-top:-6px' }, 'The minivan link opens WhatsApp with the pickup place, time and plate number for this guest.'));
      rc.appendChild(receiptPaper(d));
    } else if (b.receipt_ref) rc.appendChild(h('p', { class: 'noprint' }, 'This booking is on receipt ' + b.receipt_ref + ', which belongs to another booking (one paper receipt for several bookings). Search for ' + b.receipt_ref + ' to find it.'));
    else rc.appendChild(h('p', { class: 'muted noprint' }, 'No receipt number yet. Issuing gives this booking the next number; it keeps that number for good.'));
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

  // The printed receipt, laid out like the receipt of the old Google Sheet: the package code, pickup and return with their
  // times, what each person pays, and a Details column. Labels come from receipt-text.js in the receipt's language.
  function receiptWording(r) { var o = {}; try { o = JSON.parse(r.overrides || '{}') || {}; } catch (e) { o = {}; } return o; }
  function receiptPaper(d) {
    var b = d.booking, t = d.totals, r = d.receipt, s = (state.cfg && state.cfg.settings) || {}, o = receiptWording(r);
    var L = (window.RECEIPT_TEXT && (window.RECEIPT_TEXT[r.language] || window.RECEIPT_TEXT.en)) || {};
    var paid = t.total_usd > 0 && t.balance_usd <= 0.005;
    var people = d.travellers.filter(function (x) { return x.status !== 'Cancelled'; });
    var riders = people.filter(function (x) { return x.pickup_place !== 'No transfer'; });
    var up = /round/i.test(b.transfer) || (/one way/i.test(b.transfer) && !/luang prabang/i.test(b.transfer)), back = /round/i.test(b.transfer) || /to luang prabang/i.test(b.transfer);
    var stops = d.summary.pickups ? d.summary.pickups.split('; ') : [];
    var places = stops.length === 1 ? stops[0].replace(/: [\d, ]+$/, '') : stops.join('; ');
    var join = function (parts) { return parts.filter(Boolean).join('  |  '); };
    var tourLine = o.tour || (b.tour === 'T00' || !b.tour ? b.tour_name : 'Code: ' + b.tour + ' – ' + b.tour_name) + (Number(b.private_tour) ? ' (Private tour)' : '');
    var pickupLine = o.transport || (b.transfer && b.transfer !== 'No' ? join([b.transfer, places, up && b.pickup_date ? day(b.pickup_date) + ' ' + (b.pickup_time || '') : '']) : '');
    var returnLine = !o.transport && back ? join(['Nong Khiaw → Luang Prabang', b.return_date ? day(b.return_date) + ' ' + (b.return_time || '') : '', L.dropoff + ': ' + (Number(b.train_dropoff) ? L.train : L.citycenter)]) : '';
    var row = function (label, value, label2, value2) {
      return h('tr', {}, h('th', {}, label ? label + ':' : ''), h('td', { colspan: label2 === undefined ? 3 : 1 }, value),
        label2 === undefined ? null : h('th', { class: 'r' }, label2 + ':'), label2 === undefined ? null : h('td', {}, value2));
    };
    // what each person pays: the tour per person, their share of the transport if they ride, and their own lunch
    var each = function (x) {
      var kip = Math.round(t.tour_usd / people.length * t.rate + (riders.length ? (x.pickup_place !== 'No transfer' ? t.transfer_kip / riders.length : 0) : t.transfer_kip / people.length) + Number(x.lunch_kip || 0));
      return money(kip / t.rate, 2) + ' / ' + money(kip);
    };
    return h('div', { class: 'receipt' },
      h('div', { class: 'head' }, h('div', {}, h('h2', {}, s.business_name || 'Nong Khiaw Eco-Trail'), h('div', { class: 'muted' }, s.business_address || ''), h('div', { class: 'muted' }, s.business_contact || '')),
        h('div', { class: 'right' }, h('div', { class: 'rtitle' }, L.receipt), h('div', {}, L.no + ' ', h('strong', { class: 'rno' }, r.no)))),
      h('table', { class: 'rinfo' },
        row(L.name, d.summary.lead_name, L.issued, day(r.issued_on)),
        row(L.tourdate, day(b.tour_date), L.payment, b.payment_method),
        row(L.tour, tourLine, L.bookingid, b.id),
        pickupLine ? row(L.pickup, pickupLine) : null,
        returnLine ? row(L['return'], returnLine) : null,
        b.note ? row(L.note || 'Note', b.note) : null,
        o.note ? row('', o.note) : null),
      h('div', { class: 'scroll' }, h('table', { class: 'rtab' }, h('tr', {}, h('th', {}, L.no), h('th', {}, L.name), h('th', {}, L.passport), h('th', {}, L.food), h('th', {}, L.lunch),
          people.length > 1 ? h('th', { class: 'num' }, L.perperson + ' (USD / ' + L.kip + ')') : null),
        people.map(function (x) {
          return h('tr', {}, h('td', {}, x.n), h('td', {}, x.full_name), h('td', {}, x.passport_no), h('td', {}, x.food || 'Regular'),
            h('td', {}, x.lunch_dish + (x.lunch_choice ? ' (' + x.lunch_choice + ')' : '')), people.length > 1 ? h('td', { class: 'num' }, each(x)) : null);
        }))),
      h('div', { class: 'scroll' }, h('table', { class: 'rtab', style: 'margin-top:12px' }, h('tr', {}, h('th', {}, L.item), h('th', {}, L.details), h('th', { class: 'num' }, 'USD'), h('th', { class: 'num' }, L.kip)),
        h('tr', {}, h('td', {}, L.tour), h('td', {}, people.length + ' ' + L.people), h('td', { class: 'num' }, money(t.tour_usd, 2)), h('td', { class: 'num' }, money(Math.round(t.tour_usd * t.rate)))),
        t.transfer_kip ? h('tr', {}, h('td', {}, L.transport), h('td', {}, o.transport || b.transfer + (Number(b.train_dropoff) ? ' + ' + L.train : '')), h('td', { class: 'num' }, money(t.transfer_kip / t.rate, 2)), h('td', { class: 'num' }, money(t.transfer_kip))) : null,
        t.lunch_kip ? h('tr', {}, h('td', {}, L.lunch), h('td', {}, d.summary.lunch), h('td', { class: 'num' }, money(t.lunch_kip / t.rate, 2)), h('td', { class: 'num' }, money(t.lunch_kip))) : null,
        h('tr', { class: 'rtotal' }, h('td', { colspan: 2 }, L.total), h('td', { class: 'num' }, money(t.total_usd, 2)), h('td', { class: 'num' }, money(t.total_kip))),
        h('tr', {}, h('td', { colspan: 2 }, paid ? L.paid : L.deposit), h('td', { class: 'num' }, money(t.paid_usd, 2)), h('td', { class: 'num' }, money(t.paid_kip))),
        h('tr', { class: 'rbalance' }, h('td', { colspan: 2 }, L.balance), h('td', { class: 'num' }, money(t.balance_usd, 2)), h('td', { class: 'num' }, money(t.balance_kip))))),
      h('p', { class: 'muted', style: 'font-style:italic' }, L.rate + ': 1 USD = ' + money(t.rate) + ' kip'),
      paid ? h('p', { class: 'paid' }, '✓ ' + String(L.paid).toUpperCase()) : null,
      h('p', { style: 'margin-top:28px' }, L.custsig + ': ______________________      ' + L.issuedby + ': ' + (o.issued_by || r.issued_by || '______________')),
      h('p', { style: 'text-align:center;color:#2f6b4f;font-weight:700' }, o.thanks || L.thanks));
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
    var pasted = h('textarea', { rows: 6, placeholder: 'Hello! I would like to book: …' });
    main.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'A website booking that did not arrive'),
      h('p', { class: 'muted' }, 'Paste the whole WhatsApp message the guest sent, from "Hello! I would like to book". It is saved with the guest\'s own booking ID, travellers, passports, transfer and lunch.'),
      field('WhatsApp message', pasted), h('p'),
      h('button', { class: 'btn', onclick: function () {
        var x = window.parseWhatsAppBooking(pasted.value);
        if (x.error) { toast(x.error, true); return; }
        api('booking_new', { booking: x.d }).then(function (d) { toast('Booking ' + d.booking.id + ' saved'); state.tab = 'booking'; state.id = d.booking.id; render(); }, function () {});
      } }, 'Import this message')));
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

      var tt = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Tours and prices'),
        h('p', { class: 'muted' }, 'To add a package (201, 202, 301 …): fill the last line and press "Add tour". Then open Tour plans to write its days and show it on the website.'));
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

      var mm = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Menu: lunch before the tour'));
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

  // Where the guest pages (agreement, lunch) live. The dashboard runs on app.<domain>; the website is on <domain>.
  function guestSite() {
    if (/^app\./.test(location.hostname)) return 'https://' + location.hostname.slice(4) + '/';
    return location.origin + location.pathname.replace(/admin\/.*$/, '');
  }

  /* ---------- tables and Excel download ---------- */
  // A real .xlsx file, written here in the browser: a zip (stored, not compressed) of the few XML parts Excel needs.
  // rows: arrays of cells; a number becomes a number cell, anything else text (so 000325 keeps its zeros). Row 1 is bold.
  function xlsxBlob(name, rows) {
    var esc = function (v) { return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var col = function (i) { var c = ''; for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) c = String.fromCharCode(65 + (i - 1) % 26) + c; return c; };
    var widths = [];
    var body = rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
        if (v === null || v === undefined || v === '') return '';
        widths[ci] = Math.min(60, Math.max(widths[ci] || 8, String(v).length + 2));
        var ref = ' r="' + col(ci) + (ri + 1) + '"' + (ri === 0 ? ' s="1"' : '');
        return typeof v === 'number' && isFinite(v) ? '<c' + ref + '><v>' + v + '</v></c>' : '<c' + ref + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    for (var i = 0; i < widths.length; i++) if (!widths[i]) widths[i] = 8;
    var cols = widths.length ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
    var X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>', M = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships', P = 'http://schemas.openxmlformats.org/package/2006/';
    var files = [
      ['[Content_Types].xml', X + '<Types xmlns="' + P + 'content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
      ['_rels/.rels', X + '<Relationships xmlns="' + P + 'relationships"><Relationship Id="rId1" Type="' + R + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', X + '<workbook xmlns="' + M + '" xmlns:r="' + R + '"><sheets><sheet name="' + esc(name.replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31)) + '" sheetId="1" r:id="rId1"/></sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="' + P + 'relationships"><Relationship Id="rId1" Type="' + R + '/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="' + R + '/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', X + '<styleSheet xmlns="' + M + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
      ['xl/worksheets/sheet1.xml', X + '<worksheet xmlns="' + M + '">' + cols + '<sheetData>' + body + '</sheetData></worksheet>']];
    var crcTable = xlsxBlob.crc || (xlsxBlob.crc = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })());
    var crc32 = function (u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    var head = function (sig, extra, nameBytes, crc, size) {   // local header (sig 0x04034b50) or central entry (0x02014b50)
      var b = new DataView(new ArrayBuffer(extra ? 46 : 30)), p = 0;
      b.setUint32(p, sig, true); p += 4; if (extra) { b.setUint16(p, 20, true); p += 2; }
      b.setUint16(p, 20, true); p += 2; b.setUint16(p, 0x0800, true); p += 2; b.setUint16(p, 0, true); p += 2;   // version, UTF-8 names, stored
      b.setUint16(p, 0, true); p += 2; b.setUint16(p, 0x21, true); p += 2;                                         // time, date (1980-01-01)
      b.setUint32(p, crc, true); p += 4; b.setUint32(p, size, true); p += 4; b.setUint32(p, size, true); p += 4;
      b.setUint16(p, nameBytes.length, true); p += 2; b.setUint16(p, 0, true); p += 2;
      if (extra) { b.setUint16(p, 0, true); p += 2; b.setUint16(p, 0, true); p += 2; b.setUint16(p, 0, true); p += 2; b.setUint32(p, 0, true); p += 4; b.setUint32(p, extra.offset, true); }
      return new Uint8Array(b.buffer);
    };
    files.forEach(function (f) {
      var nameBytes = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data), local = head(0x04034b50, null, nameBytes, crc, data.length);
      central.push(head(0x02014b50, { offset: offset }, nameBytes, crc, data.length), nameBytes);
      parts.push(local, nameBytes, data); offset += local.length + nameBytes.length + data.length;
    });
    var cdSize = central.reduce(function (n, x) { return n + x.length; }, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function download(blob, file) { var a = h('a', { href: URL.createObjectURL(blob), download: file }); document.body.appendChild(a); a.click(); a.remove(); }
  // cols: [[header, key or function(row), 'num'?], ...]; foot: extra rows (arrays) written under the table in the Excel file.
  function table(cols, rows, name, foot) {
    var cell = function (c, r) { var v = typeof c[1] === 'function' ? c[1](r) : r[c[1]]; return v === null || v === undefined ? '' : v; };
    var wrap = h('div', {});
    if (!rows.length) { wrap.appendChild(h('p', { class: 'muted' }, 'Nothing for this date.')); return wrap; }
    wrap.appendChild(h('div', { class: 'scroll' }, h('table', {}, h('tr', {}, cols.map(function (c) { return h('th', { class: c[2] || '' }, c[0]); })),
      rows.map(function (r) { return h('tr', {}, cols.map(function (c) { var v = cell(c, r); return h('td', { class: c[2] || '' }, c[2] === 'num' && v !== '' ? money(v, c[3] || 0) : v); })); }))));
    wrap.appendChild(h('p', { class: 'noprint' }, h('button', { class: 'btn ghost small', onclick: function () {
      var out = [cols.map(function (c) { return c[0]; })].concat(rows.map(function (r) {
        return cols.map(function (c) { var v = cell(c, r); return c[2] === 'num' && v !== '' && isFinite(Number(v)) ? Number(v) : String(v); });
      }));
      if (foot && foot.length) out = out.concat([[]], typeof foot === 'function' ? foot() : foot);
      download(xlsxBlob(name, out), name + '.xlsx');
    } }, 'Download as an Excel file')));
    return wrap;
  }
  function tomorrow() { return new Date(Date.now() + 31 * 3600 * 1000).toISOString().slice(0, 10); }   // tomorrow in Laos (UTC+7)
  function openBooking(id) { return h('button', { class: 'btn ghost small', onclick: function () { state.tab = 'booking'; state.id = id; render(); } }, id); }

  /* ---------- daily lists: guide, lunch, collect on arrival ---------- */
  function viewReports(main) {
    var date = input('date', state.reportDate || tomorrow(), { type: 'date' }), body = h('div', {});
    var run = 0;
    function load() {
      var mine = ++run, stale = function () { if (mine !== run) throw new Error('stale'); };
      state.reportDate = date.value; body.textContent = '';
      api('tour_report', { date: date.value }).then(function (tr) {
        stale();
        var short = day(tr.date).slice(0, 5).replace('/', '.');
        var lineText = function (l, guide) { return l.label + ': ' + l.pax + 'pax' + (guide ? ' · Guide ' + guide : ''); };
        var guides = tr.lines.map(function (l) {
          var g = input('guide', l.guide, { placeholder: 'Guide (type the name)', style: 'max-width:240px' });
          g.addEventListener('change', function () { l.guide = g.value.trim(); api('guide_save', { date: tr.date, tour: l.tour, guide: g.value }).then(function () { toast('Guide saved'); }, function () {}); });
          return h('div', { class: 'bar', style: 'margin:4px 0' }, h('strong', { style: 'flex:1 1 260px' }, l.label + ': ', h('span', { class: 'red' }, l.pax + 'pax')), g);
        });
        var cols = [['No', 'no'], ['Booking ID', 'booking_id'], ['Package', function (r) { return 'Package ' + r.tour; }], ['Receipt No', 'receipt_no'], ['Name', 'name'], ['Pax', 'pax'], ['Food type', 'food'], ['Guest note', 'note']];
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, short + ' Tour · report for the team (' + tr.pax + ' pax starting)'),
          table(cols, tr.rows, short + ' Tour', function () { return tr.lines.map(function (l) { return ['', '', '', '', lineText(l, l.guide)]; }); }),
          tr.rows.length ? h('div', {}, guides, h('p', { class: 'noprint' }, h('button', { class: 'btn ghost small', onclick: function () {
            copyText(short + ' Tour\n' + tr.lines.map(function (l) { return lineText(l, l.guide); }).join('\n') + '\n\n' +
              tr.rows.map(function (r) { return r.no + '. ' + r.name + ' · Package ' + r.tour + ' · ' + r.food + (r.note ? ' (' + r.note + ')' : ''); }).join('\n'), 'Report copied');
          } }, 'Copy as a message for the team'))) : null));
        return api('trip_sheet', { date: date.value });
      }).then(function (t) {
        stale();
        var food = Object.keys(t.food).map(function (k) { return k + ' ' + t.food[k]; }).join(' · ');
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Trip sheet · ' + day(t.date) + ' (' + t.travellers + ' travellers starting a tour)'),
          t.rows.length ? h('div', { class: 'kpis' }, kpi('Bookings', t.bookings), kpi('Travellers', t.travellers), kpi('Taking the minivan', t.riders), kpi('Food', food || '-'),
            kpi('Tours still to collect', '$' + money(t.tour_due_usd, 2)), kpi('Minivan, kip', money(t.transfer_kip)), kpi('Lunches before the tour, kip', money(t.lunch_kip))) : null,
          table([['Tour', 'tour'], ['Name', 'full_name'], ['Country', 'country'], ['Gender', 'gender'], ['Food', function (r) { return r.food || 'Regular'; }], ['Lunch before the tour', 'lunch'],
            ['Pickup place', 'pickup_place'], ['Pickup map', 'pickup_map'], ['Booking ID', 'booking_id'], ['Receipt No', 'receipt_no']], t.rows, 'trip-sheet-' + t.date)));
        return api('guide_report', { date: date.value });
      }).then(function (g) {
        stale();
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Guide report · ' + day(g.date) + ' (' + g.pax + ' guests on tour)'),
          table([['Receipt', 'receipt_no'], ['Booking', 'booking_id'], ['Contact', 'contact'], ['Guests', 'names'], ['Pax', 'pax', 'num'], ['Package', 'package'], ['Day', 'day'],
            ['Plan for the day', 'plan'], ['Viewpoint', 'viewpoint'], ['Additional package', 'addon'], ['Add. package date', function (r) { return day(r.addon_date); }], ['Food', 'food'],
            ['Pickup date', function (r) { return day(r.pickup_date); }], ['Tour starts', function (r) { return day(r.tour_date); }], ['Pick-up location', 'pickups'],
            ['Departure', function (r) { return day(r.return_date); }], ['WhatsApp', 'whatsapp'], ['Notes', 'notes']], g.rows, 'guide-report-' + g.date)));
        return api('lunch_report', { date: date.value });
      }).then(function (l) {
        stale();
        var dishes = Object.keys(l.dishes).map(function (k) { return k + ' x' + l.dishes[k]; }).join(' · ');
        var shortL = day(l.date).slice(0, 5).replace('/', '.');
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, shortL + ' Food report · for the kitchen'),
          l.rows.length ? h('p', {}, h('strong', {}, dishes), ' · ' + money(l.total_kip) + ' kip') : null,
          table([['No', 'no'], ['Booking ID', 'booking_id'], ['Package', function (r) { return 'Package ' + r.tour; }], ['Receipt No', 'receipt_no'], ['Name', 'name'], ['Food type', 'food'],
            ['Menu', 'item'], ['Qty', 'qty', 'num'], ['Date', function (r) { return day(r.day); }], ['Ready by', 'ready_by'], ['Special requests', 'special'], ['Price kip', 'kip', 'num']], l.rows, shortL + ' Food report',
            Object.keys(l.dishes).map(function (k) { return ['', '', '', '', '', '', k, l.dishes[k]]; })),
          l.message ? h('div', {}, h('h3', {}, 'Message for the kitchen'), h('pre', { style: 'white-space:pre-wrap;font:inherit' }, l.message),
            h('button', { class: 'btn ghost small', onclick: function () { copyText(l.message, 'Kitchen message copied'); } }, 'Copy message')) : null));
        return api('collect_report', { from: date.value, to: date.value });
      }).then(function (c) {
        stale();
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Collect on arrival · ' + day(c.from)),
          c.rows.length ? h('p', {}, h('strong', {}, 'To collect: $' + money(c.total.due_usd, 2) + ' = ' + money(c.total.due_kip) + ' kip'), ' from ' + c.total.pax + ' guests') : null,
          table([['Booking', 'booking_id'], ['Receipt', 'receipt_no'], ['Tour', 'tour'], ['Name', 'name'], ['Pax', 'pax', 'num'], ['Tour USD', 'tour_usd', 'num', 2],
            ['Lunch kip', 'lunch_kip', 'num'], ['Transport kip', 'transfer_kip', 'num'], ['Total USD', 'total_usd', 'num', 2], ['Paid USD', 'paid_usd', 'num', 2],
            ['To collect USD', 'due_usd', 'num', 2], ['To collect kip', 'due_kip', 'num'], ['Status', 'status']], c.rows, 'collect-' + c.from)));
      }, function () {});
    }
    date.addEventListener('change', load);
    main.appendChild(h('div', { class: 'card noprint' }, h('div', { class: 'bar' }, h('h1', {}, 'Daily lists'), field('Date', date),
      h('button', { class: 'btn ghost', onclick: function () { window.print(); } }, 'Print'))));
    main.appendChild(body); load();
  }

  function kpi(label, value) { return h('div', { class: 'kpi' }, h('span', { class: 'muted' }, label), h('strong', {}, value)); }

  /* ---------- overview (admin): totals and simple bar charts ---------- */
  function bars(title, rows, label, value, name, more) {
    var max = rows.reduce(function (m, r) { return Math.max(m, Number(r[value]) || 0); }, 0) || 1;
    var cols = [[title, label], [more ? more[0][0] : 'Count', value, 'num']].concat((more || []).slice(1).map(function (c) { return [c[0], c[1], 'num', c[2] || 0]; }));
    if (more) cols[1] = [more[0][0], value, 'num', more[0][2] || 0];
    return h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, title),
      h('div', { class: 'chart' }, rows.map(function (r) {
        return h('div', { class: 'chart-row' }, h('span', { class: 'chart-l' }, r[label]), h('span', { class: 'chart-b' }, h('i', { style: 'width:' + Math.max(1, Math.round(100 * (Number(r[value]) || 0) / max)) + '%' })),
          h('span', { class: 'chart-v' }, money(r[value])));
      })), h('details', {}, h('summary', {}, 'Numbers'), table(cols, rows, name)));
  }
  function viewOverview(main) {
    api('overview').then(function (d) {
      main.appendChild(h('div', { class: 'card' }, h('h1', {}, 'Overview'), h('p', { class: 'muted' }, 'All bookings in the system, deleted ones left out. Cancelled and no-show bookings are left out of travellers, tours and countries.'),
        h('div', { class: 'kpis' }, Object.keys(d.cards).map(function (k) { return kpi(k, /USD/.test(k) ? '$' + money(d.cards[k], 2) : money(d.cards[k])); }))));
      main.appendChild(bars('Month of the tour', d.by_month, 'month', 'bookings', 'by-month', [['Bookings', 'bookings'], ['Travellers', 'travellers'], ['Tour USD', 'tour_usd', 2], ['Paid USD', 'paid_usd', 2]]));
      main.appendChild(bars('Tour', d.by_tour, 'tour', 'bookings', 'by-tour', [['Bookings', 'bookings'], ['Travellers', 'travellers'], ['Paid USD', 'paid_usd', 2]]));
      main.appendChild(bars('Country (travellers)', d.by_country, 'country', 'travellers', 'by-country', [['Travellers', 'travellers']]));
      main.appendChild(bars('Where bookings come from', d.by_source, 'source', 'bookings', 'by-source', [['Bookings', 'bookings']]));
      main.appendChild(bars('Status', d.by_status, 'status', 'bookings', 'by-status', [['Bookings', 'bookings']]));
      main.appendChild(bars('Inquiries by month', d.inquiries, 'month', 'inquiries', 'inquiries', [['Inquiries', 'inquiries'], ['Booked', 'booked']]));
    }, function () {});
  }

  /* ---------- tour plans and cost list (admin) ---------- */
  function viewPlans(main) {
    main.appendChild(h('div', { class: 'card' }, h('h1', {}, 'Tour plans'), h('p', { class: 'muted' },
      'A new package: add its code, name and price under Prices and settings first; it then appears here, where you write its days and put it on the website. ' +
      'The plan for each day shows in the guide report. The cost lines are what Tour costs starts from. "Counted per": group, person, or "2 people", "4 people" (one for every 2 or 4 guests).')));
    Promise.all([api('settings'), api('plans')]).then(function (res) {
      state.cfg = res[0]; var p = res[1];
      res[0].tours.forEach(function (t) {
        var days = p.days.filter(function (x) { return x.tour === t.code; }), addon = p.addons.filter(function (x) { return x.tour === t.code; })[0] || {};
        var costs = p.costs.filter(function (x) { return x.tour === t.code; });
        var dayBox = h('div', {}), costBox = h('div', {});
        var addDay = function (text) { var n = dayBox.children.length + 1; dayBox.appendChild(h('label', { class: 'f' }, 'Day ' + n, h('textarea', { name: 'day', rows: 3 }, text || ''))); };
        days.forEach(function (x) { addDay(x.plan); }); if (!days.length) addDay('');
        var addCost = function (c) {
          c = c || {};
          costBox.appendChild(h('div', { class: 'bar costline' }, h('div', { style: 'flex:2 1 200px' }, field('Cost line', input('item', c.item))), field('Kip each', input('unit_kip', c.unit_kip, { type: 'number', style: 'width:130px' })),
            field('Counted per', input('counted_per', c.counted_per || 'group', { list: 'perlist', style: 'width:120px' })), field('How many', input('qty', c.qty === undefined ? 1 : Number(c.qty), { type: 'number', step: '0.01', style: 'width:90px' }))));
        };
        costs.forEach(addCost); addCost();
        var ad = input('addon', addon.addon), adDay = input('addon_day', addon.starts_day, { type: 'number', min: 1, style: 'width:90px' });
        var builtIn = ['101', '102', '103', '001'].indexOf(t.code) !== -1, web;
        if (builtIn) web = h('p', { class: 'muted' }, 'On the website: this is one of the four original tours. Its text is under Website > Website text, its price under Prices and settings.');
        else {
          var show = h('input', { type: 'checkbox' }); show.checked = !!Number(t.web_show);
          var wt = input('title', t.web_title, { placeholder: t.name }), wd = input('duration', t.web_duration, { placeholder: '2 days · 1 night' }), wl = select('level', ['', 'Easy', 'Moderate', 'Hard'], t.web_level);
          var ws = h('textarea', { rows: 3 }, t.web_summary || ''), wi = h('textarea', { rows: 2 }, t.web_included || '');
          var img = h('img', { class: 'tourphoto', alt: '' }); if (t.photo_url) img.src = t.photo_url; else img.hidden = true;
          var file = h('input', { type: 'file', accept: 'image/*' });
          file.addEventListener('change', function () {
            if (!file.files[0]) return;
            var pic = new Image(), url = URL.createObjectURL(file.files[0]);
            pic.onload = function () {   // made smaller here (1600 px at most) so a phone photo uploads fast
              var k = Math.min(1, 1600 / Math.max(pic.width, pic.height)), c = h('canvas', { width: Math.round(pic.width * k), height: Math.round(pic.height * k) });
              c.getContext('2d').drawImage(pic, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
              api('tour_photo', { code: t.code, data: c.toDataURL('image/jpeg', 0.82) }).then(function (x) { img.src = x.photo; img.hidden = false; toast('Photo saved'); }, function () {});
            };
            pic.onerror = function () { toast('That file is not a photo.', true); };
            pic.src = url;
          });
          web = h('div', { class: 'trav' }, h('h3', { style: 'margin-top:0' }, 'On the website'),
            h('p', { class: 'muted' }, 'Tick "Show on the website" and this tour appears with the other tours and in the booking form, with its price from Prices and settings and the days typed above. What you type shows as typed in every language.'),
            h('label', {}, show, ' Show on the website'),
            h('div', { class: 'grid', style: 'margin-top:8px' }, field('Title on the website', wt), field('Length', wd), field('Level', wl)),
            h('label', { class: 'f' }, 'Short description', ws), h('label', { class: 'f' }, 'Included', wi),
            h('div', { class: 'bar' }, img, field('Photo', file)),
            h('p', {}, h('button', { class: 'btn small', onclick: function () {
              if (show.checked && !(Number(t.price_usd) > 0)) { toast('Give the tour a price under Prices and settings first.', true); return; }
              api('tour_web', { code: t.code, show: show.checked, title: wt.value, duration: wd.value, level: wl.value, summary: ws.value, included: wi.value }).then(function () { toast('Saved. The website shows it within a minute.'); }, function () {});
            } }, 'Save website details')));
        }
        main.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, t.code + ' · ' + t.name), web, dayBox,
          h('p', {}, h('button', { class: 'btn ghost small', onclick: function () { addDay(''); } }, '+ Add a day')),
          h('div', { class: 'bar' }, h('div', { style: 'flex:1 1 220px' }, field('Additional package (empty = none)', ad)), field('Starts on day', adDay)),
          h('h3', {}, 'Cost lines'), costBox, h('p', {}, h('button', { class: 'btn ghost small', onclick: function () { addCost(); } }, '+ Add a cost line')),
          h('button', { class: 'btn', onclick: function () {
            var body = { tour: t.code, addon: ad.value, addon_day: adDay.value,
              days: [].map.call(dayBox.querySelectorAll('textarea'), function (x) { return x.value; }),
              costs: [].map.call(costBox.querySelectorAll('.costline'), function (row) { var c = {}; row.querySelectorAll('[name]').forEach(function (i) { c[i.name] = i.value; }); return c; }) };
            while (body.days.length && !body.days[body.days.length - 1].trim()) body.days.pop();
            if (body.days.some(function (x) { return !x.trim(); })) { toast('A day in the middle is empty. Fill it in or move the later days up.'); return; }
            api('plan_save', body).then(function () { toast('Saved ' + t.code); state.tab = 'plans'; render(); }, function () {});
          } }, 'Save ' + t.code)));
      });
      main.appendChild(h('datalist', { id: 'perlist' }, ['group', 'person', '2 people', '4 people'].map(function (x) { return h('option', { value: x }); })));
    }, function () {});
  }

  /* ---------- website: reviews and text (admin) ---------- */
  function viewWebsite(main) {
    var LANG_NAMES = { en: 'English', lo: 'Lao', th: 'Thai', zh: 'Chinese', ko: 'Korean', ja: 'Japanese', fr: 'French', de: 'German' };
    var rev = h('div', { class: 'card' }, h('h1', {}, 'Website'), h('h2', {}, 'Reviews'), h('p', { class: 'muted' }, 'The website shows the 8 newest reviews that are ticked "Show". Changes appear on the site within a minute.'));
    main.appendChild(rev);
    api('reviews').then(function (d) {
      d.rows.concat([{ isNew: true, show: 1 }]).forEach(function (r) {
        var show = h('input', { type: 'checkbox', name: 'show' }); show.checked = !!Number(r.show);
        var dt = input('review_date', r.review_date || '', { type: 'date' }), nm = input('name', r.name), tx = h('textarea', { name: 'review', rows: 3 }, r.review || '');
        rev.appendChild(h('div', { class: 'trav' }, h('div', { class: 'bar', style: 'margin:0' }, h('label', {}, show, ' Show'), field('Date', dt), h('div', { style: 'flex:1 1 180px' }, field('Name', nm))),
          h('label', { class: 'f' }, r.isNew ? 'New review' : 'Review', tx),
          h('p', {}, h('button', { class: 'btn small', onclick: function () {
            if (!tx.value.trim()) { toast('Write the review first'); return; }
            api('review_save', { id: r.id, show: show.checked ? 1 : 0, review_date: dt.value, name: nm.value, review: tx.value }).then(function () { toast('Saved'); state.tab = 'website'; render(); }, function () {});
          } }, r.isNew ? 'Add review' : 'Save'), ' ',
          r.isNew ? null : h('button', { class: 'btn ghost small danger', onclick: function () {
            if (!confirm('Delete this review?')) return;
            api('review_delete', { id: r.id }).then(function () { toast('Deleted'); state.tab = 'website'; render(); }, function () {});
          } }, 'Delete'))));
      });
    }, function () {});

    var textCard = h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Website text')), list = h('div', {});
    main.appendChild(textCard);
    api('content').then(function (d) {
      var places = []; d.seed.forEach(function (r) { if (places.indexOf(r[1]) === -1) places.push(r[1]); });
      var lang = h('select', { name: 'lang' }, d.langs.map(function (c) { return h('option', { value: c }, LANG_NAMES[c] || c); }));
      var place = select('place', ['Only changed texts'].concat(places), state.webPlace || places[0]), find = input('find', '', { type: 'search', placeholder: 'Find a word' });
      lang.value = state.webLang || 'en';
      function draw() {
        state.webLang = lang.value; state.webPlace = place.value; list.textContent = '';
        var col = 2 + d.langs.indexOf(lang.value), word = find.value.trim().toLowerCase(), shown = 0;
        d.seed.forEach(function (r) {
          var own = (d.changed[r[0]] || {})[lang.value], cur = own || r[col] || '';
          if (word ? (cur + ' ' + r[2] + ' ' + r[0]).toLowerCase().indexOf(word) === -1 : (place.value === 'Only changed texts' ? !own : r[1] !== place.value)) return;
          if (++shown > 120) return;
          var tx = h('textarea', { rows: Math.min(8, Math.max(2, Math.ceil(cur.length / 70))) }, cur), pill = h('span', { class: 'pill ' + (own ? 'Confirmed' : '') }, own ? 'Changed' : 'Built-in');
          var save = function (value) {
            api('content_save', { key: r[0], lang: lang.value, value: value }).then(function () {
              var same = !value.trim() || value.trim() === String(r[col] || '').trim();
              d.changed[r[0]] = d.changed[r[0]] || {}; if (same) delete d.changed[r[0]][lang.value]; else d.changed[r[0]][lang.value] = value.trim();
              toast(same ? 'Back to the built-in text' : 'Saved'); draw();
            }, function () {});
          };
          list.appendChild(h('div', { class: 'trav' }, h('div', { class: 'bar', style: 'margin:0' }, h('strong', {}, r[0]), h('span', { class: 'muted' }, r[1]), pill),
            lang.value !== 'en' ? h('p', { class: 'muted', style: 'margin:6px 0' }, 'English: ' + r[2]) : null, tx,
            h('p', {}, h('button', { class: 'btn small', onclick: function () { save(tx.value); } }, 'Save'), ' ',
              own ? h('button', { class: 'btn ghost small', onclick: function () { save(''); } }, 'Back to the built-in text') : null)));
        });
        if (!shown) list.appendChild(h('p', { class: 'muted' }, place.value === 'Only changed texts' && !word ? 'No text has been changed.' : 'Nothing found.'));
        if (shown > 120) list.appendChild(h('p', { class: 'muted' }, 'Showing the first 120. Narrow the search to see the rest.'));
      }
      [lang, place].forEach(function (x) { x.addEventListener('change', draw); }); find.addEventListener('input', draw);
      textCard.appendChild(h('p', { class: 'muted' }, 'Each language is edited on its own: changing the English text does not change the translations. A saved text appears on the website within a minute. Empty a text to go back to the built-in one.'));
      textCard.appendChild(h('div', { class: 'bar' }, field('Language', lang), field('Part of the site', place), h('div', { style: 'flex:1 1 180px' }, field('Search all parts', find))));
      textCard.appendChild(list); draw();
    }, function () {});
  }

  /* ---------- agreements ---------- */
  function viewAgreements(main) {
    var from = input('from', state.agFrom || tomorrow(), { type: 'date' }), to = input('to', state.agTo || '', { type: 'date' }), body = h('div', {});
    function load() {
      state.agFrom = from.value; state.agTo = to.value;
      api('agreements', { from: from.value, to: to.value || from.value }).then(function (d) {
        body.textContent = '';
        var signed = d.rows.filter(function (r) { return r.agreement_id; }).length, site = guestSite();
        var card = h('div', { class: 'card' }, h('p', {}, h('strong', {}, signed + ' of ' + d.rows.length + ' travellers have signed')));
        if (!d.rows.length) card.appendChild(h('p', { class: 'muted' }, 'No tours start in these dates.'));
        d.rows.forEach(function (r) {
          var ok = h('input', { type: 'checkbox' }); ok.checked = !!Number(r.staff_checked);
          ok.addEventListener('change', function () { api('agreement_check', { id: r.agreement_id, checked: ok.checked }).then(function () { toast('Saved'); }, function () { ok.checked = !ok.checked; }); });
          card.appendChild(h('div', { class: 'trav' }, h('div', { class: 'bar', style: 'margin:0' }, h('strong', {}, r.full_name || 'Traveller ' + r.n),
            h('span', { class: 'pill ' + (r.agreement_id ? 'Paid' : 'Cancelled') }, r.agreement_id ? 'Signed' : 'Not signed'),
            r.agreement_id ? h('span', { class: 'pill ' + (Number(r.photo_permission) ? 'Paid' : 'Cancelled') }, Number(r.photo_permission) ? 'Photos allowed' : 'NO photos') : null,
            h('span', { class: 'muted' }, day(r.tour_date) + ' · tour ' + r.tour), openBooking(r.booking_id)),
            r.agreement_id ? h('p', { style: 'margin:8px 0 0' }, 'Medical / allergies: ' + (r.medical || 'none') + ' · Emergency contact: ' + r.ec_name + ' ' + r.ec_phone +
              (r.insurance ? ' · Insurance: ' + r.insurance : '') + ' · Signed as: ' + r.signed_name + ' ', h('label', {}, ok, ' checked by staff'))
              : (r.form_key ? h('p', { style: 'margin:8px 0 0' }, h('a', { href: site + 'agreement/?k=' + r.form_key + '&lang=' + (r.language || 'en') + '&n=' + r.n, target: '_blank', rel: 'noopener' }, 'Agreement link for this guest'))
                : h('p', { class: 'muted', style: 'margin:8px 0 0' }, 'Issue the receipt first: the agreement link comes with it.'))));
        });
        body.appendChild(card);
      }, function () {});
    }
    main.appendChild(h('div', { class: 'card' }, h('form', { class: 'bar', onsubmit: function (e) { e.preventDefault(); load(); } }, h('h1', {}, 'Agreements'),
      field('Tour date from', from), field('to (empty = same day)', to), h('button', { class: 'btn', type: 'submit' }, 'Show'))));
    main.appendChild(body); load();
  }

  /* ---------- inquiries from the website ---------- */
  function viewInquiries(main) {
    var all = h('input', { type: 'checkbox' }), body = h('div', {});
    function load() {
      api('inquiries', { all: all.checked }).then(function (d) {
        body.textContent = '';
        if (!d.rows.length) body.appendChild(h('div', { class: 'card' }, h('p', { class: 'muted' }, 'No open inquiries.')));
        d.rows.forEach(function (r) {
          var st = select('status', ['New', 'Replied', 'Booked', 'Closed'], r.status), notes = input('staff_notes', r.staff_notes);
          body.appendChild(h('div', { class: 'card' }, h('div', { class: 'bar', style: 'margin-bottom:4px' }, h('strong', {}, r.name || '(no name)'), h('span', { class: 'pill' }, r.status),
            h('span', { class: 'muted' }, r.submitted_at.slice(0, 16) + ' UTC · ' + r.contact + (r.tour ? ' · tour ' + r.tour : '') + ' · ' + r.site_language)),
            h('p', { style: 'white-space:pre-wrap' }, r.question),
            h('div', { class: 'bar' }, field('Status', st), h('div', { style: 'flex:1 1 200px' }, field('Staff notes', notes)),
              h('button', { class: 'btn small', onclick: function () { api('inquiry_save', { id: r.id, fields: { status: st.value, staff_notes: notes.value } }).then(function () { toast('Saved'); load(); }, function () {}); } }, 'Save'))));
        });
      }, function () {});
    }
    all.addEventListener('change', load);
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'bar' }, h('h1', {}, 'Inquiries'), h('label', {}, all, ' also show Booked and Closed'))));
    main.appendChild(body); load();
  }

  /* ---------- tour costs, tour accounts, agency share (admin) ---------- */
  function viewMoney(main) {
    var tours = ((state.cfg && state.cfg.tours) || []).map(function (t) { return t.code; });
    var date = input('date', state.moneyDate || tomorrow(), { type: 'date' }), tour = select('tour', tours, state.moneyTour || tours[0]), body = h('div', {});
    var run = 0;
    function load() {
      var mine = ++run, stale = function () { if (mine !== run) throw new Error('stale'); };
      state.moneyDate = date.value; state.moneyTour = tour.value;
      api('arrange', { date: date.value, tour: tour.value }).then(function (a) {
        stale();
        body.textContent = '';
        var lines = a.saved ? JSON.parse(a.saved.costs) : a.lines, rowsEl = h('div', {});
        var guests = input('guests', a.saved ? a.saved.guests : a.guests, { type: 'number', style: 'width:110px' }), income = input('income_kip', a.saved ? a.saved.income_kip : a.income_kip, { type: 'number' });
        var sum = h('p', {});
        function total() {
          var e = 0; rowsEl.querySelectorAll('.bar').forEach(function (r) { e += Number(r.querySelector('[name=qty]').value || 0) * Number(r.querySelector('[name=unit_kip]').value || 0); });
          sum.textContent = 'Income ' + money(income.value) + ' kip − expense ' + money(e) + ' kip = profit ' + money(Number(income.value || 0) - e) + ' kip';
        }
        function addLine(l) {
          var r = h('div', { class: 'bar', style: 'margin-bottom:6px' }, h('div', { style: 'flex:1 1 160px' }, field('Item', input('item', l.item))), field('Counted per', input('counted_per', l.counted_per, { style: 'width:110px' })),
            field('Qty', input('qty', l.qty, { type: 'number', step: '0.01', style: 'width:90px' })), field('Unit kip', input('unit_kip', l.unit_kip, { type: 'number', style: 'width:130px' })));
          r.addEventListener('input', total); rowsEl.appendChild(r);
        }
        lines.forEach(addLine); income.addEventListener('input', total);
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Tour ' + a.tour + ' on ' + day(a.date) + (a.saved ? ' (saved)' : '')),
          h('p', { class: 'muted' }, a.guests + ' guests booked' + (a.receipt_nos ? ' · receipts ' + a.receipt_nos : '') + (a.booking_ids ? ' · ' + a.booking_ids : '')),
          h('div', { class: 'bar' }, field('Guests counted', guests), field('Income kip', income)), rowsEl,
          h('button', { class: 'btn ghost small', onclick: function () { addLine({ item: '', counted_per: 'group', qty: 1, unit_kip: 0 }); } }, '+ Add a cost line'), sum,
          h('button', { class: 'btn', onclick: function () {
            var ls = []; rowsEl.querySelectorAll('.bar').forEach(function (r) { var l = {}; r.querySelectorAll('[name]').forEach(function (i) { l[i.name] = i.value; }); ls.push(l); });
            api('account_save', { date: a.date, tour: a.tour, guests: guests.value, income_kip: income.value, lines: ls }).then(function (x) { toast('Saved. Profit ' + money(x.profit_kip) + ' kip'); load(); }, function () {});
          } }, 'Save in tour accounts')));
        total();
        return api('accounts');
      }).then(function (x) {
        stale();
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Tour accounts'),
          table([['Tour date', function (r) { return day(r.tour_date); }], ['Tour', 'tour'], ['Guests', 'guests', 'num'], ['Income kip', 'income_kip', 'num'], ['Expense kip', 'expense_kip', 'num'],
            ['Profit kip', 'profit_kip', 'num'], ['Receipts', 'receipt_nos'], ['Bookings', 'booking_ids']], x.rows, 'tour-accounts')));
        return api('agency');
      }).then(function (x) {
        stale();
        var f = {}; ['tour_date', 'booking_id', 'tour', 'guests', 'sending_agency', 'receiving_agency', 'price_usd', 'sender_usd', 'guide_name', 'guide_whatsapp', 'notes'].forEach(function (k) {
          f[k] = input(k, '', k === 'tour_date' ? { type: 'date' } : {}); });
        var label = { tour_date: 'Tour date', booking_id: 'Booking ID', tour: 'Tour code', guests: 'Guests', sending_agency: 'Sending agency', receiving_agency: 'Receiving agency',
          price_usd: 'Price per person USD (empty = price list)', sender_usd: 'Sender gets per person USD', guide_name: 'Guide name', guide_whatsapp: 'Guide WhatsApp', notes: 'Notes' };
        body.appendChild(h('div', { class: 'card' }, h('h2', { style: 'margin-top:0' }, 'Agency share'),
          table([['Tour date', function (r) { return day(r.tour_date); }], ['Booking', 'booking_id'], ['Tour', 'tour'], ['Guests', 'guests'], ['Sending agency', 'sending_agency'],
            ['Receiving agency', 'receiving_agency'], ['Total USD', 'total_usd', 'num', 2], ['Sender gets USD', 'sender_gets_usd', 'num', 2], ['Receiver keeps USD', 'receiver_keeps_usd', 'num', 2],
            ['Guide', 'guide_name'], ['Notes', 'notes']], x.rows, 'agency-share'),
          h('h3', { style: 'margin-top:14px' }, 'Add a group passed between agencies'), h('div', { class: 'grid' }, Object.keys(f).map(function (k) { return field(label[k], f[k]); })), h('p'),
          h('button', { class: 'btn', onclick: function () {
            var v = {}; Object.keys(f).forEach(function (k) { v[k] = f[k].value; });
            api('agency_save', v).then(function () { toast('Saved'); load(); }, function () {});
          } }, 'Add row')));
      }, function () {});
    }
    date.addEventListener('change', load); tour.addEventListener('change', load);
    main.appendChild(h('div', { class: 'card' }, h('div', { class: 'bar' }, h('h1', {}, 'Tour costs'), field('Tour date', date), field('Tour', tour)),
      h('p', { class: 'muted', style: 'margin:0' }, 'Cost lines come from the tour\'s cost list (Prices and settings). Admins only.')));
    main.appendChild(body); load();
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
