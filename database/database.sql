-- Base de datos para Mapa Interactivo de Reclamos - Supabase
-- Ejecutar este archivo completo en Supabase > SQL Editor > New query > Run.

-- Extensión necesaria para gen_random_uuid()
create extension if not exists pgcrypto;

-- Tabla principal de reclamos
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  type text not null check (
    type in ('cano_roto','falta_asfalto','bache','poste_caido','arbol_caido')
  ),

  name text not null,
  email text not null,
  phone text,
  address text not null,
  description text not null,

  lat double precision not null,
  lng double precision not null,

  status text not null default 'pending' check (
    status in ('pending','analysis','approved','rejected')
  ),

  admin_notes text
);

-- Índices útiles para filtros y mapa
create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_type_idx on public.reports (type);
create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_lat_lng_idx on public.reports (lat, lng);

-- Trigger para updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_set_updated_at on public.reports;
create trigger reports_set_updated_at
before update on public.reports
for each row
execute function public.set_updated_at();

-- Seguridad RLS
alter table public.reports enable row level security;

-- Limpiar políticas previas si se vuelve a ejecutar el script
drop policy if exists "Cualquiera puede crear reclamos pendientes" on public.reports;
drop policy if exists "Cualquiera puede ver reclamos" on public.reports;
drop policy if exists "Usuarios autenticados pueden actualizar reclamos" on public.reports;
drop policy if exists "Usuarios autenticados pueden borrar reclamos" on public.reports;

-- Los vecinos/usuarios anónimos pueden enviar reclamos, siempre como pending
create policy "Cualquiera puede crear reclamos pendientes"
on public.reports
for insert
to anon, authenticated
with check (status = 'pending');

-- Todos pueden visualizar reclamos para el mapa público
create policy "Cualquiera puede ver reclamos"
on public.reports
for select
to anon, authenticated
using (true);

-- El panel administrador usa Supabase Auth: cualquier usuario autenticado puede gestionar estados
-- Recomendación: crear solo usuarios administradores en Authentication > Users.
create policy "Usuarios autenticados pueden actualizar reclamos"
on public.reports
for update
to authenticated
using (true)
with check (true);

-- Opcional: permite borrar reclamos desde futuras versiones del panel admin
create policy "Usuarios autenticados pueden borrar reclamos"
on public.reports
for delete
to authenticated
using (true);

-- Datos de prueba opcionales. Podés borrarlos después.
insert into public.reports (type, name, email, phone, address, description, lat, lng, status)
values
('bache', 'Vecino Demo', 'demo@ejemplo.com', '3810000000', 'Plaza Independencia, San Miguel de Tucumán', 'Bache grande en esquina.', -26.8300, -65.2038, 'approved'),
('cano_roto', 'Vecina Demo', 'vecina@ejemplo.com', null, 'Av. Mate de Luna y Camino del Perú', 'Pérdida de agua sobre calzada.', -26.8175, -65.2670, 'pending'),
('arbol_caido', 'Usuario Demo', 'usuario@ejemplo.com', null, 'Parque 9 de Julio', 'Árbol caído bloqueando paso peatonal.', -26.8212, -65.1901, 'analysis')
on conflict do nothing;
