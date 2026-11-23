-- Rules ported from apps-script/Code.gs. Functions the website calls are SECURITY DEFINER and are the only
-- things the public (anon) role may run; see 0003_access.sql.

create function setting_num(k text, fallback numeric) returns numeric
language sql stable set search_path = public as $$
  select coalesce((select nullif(value #>> '{}', '')::numeric from settings where key = k), fallback)
$$;

create function setting_text(k text) returns text
language sql stable set search_path = public as $$
  select coalesce((select value #>> '{}' from settings where key = k), '')
$$;

-- clean_(): trimmed, cut to max characters.
create function clean(v text, max int) returns text
language sql immutable as $$ select left(btrim(coalesce(v, '')), max) $$;

create function to_date_safe(s text) returns date
language plpgsql immutable as $$
begin
  if s ~ '^\d{4}-\d{2}-\d{2}$' then return s::date; end if;
  return null;
exception when others then return null;
end $$;

create function country_name(raw text) returns text
language sql stable set search_path = public as $$
  with s as (select clean(raw, 60) as v),
       k as (select regexp_replace(regexp_replace(lower(v), '\s+', ' ', 'g'), '^(the|from)\s+', '') as key, v from s)
  select coalesce((select name from country_aliases a where a.alias = k.key),
                  case when k.v = '' then 'Not given' else upper(left(k.v, 1)) || substr(k.v, 2) end)
  from k
$$;

create function goes_up(transfer text) returns boolean
language sql immutable as $$
  select transfer ~* 'round' or (transfer ~* 'one way' and transfer !~* 'luang prabang')
$$;
create function goes_down(transfer text) returns boolean
language sql immutable as $$ select transfer ~* 'round' or transfer ~* 'to luang prabang' $$;

-- Transfer amount in kip: (one way or round trip, plus the train extra on the way back) x riders.
create function transfer_kip(p_transfer text, p_train boolean, p_riders int) returns numeric
language sql stable set search_path = public as $$
  select (case (goes_up(p_transfer)::int + goes_down(p_transfer)::int)
            when 2 then setting_num('transfer_round_kip', 2 * setting_num('transfer_one_kip', 250000))
            when 1 then setting_num('transfer_one_kip', 250000)
            else 0 end
          + case when p_train and goes_down(p_transfer) then setting_num('train_extra_kip', 70000) else 0 end)
         * p_riders
$$;

create function riders(p_booking text) returns int
language sql stable set search_path = public as $$
  select count(*)::int from travellers
  where booking_id = p_booking and pickup_place <> 'No transfer'
$$;

-- What the Sheet kept as columns of Bookings.
create view booking_summary with (security_invoker = true) as
select b.id,
  (select count(*) from travellers t where t.booking_id = b.id)::int as people,
  coalesce((select t.full_name from travellers t where t.booking_id = b.id order by t.n limit 1), '') as lead_name,
  coalesce((select string_agg(t.full_name, ', ' order by t.n) from travellers t where t.booking_id = b.id), '') as traveller_names,
  coalesce((select string_agg(c, ', ' order by first_n) from (select t.country as c, min(t.n) as first_n from travellers t
            where t.booking_id = b.id and t.country <> '' group by t.country) x), '') as countries,
  coalesce((select string_agg(f || ' ' || k, ', ' order by first_n) from (select coalesce(nullif(t.food, ''), 'Regular') as f,
            count(*) as k, min(t.n) as first_n from travellers t where t.booking_id = b.id group by 1) x), '') as food,
  coalesce((select string_agg(dish || ' ' || k, '; ' order by first_n) from (
            select t.lunch_dish || case when t.lunch_choice <> '' then ' (' || t.lunch_choice || ')' else '' end as dish,
            count(*) as k, min(t.n) as first_n from travellers t
            where t.booking_id = b.id and t.lunch_dish <> '' group by 1) x), '') as lunch,
  coalesce((select sum(t.lunch_kip) from travellers t where t.booking_id = b.id), 0) as lunch_kip,
  coalesce((select string_agg(place || ': ' || nums, '; ' order by first_n) from (
            select t.pickup_place as place, string_agg(t.n::text, ', ' order by t.n) as nums, min(t.n) as first_n
            from travellers t where t.booking_id = b.id and t.pickup_place <> ''
            group by t.pickup_place, t.pickup_map) x), '') as pickups,
  (select r.no from receipts r where r.booking_id = b.id) as receipt_no
from bookings b;

-- Totals of a booking: tour in USD, transport and lunch in kip, paid from the payments.
create function booking_totals(p_booking text)
returns table (tour_usd numeric, transfer_kip numeric, lunch_kip numeric, rate numeric,
               total_usd numeric, total_kip numeric, paid_usd numeric, balance_usd numeric)
language sql stable set search_path = public as $$
  with b as (select * from bookings where id = p_booking),
       r as (select setting_num('kip_per_usd', 22500) as rate),
       l as (select coalesce(sum(lunch_kip), 0) as kip from travellers where booking_id = p_booking),
       p as (select coalesce(sum(amount_usd), 0) as usd from payments where booking_id = p_booking),
       t as (select b.est_tour_usd as tour_usd, b.est_transfer_kip as transfer_kip, l.kip as lunch_kip, r.rate,
                    round(b.est_tour_usd + (b.est_transfer_kip + l.kip) / r.rate, 2) as total_usd,
                    round(b.est_tour_usd * r.rate) + b.est_transfer_kip + l.kip as total_kip, p.usd as paid_usd
             from b, r, l, p)
  select tour_usd, transfer_kip, lunch_kip, rate, total_usd, total_kip, paid_usd, total_usd - paid_usd from t
$$;

/* ---------- website: booking ---------- */

-- d: the JSON the booking form sends (see js/main.js). Returns 'ok'. A booking ID sent twice is saved once.
create function submit_booking(d jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  people jsonb; p jsonb; i int; k int;
  v_tour text; v_name text; v_price numeric; v_transfer text; up boolean; down boolean; legs int;
  v_hotel text; v_map text; v_nk text; v_train boolean; v_id text; v_riders int := 0;
  v_mode text; v_place text; v_pmap text; v_first text; v_last text; v_full text;
  v_dish text; v_choice text; v_kip numeric; m lunch_menu;
begin
  if coalesce(d ->> 'website', '') <> '' then return 'ok'; end if;   -- honeypot field: only bots fill it
  if jsonb_typeof(d -> 'travellers') <> 'array' or jsonb_array_length(d -> 'travellers') = 0 then
    raise exception 'booking without travellers';
  end if;
  select jsonb_agg(x order by ord) into people
    from jsonb_array_elements(d -> 'travellers') with ordinality as t (x, ord) where ord <= 30;
  k := jsonb_array_length(people);

  v_tour := clean(d ->> 'tour', 5);
  if v_tour = 'T00' then v_name := 'Transport only'; v_price := 0;
  else
    select name, price_usd into v_name, v_price from tours where code = v_tour;
    if not found then v_name := v_tour; v_price := 0; end if;
  end if;
  v_transfer := coalesce(nullif(clean(d ->> 'transfer', 40), ''), 'No');
  up := goes_up(v_transfer); down := goes_down(v_transfer); legs := up::int + down::int;
  v_hotel := clean(d ->> 'hotel', 120); v_map := clean(d ->> 'map', 300);
  v_nk := coalesce(nullif(clean(d ->> 'nkPickup', 120), ''), case when not up then nullif(v_hotel, '') end,
                   setting_text('nk_office'));
  v_train := down and coalesce((d -> 'train') = 'true'::jsonb, false);

  v_id := clean(d ->> 'id', 20);
  if v_id !~ '^[A-Za-z0-9-]{4,20}$' then
    v_id := 'NK' || to_char(now() at time zone 'Asia/Vientiane', 'YYMMDDHH24MISS');
  end if;
  if exists (select 1 from bookings where id = v_id) then return 'ok'; end if;   -- sent twice

  insert into bookings (id, tour_date, tour, tour_name, transfer, pickup_date, return_date, train_dropoff,
      accommodation, maps_link, nk_pickup, payment_method, whatsapp, source, referrer, site_language, note,
      est_tour_usd, addon_package, private_tour, transport_remark)
  values (v_id, to_date_safe(d ->> 'date'), v_tour, v_name, v_transfer,
      case when up then to_date_safe(d ->> 'pickupDate') end, case when down then to_date_safe(d ->> 'returnDate') end,
      v_train, case when up then v_hotel else '' end, case when up then v_map else '' end,
      case when down then v_nk else '' end, clean(d ->> 'payment', 40), clean(d ->> 'phone', 40),
      coalesce(nullif(clean(d ->> 'source', 40), ''), 'Not given'), clean(d ->> 'referrer', 120),
      clean(d ->> 'lang', 5), clean(d ->> 'note', 1000), v_price * k,
      coalesce((select addon from tour_addons where tour = v_tour), ''), coalesce((d -> 'private') = 'true'::jsonb, false),
      case d ->> 'returnPlan' when 'end' then 'Back after the tour, about 3:30-4:30 PM'
                              when 'later' then 'Back on another day, minivan about 10:30 AM' else '' end);

  for i in 0 .. k - 1 loop
    p := people -> i;
    v_first := clean(p ->> 'first', 60); v_last := clean(p ->> 'last', 60);
    v_full := case when v_first <> '' or v_last <> '' then btrim(v_first || ' ' || v_last) else clean(p ->> 'name', 80) end;
    -- the group's pickup place (default), the traveller's own place, or no transfer
    v_mode := case when legs = 0 then 'none'
                   when i > 0 and p ->> 'pickup' in ('other', 'none') then p ->> 'pickup' else 'same' end;
    if v_mode = 'other' and clean(p ->> 'pkPlace', 120) = '' then v_mode := 'same'; end if;
    v_place := case v_mode when 'none' then case when legs = 0 then '' else 'No transfer' end
                           when 'other' then clean(p ->> 'pkPlace', 120)
                           else case when up then v_hotel else v_nk end end;
    v_pmap := case v_mode when 'none' then '' when 'other' then clean(p ->> 'pkMap', 300) else v_map end;
    if v_mode <> 'none' then v_riders := v_riders + 1; end if;
    -- lunch is priced here from the menu: the page's numbers are never trusted
    v_dish := clean(p ->> 'lunch', 80); v_choice := ''; v_kip := 0;
    select * into m from lunch_menu where dish = v_dish and price_kip > 0;
    if found and v_dish <> '' then
      v_kip := m.price_kip;
      if clean(p ->> 'lunchChoice', 40) = any (m.choices) then v_choice := clean(p ->> 'lunchChoice', 40); end if;
    else v_dish := '';
    end if;
    insert into travellers (booking_id, n, first_name, last_name, full_name, country, gender, passport_no,
        passport_issued, passport_expires, food, pickup_place, pickup_map, lunch_dish, lunch_choice, lunch_kip)
    values (v_id, i + 1, v_first, v_last, v_full, country_name(p ->> 'nat'), clean(p ->> 'gender', 10),
        upper(clean(p ->> 'pass', 40)), clean(p ->> 'issued', 10), clean(p ->> 'expires', 10), clean(p ->> 'food', 20),
        v_place, v_pmap, v_dish, v_choice, v_kip);
  end loop;

  update bookings set est_transfer_kip = transfer_kip(v_transfer, v_train, v_riders) where id = v_id;
  return 'ok';
end $$;

create function submit_inquiry(d jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(d ->> 'website', '') <> '' then return 'ok'; end if;
  insert into inquiries (name, contact, tour, question, source, referrer, site_language)
  values (clean(d ->> 'name', 80), clean(d ->> 'contact', 120), clean(d ->> 'tour', 20), clean(d ->> 'question', 2000),
          coalesce(nullif(clean(d ->> 'source', 40), ''), 'Not given'), clean(d ->> 'referrer', 120), clean(d ->> 'lang', 5));
  return 'ok';
end $$;

/* ---------- website: config and reviews ---------- */

create function lunch_menu_json() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('group', grp, 'dish', dish, 'price', price_kip, 'choices', to_jsonb(choices))
                            order by sort, id), '[]')
  from lunch_menu where show and dish <> '' and price_kip > 0
$$;

create function get_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'content', coalesce((select jsonb_object_agg(lang, texts) from
        (select lang, jsonb_object_agg(key, value) as texts from content where btrim(value) <> '' group by lang) c), '{}'),
    'prices', coalesce((select jsonb_object_agg(code, price_usd) from tours where price_usd > 0), '{}'),
    'kip', jsonb_build_object('one', setting_num('transfer_one_kip', 250000),
                              'round', setting_num('transfer_round_kip', 500000),
                              'train', setting_num('train_extra_kip', 70000)),
    'menu', lunch_menu_json())
$$;

create function get_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'text', review) order by review_date desc nulls last, id), '[]')
  from (select btrim(name) as name, btrim(review) as review, review_date, id from reviews
        where show and btrim(review) <> '' order by review_date desc nulls last, id limit 8) r
$$;

/* ---------- website: agreement form and lunch page (private link code = receipts.form_key) ---------- */

create function key_booking(p_key text) returns receipts
language sql stable set search_path = public as $$
  select r from receipts r join bookings b on b.id = r.booking_id
  where r.form_key = p_key and p_key ~ '^[a-f0-9]{16}$' and b.deleted_at is null
$$;

create function get_agreement(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r receipts; b bookings;
begin
  r := key_booking(p_key);
  if r.no is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into b from bookings where id = r.booking_id;
  return jsonb_build_object('receipt', r.no, 'date', coalesce(to_char(b.tour_date, 'DD/MM/YYYY'), ''),
    'tour', b.tour, 'tourName', b.tour_name,
    'travellers', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'first', first_name, 'last', last_name,
        'full', full_name, 'gender', gender, 'nat', country, 'pass', passport_no, 'issued', passport_issued,
        'expires', passport_expires) order by n) from travellers where booking_id = b.id), '[]'),
    'signed', coalesce((select jsonb_agg(n order by n) from agreements where booking_id = b.id), '[]'));
