-- Planbench database. Safe to run again and again.
-- A project is one renovation (for example "Our kitchen"). Its whole budget is kept as one
-- document. People are given access by email address; they sign in with an emailed link.

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  data jsonb not null,
  -- Goes up by one on every save, so two people saving at once can be noticed and merged.
  rev integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  added_at timestamptz not null default now(),
  primary key (project_id, email)
);

alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- Is the signed-in person a member of this project?
create or replace function public.is_member(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = pid and m.email = lower(auth.jwt() ->> 'email')
  );
$$;
revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;

drop policy if exists "members read their projects" on public.projects;
create policy "members read their projects" on public.projects
  for select to authenticated using (public.is_member(id));

drop policy if exists "members change their projects" on public.projects;
create policy "members change their projects" on public.projects
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "members see who else is a member" on public.project_members;
create policy "members see who else is a member" on public.project_members
  for select to authenticated using (public.is_member(project_id));

drop policy if exists "members invite others" on public.project_members;
create policy "members invite others" on public.project_members
  for insert to authenticated with check (public.is_member(project_id));

-- You can remove someone else, but not yourself (so a project is never left with nobody).
drop policy if exists "members remove others" on public.project_members;
create policy "members remove others" on public.project_members
  for delete to authenticated
  using (public.is_member(project_id) and email <> lower(auth.jwt() ->> 'email'));

-- Record when and by whom a project was last saved.
create or replace function public.stamp_project()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := lower(auth.jwt() ->> 'email');
  return new;
end $$;
drop trigger if exists stamp_project on public.projects;
create trigger stamp_project before update on public.projects
  for each row execute function public.stamp_project();

-- Starting a new project makes the person who starts it its first member.
create or replace function public.create_project(p_name text, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me text := lower(auth.jwt() ->> 'email');
  pid uuid;
begin
  if me is null or me = '' then
    raise exception 'You need to be signed in.';
  end if;
  if (select count(*) from public.project_members m where m.email = me) >= 5 then
    raise exception 'You already have the most projects allowed.';
  end if;
  insert into public.projects (name, data, updated_by) values (coalesce(p_name, ''), p_data, me) returning id into pid;
  insert into public.project_members (project_id, email) values (pid, me);
  return pid;
end $$;
revoke all on function public.create_project(text, jsonb) from public, anon;
grant execute on function public.create_project(text, jsonb) to authenticated;

-- Only invited people can sign up. The very first person to sign in is let through
-- (that is the owner); after that an email address must have been added to a project.
create or replace function public.only_invited_signups()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users)
     and not exists (select 1 from public.project_members m where m.email = lower(new.email)) then
    raise exception 'This email address has not been invited to Planbench.';
  end if;
  return new;
end $$;
revoke all on function public.only_invited_signups() from public, anon, authenticated;
drop trigger if exists only_invited_signups on auth.users;
create trigger only_invited_signups before insert on auth.users
  for each row execute function public.only_invited_signups();

-- Tell signed-in devices straight away when a project changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;

-- Photos are kept privately, in a folder named after the project.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

create or replace function public.photo_project(object_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

drop policy if exists "members read project photos" on storage.objects;
create policy "members read project photos" on storage.objects
  for select to authenticated using (bucket_id = 'photos' and public.is_member(public.photo_project(name)));

drop policy if exists "members add project photos" on storage.objects;
create policy "members add project photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos' and public.is_member(public.photo_project(name)));

drop policy if exists "members replace project photos" on storage.objects;
create policy "members replace project photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_member(public.photo_project(name)))
  with check (bucket_id = 'photos' and public.is_member(public.photo_project(name)));

drop policy if exists "members delete project photos" on storage.objects;
create policy "members delete project photos" on storage.objects
  for delete to authenticated using (bucket_id = 'photos' and public.is_member(public.photo_project(name)));
