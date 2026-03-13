create extension if not exists pgcrypto;

create table if not exists public.closed_test_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  email text not null,
  name text,
  device_type text,
  phone_model text,
  heard_about text,
  source text not null default 'unknown',
  consent_marketing boolean not null default false,
  user_agent text
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closed_test_signups'
      and column_name = 'source_page'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closed_test_signups'
      and column_name = 'source'
  ) then
    alter table public.closed_test_signups rename column source_page to source;
  end if;
end $$;

alter table public.closed_test_signups add column if not exists created_at timestamptz not null default timezone('utc', now());
alter table public.closed_test_signups add column if not exists email text;
alter table public.closed_test_signups add column if not exists name text;
alter table public.closed_test_signups add column if not exists device_type text;
alter table public.closed_test_signups add column if not exists phone_model text;
alter table public.closed_test_signups add column if not exists heard_about text;
alter table public.closed_test_signups add column if not exists source text;
alter table public.closed_test_signups add column if not exists consent_marketing boolean not null default false;
alter table public.closed_test_signups add column if not exists user_agent text;

update public.closed_test_signups
set source = coalesce(source, 'unknown')
where source is null;

alter table public.closed_test_signups
  alter column email set not null,
  alter column source set not null,
  alter column consent_marketing set not null;

alter table public.closed_test_signups drop constraint if exists closed_test_signups_email_format;
alter table public.closed_test_signups drop constraint if exists closed_test_signups_source_page_valid;
alter table public.closed_test_signups drop constraint if exists closed_test_signups_source_valid;
alter table public.closed_test_signups add constraint closed_test_signups_email_format
  check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');
alter table public.closed_test_signups add constraint closed_test_signups_source_valid
  check (source in ('home', 'blog', 'newsletter'));

create unique index if not exists closed_test_signups_email_unique
  on public.closed_test_signups (lower(email));

alter table public.closed_test_signups enable row level security;

grant insert on table public.closed_test_signups to anon, authenticated;

drop policy if exists "public can insert closed test signups" on public.closed_test_signups;
create policy "public can insert closed test signups"
on public.closed_test_signups
for insert
to anon, authenticated
with check (
  source in ('home', 'blog', 'newsletter')
  and consent_marketing is true
  and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
);

drop policy if exists "nobody can select closed test signups" on public.closed_test_signups;
create policy "nobody can select closed test signups"
on public.closed_test_signups
for select
to anon, authenticated
using (false);