end $$;

-- d: { key, lang, people: [{ n, photo, medical, ecName, ecPhone, insurance, signedName, accept }] }
create function submit_agreement(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r receipts; p jsonb; t travellers; saved int := 0;
begin
  if coalesce(d ->> 'website', '') <> '' then return jsonb_build_object('saved', 0); end if;
  r := key_booking(d ->> 'key');
  if r.no is null then raise exception 'agreement: bad key'; end if;
  for p in select * from jsonb_array_elements(case when jsonb_typeof(d -> 'people') = 'array' then d -> 'people' else '[]' end) loop
    select * into t from travellers where booking_id = r.booking_id and n = (p ->> 'n')::int;
    continue when not found;
    continue when exists (select 1 from agreements where booking_id = r.booking_id and n = t.n);   -- each traveller signs once
    continue when (p -> 'accept') is distinct from 'true'::jsonb or coalesce(p ->> 'photo', '') not in ('yes', 'no')
      or length(clean(p ->> 'signedName', 80)) < 2 or clean(p ->> 'ecName', 80) = '' or clean(p ->> 'ecPhone', 40) = '';
    insert into agreements (booking_id, n, full_name, gender, nationality, passport_no, photo_permission, medical,
        ec_name, ec_phone, insurance, signed_name, language, form_version)
    values (r.booking_id, t.n, t.full_name, t.gender, t.country, t.passport_no, p ->> 'photo' = 'yes',
        clean(p ->> 'medical', 500), clean(p ->> 'ecName', 80), clean(p ->> 'ecPhone', 40), clean(p ->> 'insurance', 60),
        clean(p ->> 'signedName', 80), clean(d ->> 'lang', 5), setting_text('agreement_version'));
    saved := saved + 1;
  end loop;
  return jsonb_build_object('saved', saved);
end $$;

create function get_lunch(p_key text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r receipts; b bookings;
begin
  r := key_booking(p_key);
  if r.no is null then return jsonb_build_object('error', 'invalid'); end if;
  select * into b from bookings where id = r.booking_id;
  return jsonb_build_object('date', coalesce(to_char(b.tour_date, 'DD/MM/YYYY'), ''), 'tour', b.tour, 'tourName', b.tour_name,
    'menu', lunch_menu_json(),
    'travellers', coalesce((select jsonb_agg(jsonb_build_object('n', n, 'first', coalesce(nullif(first_name, ''), full_name),
        'lunch', lunch_dish, 'choice', lunch_choice) order by n)
        from travellers where booking_id = b.id and status <> 'Cancelled'), '[]'));
end $$;

-- d: { key, people: [{ n, lunch, choice }] }; a dish not on the menu (or empty) clears the order.
create function submit_lunch(d jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r receipts; p jsonb; m lunch_menu; saved int := 0; hit int;
begin
  if coalesce(d ->> 'website', '') <> '' then return jsonb_build_object('saved', 0); end if;
  r := key_booking(d ->> 'key');
  if r.no is null then raise exception 'lunch: bad key'; end if;
  for p in select x from jsonb_array_elements(case when jsonb_typeof(d -> 'people') = 'array' then d -> 'people' else '[]' end)
           with ordinality as t (x, ord) where ord <= 30 loop
    select * into m from lunch_menu where dish = clean(p ->> 'lunch', 80) and dish <> '' and price_kip > 0;
    if found then
      update travellers set lunch_dish = m.dish, lunch_kip = m.price_kip,
        lunch_choice = case when clean(p ->> 'choice', 40) = any (m.choices) then clean(p ->> 'choice', 40) else '' end
      where booking_id = r.booking_id and n = (p ->> 'n')::int;
    else
      update travellers set lunch_dish = '', lunch_choice = '', lunch_kip = 0
      where booking_id = r.booking_id and n = (p ->> 'n')::int;
    end if;
    get diagnostics hit = row_count;
    saved := saved + hit;
  end loop;
  return jsonb_build_object('saved', saved);
end $$;

/* ---------- staff: receipts, payments, deleting ---------- */

create function staff_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from staff where id = auth.uid()), '')
$$;
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active)
$$;
create function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where id = auth.uid() and active and role = 'admin')
$$;

