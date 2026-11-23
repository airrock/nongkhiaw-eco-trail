-- Run by run.sh. Every check raises on failure.
\set admin '11111111-1111-1111-1111-111111111111'
\set office '22222222-2222-2222-2222-222222222222'
\set admin2 '33333333-3333-3333-3333-333333333333'
insert into auth.users values (:'admin', 'admin@test'), (:'office', 'office@test'), (:'admin2', 'a2@test');
insert into staff (id, name, email, role) values (:'admin', 'Test Admin', 'admin@test', 'admin'),
  (:'office', 'Test Office', 'office@test', 'staff');
insert into lunch_menu (dish, choices, price_kip) values ('Fried rice', '{Chicken,Tofu}', 40000), ('Hidden', '{}', 0);
insert into tour_addons (tour, addon, starts_day) values ('102', 'Kayak', 2);
insert into country_aliases values ('netherlands', 'Netherlands');

/* ---------- the website (anon) ---------- */
set role anon;
select t.denied('select 1 from bookings', 'anon reads bookings');
select t.denied('select 1 from travellers', 'anon reads travellers');
select t.denied('select 1 from booking_summary', 'anon reads summary');
select t.denied($$select issue_receipt('SELFTEST-A1')$$, 'anon issues a receipt');
select t.denied($$select add_payment('SELFTEST-A1', 10)$$, 'anon adds a payment');

