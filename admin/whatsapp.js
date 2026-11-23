/* Reads the WhatsApp message the website writes for a booking ("Hello! I would like to book: ...") back into a booking.
   Same rules as parseWhatsAppBooking_ in the old sheet script. Returns { d: booking } or { error: text }. */
var TRANSFERS = ['No', 'One way to Nong Khiaw', 'One way to Luang Prabang', 'Round trip'], TRANSPORT_ONLY = 'T00';
window.parseWhatsAppBooking = function (text) {
  var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/^[\s\u2022\u00b7*-]+/, '').trim(); }).filter(String);
  var find = function (re) { for (var i = 0; i < lines.length; i++) { var m = re.exec(lines[i]); if (m) return m; } return null; };
  var ymd = function (dmy) {   // dd/mm/yy or dd/mm/yyyy -> yyyy-mm-dd
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(dmy || '').trim());
    if (!m) return '';
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  };
  var ref = find(/^Booking ref:\s*([A-Za-z0-9-]+)/), tour = find(/^(?:Package|Tour)\s+(\d{3})\b/);
  var only = find(/^Transport only/i);
  if (!ref) return { error: 'No "Booking ref" in the message: paste the whole message, from "Hello! I would like to book".' };
  if (!tour && !only) return { error: 'The tour (Package 101, 102, 103, Tour 001 or Transport only) is missing in the message.' };
  var date = find(/^Date:\s*(\S+)/), transfer = find(/^Minivan transfer:\s*(.+)$/);
  var t = transfer ? transfer[1].trim() : 'No';
  if (TRANSFERS.indexOf(t) === -1) t = 'No';
  var back = find(/^Date back[^:]*:\s*(\S+)(.*)$/), pick = find(/^Pickup date[^:]*:\s*(\S+)/);
  var hotel = find(/^Accommodation(?: in Nong Khiaw)?:\s*(.+)$/), map = find(/^Google Maps:\s*(\S+)/);
  var nk = find(/^Pickup in Nong Khiaw \(way back\):\s*(.+)$/), drop = find(/^Drop-off in Luang Prabang:\s*(.+)$/);
  var pay = find(/^Payment method:\s*(.+)$/), noteAt = String(text).search(/\n\s*Note:\s*/);
  var people = [], cur = null;
  lines.forEach(function (l) {
    var head = /^Traveller (\d+):\s*(.*)$/.exec(l);
    if (head) { cur = { name: head[2], first: '', last: '', gender: '', nat: '', pass: '', issued: '', expires: '', food: 'Regular', pickup: 'same', lunch: '', lunchChoice: '' }; people.push(cur); return; }
    if (!cur) return;
    var m;
    if ((m = /^First name:\s*(.*)$/.exec(l))) cur.first = m[1];
    else if ((m = /^Last name:\s*(.*)$/.exec(l))) cur.last = m[1];
    else if ((m = /^Gender:\s*(.*)$/.exec(l))) cur.gender = m[1];
    else if ((m = /^Nationality:\s*(.*)$/.exec(l))) cur.nat = m[1];
    else if ((m = /^Passport:\s*(\S*)\s*\(issued\s*(\S+),\s*expires\s*([^)\s]+)\)/.exec(l))) { cur.pass = m[1]; cur.issued = ymd(m[2]); cur.expires = ymd(m[3]); }
    else if ((m = /^Food:\s*(.*)$/.exec(l))) cur.food = m[1] || 'Regular';
    else if ((m = /^Takeaway lunch:\s*(.+?)(?:\s*\((.+)\))?,\s*[\d,.]+\s*kip$/i.exec(l))) { cur.lunch = m[1]; cur.lunchChoice = m[2] || ''; }
    else if (/^(Takeaway lunch total|Note):/.test(l)) cur = null;
  });
  if (!people.length) return { error: 'No travellers ("Traveller 1: ...") in the message.' };
  var dt = ymd(date && date[1]);
  if (!only && !dt) return { error: 'The tour date ("Date: dd/mm/yy") is missing in the message.' };
  var plan = back && /last day of the tour/i.test(back[2]) ? 'end' : back && /10:30/.test(back[2]) ? 'later' : '';
  return { d: {
    type: 'booking', id: ref[1].toUpperCase(), tour: only ? TRANSPORT_ONLY : tour[1], date: only ? '' : dt, transfer: t,
    pickupDate: ymd(pick && pick[1]), returnDate: ymd(back && back[1]), returnPlan: plan,
    private: !!find(/^PRIVATE TOUR/), nkPickup: nk && !/^our office/i.test(nk[1]) ? nk[1] : '',
    hotel: hotel ? hotel[1] : '', map: map ? map[1] : '', train: !!(drop && /train/i.test(drop[1])),
    payment: pay ? pay[1] : '', phone: '', source: 'Website (from WhatsApp)', lang: 'Staff',
    note: noteAt >= 0 ? String(text).slice(noteAt).replace(/^\s*Note:\s*/, '').trim() : '',
    travellers: people } };
};
