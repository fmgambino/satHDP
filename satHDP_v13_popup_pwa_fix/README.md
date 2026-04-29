# satHDP v4 — PWA Mapa Interactivo de Reclamos

Versión refactorizada para GitHub Pages con HTML, CSS, JS, Supabase, Google Maps, Places Autocomplete, SweetAlert2 y Chart.js.

## 1) Subir a GitHub Pages

1. Descomprimí el ZIP.
2. Subí todos los archivos al repo `satHDP` reemplazando la versión anterior.
3. En GitHub: **Settings > Pages > Deploy from branch**.
4. Branch: `main`, carpeta `/root`.
5. URL esperada: `https://fmgambino.github.io/satHDP/`.

## 2) Configurar Supabase

En Supabase abrí **SQL Editor** y ejecutá completo:

```sql
/database/database.sql
```

Luego creá el usuario administrador:

1. Supabase > Authentication > Users.
2. Add user.
3. Usá ese email y contraseña en el Panel administrador de la PWA.

## 3) Configurar `config.js`

Reemplazá estos valores:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_KEY',
  GOOGLE_MAPS_API_KEY: 'TU_GOOGLE_MAPS_API_KEY',
  MAP_CENTER: { lat: -26.8241, lng: -65.2226 },
  MAP_ZOOM: 13,
  PLACES_RADIUS_METERS: 30000,
  PLACES_COUNTRY: 'ar'
};
```

## 4) Conectar Google Maps correctamente

En Google Cloud Console:

1. Abrí **APIs & Services > Library**.
2. Activá:
   - **Maps JavaScript API**
   - **Places API**
3. Abrí **APIs & Services > Credentials**.
4. Editá tu API key.
5. En **Application restrictions**, seleccioná **HTTP referrers**.
6. Agregá estos dominios:

```txt
https://fmgambino.github.io/*
https://fmgambino.github.io/satHDP/*
http://localhost:*
```

7. Guardá y esperá 2 a 5 minutos.

Si ves `RefererNotAllowedMapError`, significa que falta autorizar el dominio exacto que Chrome muestra en consola.

## 5) Qué incluye v4

- Mapa Google Maps responsivo.
- Buscador tipo Google Maps con sugerencias en tiempo real.
- Formulario lateral de reclamos.
- Tipos de daño administrables desde el panel.
- Estados: pendiente, análisis, aprobado, rechazado.
- Filtros por tipo y estado.
- Gráficos con Chart.js: torta, barra y línea.
- SweetAlert2 para mensajes.
- PWA instalable.
- Modo oscuro/claro con toggle horizontal.

## Nota importante

El mapa no puede cargar si Google Cloud bloquea el dominio. El código ya está preparado; la API key debe permitir el referer de GitHub Pages.


## v5 - Imágenes y video

Esta versión permite:
- Cargar hasta 5 imágenes por reclamo.
- Validar 5MB máximo por imagen.
- Guardar imágenes en Supabase Storage en el bucket público `report-images`.
- Agregar una URL opcional de video de YouTube, TikTok, Instagram o Facebook.
- Ver imágenes y video desde el mapa y desde el Panel Administrador.

### Actualización de base de datos

Ejecutá nuevamente:

```sql
database/database.sql
```

El script es seguro para instalaciones existentes: agrega `image_urls`, `video_url`, crea el bucket `report-images` y sus policies.

### Supabase Storage

El SQL crea automáticamente el bucket público `report-images`.
Si tu proyecto de Supabase no permite crear buckets desde SQL, hacelo manualmente:

1. Supabase > Storage > New bucket.
2. Nombre: `report-images`.
3. Public bucket: activado.
4. File size limit: `5 MB`.
5. Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

Luego ejecutá las policies incluidas en `database/database.sql`.


## Cambios v7

- Landing inicial con scroll suave hacia el mapa.
- Secciones informativas: por qué hacemos el mapa, evidencia, cómo funciona, compromiso y footer.
- Popup del marcador rediseñado:
  - Imagen principal arriba en formato 500x500 px.
  - Tipo de daño arriba del contenido.
  - Estado con fondo y borde por color.
  - Antigüedad y fecha de reporte.
  - Miniaturas y enlace de video.
- Formulario:
  - Hasta 5 imágenes subidas por archivo, 5MB cada una.
  - URL opcional de imagen directa. Se guarda dentro de `image_urls`.
  - URL opcional de video: YouTube, TikTok, Instagram o Facebook.
- Estadísticas de landing actualizadas desde Supabase.
- Galería “Así se ven las calles” alimentada desde imágenes de reclamos.

## Cambiar imagen o video de fondo de la landing

### Imagen
Editá `styles.css`:

```css
.hero-section {
  --hero-image: linear-gradient(...), url('assets/hero-bg.svg');
}
```

Podés reemplazar `assets/hero-bg.svg` por `assets/hero-bg.jpg` o cualquier imagen propia.

### Video
En `index.html`, buscá:

```html
<!-- <video class="hero-video" autoplay muted loop playsinline src="assets/hero-bg.mp4"></video> -->
```

Quitá los comentarios y subí tu video como:

```text
assets/hero-bg.mp4
```

## Base de datos

No necesitás una columna nueva para URL de imagen: se guarda en `reports.image_urls` junto con las imágenes subidas. Ejecutá igualmente `database/database.sql` si venís de una versión anterior para asegurar columnas, políticas y Storage.

## v8 - Slider, landing y Cafecito

- El bloque **“Así se ven las calles”** ahora usa un slider interactivo con imágenes o video de los reclamos.
- Desde el **Panel Administrador > Slider de evidencia** podés cambiar efecto: `Slide`, `Fade` o `Zoom`, tiempo en milisegundos y autoplay.
- Se agregó sección **“Quién impulsa esta iniciativa”**.
- Se agregó botón **Cafecito** en header y footer.
- El popup del marcador muestra imagen principal 500x500px, antigüedad, fecha de reporte y estado con borde/color.

Para persistir la configuración del slider en Supabase, ejecutá nuevamente `database/database.sql` o al menos la sección `app_settings` del final.

## v10 - Cambios incluidos
- Panel administrador en pantalla completa y responsivo.
- Estado nuevo `resolved` / **Resuelto** en filtros, admin, badges y contadores.
- Contadores reales desde Supabase usando consultas `count: exact`: reportados, en revisión, aprobados y resueltos.
- Logo MUNIPA-HDP remoto configurado en header, manifest PWA y alerta SweetAlert2 de instalación.
- Foto de perfil de Ing. Fernando Gambino integrada desde `https://i.ibb.co/QvYLrwXg/fmg-perfil-EGR.png`.
- Ajustes de contraste y cards para modo claro.

