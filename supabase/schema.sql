-- Épület-LCA – felhős tárhely (Supabase / PostgreSQL)
-- Futtatás: Supabase → SQL Editor → New query → ennek a fájlnak a teljes tartalma → Run.
-- Egyetlen tábla: a program "dokumentumai" felhasználónként.
--   id = 'p…'  projekt
--   id = 'ip…' a projekt épületképe
--   id = 'm…'  saját anyag (EPD)

create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) between 1 and 200),
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- legfeljebb ~1 MB dokumentumonként (egy projekt jellemzően 5–50 kB, egy kép ~200 kB)
alter table public.docs drop constraint if exists docs_size;
alter table public.docs add constraint docs_size check (pg_column_size(data) < 1048576);

create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.docs_touch();

-- sorszintű jogosultság: mindenki csak a saját dokumentumait látja és módosítja
alter table public.docs enable row level security;
drop policy if exists "docs_select_own" on public.docs;
drop policy if exists "docs_insert_own" on public.docs;
drop policy if exists "docs_update_own" on public.docs;
drop policy if exists "docs_delete_own" on public.docs;
create policy "docs_select_own" on public.docs for select to authenticated using (user_id = (select auth.uid()));
create policy "docs_insert_own" on public.docs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "docs_update_own" on public.docs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "docs_delete_own" on public.docs for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.docs to authenticated;
revoke all on public.docs from anon;
