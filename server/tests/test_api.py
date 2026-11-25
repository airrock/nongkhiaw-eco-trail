#!/usr/bin/env python3
"""End-to-end checks of the local server (docker compose up first). Only SELFTEST- data; the database is emptied first,
so never point this at the real one.  Run: python3 server/tests/test_api.py"""
import json, subprocess, sys, urllib.request, http.cookiejar, os

BASE = os.environ.get('NK_BASE', 'http://localhost:8787')
HERE = os.path.dirname(os.path.abspath(__file__))
COMPOSE = ['docker', 'compose', '-f', os.path.join(HERE, '..', 'docker-compose.yml')]
if 'localhost' not in BASE: sys.exit('tests only run against localhost')

def sql(s):
    subprocess.run(COMPOSE + ['exec', '-T', 'db', 'mariadb', '-unongkhiaw', '-plocalonly', 'nongkhiaw', '-N', '-e', s], check=True, capture_output=True)
def sqlval(s):
    return subprocess.run(COMPOSE + ['exec', '-T', 'db', 'mariadb', '-unongkhiaw', '-plocalonly', 'nongkhiaw', '-N', '-e', s], check=True, capture_output=True, text=True).stdout.strip()
def make_admin(name, email, pw):
    with open(os.path.join(HERE, '..', 'tools', 'create_admin.php')) as f:
        subprocess.run(COMPOSE + ['exec', '-T', 'web', 'php', '--', name, email, pw], stdin=f, check=True, capture_output=True)

