-- Lean Coach cloud sync: run this once in the Supabase SQL Editor.
-- It is safe to run again.
--
-- One table holds every synced record as JSON. Each row belongs to the
-- signed-in user, and row level security makes all other users' rows invisible.

create table if not exists public.records (
  user_id           uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  store             text        not null,
  id                text        not null,
  data              jsonb,
  deleted           boolean     not null default false,
  client_updated_at timestamptz not null,
  updated_at        timestamptz not null default clock_timestamp(),
  primary key (user_id, store, id)
);

create index if not exists records_user_updated on public.records (user_id, updated_at);

-- Stamp the server time on every write, and ignore a write that is older than
-- what is already stored (the most recently edited copy wins).
create or replace function public.records_before_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

alter table public.records enable row level security;

drop policy if exists records_select_own on public.records;
drop policy if exists records_insert_own on public.records;
drop policy if exists records_update_own on public.records;

create policy records_select_own on public.records
  for select to authenticated using (user_id = auth.uid());
create policy records_insert_own on public.records
  for insert to authenticated with check (user_id = auth.uid());
create policy records_update_own on public.records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.records from anon;
grant select, insert, update on public.records to authenticated;
