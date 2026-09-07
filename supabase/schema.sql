-- PEGASUS production schema
-- Replace admin@yourdomain.com below with the same ADMIN_EMAIL used in Vercel.

create extension if not exists pgcrypto;

create table if not exists public.designs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('nuevos','futbol','gotico','otros')),
  size text,
  price text,
  image_url text not null,
  storage_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.site_content(key,value) values
('hero_tagline','DISEÑOS DISPONIBLES PARA BORDAR'),
('hero_title','Elegí tu diseño.'),
('hero_description','Encontrá un diseño y consultanos para bordarlo en tu prenda.'),
('custom_title','DISEÑO PERSONALIZADO'),
('custom_description','Comunicáte conmigo para consultar medidas, tipo de diseño, precio y recibir un asesoramiento personalizado.'),
('custom_button','CONSULTAR DISEÑO PERSONALIZADO')
on conflict (key) do nothing;

alter table public.designs enable row level security;
alter table public.site_content enable row level security;

revoke all on table public.designs from anon, authenticated;
revoke all on table public.site_content from anon, authenticated;
grant select on public.designs to anon, authenticated;
grant select, insert, update, delete on public.designs to authenticated;
grant select on public.site_content to anon, authenticated;
grant insert, update on public.site_content to authenticated;

create policy "public can read active designs"
on public.designs for select to anon, authenticated
using (active = true or lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "admin can insert designs"
on public.designs for insert to authenticated
with check (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "admin can update designs"
on public.designs for update to authenticated
using (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'))
with check (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "admin can delete designs"
on public.designs for delete to authenticated
using (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "public can read site content"
on public.site_content for select to anon, authenticated
using (true);

create policy "admin can write site content"
on public.site_content for insert to authenticated
with check (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "admin can update site content"
on public.site_content for update to authenticated
using (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'))
with check (lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

-- Public image bucket. Database permissions above still protect the catalog records.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('designs','designs',true,5242880,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true;

create policy "public can view design images"
on storage.objects for select to public
using (bucket_id = 'designs');

create policy "admin can upload design images"
on storage.objects for insert to authenticated
with check (bucket_id = 'designs' and lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "admin can update design images"
on storage.objects for update to authenticated
using (bucket_id = 'designs' and lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'))
with check (bucket_id = 'designs' and lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

create policy "admin can delete design images"
on storage.objects for delete to authenticated
using (bucket_id = 'designs' and lower(coalesce(auth.email(),'')) = lower('admin@yourdomain.com'));

-- Simple DB-backed rate limiter used by the server-side login endpoint.
create table if not exists public.rate_limits (
  key text primary key,
  window_started_at timestamptz not null default now(),
  hits integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare r public.rate_limits%rowtype; now_ts timestamptz := now();
begin
  insert into public.rate_limits(key,window_started_at,hits) values(p_key,now_ts,1)
  on conflict(key) do nothing;
  select * into r from public.rate_limits where key=p_key for update;
  if now_ts - r.window_started_at >= make_interval(secs => p_window_seconds) then
    update public.rate_limits set window_started_at=now_ts,hits=1 where key=p_key;
    return true;
  end if;
  if r.hits >= p_limit then return false; end if;
  update public.rate_limits set hits=hits+1 where key=p_key;
  return true;
end; $$;
revoke all on function public.check_rate_limit(text,integer,integer) from public;
grant execute on function public.check_rate_limit(text,integer,integer) to anon, authenticated;