Para que los contadores públicos muestren todos los estados con la anon key, ejecutá el SQL de `database/database.sql` o una policy equivalente de lectura pública/segura para `reports`.


## v11 - Mejoras solicitadas

- Panel administrador en pantalla completa con selección masiva.
- Checkbox por reclamo y “Seleccionar todo” arriba, encabezado y abajo.
- Acciones masivas: Aprobar, En revisión, Resuelto, Rechazar y Eliminar.
- Paginación del administrador arriba y abajo.
- Tamaño de lista configurable: 5, 10, 25, 50, 100 y 500.
- Botón flotante interactivo de WhatsApp: `https://wa.me/3816150488`.
- Mejoras de escritorio para evitar desbordes en tipos, acciones y tabla.
- Home en modo claro reforzada con mejor contraste.
- Fondo de landing configurable desde `config.js`:
  - `HERO_BACKGROUND_IMAGE`
  - `HERO_BACKGROUND_VIDEO`
- Cards de “Quién impulsa esta iniciativa” más grandes.
- Popup del mapa con imagen recortada a 400x400px.
- Alerta SweetAlert2 automática para instalar PWA en móviles.
- Favicon, logo e icono PWA configurados con `http://munipahdp.com/img/logoMunipa.svg`.

### Nota sobre el icono PWA
Algunos navegadores requieren que los íconos del manifest estén servidos por HTTPS y desde el mismo dominio. Si el navegador no toma el SVG remoto, descargá el logo y reemplazá `icons/icon.svg`, luego actualizá `manifest.webmanifest`.

### SQL requerido para estado Resuelto

```sql
ALTER TABLE reports 
DROP CONSTRAINT IF EXISTS reports_status_check;

ALTER TABLE reports 
ADD CONSTRAINT reports_status_check 
CHECK (status IN ('pending','analysis','approved','rejected','resolved'));
```

## Cambios v13
- Popup del reclamo del mapa centrado y con imagen principal recortada 400x400 px.
- SweetAlert2 de instalación PWA al ingresar en escritorio y mobile.
- Manifest corregido con íconos PNG locales para que Chrome/Edge puedan disparar `beforeinstallprompt`.
- Favicon, logo header e ícono instalable apuntan a `icons/icon-192.png` / `icons/icon-512.png`.

### Importante para probar instalación PWA
Chrome/Edge solo muestran la instalación real cuando:
1. El sitio corre en HTTPS o `localhost`.
2. El manifest es válido.
3. El service worker está activo.
4. No fue instalada antes.
5. No bloqueaste previamente el prompt.

Si probás una versión anterior, borrá cache y service workers: DevTools > Application > Service Workers > Unregister, y luego recargá con Ctrl+F5.