def site(body=None, query=''):
    req = urllib.request.Request(BASE + '/api/exec.php' + query, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type': 'text/plain'})
    try:
        with urllib.request.urlopen(req) as r: t = r.read().decode(); code = r.status
    except urllib.error.HTTPError as e: t = e.read().decode(); code = e.code
    try: return code, json.loads(t)
    except ValueError: return code, t

class User:
    def __init__(self): self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(self, action, **kw):
        req = urllib.request.Request(BASE + '/api/admin.php', data=json.dumps(dict(action=action, **kw)).encode(), headers={'Content-Type': 'application/json', 'X-NK': '1'})
        try:
            with self.op.open(req) as r: return r.status, json.loads(r.read().decode())
        except urllib.error.HTTPError as e: return e.code, json.loads(e.read().decode())
    def ok(self, action, **kw):
        code, d = self.call(action, **kw)
        assert code == 200, f'{action}: {code} {d}'
        return d

n = 0
def eq(got, want, what):
    global n; n += 1
    assert got == want, f'FAILED {what}: got {got!r}, want {want!r}'
def refused(res, what, code=None):
    global n; n += 1
    assert res[0] >= 400 and (code is None or res[0] == code), f'FAILED {what}: was allowed {res}'

sql("SET FOREIGN_KEY_CHECKS=0; TRUNCATE travellers; TRUNCATE payments; TRUNCATE receipts; TRUNCATE agreements; TRUNCATE bookings; TRUNCATE inquiries;"
    "TRUNCATE change_log; TRUNCATE users; TRUNCATE lunch_menu; TRUNCATE country_aliases; TRUNCATE tour_addons; TRUNCATE agency_share; TRUNCATE tour_accounts; TRUNCATE day_guides; SET FOREIGN_KEY_CHECKS=1;"
    "UPDATE settings SET value='1' WHERE `key`='receipt_next'; UPDATE settings SET value='22500' WHERE `key`='kip_per_usd';"
    "INSERT INTO lunch_menu (dish, choices, price_kip) VALUES ('Fried rice','Chicken, Tofu',40000),('Hidden','',0);"
    "INSERT INTO tour_addons VALUES ('102','Kayak',2); INSERT INTO country_aliases VALUES ('netherlands','Netherlands');")
make_admin('Test Admin', 'admin@test.local', 'admin-pass-1')

# ---------- the website ----------
A1 = {"type": "booking", "id": "SELFTEST-A1", "tour": "102", "date": "2030-02-01", "transfer": "Round trip", "pickupDate": "2030-02-01",
      "returnDate": "2030-02-03", "returnPlan": "end", "hotel": "Sunset Hostel", "map": "https://m/1", "train": True, "payment": "USD cash",
      "phone": "+1 555 0100", "lang": "en", "private": True, "travellers": [
        {"first": "SELFTEST-Ann", "last": "One", "nat": "the netherlands", "pass": "ab123", "food": "Vegan", "lunch": "Fried rice", "lunchChoice": "Tofu"},
        {"first": "SELFTEST-Bo", "last": "Two", "pickup": "other", "pkPlace": "Villa Maly", "pkMap": "https://m/2", "lunch": "Hidden"},
        {"name": "SELFTEST-Cy Three", "pickup": "none", "lunch": "Fried rice", "lunchChoice": "Beef"}]}
eq(site(A1), (200, 'ok'), 'booking saved')
eq(site({"type": "booking", "id": "SELFTEST-A1", "tour": "101", "travellers": [{"first": "X"}]}), (200, 'ok'), 'duplicate answered ok')
eq(site({"type": "booking", "id": "SELFTEST-BOT", "website": "x", "tour": "101", "travellers": [{"first": "X"}]}), (200, 'ok'), 'bot answered ok')
eq(site({"type": "booking", "tour": "101", "date": "2030-02-05", "transfer": "One way to Nong Khiaw", "hotel": "H", "travellers": [{"first": "SELFTEST-D"}, {"first": "SELFTEST-E"}]}), (200, 'ok'), 'booking without id')
eq(site({"type": "booking", "id": "SELFTEST-T0", "tour": "T00", "transfer": "One way to Luang Prabang", "returnDate": "2030-02-07", "travellers": [{"first": "SELFTEST-F"}]}), (200, 'ok'), 'transport only')
refused(site({"type": "booking", "id": "SELFTEST-NOBODY", "tour": "101", "travellers": []}), 'booking without travellers')
eq(site({"type": "inquiry", "name": "SELFTEST", "contact": "c", "question": "q"}), (200, 'ok'), 'inquiry')
cfg = site(query='?config=1')[1]
eq((cfg['prices']['102'], cfg['kip']['round'], len(cfg['menu'])), (60, 500000, 1), 'config')
eq(sqlval('SELECT COUNT(*) FROM bookings'), '3', 'three bookings')
eq(sqlval("SELECT COUNT(*) FROM travellers WHERE booking_id='SELFTEST-A1'"), '3', 'duplicate did not add travellers')

# the dashboard needs a login
refused(User().call('bookings'), 'bookings without login', 401)
refused(User().call('login', email='admin@test.local', password='wrong'), 'wrong password')
admin = User(); eq(admin.ok('login', email='admin@test.local', password='admin-pass-1')['user']['role'], 'admin', 'admin login')
refused(admin.call('bookings'), 'temporary password must be changed first', 403)
admin.ok('change_password', old='admin-pass-1', new='admin-pass-2')
admin.ok('user_add', name='Test Office', email='office@test.local', role='staff', password='office-pass-1')
office = User(); eq(office.ok('login', email='office@test.local', password='office-pass-1')['user']['must_change_password'], True, 'new user must change password')
office.ok('change_password', old='office-pass-1', new='office-pass-2')
eq(office.ok('me')['user']['must_change_password'], False, 'password changed')

# ---------- office staff ----------
b = office.ok('booking', id='SELFTEST-A1')
eq(float(b['booking']['est_tour_usd']), 180.0, 'tour 102 x 3')
eq(float(b['booking']['est_transfer_kip']), 1140000.0, '(round 500000 + train 70000) x 2 riders')
eq((b['booking']['addon_package'], b['booking']['transport_remark'], b['booking']['private_tour']), ('Kayak', 'Back after the tour, about 3:30-4:30 PM', 1), 'addon, remark, private')
eq([t['pickup_place'] for t in b['travellers']], ['Sunset Hostel', 'Villa Maly', 'No transfer'], 'pickup places')
t1 = b['travellers'][0]; eq((t1['country'], t1['passport_no'], t1['lunch_dish'], t1['lunch_choice']), ('Netherlands', 'AB123', 'Fried rice', 'Tofu'), 'traveller 1')
eq((b['travellers'][2]['lunch_choice'], float(b['travellers'][1]['lunch_kip'])), ('', 0.0), 'unknown choice and unpriced dish dropped')
s = b['summary']
eq((s['people'], s['lead_name'], s['food'], s['lunch'], s['lunch_kip'], s['pickups']),
   (3, 'SELFTEST-Ann One', 'Vegan 1, Regular 2', 'Fried rice (Tofu) 1; Fried rice 1', 80000, 'Sunset Hostel: 1; Villa Maly: 2; No transfer: 3'), 'summary')
eq(len(office.ok('bookings')['bookings']), 3, 'staff sees bookings')
eq(len(office.ok('bookings', q='ab123')['bookings']), 1, 'search by passport')
t0 = office.ok('booking', id='SELFTEST-T0')['booking']
eq((t0['nk_pickup'], float(t0['est_transfer_kip']), t0['tour_name']), ('Office (The Trio Bar & Cafe)', 250000.0, 'Transport only'), 'transport only')

r = office.ok('receipt_issue', booking_id='SELFTEST-A1', language='fr')['receipt']
eq((r['no'], r['language'], float(r['total_usd']), float(r['total_kip']), r['issued_by']), ('000001', 'fr', 234.22, 5270000.0, 'Test Office'), 'first receipt and totals')
eq(office.ok('receipt_issue', booking_id='SELFTEST-A1')['receipt']['no'], '000001', 'same booking keeps its number')
eq(office.ok('receipt_issue', booking_id='SELFTEST-T0')['receipt']['no'], '000002', 'next number')
t0 = office.ok('booking', id='SELFTEST-A1')['totals']
eq((t0['paid_kip'], t0['balance_kip']), (0, t0['total_kip']), 'nothing paid: the kip balance is the kip total, to the kip')
d1 = office.ok('payment_add', booking_id='SELFTEST-A1', amount=100, currency='USD', method='USD cash')
eq(d1['booking']['status'], 'Requested', 'deposit does not mark Paid')
eq((d1['totals']['paid_kip'], d1['totals']['balance_kip']), (2250000, 3020000), 'kip paid and kip balance after a USD deposit')
b = office.ok('payment_add', booking_id='SELFTEST-A1', amount=3020000, currency='LAK', method='Kip cash')
eq((b['booking']['status'], b['totals']['balance_usd'], float(b['payments'][1]['amount_usd'])), ('Paid', 0, 134.22), 'kip converted, paid in full marks Paid')
eq((b['totals']['paid_kip'], b['totals']['balance_kip']), (5270000, 0), 'paid in full: kip balance is 0')
b = office.ok('booking_save', id='SELFTEST-A1', fields={'staff_notes': 'called', 'transfer': 'One way to Nong Khiaw'})
eq(float(b['booking']['est_transfer_kip']), 500000.0, 'transfer amount follows the transfer (250000 x 2 riders)')
office.ok('booking_save', id='SELFTEST-A1', fields={'transfer': 'Round trip'})
b = office.ok('traveller_save', booking_id='SELFTEST-A1', n=2, fields={'food': 'Halal', 'lunch_dish': 'Fried rice', 'lunch_choice': 'Chicken'})
eq((b['travellers'][1]['food'], float(b['travellers'][1]['lunch_kip']), b['booking']['status']), ('Halal', 40000.0, 'Confirmed'), 'lunch added: priced from the menu, no longer paid in full')
office.ok('traveller_save', booking_id='SELFTEST-A1', n=2, fields={'lunch_dish': ''})
eq(office.ok('booking', id='SELFTEST-A1')['booking']['status'], 'Paid', 'paid in full again')
office.ok('receipt_save', no='000001', overrides={'pickup': '7:00'})
pay_id = b['payments'][1]['id']
for what, res in [
    ('staff deletes a booking', office.call('booking_delete', id='SELFTEST-A1')),
    ('staff restores a booking', office.call('booking_restore', id='SELFTEST-A1')),
    ('staff edits a payment', office.call('payment_edit', id=pay_id, fields={'amount': 1})),
    ('staff removes a payment', office.call('payment_delete', id=pay_id)),
    ('staff changes a setting', office.call('settings_save', settings={'kip_per_usd': 1})),
    ('staff changes a price', office.call('tour_save', code='102', name='x', price_usd=1)),
    ('staff adds a dish', office.call('menu_save', dish='x', price_kip=1)),
    ('staff lists users', office.call('users')),
    ('staff adds a user', office.call('user_add', name='x', email='x@test.local', role='admin', password='12345678')),
    ('staff makes itself admin', office.call('user_save', id=2, role='admin')),
    ('staff resets a password', office.call('user_password', id=1, password='12345678'))]:
    refused(res, what, 403)
eq(office.ok('booking_save', id='SELFTEST-A1', fields={'deleted_at': '2030-01-01 00:00:00'})['booking']['deleted_at'], None, 'deleted_at is not a field staff can set')
eq(office.ok('settings')['settings']['kip_per_usd'], '22500', 'staff can read settings')

# ---------- admin ----------
admin.ok('settings_save', settings={'kip_per_usd': 23000})
eq(float(admin.ok('booking', id='SELFTEST-A1')['payments'][1]['amount_usd']), 134.22, 'old payment keeps its rate')
admin.ok('settings_save', settings={'kip_per_usd': 22500})
refused(admin.call('settings_save', settings={'kip_per_usd': 0}), 'rate of 0')
admin.ok('tour_save', code='102', name='2 days 1 night', price_usd=60)
admin.ok('payment_edit', id=pay_id, fields={'note': 'checked'})
eq(admin.ok('payment_delete', id=pay_id)['booking']['status'], 'Confirmed', 'no longer paid in full')
admin.ok('booking_delete', id='SELFTEST-T0')
eq(len(admin.ok('bookings', deleted=True)['bookings']), 1, 'admin sees the deleted booking')
eq(len(office.ok('bookings')['bookings']), 2, 'staff does not see a deleted booking')
refused(office.call('booking', id='SELFTEST-T0'), 'staff opens a deleted booking')
users = {u['email']: u for u in admin.ok('users')['users']}
admin.ok('user_save', id=users['office@test.local']['id'], role='admin'); admin.ok('user_save', id=users['office@test.local']['id'], role='staff')
refused(admin.call('user_save', id=users['admin@test.local']['id'], role='staff'), 'last admin demotes itself')
refused(admin.call('user_save', id=users['admin@test.local']['id'], active=False), 'last admin deactivates itself')
admin.ok('user_save', id=users['office@test.local']['id'], active=False)
refused(office.call('bookings'), 'deactivated user is signed out at once', 401)
refused(User().call('login', email='office@test.local', password='office-pass-2'), 'deactivated user cannot sign in')
admin.ok('user_save', id=users['office@test.local']['id'], active=True)
office.ok('login', email='office@test.local', password='office-pass-2')

# ---------- pickups and minivan lists ----------
admin.ok('booking_save', id='SELFTEST-A1', fields={'vehicle_to_nk': 'AB 1234'})
tr = office.ok('transport', date='2030-02-01')
eq((tr['up_pax'], tr['down_pax'], [(u['place'], u['pax'], u['stop']) for u in tr['up']]), (2, 0, [('Sunset Hostel', 1, '1/2'), ('Villa Maly', 1, '2/2')]), 'two pickup stops on the way up')
eq(tr['up'][0]['team'].split('\n')[:4], ['Booking id: SELFTEST-A1', 'Receipt no: 001', 'ຈຸດຮັບ 1/2: 1pax', '- SELFTEST-Ann One  WhatsApp: +1 555 0100 https://wa.me/15550100'], 'team message per stop')
eq('booked by SELFTEST-Ann One' in tr['up'][1]['team'], True, 'second stop names who booked')
eq([x for x in tr['up'][0]['guest'].split('\n') if x][:3], ['Hello SELFTEST-Ann! Your minivan to Nong Khiaw is booked for 01/02/2030.', 'Pickup at Sunset Hostel between 7:30 and 8:00am. Please wait at your hotel reception for the driver to pick you up.', 'Minivan plate: AB 1234'], 'guest message in the team\'s words')
tr = office.ok('transport', date='2030-02-03')
eq((tr['up_pax'], tr['down_pax'], tr['down'][0]['drop'], tr['down'][0]['place']), (0, 2, 'Luang Prabang train station', 'Office (The Trio Bar & Cafe)'), 'way back')
eq('ລົງ: 03/02 10:00 - 10:30 AM ສົ່ງສະຖານີລົດໄຟ' in tr['down'][0]['team'], True, 'team message: back after the day the tour ends = morning minivan, train station')
eq(office.ok('transport', date='2030-02-07')['down'], [], 'a deleted booking is not on the list')

# ---------- daily lists and money reports ----------
admin.ok('plan_save', tour='102', days=['Hike up', 'Hike down'], addon='Kayak', addon_day=2, costs=[{'item': 'Guide', 'unit_kip': 300000, 'counted_per': 'group', 'qty': 1},
    {'item': 'Food', 'unit_kip': 50000, 'counted_per': 'person'}, {'item': 'Tent', 'unit_kip': 80000, 'counted_per': '2 people'}])
refused(office.call('plan_save', tour='102', days=[]), 'staff changes tour plans', 403)
g = office.ok('guide_report', date='2030-02-02')
eq((g['pax'], g['rows'][0]['day'], g['rows'][0]['plan'], g['rows'][0]['addon_date'], g['rows'][0]['food']), (3, 'Day 2 of 2', 'Hike down', '2030-02-02', 'Vegan 1, Halal 1, Regular 1'), 'guide report: day 2 of the tour')
eq(office.ok('guide_report', date='2030-02-03')['rows'], [], 'guide report: tour is over on day 3')
l = office.ok('lunch_report', date='2030-02-01')
eq((len(l['rows']), l['dishes'], l['total_kip'], l['message'].split('\n')[:2]), (2, {'Fried rice': 1, 'Fried rice Tofu': 1}, 80000, ['01/02', '1.) Fried rice Tofu x1 : SELFTEST-Ann One']), 'lunch report and kitchen message')
c = office.ok('collect_report', **{'from': '2030-02-01', 'to': '2030-02-01'})
eq((len(c['rows']), c['rows'][0]['total_usd'], c['rows'][0]['paid_usd'], c['rows'][0]['due_usd'], c['total']['due_kip']), (1, 234.22, 100, 134.22, 3020000), 'collect on arrival')
refused(office.call('arrange', date='2030-02-01', tour='102'), 'staff opens tour costs', 403)
refused(office.call('agency'), 'staff opens agency share', 403)
a = admin.ok('arrange', date='2030-02-01', tour='102')
eq((a['guests'], a['income_kip'], [(x['item'], x['qty'], x['total_kip']) for x in a['lines']]), (3, 4050000, [('Guide', 1, 300000), ('Food', 3, 150000), ('Tent', 2, 160000)]), 'tour costs counted per group, person and 2 people')
eq(admin.ok('account_save', date='2030-02-01', tour='102', lines=a['lines'])['profit_kip'], 3440000, 'tour account saved')
admin.ok('account_save', date='2030-02-01', tour='102', lines=a['lines'])
eq(len(admin.ok('accounts')['rows']), 1, 'saving again replaces the row')
admin.ok('agency_save', tour_date='2030-02-01', tour='102', guests='3', sending_agency='A', receiving_agency='B', sender_usd='10')
ag0 = admin.ok('agency')['rows'][0]
eq((ag0['total_usd'], ag0['sender_gets_usd'], ag0['receiver_keeps_usd']), (180, 30, 150), 'agency share')
iq = office.ok('inquiries')['rows']
office.ok('inquiry_save', id=iq[0]['id'], fields={'status': 'Replied', 'staff_notes': 'answered'})
eq(office.ok('inquiries')['rows'][0]['status'], 'Replied', 'inquiry updated')
refused(office.call('inquiry_delete', id=iq[0]['id']), 'staff deletes an inquiry', 403)

# ---------- agreement and lunch links ----------
k1 = sqlval("SELECT form_key FROM receipts WHERE no='000001'"); k2 = sqlval("SELECT form_key FROM receipts WHERE no='000002'")
eq(site(query='?agreement=0123456789abcdef')[1], {'error': 'invalid'}, 'bad key')
eq(site(query='?agreement=' + k2)[1], {'error': 'invalid'}, 'key of a deleted booking')
ag = site(query='?agreement=' + k1)[1]
eq((len(ag['travellers']), ag['date'], ag['receipt'], ag['signed']), (3, '01/02/2030', '000001', []), 'agreement data')
people = [{"n": 1, "photo": "yes", "medical": "none", "ecName": "C", "ecPhone": "+1", "signedName": "Ann One", "accept": True},
          {"n": 2, "photo": "no", "ecName": "", "ecPhone": "", "signedName": "Bo Two", "accept": True},
          {"n": 3, "photo": "no", "ecName": "C", "ecPhone": "+1", "signedName": "Cy Three", "accept": False}]
eq(site({"type": "agreement", "key": k1, "lang": "en", "people": people})[1], {'saved': 1}, 'only the complete one is saved')
eq(site({"type": "agreement", "key": k1, "lang": "en", "people": people[:1]})[1], {'saved': 0}, 'signs once')
eq(site(query='?agreement=' + k1)[1]['signed'], [1], 'signed list')
refused(site({"type": "agreement", "key": "0123456789abcdef", "people": []}), 'agreement with a bad key')
eq(site({"type": "lunch", "key": k1, "people": [{"n": 2, "lunch": "Fried rice", "choice": "Chicken"}, {"n": 3, "lunch": ""}, {"n": 9, "lunch": "Fried rice"}]})[1], {'saved': 2}, 'lunch saved for 2 and 3')
eq(site(query='?lunch=' + k1)[1]['travellers'][1]['choice'], 'Chicken', 'lunch read back')
rows = office.ok('agreements', **{'from': '2030-02-01', 'to': '2030-02-01'})['rows']
eq([(r['n'], bool(r['agreement_id'])) for r in rows], [(1, True), (2, False), (3, False)], 'agreements list: who signed')
office.ok('agreement_check', id=rows[0]['agreement_id'], checked=True)
eq(office.ok('agreements', **{'from': '2030-02-01', 'to': '2030-02-01'})['rows'][0]['staff_checked'], 1, 'agreement marked checked')
refused(office.call('agreement_delete', id=rows[0]['agreement_id']), 'staff deletes an agreement', 403)

# ---------- change log ----------
hist = admin.ok('history', id='SELFTEST-A1')['history']
eq(any(h['user_name'] == 'Test Office' and h['new_values'] and 'staff_notes' in h['new_values'] for h in hist), True, 'log names the user')
eq(any(h['row_id'] == 'SELFTEST-A1 #2' and h['new_values'] == '{"food":"Halal"}' for h in hist), True, 'log keeps only what changed')

# ---------- trip sheet, overview, website text, receipt wording ----------
ts = office.ok('trip_sheet', date='2030-02-01')
eq((ts['travellers'] >= 1, len(ts['rows']) == ts['travellers'], all(r['pickup_place'] for r in ts['rows'])), (True, True, True), 'trip sheet lists the travellers of the day')
eq(office.ok('trip_sheet', date='2031-01-01')['rows'], [], 'trip sheet of an empty day')
refused(office.call('overview'), 'office cannot see the overview', 403)
ov = admin.ok('overview')
eq((ov['cards']['Booking requests'] >= 1, isinstance(ov['by_status'], list), isinstance(ov['by_month'], list)), (True, True, True), 'overview totals')
refused(office.call('content'), 'office cannot read the website text editor', 403)
refused(office.call('content_save', key='nav_tour', lang='en', value='x'), 'office cannot change website text', 403)
ct = admin.ok('content')
eq((len(ct['seed']) > 300, ct['langs'][0], ct['seed'][0][0]), (True, 'en', 'nav_tour'), 'website text list')
sql("DELETE FROM content")
admin.ok('content_save', key='nav_tour', lang='en', value='Our tours')
eq(site(query='?config=1')[1]['content']['en']['nav_tour'], 'Our tours', 'changed text reaches the website')
admin.ok('content_save', key='nav_tour', lang='en', value=ct['seed'][0][2])
eq(sqlval('SELECT COUNT(*) FROM content'), '0', 'the built-in text again stores nothing')
admin.ok('content_save', key='nav_tour', lang='fr', value='Nos excursions'); admin.ok('content_save', key='nav_tour', lang='fr', value='')
eq(sqlval('SELECT COUNT(*) FROM content'), '0', 'emptying a text goes back to the built-in one')
refused(admin.call('content_save', key='no_such_key', lang='en', value='x'), 'unknown text key')
refused(admin.call('content_save', key='nav_tour', lang='xx', value='x'), 'unknown language')
rno = admin.ok('booking', id='SELFTEST-A1')['receipt']['no']
rs = office.ok('receipt_save', no=rno, overrides={'tour': 'Camping, private', 'note': 'Paid by friend', 'hack': 'x', 'thanks': ''})['receipt']
eq(json.loads(rs['overrides']), {'tour': 'Camping, private', 'note': 'Paid by friend'}, 'receipt wording keeps only the known, filled fields')
eq(admin.ok('booking', id='SELFTEST-A1')['receipt']['no'], rno, 'wording does not change the receipt number')

# ---------- feedback round 2026-11-25: times, no-show, pickup place, team and minivan lists, Excel, tours on the website ----------
bk = admin.ok('booking', id='SELFTEST-A1')
eq((bk['booking']['pickup_time'], bk['booking']['return_time']), ('7:30 - 8:00 AM', '10:00 - 10:30 AM'), 'minivan times are filled in when nobody typed them (back the day after the 2-day tour ends: morning)')
eq(sqlval("SELECT CONCAT(pickup_time, '|', return_time) FROM bookings WHERE id='SELFTEST-A1'"), '|', 'the usual times are not stored')
admin.ok('booking_save', id='SELFTEST-A1', fields={'return_time': '2 PM', 'transport_remark': ''})
eq(admin.ok('booking', id='SELFTEST-A1')['booking']['return_time'], '2 PM', 'a typed time wins')
admin.ok('booking_save', id='SELFTEST-A1', fields={'return_time': ''})
eq(admin.ok('booking', id='SELFTEST-A1')['booking']['return_time'], '10:00 - 10:30 AM', 'back on a later day: morning minivan')
admin.ok('booking_save', id='SELFTEST-A1', fields={'return_date': '2030-02-02'})
eq(admin.ok('booking', id='SELFTEST-A1')['booking']['return_time'], '3:30 - 4:30 PM', 'back on the day the tour ends: afternoon minivan')
admin.ok('booking_save', id='SELFTEST-A1', fields={'return_date': '2030-02-03', 'transport_remark': 'Back after the tour, about 3:30-4:30 PM'})
eq([m['dir'] for m in bk['minivan']], ['up', 'up', 'down'], 'booking carries the minivan messages for the guest')
eq('Pickup at Sunset Hostel between 7:30 and 8:00am.' in bk['minivan'][0]['guest'], True, 'minivan message names place and time')

tr = office.ok('transport', date='2030-02-01')
eq(([(r['no'], r['name'], r['pax'], r['place'], r['time']) for r in tr['up_rows']]), [(1, 'SELFTEST-Ann One', 2, 'Sunset Hostel', '7:30 - 8:00 AM'), (2, 'SELFTEST-Bo Two', '', 'Villa Maly', '7:30 - 8:00 AM')], 'list for the minivan manager, one row per guest')
eq((tr['up_rows'][0]['lunch'], tr['up_rows'][0]['lunch_qty'], tr['up_rows'][0]['food']), ('Fried rice (Tofu)', 1, 'Vegan'), 'pickup list keeps food and lunch')
old_place = sqlval("SELECT accommodation FROM bookings WHERE id='SELFTEST-A1'")
admin.ok('booking_save', id='SELFTEST-A1', fields={'accommodation': 'Jam Hostel', 'maps_link': 'https://maps.example/jam'})
tr = office.ok('transport', date='2030-02-01')
eq([(u['place'], u['map']) for u in tr['up']], [('Jam Hostel', 'https://maps.example/jam'), ('Villa Maly', tr['up'][1]['map'])], 'a pickup place changed on the booking reaches the pickups list; a guest with their own place keeps it')
admin.ok('booking_save', id='SELFTEST-A1', fields={'accommodation': old_place})
eq(office.ok('transport', date='2030-02-01')['up'][0]['place'], old_place, 'and back again')
eq(office.ok('transport_plate', date='2030-02-01', dir='up', plate='ກກ 7519')['bookings'], 1, 'one plate number for the whole list')
eq(sqlval("SELECT vehicle_to_nk FROM bookings WHERE id='SELFTEST-A1'"), 'ກກ 7519', 'plate saved on the booking')
ps = office.ok('transport', date='2030-02-01')['passengers']
eq((len(ps), ps[0]['route'], ps[0]['date'], ps[0]['name'], ps[0]['passport'], ps[0]['country'] != '', ps[0]['pax'], ps[1]['pax'], ps[0]['place'], ps[0]['map'] == '', ps[0]['whatsapp'],
    sorted(ps[0].keys()) == sorted(['no', 'date', 'dir', 'route', 'name', 'passport', 'issued', 'expires', 'country', 'pax', 'place', 'map', 'whatsapp', 'remark', 'time', 'vehicle', 'booking_id'])),
   (2, 'Luang Prabang → Nong Khiaw', '2030-02-01', 'SELFTEST-Ann One', 'AB123', True, 2, '', old_place, True, '+15550100', True), 'transfer report: date, route, passport, group pax, map, WhatsApp with country code')
pd = office.ok('transport', date='2030-02-03')['passengers']
eq((len(pd), pd[0]['route'], pd[0]['remark'].endswith('Drop-off: Luang Prabang train station')), (2, 'Nong Khiaw → Luang Prabang', True), 'transfer report: the way back with its drop-off')
bk = office.ok('booking', id='SELFTEST-A1')
eq(all('https://wa.me/15550100' in m['team'] for m in bk['minivan']), True, 'team message on the booking, with the WhatsApp link')
dn = office.ok('transport', date='2030-02-03')
eq((dn['down_rows'][0]['notes'], dn['down_slots']), ('Leave at 10:00 - 10:30 AM, drop off at the train station', [{'time': '10:00 - 10:30 AM', 'pax': 2, 'train': 2}]), 'way back: note and head count per leaving time')

rep = office.ok('tour_report', date='2030-02-01')
eq((rep['pax'], [(r['no'], r['tour'], r['receipt_no'], r['pax']) for r in rep['rows']], [(x['tour'], x['pax'], x['label'].split(' ')[:2]) for x in rep['lines']]),
   (3, [(1, '102 (PRIVATE)', '000001', 3), (2, '102 (PRIVATE)', '000001', ''), (3, '102 (PRIVATE)', '000001', '')], [('102', 3, ['Package', '102'])]), 'tour report: one line per package, code before the name')
office.ok('guide_save', date='2030-02-01', tour='102', guide='Mr Boun Mee')
eq(office.ok('tour_report', date='2030-02-01')['lines'][0]['guide'], 'Mr Boun Mee', 'guide of the day saved')
office.ok('guide_save', date='2030-02-01', tour='102', guide='')
eq(sqlval('SELECT COUNT(*) FROM day_guides'), '0', 'an emptied guide is removed')
l = office.ok('lunch_report', date='2030-02-01')
eq((l['rows'][0]['no'], l['rows'][0]['receipt_no'], l['rows'][0]['food'], l['rows'][0]['day']), (1, '000001', 'Vegan', '2030-02-01'), 'kitchen report: receipt number, food type and date')

admin.ok('booking_save', id='SELFTEST-A1', fields={'status': 'No-show'})
eq((office.ok('trip_sheet', date='2030-02-01')['rows'], office.ok('tour_report', date='2030-02-01')['rows'], office.ok('lunch_report', date='2030-02-01')['rows'],
    office.ok('transport', date='2030-02-01')['up'], office.ok('collect_report', **{'from': '2030-02-01', 'to': '2030-02-01'})['rows']), ([], [], [], [], []), 'a no-show booking is on none of the daily lists')
admin.ok('booking_save', id='SELFTEST-A1', fields={'status': 'Confirmed'})
admin.ok('traveller_save', booking_id='SELFTEST-A1', n=2, fields={'status': 'No-show'})
eq(len(office.ok('trip_sheet', date='2030-02-01')['rows']), 2, 'a no-show traveller is left out too')
admin.ok('traveller_save', booking_id='SELFTEST-A1', n=2, fields={'status': ''})

sql("DELETE FROM tours WHERE code = '201'")
admin.ok('tour_save', code='201', name='Waterfall day', price_usd=25, sort=9)
eq([t['code'] for t in site(query='?config=1')[1]['tours']], [], 'a new tour is not on the website until it is ticked')
refused(office.call('tour_web', code='201', show=True), 'office cannot put a tour on the website', 403)
admin.ok('plan_save', tour='201', days=['Walk to the 100 waterfalls', ''], addon='', costs=[])
admin.ok('tour_web', code='201', show=True, title='1 day: 100 waterfalls', summary='A wet walk.', duration='1 day', level='Easy', included='Guide, lunch')
wt = site(query='?config=1')[1]['tours']
eq((len(wt), wt[0]['code'], wt[0]['title'], wt[0]['price'], wt[0]['days'], wt[0]['level'], wt[0]['photo']), (1, '201', '1 day: 100 waterfalls', 25, ['Walk to the 100 waterfalls'], 'Easy', ''), 'the ticked tour reaches the website with its days and price')
JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA='
refused(admin.call('tour_photo', code='201', data='data:image/jpeg;base64,' + 'iVBORw0KGgo' * 20), 'a file that is not a JPEG is refused')
refused(office.call('tour_photo', code='201', data=JPEG), 'office cannot upload a tour photo', 403)
ph = admin.ok('tour_photo', code='201', data='data:image/jpeg;base64,' + JPEG)['photo']
eq((ph.startswith(BASE + '/uploads/tour-201-'), urllib.request.urlopen(ph).status, site(query='?config=1')[1]['tours'][0]['photo']), (True, 200, ph), 'tour photo saved and served')
bid = 'SELFTEST-W201'
eq(site({"type": "booking", "id": bid, "tour": "201", "date": "2030-03-01", "transfer": "No", "travellers": [{"first": "SELFTEST-Wa", "last": "Ter", "nat": "Laos"}]})[1], 'ok', 'website booking of the new tour')
eq(sqlval(f"SELECT CONCAT(tour_name, '|', est_tour_usd) FROM bookings WHERE id='{bid}'"), 'Waterfall day|25.00', 'the new tour is priced from the price list')
admin.ok('tour_web', code='201', show=False)
eq(site(query='?config=1')[1]['tours'], [], 'unticked: off the website again')

# ---------- fixes after the 10-agent test round (2026-11-26) ----------
def nb(**kw):
    b = {"tour": "101", "date": "2031-01-10", "transfer": "No", "payment": "USD cash", "status": "Confirmed", "travellers": [{"first": "SELFTEST-Z", "last": "One"}]}
    b.update(kw); return b
ids = [admin.ok('booking_new', booking=nb(travellers=[{"first": "SELFTEST-Auto%d" % i}]))['booking']['id'] for i in range(3)]
eq((len(set(ids)), [sqlval(f"SELECT full_name FROM travellers WHERE booking_id='{i}'") for i in ids]), (3, ['SELFTEST-Auto0', 'SELFTEST-Auto1', 'SELFTEST-Auto2']), 'three bookings without an ID in the same second stay three bookings')
refused(admin.call('booking_new', booking=nb(id=ids[0])), 'staff typing an ID that exists is told, nothing saved')
refused(admin.call('booking_new', booking=nb(id='A B')), 'a typed ID that is not valid is refused')
refused(admin.call('booking_new', booking=nb(priceUsd=-5)), 'negative tour price refused')
refused(admin.call('booking_new', booking=nb(transfer='Round trip', hotel='H')), 'round trip without dates refused')
refused(admin.call('booking_new', booking=nb(transfer='Round trip', hotel='H', pickupDate='2031-01-10', returnDate='2031-01-09')), 'date back before pickup refused')
eq(admin.ok('booking_new', booking=nb(tour='T00', private=True, transfer='One way to Luang Prabang', returnDate='2031-01-10'))['booking']['private_tour'], 0, 'transport only is never private')
refused(site({"type": "booking", "id": "SELFTEST-BADTOUR", "tour": "ZZZ", "travellers": [{"first": "X"}]}), 'website booking for an unknown tour refused')
site({"type": "booking", "id": "SELFTEST-JS", "tour": "101", "date": "2031-01-10", "transfer": "Round trip", "pickupDate": "2031-01-10", "returnDate": "2031-01-11", "hotel": "H",
      "map": "javascript:alert(1)", "travellers": [{"first": "SELFTEST-J"}, {"first": "SELFTEST-K", "pickup": "other", "pkPlace": "P", "pkMap": "javascript:x"}]})
eq(sqlval("SELECT CONCAT(maps_link, '|', (SELECT GROUP_CONCAT(pickup_map) FROM travellers WHERE booking_id='SELFTEST-JS')) FROM bookings WHERE id='SELFTEST-JS'"), '|,', 'map links that are not web addresses are dropped')
refused(site({"type": "inquiry"}), 'empty website question refused')
eq(site({"type": "nonsense"})[0], 400, 'unknown website request answers 400')

# travellers change the amounts
G = admin.ok('booking_new', booking=nb(id='SELFTEST-G1', transfer='Round trip', hotel='H', pickupDate='2031-01-10', returnDate='2031-01-11',
     travellers=[{"first": "SELFTEST-G", "last": "One"}, {"first": "SELFTEST-G", "last": "Two"}]))
eq((G['totals']['tour_usd'], G['totals']['transfer_kip']), (60.0, 1000000.0), 'two travellers: tour 60, transport 1,000,000')
g = admin.ok('traveller_add', booking_id='SELFTEST-G1', fields={'first_name': 'SELFTEST-G', 'last_name': 'Three'})
eq((g['totals']['tour_usd'], g['totals']['transfer_kip'], g['travellers'][2]['full_name']), (90.0, 1500000.0, 'SELFTEST-G Three'), 'a traveller added: tour, transport and full name follow')
g = admin.ok('traveller_save', booking_id='SELFTEST-G1', n=3, fields={'status': 'Cancelled'})
eq((g['totals']['tour_usd'], g['totals']['transfer_kip']), (60.0, 1000000.0), 'a cancelled traveller pays no tour or transport')
g = admin.ok('traveller_save', booking_id='SELFTEST-G1', n=3, fields={'status': ''})
eq((g['totals']['tour_usd'], g['totals']['transfer_kip']), (90.0, 1500000.0), 'and back again')
g = admin.ok('traveller_remove', booking_id='SELFTEST-G1', n=3)
eq((g['totals']['tour_usd'], g['totals']['transfer_kip']), (60.0, 1000000.0), 'a traveller removed: tour and transport follow')
g = admin.ok('traveller_save', booking_id='SELFTEST-G1', n=2, fields={'pickup_place': 'no transfer'})
eq((g['travellers'][1]['pickup_place'], g['totals']['transfer_kip']), ('No transfer', 500000.0), '"no transfer" typed in lower case counts as no transfer')
refused(admin.call('traveller_save', booking_id='SELFTEST-G1', n=1, fields={'lunch_dish': 'Fried rice', 'lunch_choice': 'Beef'}), 'a lunch choice that is not on the list is refused')
refused(admin.call('traveller_save', booking_id='SELFTEST-G1', n=1, fields={'lunch_dish': 'Fried rice', 'lunch_choice': ''}), 'a dish with choices needs one')
admin.ok('traveller_save', booking_id='SELFTEST-G1', n=1, fields={'lunch_dish': 'Fried rice', 'lunch_choice': 'Tofu'})

# money
t = admin.ok('booking', id='SELFTEST-G1')['totals']
admin.ok('payment_add', booking_id='SELFTEST-G1', amount=50, currency='USD', method='USD cash')
t = admin.ok('booking', id='SELFTEST-G1')['totals']
g = admin.ok('payment_add', booking_id='SELFTEST-G1', amount=t['balance_kip'], currency='LAK', method='Kip cash')
eq((g['totals']['balance_usd'], g['totals']['balance_kip'], g['booking']['status']), (0.0, 0.0, 'Paid'), 'paying the kip balance shown makes the booking Paid')
g = admin.ok('payment_add', booking_id='SELFTEST-G1', amount=10, currency='USD', method='USD cash')
eq((g['totals']['balance_usd'], g['totals']['balance_kip'] < 0), (-10.0, True), 'an overpayment shows on both sides')
refused(admin.call('payment_add', booking_id='SELFTEST-G1', amount=1, currency='USD', paid_on='2031-02-30'), 'a payment date that does not exist is refused')
refused(admin.call('payment_add', booking_id='SELFTEST-G1', amount=1e15, currency='LAK'), 'a huge amount is refused')
H = admin.ok('booking_new', booking=nb(id='SELFTEST-H1'))
refused(admin.call('booking_save', id='SELFTEST-H1', fields={'status': 'Paid'}), 'Paid cannot be chosen while money is owed')
for f, v, what in [('pickup_time', 'x' * 21, 'a too long time'), ('est_tour_usd', '', 'an emptied amount'), ('est_tour_usd', -1, 'a negative amount'),
                   ('tour_date', 'garbage', 'a date that is not a date'), ('transfer', 'Teleport', 'an unknown transfer'), ('maps_link', 'javascript:x', 'a map link that is not a web address')]:
    code, d = admin.call('booking_save', id='SELFTEST-H1', fields={f: v})
    eq((code, 'went wrong' in d.get('error', '')), (400, False), f'{what} gets a clear message')
eq(admin.ok('booking_save', id='SELFTEST-H1', fields={'tour': '102'})['booking']['tour_name'], '2 days 1 night', 'a new tour code brings its name')

# deleted bookings and office staff
admin.ok('booking_new', booking=nb(id='SELFTEST-DEL', travellers=[{"first": "SELFTEST-D1"}, {"first": "SELFTEST-D2"}]))
rno = admin.ok('receipt_issue', booking_id='SELFTEST-DEL', language='en')['receipt']['no']
admin.ok('booking_delete', id='SELFTEST-DEL')
refused(office.call('traveller_remove', booking_id='SELFTEST-DEL', n=2), 'office staff cannot remove a traveller from a deleted booking')
eq(sqlval("SELECT COUNT(*) FROM travellers WHERE booking_id='SELFTEST-DEL'"), '2', 'and nothing was removed')
refused(office.call('history', id='SELFTEST-DEL'), 'office staff cannot read the history of a deleted booking')
refused(office.call('receipt_save', no=rno, overrides={'note': 'x'}), 'office staff cannot change the receipt of a deleted booking')
refused(admin.call('receipt_issue', booking_id='SELFTEST-H1', language='xx'), 'an unknown receipt language is refused')

# admin screens
refused(admin.call('tour_save', code='101', name='X', price_usd=99, is_new=True), '"Add tour" with a code that exists is refused')
eq(sqlval("SELECT price_usd FROM tours WHERE code='101'"), '30.00', 'and the price did not change')
refused(admin.call('tour_delete', code='101'), 'an original tour cannot be deleted')
admin.ok('tour_save', code='Z9', name='SELFTEST tour', price_usd=5, is_new=True); admin.ok('plan_save', tour='Z9', days=['a', 'b'], addon='', costs=[{'item': 'c', 'unit_kip': 1}])
refused(admin.call('plan_save', tour='Z9', days=['a', '', 'c']), 'an empty day in the middle is refused')
refused(admin.call('plan_save', tour='Z9', days=['a'], addon='Kayak', addon_day=5), 'an add-on starting after the tour is refused')
admin.ok('tour_delete', code='Z9')
eq(sqlval("SELECT (SELECT COUNT(*) FROM tour_days WHERE tour='Z9') + (SELECT COUNT(*) FROM tour_costs WHERE tour='Z9')"), '0', 'deleting a tour removes its days and costs')
refused(admin.call('tour_delete', code='102'), 'a tour that bookings use cannot be deleted')
was = sqlval("SELECT value FROM settings WHERE `key`='transfer_one_kip'")
refused(admin.call('settings_save', settings={'transfer_one_kip': 260000, 'train_extra_kip': -1}), 'settings with one wrong value')
eq(sqlval("SELECT value FROM settings WHERE `key`='transfer_one_kip'"), was, 'nothing is saved when one value is wrong')
refused(admin.call('menu_save', dish='Fried rice', price_kip=1000, show=True), 'a dish already on the menu is refused')
refused(admin.call('menu_save', dish='SELFTEST dish', price_kip=0, show=True), 'a dish needs a price')
refused(admin.call('agency_save', tour_date='2031-01-10', tour='101', guests='abc'), 'agency share needs a number of guests')

# lists
mins = lambda: [x['time'] for x in office.ok('transport', date='2031-01-11')['down_slots']]
admin.ok('booking_new', booking=nb(id='SELFTEST-T1', transfer='One way to Luang Prabang', returnDate='2031-01-11'))
admin.ok('booking_save', id='SELFTEST-T1', fields={'return_time': '11:30 - 12:30 PM'})
admin.ok('booking_new', booking=nb(id='SELFTEST-T2', transfer='One way to Luang Prabang', returnDate='2031-01-11'))
admin.ok('booking_save', id='SELFTEST-T2', fields={'return_time': '3:30 - 4:30'})
eq(mins()[-2:], ['11:30 - 12:30 PM', '3:30 - 4:30 PM'], 'times sort by the clock and a time without PM gets it')
eq('is booked for 11/01/2031' in office.ok('transport', date='2031-01-11')['down'][0]['guest'], True, 'guest message reads "booked for <date>"')
admin.ok('booking_new', booking=nb(id='SELFTEST-NS', date='2031-01-12', travellers=[{"first": "SELFTEST-NS1"}]))
admin.ok('traveller_save', booking_id='SELFTEST-NS', n=1, fields={'status': 'No-show'})
eq((office.ok('trip_sheet', date='2031-01-12')['bookings'], office.ok('collect_report', **{'from': '2031-01-12', 'to': '2031-01-12'})['rows']), (0, []), 'a booking where everyone is a no-show is on no list')
k = admin.ok('receipt_issue', booking_id='SELFTEST-G1', language='en')['receipt']['form_key']
admin.ok('traveller_add', booking_id='SELFTEST-G1', fields={'first_name': 'SELFTEST-Gone'}); admin.ok('traveller_save', booking_id='SELFTEST-G1', n=3, fields={'status': 'Cancelled'})
eq([x['n'] for x in site(query='?agreement=' + k)[1]['travellers']], [1, 2], 'the agreement page leaves out a cancelled traveller')
eq(site({"type": "agreement", "key": k, "people": [{"n": 3, "photo": "yes", "ecName": "x", "ecPhone": "1", "signedName": "xx", "accept": True}]})[1], {'saved': 0}, 'a cancelled traveller cannot sign')
eq(site({"type": "lunch", "key": k, "people": [{"n": 3, "lunch": "Fried rice", "choice": "Tofu"}]})[1], {'saved': 0}, 'nor order a lunch')
refused(admin.call('change_password', old='admin-pass-2', new='admin-pass-2'), 'the new password must differ')
refused(admin.call('user_password', id=99999, password='whatever-1'), 'resetting the password of an unknown user')
refused(admin.call('settings_save', settings={'logo_url': 'javascript:alert(1)'}), 'a logo link that is not https')
admin.ok('settings_save', settings={'logo_url': 'https://nongkhiawlaos.com/images/receipt-logo.png'})
eq(admin.ok('settings')['settings']['logo_url'], 'https://nongkhiawlaos.com/images/receipt-logo.png', 'logo link saved')
# a password change ends the user's other sessions, not the one that changed it
phone = User(); phone.ok('login', email='admin@test.local', password='admin-pass-2')
admin.ok('change_password', old='admin-pass-2', new='admin-pass-3')
eq((admin.ok('me')['user'] is not None, phone.ok('me')['user']), (True, None), 'other session signed out after a password change')
# ----- the audit round: return time, no-show customer, a new hotel's map, a transfer that changes direction -----
W = {"type": "booking", "id": "SELFTEST-W1", "tour": "101", "date": "2032-03-01", "transfer": "Round trip", "pickupDate": "2032-03-01", "returnDate": "2032-03-02",
     "returnPlan": "end", "hotel": "Old Hotel", "map": "https://maps.example/old", "payment": "USD cash", "phone": "+44 7000 000000", "lang": "en",
     "travellers": [{"first": "SELFTEST-W", "last": "Lead"}, {"first": "SELFTEST-W", "last": "Two"}]}
site(W)
eq(office.ok('booking', id='SELFTEST-W1')['booking']['return_time'] or office.ok('transport', date='2032-03-02')['down'][0]['time'], '3:30 - 4:30 PM', 'back on the day the tour ends: 3:30 - 4:30 PM')
office.ok('booking_save', id='SELFTEST-W1', fields={'return_date': '2032-03-05'})
eq(office.ok('transport', date='2032-03-05')['down'][0]['time'], '10:00 - 10:30 AM', "the website's 'back after the tour' note does not hold the time once the date back moves")
office.ok('booking_save', id='SELFTEST-W1', fields={'transport_remark': 'Driver call at 7 AM'})
eq(office.ok('transport', date='2032-03-05')['down'][0]['time'], '10:00 - 10:30 AM', 'a time inside another remark is not the time back')
office.ok('booking_save', id='SELFTEST-W1', fields={'transport_remark': 'Minivan back 2 PM'})
eq(office.ok('transport', date='2032-03-05')['down'][0]['time'], '2 PM', "the Sheet's 'Minivan back 2 PM' still counts")
office.ok('traveller_save', booking_id='SELFTEST-W1', n=1, fields={'status': 'No-show'})
eq('SELFTEST-W Lead' in office.ok('transport', date='2032-03-01')['up'][0]['team'], False, 'a no-show is not named as the customer in the team message')
office.ok('traveller_save', booking_id='SELFTEST-W1', n=1, fields={'status': ''})
office.ok('booking_save', id='SELFTEST-W1', fields={'accommodation': 'New Hotel'})
up = office.ok('transport', date='2032-03-01')['up'][0]
eq((up['place'], up['map'], sqlval("SELECT maps_link FROM bookings WHERE id='SELFTEST-W1'")), ('New Hotel', '', ''), 'a new hotel without a new map: the old map link is cleared')
X = dict(W, id='SELFTEST-W2', transfer='One way to Luang Prabang', pickupDate='', hotel='', map='', returnPlan='later', returnDate='2032-03-04')
site(X)
office.ok('booking_save', id='SELFTEST-W2', fields={'transfer': 'Round trip', 'pickup_date': '2032-03-01', 'accommodation': 'LP Hostel'})
eq(sorted(set(u['place'] for u in office.ok('transport', date='2032-03-01')['up'] if u['booking_id'] == 'SELFTEST-W2')), ['LP Hostel'], 'one way back made a round trip: the travellers follow the new Luang Prabang hotel')
office.ok('booking_save', id='SELFTEST-W2', fields={'return_date': '2032-03-05'})
eq(office.ok('transport_plate', date='2032-03-05', dir='down', plate='ກກ 1111', time='2 PM')['bookings'], 1, 'a plate for one leaving time only')
eq((sqlval("SELECT vehicle_to_lpb FROM bookings WHERE id='SELFTEST-W1'"), sqlval("SELECT vehicle_to_lpb FROM bookings WHERE id='SELFTEST-W2'")), ('ກກ 1111', ''), 'the other minivan keeps its own plate')
# 0013: tick who rides each minivan; 0014: the coordinator's WhatsApp link in the guest message
eq(office.ok('transport_plate', date='2032-03-01', dir='up', plate='ກຮ 2222', ids=['SELFTEST-W2'])['bookings'], 1, 'a plate for the ticked bookings only')
eq((sqlval("SELECT vehicle_to_nk FROM bookings WHERE id='SELFTEST-W2'"), sqlval("SELECT vehicle_to_nk FROM bookings WHERE id='SELFTEST-W1'")), ('ກຮ 2222', ''), 'the unticked booking keeps no plate')
refused(office.call('transport_plate', date='2032-03-01', dir='up', plate='X', ids=[]), 'saving a plate with nobody ticked')
admin.ok('settings_save', settings={'transport_manager': '+856 20 55200091'})
g = [u for u in office.ok('transport', date='2032-03-01')['up'] if u['booking_id'] == 'SELFTEST-W2'][0]['guest']
eq(("Minivan coordinator's WhatsApp: https://wa.me/8562055200091" in g, 'Minivan plate: ກຮ 2222' in g, g.endswith('Thank you!')), (True, True, True), 'guest message: plate and the coordinator link')
admin.ok('settings_save', settings={'transport_manager': ''})
print(f'all {n} checks passed')
