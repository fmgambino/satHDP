# Mapa Interactivo de Reclamos - PWA

Primera versión estática lista para GitHub Pages con Google Maps, Supabase, SweetAlert2 y Chart.js.

## 1. Configurar claves
Editá `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_SUPABASE_ANON_KEY',
  GOOGLE_MAPS_API_KEY: 'TU_GOOGLE_MAPS_API_KEY',
  MAP_CENTER: { lat: -26.8241, lng: -65.2226 },
  MAP_ZOOM: 13
};
```

## 2. Crear tabla en Supabase
En SQL Editor ejecutá:

```sql
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null check (type in ('cano_roto','falta_asfalto','bache','poste_caido','arbol_caido')),
  name text not null,
  email text not null,
  phone text,
  address text not null,
  description text not null,
  lat double precision not null,
  lng double precision not null,
  status text not null default 'pending' check (status in ('pending','analysis','approved','rejected'))
);

alter table public.reports enable row level security;

create policy "Cualquiera puede crear reclamos"
on public.reports for insert
to anon, authenticated
with check (status = 'pending');

create policy "Cualquiera puede ver reclamos"
on public.reports for select
to anon, authenticated
using (true);

create policy "Admins autenticados pueden actualizar estados"
on public.reports for update
to authenticated
using (true)
with check (true);
```

## 3. Crear usuario administrador
En Supabase > Authentication > Users, creá el email y contraseña del administrador. Con ese usuario podrás entrar al panel.

## 4. Publicar en GitHub Pages
1. Crear repositorio.
2. Subir todos los archivos.
3. Ir a Settings > Pages.
4. Source: Deploy from branch.
5. Branch: `main` / root.
6. Abrir la URL publicada.

## Funcionalidades incluidas
- PWA instalable con service worker.
- Mapa Google Maps responsivo.
- Alta de reclamos desde formulario lateral.
- Marcadores SVG con emojis por tipo.
- Filtros por tipo, estado y búsqueda.
- Panel admin con login Supabase Auth.
- Aprobar, analizar o rechazar reclamos.
- Gráficos de torta, barra o línea con Chart.js.
- Alertas con SweetAlert2.
- Modo claro/oscuro con toggle de sol y luna.
