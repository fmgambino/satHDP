-- Base de datos para Mapa Interactivo de Reclamos - Supabase
-- Ejecutar completo en Supabase > SQL Editor > New query > Run.
-- Incluye tabla dinámica damage_types para administrar tipos de daños desde el Panel Administrador.

create extension if not exists pgcrypto;

-- Tipos dinámicos de daños
create table if not exists public.damage_types (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  label text not null,
  emoji text not null,
  color text not null default '#38bdf8' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.damage_types (key, label, emoji, color, active, sort_order)
values
('cano_roto', 'Caño roto', '💧', '#38bdf8', true, 10),
('falta_asfalto', 'Falta asfalto', '🛣️', '#94a3b8', true, 20),
('bache', 'Bache', '🕳️', '#f59e0b', true, 30),
('poste_caido', 'Poste caído', '⚡', '#facc15', true, 40),
('arbol_caido', 'Árbol caído', '🌳', '#22c55e', true, 50)
on conflict (key) do update set
  label = excluded.label,
  emoji = excluded.emoji,
  color = excluded.color,
  active = excluded.active,
  sort_order = excluded.sort_order;

-- Tabla principal de reclamos
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  type text not null,
  name text not null,
  email text not null,
  phone text,
  address text not null,
  description text not null,
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pending' check (status in ('pending','analysis','approved','rejected')),
  admin_notes text,
  image_urls text[] not null default '{}',
  video_url text
);

-- Si venís de la versión anterior, elimina el CHECK fijo de reports.type para permitir tipos nuevos.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.reports'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cano_roto%'
  loop
    execute format('alter table public.reports drop constraint if exists %I', c.conname);
  end loop;
end $$;

-- FK opcional a tipos dinámicos
alter table public.reports
  drop constraint if exists reports_type_damage_types_fk;
alter table public.reports
  add constraint reports_type_damage_types_fk
  foreign key (type) references public.damage_types(key)
  on update cascade on delete restrict;

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_type_idx on public.reports (type);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_lat_lng_idx on public.reports (lat, lng);
create index if not exists damage_types_active_idx on public.damage_types (active, sort_order);

-- Migración segura para proyectos ya instalados
alter table public.reports add column if not exists image_urls text[] not null default '{}';
alter table public.reports add column if not exists video_url text;

-- Bucket público para imágenes de reclamos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-images', 'report-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Cualquiera puede subir imagenes de reclamos" on storage.objects;
drop policy if exists "Cualquiera puede ver imagenes de reclamos" on storage.objects;
drop policy if exists "Usuarios autenticados pueden borrar imagenes de reclamos" on storage.objects;

create policy "Cualquiera puede subir imagenes de reclamos"
on storage.objects for insert to anon, authenticated
with check (bucket_id = 'report-images');

create policy "Cualquiera puede ver imagenes de reclamos"
on storage.objects for select to anon, authenticated
using (bucket_id = 'report-images');

create policy "Usuarios autenticados pueden borrar imagenes de reclamos"
on storage.objects for delete to authenticated
using (bucket_id = 'report-images');


create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at before update on public.reports for each row execute function public.set_updated_at();

drop trigger if exists damage_types_set_updated_at on public.damage_types;
create trigger damage_types_set_updated_at before update on public.damage_types for each row execute function public.set_updated_at();

alter table public.reports enable row level security;
alter table public.damage_types enable row level security;

drop policy if exists "Cualquiera puede crear reclamos pendientes" on public.reports;
drop policy if exists "Cualquiera puede ver reclamos" on public.reports;
drop policy if exists "Usuarios autenticados pueden actualizar reclamos" on public.reports;
drop policy if exists "Usuarios autenticados pueden borrar reclamos" on public.reports;
drop policy if exists "Cualquiera puede ver tipos de daños" on public.damage_types;
drop policy if exists "Usuarios autenticados pueden administrar tipos de daños" on public.damage_types;

create policy "Cualquiera puede crear reclamos pendientes"
on public.reports for insert to anon, authenticated
with check (status = 'pending');

create policy "Cualquiera puede ver reclamos"
on public.reports for select to anon, authenticated
using (true);

create policy "Usuarios autenticados pueden actualizar reclamos"
on public.reports for update to authenticated
using (true) with check (true);

create policy "Usuarios autenticados pueden borrar reclamos"
on public.reports for delete to authenticated
using (true);

create policy "Cualquiera puede ver tipos de daños"
on public.damage_types for select to anon, authenticated
using (true);

create policy "Usuarios autenticados pueden administrar tipos de daños"
on public.damage_types for all to authenticated
using (true) with check (true);

-- Realtime: en Supabase, activá Realtime para reports y damage_types si querés actualizaciones instantáneas.
-- Dashboard > Database > Replication > Source: supabase_realtime > habilitar tablas.

insert into public.reports (type, name, email, phone, address, description, lat, lng, status)
values
('bache', 'Vecino Demo', 'demo@ejemplo.com', '3810000000', 'Plaza Independencia, San Miguel de Tucumán', 'Bache grande en esquina.', -26.8300, -65.2038, 'approved'),
('cano_roto', 'Vecina Demo', 'vecina@ejemplo.com', null, 'Av. Mate de Luna y Camino del Perú', 'Pérdida de agua sobre calzada.', -26.8175, -65.2670, 'pending'),
('arbol_caido', 'Usuario Demo', 'usuario@ejemplo.com', null, 'Parque 9 de Julio', 'Árbol caído bloqueando paso peatonal.', -26.8212, -65.1901, 'analysis')
on conflict do nothing;

-- v8: configuración administrable del slider de evidencia.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Cualquiera puede ver configuraciones públicas" on public.app_settings;
drop policy if exists "Usuarios autenticados administran configuraciones" on public.app_settings;

create policy "Cualquiera puede ver configuraciones públicas"
on public.app_settings for select to anon, authenticated
using (true);

create policy "Usuarios autenticados administran configuraciones"
on public.app_settings for all to authenticated
using (true) with check (true);

insert into public.app_settings (key, value)
values ('evidence_slider', '{"effect":"slide","interval":4000,"autoplay":true}'::jsonb)
on conflict (key) do nothing;
