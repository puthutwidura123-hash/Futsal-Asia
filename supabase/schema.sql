-- Futsal Asia Pro — skema database Supabase
-- Jalankan sekali di Supabase: SQL Editor → New query → tempel → Run.

-- 1) Profil pemain (dibuat otomatis saat daftar)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null,
  username text not null,
  favorite_team text,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  goals_for int not null default 0,
  goals_against int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles dibaca user login" on public.profiles;
create policy "profiles dibaca user login" on public.profiles
  for select to authenticated using (true);

drop policy if exists "ubah profil sendiri" on public.profiles;
create policy "ubah profil sendiri" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- statistik menang/kalah hanya bisa diubah lewat fungsi finish_match (anti curang)
revoke update on public.profiles from authenticated;
grant update (username, favorite_team) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, lower(new.email),
          coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Pertandingan / undangan PvP
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references auth.users on delete cascade,
  host_email text not null,
  host_name text,
  host_team text not null,
  guest_email text not null,
  guest_id uuid references auth.users on delete set null,
  guest_name text,
  guest_team text,
  half_minutes int not null default 3 check (half_minutes between 1 and 20),
  status text not null default 'pending'
    check (status in ('pending','accepted','playing','finished','declined','cancelled','aborted')),
  score_host int,
  score_guest int,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists matches_guest_email_idx on public.matches (guest_email);
create index if not exists matches_host_idx on public.matches (host_id);
alter table public.matches enable row level security;

drop policy if exists "peserta baca" on public.matches;
create policy "peserta baca" on public.matches for select to authenticated
  using (host_id = auth.uid() or guest_email = lower(auth.jwt() ->> 'email'));

drop policy if exists "host membuat undangan" on public.matches;
create policy "host membuat undangan" on public.matches for insert to authenticated
  with check (
    host_id = auth.uid()
    and host_email = lower(auth.jwt() ->> 'email')
    and guest_email <> host_email
    and status = 'pending'
  );

drop policy if exists "peserta ubah status" on public.matches;
create policy "peserta ubah status" on public.matches for update to authenticated
  using (host_id = auth.uid() or guest_email = lower(auth.jwt() ->> 'email'))
  with check (
    host_id = auth.uid()
    or (guest_email = lower(auth.jwt() ->> 'email') and (guest_id is null or guest_id = auth.uid()))
  );

-- skor hanya lewat finish_match
revoke update on public.matches from authenticated;
grant update (status, guest_id, guest_name, guest_team) on public.matches to authenticated;

-- 3) Mengakhiri pertandingan (dipanggil host) + update statistik kedua pemain
create or replace function public.finish_match(p_match uuid, p_host int, p_guest int)
returns void language plpgsql security definer set search_path = public as $$
declare m public.matches;
begin
  select * into m from public.matches where id = p_match for update;
  if m.id is null then raise exception 'pertandingan tidak ditemukan'; end if;
  if m.host_id <> auth.uid() then raise exception 'hanya host yang boleh mengakhiri'; end if;
  if m.status not in ('playing','accepted') then return; end if;
  if p_host < 0 or p_guest < 0 or p_host > 99 or p_guest > 99 then raise exception 'skor tidak valid'; end if;

  update public.matches set status = 'finished', score_host = p_host, score_guest = p_guest, finished_at = now()
   where id = p_match;

  update public.profiles set
    goals_for = goals_for + p_host, goals_against = goals_against + p_guest,
    wins = wins + (p_host > p_guest)::int, draws = draws + (p_host = p_guest)::int, losses = losses + (p_host < p_guest)::int
   where id = m.host_id;

  if m.guest_id is not null then
    update public.profiles set
      goals_for = goals_for + p_guest, goals_against = goals_against + p_host,
      wins = wins + (p_guest > p_host)::int, draws = draws + (p_host = p_guest)::int, losses = losses + (p_guest < p_host)::int
     where id = m.guest_id;
  end if;
end $$;
grant execute on function public.finish_match(uuid, int, int) to authenticated;

-- 4) Realtime untuk notifikasi undangan
do $$ begin
  alter publication supabase_realtime add table public.matches;
exception when duplicate_object then null; end $$;
