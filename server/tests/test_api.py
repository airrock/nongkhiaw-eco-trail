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
    "TRUNCATE change_log; TRUNCATE users; TRUNCATE lunch_menu; TRUNCATE country_aliases; TRUNCATE tour_addons; SET FOREIGN_KEY_CHECKS=1;"
    "UPDATE settings SET value='1' WHERE `key`='receipt_next'; UPDATE settings SET value='22500' WHERE `key`='kip_per_usd';"
    "INSERT INTO lunch_menu (dish, choices, price_kip) VALUES ('Fried rice','Chicken, Tofu',40000),('Hidden','',0);"
    "INSERT INTO tour_addons VALUES ('102','Kayak',2); INSERT INTO country_aliases VALUES ('netherlands','Netherlands');")
make_admin('Test Admin', 'admin@test.local', 'admin-pass-1')

# ---------- the website ----------
A1 = {"type": "booking", "id": "SELFTEST-A1", "tour": "102", "date": "2030-02-01", "transfer": "Round trip", "pickupDate": "2030-02-01",
      "returnDate": "2030-02-03", "returnPlan": "end", "hotel": "Sunset Hostel", "map": "https://m/1", "train": True, "payment": "USD cash",
      "phone": "+1 555", "lang": "en", "private": True, "travellers": [
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
eq(office.ok('payment_add', booking_id='SELFTEST-A1', amount=100, currency='USD', method='USD cash')['booking']['status'], 'Requested', 'deposit does not mark Paid')
b = office.ok('payment_add', booking_id='SELFTEST-A1', amount=3020000, currency='LAK', method='Kip cash')
eq((b['booking']['status'], b['totals']['balance_usd'], float(b['payments'][1]['amount_usd'])), ('Paid', 0, 134.22), 'kip converted, paid in full marks Paid')
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

# ---------- change log ----------
hist = admin.ok('history', id='SELFTEST-A1')['history']
eq(any(h['user_name'] == 'Test Office' and h['new_values'] and 'staff_notes' in h['new_values'] for h in hist), True, 'log names the user')
eq(any(h['row_id'] == 'SELFTEST-A1 #2' and h['new_values'] == '{"food":"Halal"}' for h in hist), True, 'log keeps only what changed')
print(f'all {n} checks passed')
