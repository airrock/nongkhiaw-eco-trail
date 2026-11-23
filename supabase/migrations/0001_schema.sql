-- Nong Khiaw Eco-Trail: booking database (replaces the Google Sheet "Report" and apps-script/Code.gs).
-- Each fact is stored once. Summaries the Sheet kept as columns (people, lead name, food, pickups, lunch text)
-- are computed in the view booking_summary. Rules are in 0002_functions.sql, access in 0003_access.sql.

create table staff (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'staff' check (role in ('admin', 'staff')),   -- staff = office staff
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per setting; value is a number, a string or an object.
create table settings (
  key text primary key,
  value jsonb not null
);
insert into settings (key, value) values
  ('transfer_one_kip', '250000'),      -- per rider, one way (a legal minimum, 2026-10-18)
  ('transfer_round_kip', '500000'),
  ('train_extra_kip', '70000'),        -- per rider, train station drop-off on the way back
  ('kip_per_usd', '22500'),
  ('nk_office', '"Office (The Trio Bar & Cafe)"'),
  ('business_name', '"Nong Khiaw Eco-Trail"'),
  ('business_address', '""'),
  ('business_contact', '""'),
  ('logo_url', '""'),
  ('transport_manager', '""'),
  ('agreement_version', '"v1 2026-10-11"');

create table tours (
  code text primary key,               -- '101', '001'; 'T00' = transport only (not a row here)
  name text not null,
  price_usd numeric(10, 2) not null default 0,   -- per person
  sort int not null default 0
);
insert into tours (code, name, price_usd, sort) values
  ('101', 'Overnight camping above the clouds', 30, 1),
  ('102', '2 days 1 night', 60, 2),
  ('103', '3 days 2 nights', 90, 3),
  ('001', '1-day boat trip', 30, 4);

create table tour_days (
  tour text not null references tours (code) on update cascade on delete cascade,
  day int not null,
  plan text not null default '',
  primary key (tour, day)
);
create table tour_addons (
  tour text primary key references tours (code) on update cascade on delete cascade,
  addon text not null,
  starts_day int
);
create table tour_costs (
  id bigint generated always as identity primary key,
  tour text not null references tours (code) on update cascade on delete cascade,
  item text not null,
  unit_kip numeric(14, 0) not null default 0,
  counted_per text not null default 'group',   -- 'group', 'person' or 'N people'
  qty numeric(10, 2) not null default 1
);

create table lunch_menu (
  id bigint generated always as identity primary key,
  show boolean not null default true,
  grp text not null default '',
  dish text not null unique,
  choices text[] not null default '{}',
  price_kip numeric(14, 0) not null default 0,
  sort int not null default 0
);

-- Country spellings guests type -> the name we store (filled by the import from COUNTRY_INDEX).
create table country_aliases (
  alias text primary key,              -- lower case, single spaces
  name text not null
);

create table bookings (
  id text primary key check (id ~ '^[A-Za-z0-9-]{4,20}$'),
  submitted_at timestamptz not null default now(),
  tour_date date,
  tour text not null default '',       -- tour code as sent; 'T00' = transport only
  tour_name text not null default '',  -- name on the day it was saved
  transfer text not null default 'No',
  pickup_date date,                    -- from Luang Prabang
  return_date date,
  train_dropoff boolean not null default false,
  accommodation text not null default '',
  maps_link text not null default '',
  nk_pickup text not null default '',  -- pickup place in Nong Khiaw for the way back
  payment_method text not null default '',
  source text not null default '',
  referrer text not null default '',
  site_language text not null default '',
  note text not null default '',
  est_tour_usd numeric(12, 2) not null default 0,
  est_transfer_kip numeric(14, 0) not null default 0,
  status text not null default 'Requested'
    check (status in ('Requested', 'Confirmed', 'Paid', 'Cancelled', 'No-show')),
  staff_notes text not null default '',
  whatsapp text not null default '',
  vehicle_to_nk text not null default '',
  vehicle_to_lpb text not null default '',
  transport_remark text not null default '',
  pickup_time text not null default '',
  return_time text not null default '',
  viewpoint text not null default '',
  addon_package text not null default '',
  private_tour boolean not null default false,
  deleted_at timestamptz,              -- set by an admin: hidden, not erased
  deleted_by uuid
);
create index on bookings (tour_date);
create index on bookings (pickup_date);
create index on bookings (return_date);

create table travellers (
  id bigint generated always as identity primary key,
  booking_id text not null references bookings (id) on update cascade on delete cascade,
  n int not null,                      -- traveller number inside the booking, from 1
  first_name text not null default '',
  last_name text not null default '',
  full_name text not null default '',
  country text not null default '',
  gender text not null default '',
  passport_no text not null default '',
  passport_issued text not null default '',   -- text: guests and old rows give partial dates
  passport_expires text not null default '',
  food text not null default '',
  pickup_place text not null default '',      -- 'No transfer' = does not ride
  pickup_map text not null default '',
  lunch_dish text not null default '',
  lunch_choice text not null default '',
  lunch_kip numeric(14, 0) not null default 0,
  status text not null default '' check (status in ('', 'Cancelled', 'No-show')),
  whatsapp text not null default '',
  unique (booking_id, n)
);

-- Money received. Replaces the single "Amount paid USD" cell.
create table payments (
  id bigint generated always as identity primary key,
  booking_id text not null references bookings (id) on update cascade on delete cascade,
  paid_on date not null default (now() at time zone 'Asia/Vientiane')::date,
  amount numeric(14, 2) not null check (amount <> 0),
  currency text not null default 'USD' check (currency in ('USD', 'LAK')),
  kip_per_usd numeric(12, 2) not null,         -- rate on the day, so amount_usd never changes later
  amount_usd numeric(12, 2) not null,
  method text not null default '',
  note text not null default '',
  taken_by uuid,
  taken_by_name text not null default '',
  created_at timestamptz not null default now()
);
create index on payments (booking_id);

create sequence receipt_seq;           -- set past the highest imported number by the import

create table receipts (
  no text primary key,                 -- '000086'
  issued_on date not null default (now() at time zone 'Asia/Vientiane')::date,
  booking_id text unique references bookings (id) on update cascade on delete set null,
  legacy_booking_id text not null default '',  -- the ID in the Sheet's log when it is in no booking
  language text not null default 'en',
  total_usd numeric(12, 2) not null default 0,
  total_kip numeric(14, 0) not null default 0,
  deposit_usd numeric(12, 2) not null default 0,
  balance_usd numeric(12, 2) not null default 0,
  issued_by text not null default '',
  earlier boolean not null default false,      -- a number the booking already had (paper receipts): outside the sequence
  form_key text not null unique check (form_key ~ '^[a-f0-9]{16}$'),   -- private code in the agreement and lunch links
  overrides jsonb not null default '{}'        -- wording typed for this receipt only
);

create table agreements (
  id bigint generated always as identity primary key,
  submitted_at timestamptz not null default now(),
  booking_id text not null references bookings (id) on update cascade on delete cascade,
  n int not null,
  full_name text not null default '',          -- as signed for: a copy on purpose
  gender text not null default '',
  nationality text not null default '',
  passport_no text not null default '',
  photo_permission boolean not null,
  medical text not null default '',
  ec_name text not null default '',
  ec_phone text not null default '',
  insurance text not null default '',
  signed_name text not null default '',
  language text not null default '',
  form_version text not null default '',
  staff_checked boolean not null default false,
  unique (booking_id, n)
);

create table inquiries (
  id bigint generated always as identity primary key,
  submitted_at timestamptz not null default now(),
  name text not null default '',
  contact text not null default '',
  tour text not null default '',
  question text not null default '',
  source text not null default '',
  referrer text not null default '',
  site_language text not null default '',
  status text not null default 'New' check (status in ('New', 'Replied', 'Booked', 'Closed')),
  staff_notes text not null default ''
);

create table reviews (
  id bigint generated always as identity primary key,
  show boolean not null default false,
  review_date date,
  name text not null default '',
  review text not null default ''
);

-- Website text staff changed: only the overrides, per language.
create table content (
  key text not null,
  lang text not null,
  value text not null,
  primary key (key, lang)
);

create table tour_accounts (
  id bigint generated always as identity primary key,
  tour_date date not null,
  tour text not null,
  guests int not null default 0,
  receipt_nos text not null default '',
  booking_ids text not null default '',
  expense_kip numeric(14, 0) not null default 0,
  income_kip numeric(14, 0) not null default 0,
  profit_kip numeric(14, 0) not null default 0,
  costs jsonb not null default '[]',           -- [{item, counted_per, qty, unit_kip, total_kip}]
  saved_at timestamptz not null default now(),
  unique (tour_date, tour)
);

create table agency_share (
  id bigint generated always as identity primary key,
  tour_date date,
  booking_id text not null default '',
  data jsonb not null default '{}'             -- the Sheet's typed columns, by header
);

create table change_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_name text not null default '',          -- staff name, 'website' or 'system'
  table_name text not null,
  row_id text not null,
  action text not null,                        -- insert / update / delete
  old jsonb,
  new jsonb
);
create index on change_log (table_name, row_id);
create index on change_log (at);
