-- Daybook schema. Run once in the Supabase SQL editor (safe to re-run).
-- Tables, row-level security, realtime publication, and the private `files` storage bucket.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  name        text not null,
  color       text default '#8B7CF6',
  business    text,
  status      text not null default 'active' check (status in ('active','paused','done')),
  description text,
  sort_order  int default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  project_id   uuid references public.projects on delete set null,
  title        text not null,
  description  text,
  status       text not null default 'todo' check (status in ('todo','in_progress','done')),
  priority     text not null default 'medium' check (priority in ('low','medium','high')),
  due_date     date,
  due_time     time,
  tags         text[] not null default '{}',
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  project_id  uuid references public.projects on delete set null,
  title       text,
  body        text,
  pinned      boolean not null default false,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  project_id   uuid references public.projects on delete set null,
  name         text not null,
  kind         text not null check (kind in ('upload','link')),
  storage_path text,
  url          text,
  mime         text,
  size_bytes   bigint,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.briefings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  briefing_date date not null,
  headline      text,
  body_md       text,
  day_shape     text check (day_shape in ('heavy','normal','open')),
  stats         jsonb,
  generated_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, briefing_date)
);

-- Google OAuth tokens: service role only. RLS on, no policies, no grants.
create table if not exists public.google_tokens (
  user_id       uuid primary key references auth.users on delete cascade,
  account_email text,
  refresh_token text,
  access_token  text,
  expires_at    timestamptz,
  scopes        text[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','notes','files','briefings','google_tokens'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists tasks_user_due_idx      on public.tasks (user_id, due_date);
create index if not exists tasks_user_status_idx   on public.tasks (user_id, status);
create index if not exists tasks_project_idx       on public.tasks (project_id);
create index if not exists notes_user_updated_idx  on public.notes (user_id, updated_at desc);
create index if not exists notes_project_idx       on public.notes (project_id);
create index if not exists files_user_project_idx  on public.files (user_id, project_id);
create index if not exists projects_user_idx       on public.projects (user_id, sort_order);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.projects      enable row level security;
alter table public.tasks         enable row level security;
alter table public.notes         enable row level security;
alter table public.files         enable row level security;
alter table public.briefings     enable row level security;
alter table public.google_tokens enable row level security;

-- Owner-only CRUD on the four content tables.
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','notes','files'] loop
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated
                    using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated
                    with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated
                    using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Briefings are written only by the server (service role); the page just reads.
drop policy if exists "briefings_select_own" on public.briefings;
create policy "briefings_select_own" on public.briefings for select to authenticated
  using (user_id = (select auth.uid()));

-- Explicit grants (newer Supabase projects don't auto-expose new tables to the Data API).
revoke all on public.projects, public.tasks, public.notes, public.files, public.briefings, public.google_tokens from anon;
revoke all on public.google_tokens from authenticated;
grant select, insert, update, delete on public.projects, public.tasks, public.notes, public.files to authenticated;
grant select on public.briefings to authenticated;
grant all on public.projects, public.tasks, public.notes, public.files, public.briefings, public.google_tokens to service_role;

-- ---------------------------------------------------------------------------
-- Realtime (phone <-> laptop sync)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['projects','tasks','notes','files','briefings'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private `files` bucket, path = {user_id}/{file_id}/{filename}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('files', 'files', false, 52428800)  -- 50 MB (free-plan max per object)
on conflict (id) do nothing;

drop policy if exists "files_bucket_select_own" on storage.objects;
drop policy if exists "files_bucket_insert_own" on storage.objects;
drop policy if exists "files_bucket_update_own" on storage.objects;
drop policy if exists "files_bucket_delete_own" on storage.objects;

create policy "files_bucket_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_bucket_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_bucket_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "files_bucket_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
