# SAT HDP - Mapa Interactivo de Reclamos PWA

Versión refactorizada con Google Maps + Places Autocomplete, Supabase, Panel Administrador, tipos de daños dinámicos, filtros, gráficos Chart.js, SweetAlert2, PWA y modo claro/oscuro.

## 1. Base de datos Supabase

1. Abrí tu proyecto de Supabase.
2. Entrá a **SQL Editor > New query**.
3. Pegá y ejecutá completo el archivo `database/database.sql`.

El script crea `reports` y `damage_types`, elimina la restricción vieja de tipos fijos si existía, agrega políticas RLS y carga datos demo.

## 2. Usuario administrador

En Supabase > **Authentication > Users**, creá un usuario con email y contraseña. Ese usuario ingresa al **Panel administrador**.

## 3. Configurar Supabase en la PWA

Editá `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'TU_SUPABASE_URL',
  SUPABASE_ANON_KEY: 'TU_SUPABASE_ANON_KEY',
  GOOGLE_MAPS_API_KEY: 'TU_GOOGLE_MAPS_API_KEY',
  MAP_CENTER: { lat: -26.8241, lng: -65.2226 },
  MAP_ZOOM: 13,
  PLACES_RADIUS_METERS: 30000
};
```

Los datos salen de **Supabase > Project Settings > API**.

## 4. Conectar Google Maps

1. Entrá a Google Cloud Console.
2. Creá o seleccioná un proyecto.
3. Habilitá facturación si Google la solicita.
4. En **APIs & Services > Library**, activá:
   - **Maps JavaScript API**
   - **Places API**
5. En **APIs & Services > Credentials**, creá una **API key**.
6. Restringí la key por HTTP referrers:
   - Local: `http://localhost:*/*`
   - GitHub Pages: `https://TU_USUARIO.github.io/*`
   - Dominio propio: `https://tudominio.com/*`
7. Pegá la key en `config.js` en `GOOGLE_MAPS_API_KEY`.

La app usa `libraries=places`, necesario para que el buscador del mapa y el campo Dirección funcionen con autocompletado de Google Maps en tiempo real.

## 5. Activar Realtime en Supabase

Opcional pero recomendado:

Supabase > **Database > Replication** > activar para:

- `reports`
- `damage_types`

## 6. Publicar en GitHub Pages

1. Subí todos los archivos al repositorio.
2. GitHub > **Settings > Pages**.
3. Source: `Deploy from a branch`.
4. Branch: `main` y folder `/root`.
5. Guardá y abrí la URL generada.

## 7. Agregar nuevos tipos de daños

Entrá al **Panel administrador > Tipos de daños** y completá:

- Clave: `luminaria_rota`
- Nombre: `Luminaria rota`
- Emoji: `💡`
- Color: `#facc15`
- Activo: marcado

La clave solo admite minúsculas, números y guion bajo.


## Corrección Google Maps / buscador

Esta versión corrige el error:

`Cannot set properties of null (setting 'src')`

Ahora `app.js` crea dinámicamente el script de Google Maps, por lo que no depende de un `<script id="googleMapsScript">` existente en el HTML.

### Cómo conectar Google Maps

1. Entrá a Google Cloud Console.
2. Creá o seleccioná un proyecto.
3. Activá estas APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API
4. Creá una API Key en **APIs y servicios > Credenciales**.
5. En **Restricciones de aplicación**, elegí **Sitios web HTTP**.
6. Agregá tus dominios permitidos:
   - `http://localhost:*/*` para pruebas locales.
   - `https://TU_USUARIO.github.io/*`
   - `https://TU_USUARIO.github.io/TU_REPOSITORIO/*`
7. En **Restricciones de API**, limitá la key a:
   - Maps JavaScript API
   - Places API
   - Geocoding API
8. Abrí `config.js` y pegá la clave en:

```js
GOOGLE_MAPS_API_KEY: 'TU_CLAVE_REAL'
```

9. Publicá en GitHub Pages. Google Maps y Places funcionan mejor en HTTPS; GitHub Pages ya usa HTTPS.

### Buscador interactivo

El campo “Buscar en Google Maps y reclamos” usa Google Places Autocomplete en tiempo real. También podés escribir una dirección y presionar Enter; la app intenta geocodificarla y centrar el mapa.
