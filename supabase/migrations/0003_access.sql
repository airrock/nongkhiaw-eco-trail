-- Who may do what. Two roles (staff.role): admin and staff (office staff). The website (anon) can only run the
-- functions granted at the end; it can read or write no table.
--
--                                           admin   office staff
--   bookings, travellers: see/add/change     yes       yes
--   record a payment (add_payment)           yes       yes
--   issue a receipt (issue_receipt)          yes       yes
--   delete / restore a booking               yes       no
--   change or remove a payment               yes       no
--   prices, settings, menu, tour plans       yes       read only
--   tour accounts, agency share              yes       no
--   users and roles                          yes       no

/* ---------- guards that row-level rules cannot express ---------- */

-- Only an admin changes who is deleted. (No signed-in user = the import or the service key: allowed.)
create function guard_booking() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) then
    raise exception 'only an admin can delete or restore a booking';
  end if;
  return new;
end $$;
create trigger guard_booking before update on bookings for each row execute function guard_booking();

-- There is always at least one active admin.
create function guard_staff() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' or new.role <> 'admin' or not new.active) and old.role = 'admin' and old.active
     and not exists (select 1 from staff where role = 'admin' and active and id <> old.id) then
    raise exception 'the last admin cannot be removed, deactivated or made office staff';
  end if;
  return coalesce(new, old);
end $$;
create trigger guard_staff before update or delete on staff for each row execute function guard_staff();

-- A user who has set their own password.
create function password_changed() returns void
language sql security definer set search_path = public as $$
  update staff set must_change_password = false where id = auth.uid()
$$;

/* ---------- change log: who changed what ---------- */

create function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; who text; rid text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  rid := coalesce(coalesce(n, o) ->> 'id', coalesce(n, o) ->> 'no', coalesce(n, o) ->> 'key', coalesce(n, o) ->> 'code', '');
  if tg_table_name = 'travellers' then rid := (coalesce(n, o) ->> 'booking_id') || ' #' || (coalesce(n, o) ->> 'n'); end if;
  if tg_op = 'UPDATE' then
    -- only the columns that changed
    select jsonb_object_agg(k, o -> k), jsonb_object_agg(k, n -> k) into o, n
    from jsonb_object_keys(n) k where (o -> k) is distinct from (n -> k);
    if o is null then return null; end if;
  elsif tg_op = 'INSERT' then n := null;   -- the row itself is the record
  end if;
  who := case when auth.uid() is not null then staff_name() else 'website / system' end;
  insert into change_log (user_id, user_name, table_name, row_id, action, old, new)
  values (auth.uid(), who, tg_table_name, rid, lower(tg_op), o, n);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['bookings', 'travellers', 'payments', 'receipts', 'agreements', 'staff', 'settings',
                           'tours', 'tour_days', 'tour_addons', 'tour_costs', 'lunch_menu', 'tour_accounts'] loop
    execute format('create trigger log_change after insert or update or delete on %I for each row execute function log_change()', t);
  end loop;
end $$;

/* ---------- row-level security ---------- */

do $$
declare t text;
begin
  foreach t in array array['staff', 'settings', 'tours', 'tour_days', 'tour_addons', 'tour_costs', 'lunch_menu',
      'country_aliases', 'bookings', 'travellers', 'payments', 'receipts', 'agreements', 'inquiries', 'reviews',
      'content', 'tour_accounts', 'agency_share', 'change_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
  end loop;
  -- read by any staff, changed by admins
  foreach t in array array['settings', 'tours', 'tour_days', 'tour_addons', 'tour_costs', 'lunch_menu',
      'country_aliases', 'reviews', 'content'] loop
    execute format('create policy staff_read on %I for select to authenticated using (is_staff())', t);
    execute format('create policy admin_write on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
  -- admins only
  foreach t in array array['tour_accounts', 'agency_share'] loop
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- bookings: office staff see and change live bookings; deleted ones are for admins. Nobody erases a row.
create policy staff_read on bookings for select to authenticated using (is_staff() and (deleted_at is null or is_admin()));
create policy staff_add on bookings for insert to authenticated with check (is_staff());
create policy staff_change on bookings for update to authenticated
  using (is_staff() and (deleted_at is null or is_admin())) with check (is_staff());

create policy staff_all on travellers for all to authenticated using (is_staff()) with check (is_staff());

-- payments: added through add_payment(); corrected or removed by admins only
create policy staff_read on payments for select to authenticated using (is_staff());
create policy admin_write on payments for all to authenticated using (is_admin()) with check (is_admin());

-- receipts: numbered through issue_receipt(); staff may change the language and the wording of a receipt
create policy staff_read on receipts for select to authenticated using (is_staff());
create policy staff_change on receipts for update to authenticated using (is_staff()) with check (is_staff());
create policy admin_write on receipts for all to authenticated using (is_admin()) with check (is_admin());
revoke update on receipts from authenticated;
grant update (language, overrides, issued_on) on receipts to authenticated;

create policy staff_read on agreements for select to authenticated using (is_staff());
create policy staff_change on agreements for update to authenticated using (is_staff()) with check (is_staff());
create policy admin_remove on agreements for delete to authenticated using (is_admin());
revoke update on agreements from authenticated;
grant update (staff_checked) on agreements to authenticated;

create policy staff_read on inquiries for select to authenticated using (is_staff());
create policy staff_add on inquiries for insert to authenticated with check (is_staff());
create policy staff_change on inquiries for update to authenticated using (is_staff()) with check (is_staff());
create policy admin_remove on inquiries for delete to authenticated using (is_admin());

-- users: everyone on the team sees the list; admins change name, role and active. Logins are created by the
-- admin-users Edge Function (service key), never from the browser.
create policy staff_read on staff for select to authenticated using (is_staff() or id = auth.uid());
create policy admin_change on staff for update to authenticated using (is_admin()) with check (is_admin());
revoke insert, delete, update on staff from authenticated;
grant update (name, role, active) on staff to authenticated;

create policy staff_read on change_log for select to authenticated using (is_staff());
revoke insert, update, delete on change_log from authenticated;

grant select on booking_summary to authenticated;
revoke all on booking_summary from anon;

/* ---------- functions: nothing runs unless granted here ---------- */

revoke execute on all functions in schema public from public, anon, authenticated;

-- the website
grant execute on function submit_booking(jsonb), submit_inquiry(jsonb), get_config(), get_reviews(),
  get_agreement(text), submit_agreement(jsonb), get_lunch(text), submit_lunch(jsonb) to anon, authenticated;

-- signed-in team members (each function checks the role itself)
grant execute on function is_staff(), is_admin(), staff_name(), password_changed(),
  issue_receipt(text, text), add_payment(text, numeric, text, text, text, date), delete_booking(text),
  restore_booking(text), recalc_transfer(text), booking_totals(text), riders(text),
  transfer_kip(text, boolean, int), setting_num(text, numeric), setting_text(text), goes_up(text), goes_down(text),
  clean(text, int), to_date_safe(text), country_name(text), lunch_menu_json() to authenticated;