-- round trip with train drop-off, 3 people, traveller 3 takes no transfer, traveller 2 another place
select t.eq(submit_booking('{"id":"SELFTEST-A1","tour":"102","date":"2030-02-01","transfer":"Round trip",
  "pickupDate":"2030-02-01","returnDate":"2030-02-03","returnPlan":"end","hotel":"Sunset Hostel","map":"https://m/1",
  "train":true,"payment":"USD cash","phone":"+1 555","source":"","lang":"en","private":true,
  "travellers":[{"first":"SELFTEST-Ann","last":"One","nat":"the netherlands","pass":"ab123","food":"Vegan","lunch":"Fried rice","lunchChoice":"Tofu"},
                {"first":"SELFTEST-Bo","last":"Two","pickup":"other","pkPlace":"Villa Maly","pkMap":"https://m/2","lunch":"Hidden"},
                {"name":"SELFTEST-Cy Three","pickup":"none","lunch":"Fried rice","lunchChoice":"Beef"}]}'::jsonb), 'ok', 'booking saved');
-- the same ID again: saved once
select t.eq(submit_booking('{"id":"SELFTEST-A1","tour":"101","travellers":[{"first":"X"}]}'::jsonb), 'ok', 'duplicate answered ok');
-- honeypot filled: nothing saved
select t.eq(submit_booking('{"id":"SELFTEST-BOT","website":"x","tour":"101","travellers":[{"first":"X"}]}'::jsonb), 'ok', 'bot answered ok');
-- one way up, 2 people, no ID sent
select t.eq(submit_booking('{"tour":"101","date":"2030-02-05","transfer":"One way to Nong Khiaw","hotel":"H","travellers":[{"first":"SELFTEST-D"},{"first":"SELFTEST-E"}]}'::jsonb), 'ok', 'booking without id');
-- transport only, one way down, default pickup = office
select t.eq(submit_booking('{"id":"SELFTEST-T0","tour":"T00","transfer":"One way to Luang Prabang","returnDate":"2030-02-07","travellers":[{"first":"SELFTEST-F"}]}'::jsonb), 'ok', 'transport only');
select t.denied($$select submit_booking('{"id":"SELFTEST-NOBODY","tour":"101","travellers":[]}'::jsonb)$$, 'booking without travellers');
select t.eq(submit_inquiry('{"name":"SELFTEST","contact":"c","question":"q"}'::jsonb), 'ok', 'inquiry');
select t.eq((get_config() -> 'prices' ->> '102')::numeric, 60::numeric, 'config price');
select t.eq((get_config() -> 'kip' ->> 'round')::numeric, 500000::numeric, 'config kip');
select t.eq(jsonb_array_length(get_config() -> 'menu'), 1, 'menu hides dishes without a price');
reset role;

select t.eq((select count(*) from bookings), 3::bigint, 'three bookings');
select t.eq((select count(*) from travellers where booking_id = 'SELFTEST-A1'), 3::bigint, 'duplicate did not add travellers');
select t.eq((select est_tour_usd from bookings where id = 'SELFTEST-A1'), 180::numeric, 'tour 102 x 3');
select t.eq((select est_transfer_kip from bookings where id = 'SELFTEST-A1'), 1140000::numeric, '(round 500000 + train 70000) x 2 riders');
select t.eq((select addon_package || '|' || transport_remark || '|' || private_tour from bookings where id = 'SELFTEST-A1'),
  'Kayak|Back after the tour, about 3:30-4:30 PM|true', 'addon, remark, private');
select t.eq((select string_agg(pickup_place, ';' order by n) from travellers where booking_id = 'SELFTEST-A1'),
  'Sunset Hostel;Villa Maly;No transfer', 'pickup places');
select t.eq((select country || '|' || passport_no || '|' || lunch_dish || '|' || lunch_choice from travellers where booking_id = 'SELFTEST-A1' and n = 1),
  'Netherlands|AB123|Fried rice|Tofu', 'traveller 1');
select t.eq((select lunch_dish || '|' || lunch_choice || '|' || lunch_kip from travellers where booking_id = 'SELFTEST-A1' and n = 3),
  'Fried rice||40000', 'unknown choice dropped');
select t.eq((select lunch_kip from travellers where booking_id = 'SELFTEST-A1' and n = 2), 0::numeric, 'unpriced dish ignored');
select t.eq((select est_transfer_kip from bookings where tour = '101'), 500000::numeric, 'one way x 2');
select t.eq((select nk_pickup || '|' || est_transfer_kip || '|' || tour_name from bookings where id = 'SELFTEST-T0'),
  'Office (The Trio Bar & Cafe)|250000|Transport only', 'transport only');
select t.eq((select people || '|' || lead_name || '|' || food || '|' || lunch || '|' || lunch_kip || '|' || pickups from booking_summary where id = 'SELFTEST-A1'),
  '3|SELFTEST-Ann One|Vegan 1, Regular 2|Fried rice (Tofu) 1; Fried rice 1|80000|Sunset Hostel: 1; Villa Maly: 2; No transfer: 3', 'summary');

/* ---------- office staff ---------- */
set role authenticated;
select t.as_user(:'office');
select t.eq((select count(*) from bookings), 3::bigint, 'staff sees bookings');
select t.eq((issue_receipt('SELFTEST-A1', 'fr')).no, '000001', 'first receipt');
select t.eq((issue_receipt('SELFTEST-A1', '')).no, '000001', 'same booking keeps its number');
select t.eq((issue_receipt('SELFTEST-T0')).no, '000002', 'next number');
select t.eq((select language || '|' || total_usd || '|' || total_kip || '|' || issued_by from receipts where no = '000001'),
  'fr|234.22|5270000|Test Office', 'receipt totals: 180 + (1140000 + 80000) / 22500');
select t.eq((add_payment('SELFTEST-A1', 100, 'USD', 'USD cash')).amount_usd, 100::numeric, 'deposit');
select t.eq((select status from bookings where id = 'SELFTEST-A1'), 'Requested', 'deposit does not mark Paid');
select t.eq((add_payment('SELFTEST-A1', 3020000, 'LAK', 'Kip cash')).amount_usd, 134.22::numeric, 'kip converted at the rate');
select t.eq((select status from bookings where id = 'SELFTEST-A1'), 'Paid', 'paid in full marks Paid');
select t.eq((select balance_usd from booking_totals('SELFTEST-A1')), 0::numeric, 'balance');
update bookings set staff_notes = 'called' where id = 'SELFTEST-A1';
update travellers set food = 'Halal' where booking_id = 'SELFTEST-A1' and n = 2;
update receipts set overrides = '{"pickup":"7:00"}' where no = '000001';
update agreements set staff_checked = true where false;
select t.denied($$select delete_booking('SELFTEST-A1')$$, 'staff deletes a booking');
select t.denied($$update bookings set deleted_at = now() where id = 'SELFTEST-A1'$$, 'staff sets deleted_at');
select t.refused($$delete from bookings where id = 'SELFTEST-A1'$$, 'staff erases a booking');
select t.refused($$update payments set amount_usd = 1$$, 'staff edits a payment');
select t.refused($$delete from payments$$, 'staff removes a payment');
select t.denied($$insert into payments (booking_id, amount, kip_per_usd, amount_usd) values ('SELFTEST-A1', 1, 1, 1)$$, 'staff inserts a payment directly');
select t.denied($$update receipts set no = '999999' where no = '000001'$$, 'staff renumbers a receipt');
select t.denied($$update receipts set total_usd = 1 where no = '000001'$$, 'staff edits receipt totals');
select t.refused($$update settings set value = '1' where key = 'kip_per_usd'$$, 'staff changes a setting');
select t.refused($$update tours set price_usd = 1$$, 'staff changes a price');
select t.denied($$insert into lunch_menu (dish) values ('x')$$, 'staff adds a dish');
select t.refused($$update staff set role = 'admin' where id = auth.uid()$$, 'staff makes itself admin');
select t.denied($$insert into staff (id, name, email) values ('33333333-3333-3333-3333-333333333333', 'x', 'x')$$, 'staff adds a user');
select t.eq((select count(*) from tour_accounts), 0::bigint, 'staff sees no tour accounts');
select t.eq((select count(*) from settings where key = 'kip_per_usd'), 1::bigint, 'staff can read settings');
select password_changed();

/* ---------- admin ---------- */
select t.as_user(:'admin');
update settings set value = '23000' where key = 'kip_per_usd';
select t.eq((select amount_usd from payments where currency = 'LAK'), 134.22::numeric, 'old payment keeps its rate');
update settings set value = '22500' where key = 'kip_per_usd';
update tours set price_usd = 65 where code = '102';
update tours set price_usd = 60 where code = '102';
update payments set note = 'checked' where currency = 'LAK';
delete from payments where currency = 'LAK';
select t.eq((select status from bookings where id = 'SELFTEST-A1'), 'Confirmed', 'no longer paid in full');
select delete_booking('SELFTEST-T0');
select t.eq((select count(*) from bookings), 3::bigint, 'admin still sees a deleted booking');
insert into tour_accounts (tour_date, tour) values ('2030-02-01', '102');
update staff set role = 'admin' where id = :'office';
update staff set role = 'staff' where id = :'office';
select t.denied($$update staff set role = 'staff' where id = auth.uid()$$, 'last admin demotes itself');
select t.denied($$update staff set active = false where id = auth.uid()$$, 'last admin deactivates itself');

/* ---------- office staff again: deleted booking is gone for them ---------- */
select t.as_user(:'office');
select t.eq((select count(*) from bookings), 2::bigint, 'staff does not see a deleted booking');
select t.eq((select must_change_password from staff where id = auth.uid()), false, 'password flag cleared');
select t.denied($$select restore_booking('SELFTEST-T0')$$, 'staff restores a booking');
reset role;
select t.as_user('');

/* ---------- agreement and lunch links ---------- */
select form_key as k1 from receipts where no = '000001' \gset
select form_key as k2 from receipts where no = '000002' \gset
set role anon;
select t.eq(get_agreement('0123456789abcdef') ->> 'error', 'invalid', 'bad key');
select t.eq(get_agreement(:'k2') ->> 'error', 'invalid', 'key of a deleted booking');
select t.eq(jsonb_array_length(get_agreement(:'k1') -> 'travellers'), 3, 'agreement lists travellers');
select t.eq(get_agreement(:'k1') ->> 'date', '01/02/2030', 'agreement date');
select t.eq((submit_agreement(jsonb_build_object('key', :'k1', 'lang', 'en', 'people', '[
  {"n":1,"photo":"yes","medical":"none","ecName":"C","ecPhone":"+1","signedName":"Ann One","accept":true},
  {"n":2,"photo":"no","ecName":"","ecPhone":"","signedName":"Bo Two","accept":true},
  {"n":3,"photo":"no","ecName":"C","ecPhone":"+1","signedName":"Cy Three","accept":false}]'::jsonb)) ->> 'saved')::int, 1, 'only the complete one is saved');
select t.eq((submit_agreement(jsonb_build_object('key', :'k1', 'people', '[{"n":1,"photo":"no","ecName":"C","ecPhone":"+1","signedName":"Ann One","accept":true}]'::jsonb)) ->> 'saved')::int, 0, 'signs once');
select t.eq(get_agreement(:'k1') -> 'signed', '[1]'::jsonb, 'signed list');
select t.denied($$select submit_agreement('{"key":"0123456789abcdef","people":[]}'::jsonb)$$, 'agreement with a bad key');
select t.eq((submit_lunch(jsonb_build_object('key', :'k1', 'people', '[{"n":2,"lunch":"Fried rice","choice":"Chicken"},{"n":3,"lunch":""},{"n":9,"lunch":"Fried rice"}]'::jsonb)) ->> 'saved')::int, 2, 'lunch saved for travellers 2 and 3');
select t.eq(get_lunch(:'k1') -> 'travellers' -> 1 ->> 'choice', 'Chicken', 'lunch read back');
reset role;
select t.eq((select lunch_kip from booking_summary where id = 'SELFTEST-A1'), 80000::numeric, 'lunch total after the change');
select t.eq((select photo_permission::text || '|' || form_version from agreements), 'true|v1 2026-10-11', 'agreement row');

/* ---------- change log ---------- */
select t.eq((select user_name from change_log where table_name = 'bookings' and row_id = 'SELFTEST-A1' and new ? 'staff_notes'), 'Test Office', 'log names the user');
select t.eq((select old ->> 'food' || '>' || (new ->> 'food') from change_log where table_name = 'travellers' and row_id = 'SELFTEST-A1 #2' and action = 'update' and new ? 'food'), '>Halal', 'log keeps only what changed');
select t.eq((select count(*) from change_log where table_name = 'payments' and action = 'delete'), 1::bigint, 'removed payment is logged');
