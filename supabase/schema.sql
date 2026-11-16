-- Family trip planner. Lives in the movies Supabase project, so every table is prefixed trip_.
-- No password by design: the public key can read and write these four tables, nothing else.

create table if not exists public.trip_days (
    date date primary key,
    city text not null default '',
    title text not null default '',
    notes text not null default ''
);

create table if not exists public.trip_stays (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    check_in date not null,
    check_out date not null,
    address text not null default '',
    maps_url text not null default '',
    confirmation text not null default '',
    notes text not null default ''
);

create table if not exists public.trip_places (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    city text not null default '',
    category text not null default '',
    area text not null default '',
    address text not null default '',
    maps_url text not null default '',
    notes text not null default '',
    starred boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.trip_items (
    id uuid primary key default gen_random_uuid(),
    date date not null,
    time text not null default '',          -- "08:00" or "" for anytime
    kind text not null default 'sight',     -- food | sight | shop | flight | train | other
    title text not null,
    place_id uuid references public.trip_places (id) on delete set null,
    address text not null default '',
    maps_url text not null default '',
    notes text not null default '',
    booking_status text not null default 'none',  -- none | needed | booked
    booking_time text not null default '',
    party text not null default '',
    confirmation text not null default '',
    booking_url text not null default '',
    done boolean not null default false,
    sort double precision not null default 0,
    updated_at timestamptz not null default now()
);
create index if not exists trip_items_date on public.trip_items (date, sort);

do $$
declare t text;
begin
  foreach t in array array['trip_days','trip_stays','trip_places','trip_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists open_access on public.%I', t);
    execute format('create policy open_access on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