-- Gives the booking its receipt number (once) and stores the totals of the day. A booking never gets two numbers.
create function issue_receipt(p_booking text, p_language text default 'en') returns receipts
language plpgsql security definer set search_path = public as $$
declare r receipts; t record;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  perform 1 from bookings where id = p_booking and deleted_at is null for update;
  if not found then raise exception 'no booking %', p_booking; end if;
  select * into t from booking_totals(p_booking);
  select * into r from receipts where booking_id = p_booking;
  if found then
    update receipts set total_usd = t.total_usd, total_kip = t.total_kip, deposit_usd = t.paid_usd,
      balance_usd = t.balance_usd, language = coalesce(nullif(p_language, ''), language)
    where no = r.no returning * into r;
    return r;
  end if;
  insert into receipts (no, booking_id, language, total_usd, total_kip, deposit_usd, balance_usd, issued_by, form_key)
  values (lpad(nextval('receipt_seq')::text, 6, '0'), p_booking, coalesce(nullif(p_language, ''), 'en'),
          t.total_usd, t.total_kip, t.paid_usd, t.balance_usd, staff_name(),
          substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  returning * into r;
  return r;
end $$;

-- Records money received; the rate of the day is kept with it.
create function add_payment(p_booking text, p_amount numeric, p_currency text default 'USD', p_method text default '',
                            p_note text default '', p_paid_on date default null) returns payments
language plpgsql security definer set search_path = public as $$
declare v_rate numeric := setting_num('kip_per_usd', 22500); v_row payments;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  if p_currency not in ('USD', 'LAK') then raise exception 'currency must be USD or LAK'; end if;
  perform 1 from bookings where id = p_booking and deleted_at is null;
  if not found then raise exception 'no booking %', p_booking; end if;
  insert into payments (booking_id, paid_on, amount, currency, kip_per_usd, amount_usd, method, note, taken_by, taken_by_name)
  values (p_booking, coalesce(p_paid_on, (now() at time zone 'Asia/Vientiane')::date), p_amount, p_currency, v_rate,
          case p_currency when 'USD' then p_amount else round(p_amount / v_rate, 2) end,
          clean(p_method, 40), clean(p_note, 300), auth.uid(), staff_name())
  returning * into v_row;
  return v_row;
end $$;

-- After any change of payments: a booking paid in full becomes Paid; one no longer paid in full goes back to Confirmed.
create function payments_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text := coalesce(new.booking_id, old.booking_id); t record;
begin
  select * into t from booking_totals(v_id);
  if t.total_usd > 0 and t.balance_usd <= 0.005 then
    update bookings set status = 'Paid' where id = v_id and status in ('Requested', 'Confirmed');
  else
    update bookings set status = 'Confirmed' where id = v_id and status = 'Paid';
  end if;
  return null;
end $$;
create trigger payments_status after insert or update or delete on payments
  for each row execute function payments_status();

-- Admin only: hides a booking (kept, with who and when); restore brings it back.
create function delete_booking(p_booking text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'only an admin can delete a booking'; end if;
  update bookings set deleted_at = now(), deleted_by = auth.uid() where id = p_booking and deleted_at is null;
end $$;
create function restore_booking(p_booking text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'only an admin can restore a booking'; end if;
  update bookings set deleted_at = null, deleted_by = null where id = p_booking;
end $$;

-- Recomputes the transfer amount of a booking at today's prices (after Transfer, train drop-off or riders change).
create function recalc_transfer(p_booking text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if not is_staff() then raise exception 'not allowed'; end if;
  update bookings b set est_transfer_kip = transfer_kip(b.transfer, b.train_dropoff, riders(b.id))
  where b.id = p_booking returning est_transfer_kip into v;
  return v;
end $$;
