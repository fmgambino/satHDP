const DEFAULT_DAMAGE_TYPES = {
  cano_roto: { label: 'Caño roto', emoji: '💧', color: '#38bdf8', active: true },
  falta_asfalto: { label: 'Falta asfalto', emoji: '🛣️', color: '#94a3b8', active: true },
  bache: { label: 'Bache', emoji: '🕳️', color: '#f59e0b', active: true },
  poste_caido: { label: 'Poste caído', emoji: '⚡', color: '#facc15', active: true },
  arbol_caido: { label: 'Árbol caído', emoji: '🌳', color: '#22c55e', active: true }
};

let DAMAGE_TYPES = { ...DEFAULT_DAMAGE_TYPES };
const STATUS = { pending: 'Pendiente', analysis: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', resolved: 'Resuelto' };
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_VIDEO_HOSTS = ['youtube.com', 'youtu.be', 'tiktok.com', 'instagram.com', 'facebook.com', 'fb.watch'];
const ARGENTINA_LOCATIONS = {
  "Buenos Aires": ["La Plata", "Mar del Plata", "Bahía Blanca", "Tandil", "Olavarría", "Junín", "Pergamino", "San Nicolás", "Quilmes", "Morón", "Avellaneda", "Lanús", "Lomas de Zamora", "San Isidro", "Tigre"],
  "CABA": ["Ciudad Autónoma de Buenos Aires"],
  "Catamarca": ["San Fernando del Valle de Catamarca", "Belén", "Andalgalá", "Tinogasta", "Santa María"],
  "Chaco": ["Resistencia", "Presidencia Roque Sáenz Peña", "Villa Ángela", "Charata", "Quitilipi"],
  "Chubut": ["Rawson", "Comodoro Rivadavia", "Trelew", "Puerto Madryn", "Esquel"],
  "Córdoba": ["Córdoba", "Río Cuarto", "Villa María", "San Francisco", "Carlos Paz", "Alta Gracia"],
  "Corrientes": ["Corrientes", "Goya", "Mercedes", "Paso de los Libres", "Curuzú Cuatiá"],
  "Entre Ríos": ["Paraná", "Concordia", "Gualeguaychú", "Concepción del Uruguay", "Gualeguay"],
  "Formosa": ["Formosa", "Clorinda", "Pirané", "El Colorado", "Las Lomitas"],
  "Jujuy": ["San Salvador de Jujuy", "Palpalá", "Perico", "Libertador General San Martín", "Humahuaca"],
  "La Pampa": ["Santa Rosa", "General Pico", "Toay", "Realicó", "Eduardo Castex"],
  "La Rioja": ["La Rioja", "Chilecito", "Aimogasta", "Chamical", "Chepes"],
  "Mendoza": ["Mendoza", "San Rafael", "Godoy Cruz", "Guaymallén", "Las Heras", "Luján de Cuyo"],
  "Misiones": ["Posadas", "Oberá", "Eldorado", "Puerto Iguazú", "Apóstoles"],
  "Neuquén": ["Neuquén", "Cutral Có", "Plottier", "Zapala", "San Martín de los Andes"],
  "Río Negro": ["Viedma", "General Roca", "Bariloche", "Cipolletti", "Villa Regina"],
  "Salta": ["Salta", "San Ramón de la Nueva Orán", "Tartagal", "Metán", "Rosario de la Frontera"],
  "San Juan": ["San Juan", "Rawson", "Rivadavia", "Chimbas", "Santa Lucía"],
  "San Luis": ["San Luis", "Villa Mercedes", "Merlo", "La Punta", "Juana Koslay"],
  "Santa Cruz": ["Río Gallegos", "Caleta Olivia", "El Calafate", "Puerto Deseado", "Pico Truncado"],
  "Santa Fe": ["Santa Fe", "Rosario", "Rafaela", "Venado Tuerto", "Reconquista", "Santo Tomé"],
  "Santiago del Estero": ["Santiago del Estero", "La Banda", "Termas de Río Hondo", "Frías", "Añatuya"],
  "Tierra del Fuego": ["Ushuaia", "Río Grande", "Tolhuin"],
  "Tucumán": ["San Miguel de Tucumán", "Yerba Buena", "Tafí Viejo", "Banda del Río Salí", "Concepción", "Aguilares", "Famaillá", "Monteros", "Lules", "Simoca", "Bella Vista", "Alderetes"]
};
let searchAutocomplete = null, addressAutocomplete = null, searchPlaceElement = null, addressPlaceElement = null, geocoder = null;

let supabaseClient, map, selectedMarker, chart, allReports = [], markers = [], deferredPrompt = null, googleMapsPromise = null;
let sliderSettings = { effect: "slide", interval: 4000, autoplay: true };
let evidenceIndex = 0, evidenceTimer = null;
let adminPage = 1, adminPageSize = 10, adminStatusFilter = "all";
let adminSelectedIds = new Set();
const $ = (id) => document.getElementById(id);

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function showMapError(title, message) {
  const mapEl = $('map');
  if (mapEl) mapEl.innerHTML = `<div class="map-error"><strong>${title}</strong><p>${message}</p></div>`;
  Swal.fire(title, message, 'error');
}

function loadGoogleMaps() {
  const key = window.APP_CONFIG?.GOOGLE_MAPS_API_KEY;
  if (!key || key.includes('TU_GOOGLE')) {
    showMapError('Falta configurar Google Maps', 'Abrí config.js y cargá GOOGLE_MAPS_API_KEY con una clave válida.');
    return Promise.reject(new Error('Missing Google Maps API key'));
  }
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve, reject) => {
    window.__satHDPGoogleReady = () => resolve();
    const oldScript = document.getElementById('googleMapsScript');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'googleMapsScript';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async&callback=__satHDPGoogleReady`;
    script.onerror = () => {
      const msg = 'No se pudo cargar Google Maps. Revisá que Maps JavaScript API y Places API estén habilitadas y que el referer autorizado incluya https://fmgambino.github.io/* y https://fmgambino.github.io/satHDP/*.';
      showMapError('Google Maps no cargó', msg);
      reject(new Error(msg));
    };
    document.head.appendChild(script);
  });
  return googleMapsPromise;
}

async function initMap() {
  await loadGoogleMaps();
  const { Map } = await google.maps.importLibrary('maps');
  map = new Map($('map'), {
    center: window.APP_CONFIG.MAP_CENTER,
    zoom: window.APP_CONFIG.MAP_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: document.documentElement.dataset.theme === 'dark' ? darkMapStyle : []
  });
  geocoder = new google.maps.Geocoder();
  map.addListener('click', (e) => setSelectedLocation(e.latLng.lat(), e.latLng.lng()));
  initLocationFilters();
  await initGoogleAutocomplete();
  zoomToDeviceLocation(false);
  await loadDamageTypes();
  await loadReports();
  initRealtime();
}

async function initGoogleAutocomplete() {
  try {
    const places = await google.maps.importLibrary('places');
    if (places.PlaceAutocompleteElement) {
      createPlaceAutocompleteElement('searchHost', 'Buscar dirección, barrio, plaza...', false);
      createPlaceAutocompleteElement('addressHost', 'Buscar dirección del reclamo...', true);
      return;
    }
  } catch (err) {
    console.warn('PlaceAutocompleteElement no disponible, se usa fallback legacy.', err);
  }
  createLegacyAutocomplete('searchHost', 'searchInputFallback', false);
  createLegacyAutocomplete('addressHost', 'addressInputFallback', true);
}

function createPlaceAutocompleteElement(hostId, placeholder, fillAddress) {
  const host = $(hostId);
  host.innerHTML = '';
  const el = new google.maps.places.PlaceAutocompleteElement();
  el.className = 'places-field';
  el.setAttribute('placeholder', placeholder);
  el.setAttribute('aria-label', placeholder);
  if (window.APP_CONFIG.PLACES_COUNTRY) el.includedRegionCodes = [window.APP_CONFIG.PLACES_COUNTRY];
  host.appendChild(el);
  if (hostId === 'searchHost') searchPlaceElement = el; else addressPlaceElement = el;
  applyPlaceBias();

  el.addEventListener('gmp-select', async (event) => {
    const prediction = event.placePrediction || event.detail?.placePrediction;
    if (!prediction) return;
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'viewport'] });
    const loc = place.location;
    if (!loc) return;
    const address = place.formattedAddress || place.displayName || '';
    handlePlace({ lat: loc.lat(), lng: loc.lng(), address }, fillAddress);
  });
}

function createLegacyAutocomplete(hostId, inputId, fillAddress) {
  const host = $(hostId);
  host.innerHTML = `<input id="${inputId}" placeholder="${fillAddress ? 'Buscar dirección del reclamo...' : 'Buscar dirección, barrio, plaza...'}" autocomplete="off" />`;
  const input = $(inputId);
  const options = {
    fields: ['formatted_address', 'geometry', 'name'],
    componentRestrictions: window.APP_CONFIG.PLACES_COUNTRY ? { country: window.APP_CONFIG.PLACES_COUNTRY } : undefined
  };
  const autocomplete = new google.maps.places.Autocomplete(input, options);
  if (hostId === 'searchHost') searchAutocomplete = autocomplete; else addressAutocomplete = autocomplete;
  applyPlaceBias();
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place?.geometry?.location) return;
    handlePlace({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), address: place.formatted_address || place.name || input.value }, fillAddress);
  });
}


function initLocationFilters() {
  const province = $('provinceFilter');
  const locality = $('localityFilter');
  if (!province || !locality) return;
  province.innerHTML = '<option value="">Toda Argentina</option>';
  Object.keys(ARGENTINA_LOCATIONS).sort((a, b) => a.localeCompare(b, 'es')).forEach(name => province.appendChild(new Option(name, name)));
  province.addEventListener('change', () => {
    renderLocalityOptions();
    focusMapByAdministrativeFilter();
    applyPlaceBias();
  });
  locality.addEventListener('change', () => {
    focusMapByAdministrativeFilter();
    applyPlaceBias();
  });
  renderLocalityOptions();
}

function renderLocalityOptions() {
  const province = $('provinceFilter')?.value || '';
  const locality = $('localityFilter');
  if (!locality) return;
  locality.innerHTML = '<option value="">Todas</option>';
  const items = province ? (ARGENTINA_LOCATIONS[province] || []) : [];
  items.forEach(name => locality.appendChild(new Option(name, name)));
  locality.disabled = !province;
}


function notifyToast(title, icon = 'success') {
  if (!window.Swal) return;
  Swal.fire({ toast: true, position: 'top-end', icon, title, showConfirmButton: false, timer: 2600, timerProgressBar: true });
}
function swalError(title, message) {
  Swal.fire({ icon: 'error', title, text: message || 'Ocurrió un error inesperado.' });
}

function selectedAdministrativeQuery() {
  const province = $('provinceFilter')?.value || '';
  const locality = $('localityFilter')?.value || '';
  if (locality && province) return `${locality}, ${province}, Argentina`;
  if (province) return `${province}, Argentina`;
  return 'Argentina';
}

function focusMapByAdministrativeFilter() {
  if (!geocoder || !map) return;
  geocoder.geocode({ address: selectedAdministrativeQuery(), region: 'AR' }, (results, status) => {
    if (status !== 'OK' || !results?.[0]) return;
    const geometry = results[0].geometry;
    if (geometry.viewport) map.fitBounds(geometry.viewport);
    else {
      map.setCenter(geometry.location);
      map.setZoom($('localityFilter')?.value ? 13 : ($('provinceFilter')?.value ? 8 : 5));
    }
    applyPlaceBias(geometry.viewport || null, geometry.location || null);
  });
}

function applyPlaceBias(viewport = null, location = null) {
  try {
    if (!map && !viewport) return;
    const bounds = viewport || map?.getBounds?.() || null;
    [searchAutocomplete, addressAutocomplete].filter(Boolean).forEach(ac => {
      if (bounds) ac.setBounds(bounds);
      if (ac.setOptions) ac.setOptions({ strictBounds: Boolean($('provinceFilter')?.value) });
    });
    const bias = bounds || (location ? { center: location, radius: 45000 } : null);
    [searchPlaceElement, addressPlaceElement].filter(Boolean).forEach(el => {
      if (bias) el.locationBias = bias;
      el.includedRegionCodes = ['ar'];
    });
  } catch (err) {
    console.warn('No se pudo aplicar sesgo de ubicación a Places.', err);
  }
}

function zoomToDeviceLocation(selectPoint = false) {
  if (!navigator.geolocation || !map) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setCenter({ lat: latitude, lng: longitude });
    map.setZoom(window.APP_CONFIG.DEVICE_MAP_ZOOM || 15);
    if (selectPoint) setSelectedLocation(latitude, longitude);
  }, () => {
    map.setCenter(window.APP_CONFIG.MAP_CENTER || { lat: -38.4161, lng: -63.6167 });
    map.setZoom(window.APP_CONFIG.MAP_ZOOM || 5);
  }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 120000 });
}

function handlePlace(place, fillAddress) {
  const lat = Number(place.lat), lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  map.panTo({ lat, lng });
  map.setZoom(17);
  setSelectedLocation(lat, lng);
  if (fillAddress) $('address').value = place.address || $('address').value;
}

async function loadDamageTypes() {
  const { data, error } = await supabaseClient.from('damage_types').select('*').order('sort_order').order('label');
  if (error) {
    DAMAGE_TYPES = { ...DEFAULT_DAMAGE_TYPES };
    console.warn('No se pudo leer damage_types. Ejecutá database/database.sql.', error.message);
  } else {
    DAMAGE_TYPES = {};
    (data || []).forEach(t => DAMAGE_TYPES[t.key] = { label: t.label, emoji: t.emoji, color: t.color, active: t.active });
    if (!Object.keys(DAMAGE_TYPES).length) DAMAGE_TYPES = { ...DEFAULT_DAMAGE_TYPES };
  }
  renderDamageTypeSelectors();
  renderDamageTypesAdmin();
}

function renderDamageTypeSelectors() {
  const currentType = $('type').value;
  const currentFilter = $('filterType').value || 'all';
  $('type').innerHTML = '';
  $('filterType').innerHTML = '<option value="all">Todos</option>';
  Object.entries(DAMAGE_TYPES).forEach(([key, item]) => {
    const text = `${item.emoji} ${item.label}`;
    if (item.active) $('type').appendChild(new Option(text, key));
    $('filterType').appendChild(new Option(text + (item.active ? '' : ' (inactivo)'), key));
  });
  if (DAMAGE_TYPES[currentType]?.active) $('type').value = currentType;
  $('filterType').value = DAMAGE_TYPES[currentFilter] ? currentFilter : 'all';
}

function setSelectedLocation(lat, lng) {
  $('lat').value = lat.toFixed(7);
  $('lng').value = lng.toFixed(7);
  if (selectedMarker) selectedMarker.setMap(null);
  selectedMarker = new google.maps.Marker({ position: { lat, lng }, map, draggable: true, title: 'Ubicación seleccionada' });
  selectedMarker.addListener('dragend', () => {
    const pos = selectedMarker.getPosition();
    $('lat').value = pos.lat().toFixed(7);
    $('lng').value = pos.lng().toFixed(7);
  });
}

async function loadReports() {
  const { data, error } = await supabaseClient.from('reports').select('*').order('created_at', { ascending: false });
  if (error) return Swal.fire('Error', error.message, 'error');
  allReports = data || [];
  adminSelectedIds = new Set(Array.from(adminSelectedIds).filter(id => allReports.some(r => r.id === id)));
  renderMap();
  renderChart();
  renderAdminRows();
  await renderLandingStats();
  renderEvidenceStrip();
}


function filteredReports() {
  const type = $('filterType').value;
  const status = $('filterStatus').value;
  return allReports.filter(r => (type === 'all' || r.type === type) && (status === 'all' || r.status === status));
}

function svgMarker(type) {
  const item = DAMAGE_TYPES[type] || DEFAULT_DAMAGE_TYPES.bache;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="22" r="18" fill="${item.color}" stroke="white" stroke-width="4"/><path d="M26 50 15 35h22L26 50Z" fill="${item.color}" stroke="white" stroke-width="3"/><text x="26" y="30" font-size="22" text-anchor="middle">${item.emoji}</text></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(44, 44) };
}

function renderMap() {
  if (!map) return;
  markers.forEach(m => m.setMap(null));
  markers = [];
  filteredReports().forEach(report => {
    const item = DAMAGE_TYPES[report.type] || DEFAULT_DAMAGE_TYPES.bache;
    const marker = new google.maps.Marker({ position: { lat: Number(report.lat), lng: Number(report.lng) }, map, icon: svgMarker(report.type), title: `${item.label} - ${STATUS[report.status]}` });
    const info = new google.maps.InfoWindow({ content: reportPopupHtml(report, item) });
    marker.addListener('click', () => info.open({ anchor: marker, map }));
    markers.push(marker);
  });
}

async function submitReport(e) {
  e.preventDefault();
  if (!$('lat').value || !$('lng').value) return Swal.fire('Falta ubicación', 'Seleccioná un punto en el mapa o elegí una dirección de Google Maps.', 'warning');
  const addressValue = $('address').value.trim() || $('addressReference').value.trim();
  if (!addressValue) return Swal.fire('Falta dirección', 'Elegí una dirección desde el buscador de Google Maps o agregá una referencia manual.', 'warning');

  const files = Array.from($('images')?.files || []);
  const validation = validateImages(files);
  if (!validation.ok) return Swal.fire('Imágenes inválidas', validation.message, 'warning');

  const imageUrl = $('imageUrl')?.value.trim() || '';
  if (imageUrl && !isLikelyImageUrl(imageUrl)) {
    return Swal.fire('URL de imagen no válida', 'Ingresá una URL directa a una imagen JPG, PNG, WEBP, GIF o SVG.', 'warning');
  }

  const videoUrl = $('videoUrl').value.trim();
  if (videoUrl && !isAllowedVideoUrl(videoUrl)) {
    return Swal.fire('URL de video no válida', 'Solo se permiten enlaces de YouTube, TikTok, Instagram o Facebook.', 'warning');
  }

  const submitBtn = $('reportForm').querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  try {
    const payload = {
      type: $('type').value,
      name: $('name').value.trim(),
      email: $('email').value.trim(),
      phone: $('phone').value.trim(),
      address: addressValue,
      description: $('description').value.trim(),
      lat: Number($('lat').value),
      lng: Number($('lng').value),
      video_url: videoUrl || null,
      image_urls: imageUrl ? [imageUrl] : [],
      status: 'pending'
    };

    const { data, error } = await supabaseClient.from('reports').insert(payload).select('id').single();
    if (error) throw error;

    const uploadedUrls = files.length ? await uploadReportImages(data.id, files) : [];
    const imageUrls = [...(imageUrl ? [imageUrl] : []), ...uploadedUrls].slice(0, 6);
    if (imageUrls.length) {
      const { error: updateError } = await supabaseClient.from('reports').update({ image_urls: imageUrls }).eq('id', data.id);
      if (updateError) throw updateError;
    }

    $('reportForm').reset();
    $('address').value = '';
    $('imagePreview').innerHTML = '';
    if (selectedMarker) selectedMarker.setMap(null);
    Swal.fire('Reclamo enviado', 'Tu solicitud quedó pendiente de aprobación.', 'success');
    await loadReports();
  } catch (error) {
    Swal.fire('No se pudo enviar', error.message || 'Ocurrió un error al enviar el reclamo.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar reclamo';
  }
}

function validateImages(files) {
  if (files.length > MAX_IMAGES) return { ok: false, message: `Podés cargar hasta ${MAX_IMAGES} imágenes.` };
  for (const file of files) {
    if (!file.type.startsWith('image/')) return { ok: false, message: `${file.name} no es una imagen válida.` };
    if (file.size > MAX_IMAGE_SIZE) return { ok: false, message: `${file.name} supera los 5MB.` };
  }
  return { ok: true };
}

function isAllowedVideoUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return ALLOWED_VIDEO_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isLikelyImageUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return /\.(jpe?g|png|webp|gif|svg)(\?.*)?$/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

function getReportImages(report) {
  return Array.isArray(report.image_urls) ? report.image_urls.filter(Boolean) : [];
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
}

function reportAge(value) {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const days = Math.floor(diff / 86400000);
  if (days >= 365) return `${Math.floor(days / 365)} año${Math.floor(days / 365) === 1 ? '' : 's'}`;
  if (days >= 30) return `${Math.floor(days / 30)} mes${Math.floor(days / 30) === 1 ? '' : 'es'}`;
  if (days >= 1) return `${days} día${days === 1 ? '' : 's'}`;
  const hours = Math.floor(diff / 3600000);
  if (hours >= 1) return `${hours} hora${hours === 1 ? '' : 's'}`;
  return 'Hoy';
}

function reportPopupHtml(report, item) {
  const images = getReportImages(report);
  const mainImage = images[0] || window.APP_CONFIG?.DEFAULT_REPORT_IMAGE || '';
  const hero = mainImage ? `<a href="${escapeHtml(mainImage)}" target="_blank" rel="noopener"><img class="popup-main-image" src="${escapeHtml(mainImage)}" alt="Imagen principal del reclamo"></a>` : `<div class="popup-main-image empty">${item.emoji}</div>`;
  const thumbs = images.length > 1 ? `<div class="popup-thumbs">${images.slice(1, 6).map((url, i) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="Imagen ${i + 2}"></a>`).join('')}</div>` : '';
  const video = report.video_url ? `<a class="popup-video" href="${escapeHtml(report.video_url)}" target="_blank" rel="noopener">🎬 Ver video adjunto</a>` : '';
  return `<article class="info popup-card">
    ${hero}
    <div class="popup-body">
      <div class="popup-top"><span class="damage-title">${item.emoji} ${escapeHtml(item.label)}</span><span class="status-pill ${report.status}">${STATUS[report.status] || report.status}</span></div>
      <h3>${escapeHtml(report.address)}</h3>
      <p>${escapeHtml(report.description)}</p>
      <div class="popup-meta">
        <div><small>Antigüedad</small><strong>${reportAge(report.created_at)}</strong></div>
        <div><small>Reportado</small><strong>${formatDate(report.created_at)}</strong></div>
      </div>
      ${thumbs}
      ${video}
    </div>
  </article>`;
}

async function fetchCount(filterStatus = null) {
  let query = supabaseClient.from('reports').select('id', { count: 'exact', head: true });
  if (filterStatus) query = Array.isArray(filterStatus) ? query.in('status', filterStatus) : query.eq('status', filterStatus);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function renderLandingStats() {
  try {
    const [total, inReview, approved, resolved] = await Promise.all([
      fetchCount(), fetchCount(['pending', 'analysis']), fetchCount('approved'), fetchCount('resolved')
    ]);
    if ($('statTotal')) $('statTotal').textContent = total;
    if ($('statPending')) $('statPending').textContent = inReview;
    if ($('statApproved')) $('statApproved').textContent = approved;
    if ($('statResolved')) $('statResolved').textContent = resolved;
  } catch (err) {
    console.warn('No se pudieron obtener contadores directos; usando datos cargados.', err);
    const total = allReports.length;
    const inReview = allReports.filter(r => ['pending', 'analysis'].includes(r.status)).length;
    const approved = allReports.filter(r => r.status === 'approved').length;
    const resolved = allReports.filter(r => r.status === 'resolved').length;
    if ($('statTotal')) $('statTotal').textContent = total;
    if ($('statPending')) $('statPending').textContent = inReview;
    if ($('statApproved')) $('statApproved').textContent = approved;
    if ($('statResolved')) $('statResolved').textContent = resolved;
  }
}

function renderEvidenceStrip() {
  const wrap = $('evidenceStrip');
  const dots = $('evidenceDots');
  const slider = $('evidenceSlider');
  if (!wrap) return;
  const items = allReports.filter(r => getReportImages(r).length || r.video_url).slice(0, 12);
  if (slider) { slider.classList.remove('effect-slide', 'effect-fade', 'effect-zoom'); slider.classList.add('effect-' + (sliderSettings.effect || 'slide')); }
  if (!items.length) { wrap.innerHTML = '<div class="empty-evidence">Cuando los vecinos suban imágenes o videos, aparecerán en este slider.</div>'; if (dots) dots.innerHTML = ''; return; }
  if (evidenceIndex >= items.length) evidenceIndex = 0;
  wrap.innerHTML = items.map((r, i) => evidenceSlideHtml(r, i === evidenceIndex)).join('');
  if (dots) dots.innerHTML = items.map((_, i) => '<button class="' + (i === evidenceIndex ? 'active' : '') + '" data-slide="' + i + '" aria-label="Ver reclamo ' + (i + 1) + '"></button>').join('');
  dots?.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { evidenceIndex = Number(btn.dataset.slide); renderEvidenceStrip(); restartEvidenceAutoplay(); }));
  restartEvidenceAutoplay();
}

function evidenceSlideHtml(report, active) {
  const images = getReportImages(report);
  const img = images[0] || window.APP_CONFIG?.DEFAULT_REPORT_IMAGE || '';
  const item = DAMAGE_TYPES[report.type] || { emoji: '📍', label: report.type };
  const videoEmbed = report.video_url ? videoEmbedHtml(report.video_url) : '';
  const media = videoEmbed || (img ? '<img src="' + escapeHtml(img) + '" alt="Imagen del reclamo">' : '<div class="popup-main-image empty">' + item.emoji + '</div>');
  const videoLink = report.video_url ? '<a class="evidence-video-link" href="' + escapeHtml(report.video_url) + '" target="_blank" rel="noopener">🎬 Ver video</a>' : '';
  return '<article class="evidence-slide ' + (active ? 'active' : '') + '"><div class="evidence-card"><div class="evidence-media">' + media + videoLink + '</div><div class="evidence-info"><span class="eyebrow">' + item.emoji + ' ' + escapeHtml(item.label) + '</span><h3>' + escapeHtml(report.address) + '</h3><p>' + escapeHtml(report.description || 'Sin descripción') + '</p><span class="status-pill ' + report.status + '">' + (STATUS[report.status] || report.status) + '</span><div class="evidence-meta"><div><small>Antigüedad</small><strong>' + reportAge(report.created_at) + '</strong></div><div><small>Reportado</small><strong>' + formatDate(report.created_at) + '</strong></div></div></div></div></article>';
}

function videoEmbedHtml(urlValue) {
  try {
    const url = new URL(urlValue);
    const host = url.hostname.replace(/^www./, '').toLowerCase();
    let src = '';
    if (host === 'youtu.be') src = 'https://www.youtube.com/embed/' + url.pathname.replace('/', '');
    if (host.endsWith('youtube.com')) { const v = url.searchParams.get('v'); if (v) src = 'https://www.youtube.com/embed/' + v; }
    if (!src) return '';
    return '<iframe src="' + escapeHtml(src) + '" title="Video del reclamo" loading="lazy" allowfullscreen></iframe>';
  } catch { return ''; }
}

function nextEvidenceSlide(delta = 1) {
  const total = allReports.filter(r => getReportImages(r).length || r.video_url).slice(0, 12).length;
  if (!total) return;
  evidenceIndex = (evidenceIndex + delta + total) % total;
  renderEvidenceStrip();
}

function restartEvidenceAutoplay() {
  if (evidenceTimer) clearInterval(evidenceTimer);
  if (!sliderSettings.autoplay) return;
  evidenceTimer = setInterval(() => nextEvidenceSlide(1), Number(sliderSettings.interval) || 4000);
}

async function uploadReportImages(reportId, files) {
  const urls = [];
  const bucket = window.APP_CONFIG?.SUPABASE_STORAGE_BUCKET || 'report-images';

  for (const file of files) {
    const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `reports/${reportId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabaseClient.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });
    if (error) throw error;
    const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }

  return urls;
}

function renderImagePreview() {
  const wrap = $('imagePreview');
  if (!wrap) return;
  const files = Array.from($('images')?.files || []);
  const validation = validateImages(files);
  wrap.innerHTML = '';
  if (!validation.ok) {
    Swal.fire('Imágenes inválidas', validation.message, 'warning');
    $('images').value = '';
    return;
  }
  files.forEach(file => {
    const div = document.createElement('div');
    div.className = 'preview-thumb';
    div.innerHTML = `<img alt="${escapeHtml(file.name)}"><span>${formatBytes(file.size)}</span>`;
    div.querySelector('img').src = URL.createObjectURL(file);
    wrap.appendChild(div);
  });
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function reportMediaHtml(report) {
  const images = getReportImages(report);
  const gallery = images.length ? `<div class="report-gallery">${images.slice(0, 5).map((url, i) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><img src="${escapeHtml(url)}" alt="Imagen ${i + 1} del reclamo"></a>`).join('')}</div>` : '';
  const video = report.video_url ? `<div class="media-links"><a href="${escapeHtml(report.video_url)}" target="_blank" rel="noopener">🎬 Ver video</a></div>` : '';
  return gallery + video;
}

function adminMediaHtml(report) {
  const images = getReportImages(report);
  const parts = [];
  if (images.length) parts.push(`<a href="${escapeHtml(images[0])}" target="_blank" rel="noopener">🖼️ ${images.length}</a>`);
  if (report.video_url) parts.push(`<a href="${escapeHtml(report.video_url)}" target="_blank" rel="noopener">🎬 Video</a>`);
  return parts.length ? `<div class="media-links">${parts.join('')}</div>` : '<span class="muted small">Sin media</span>';
}

function renderChart() {
  renderLandingStats();
  renderEvidenceStrip();
  const ctx = $('reportsChart');
  if (!ctx) return;
  const counts = Object.fromEntries(Object.keys(DAMAGE_TYPES).map(k => [DAMAGE_TYPES[k].label, 0]));
  filteredReports().forEach(r => {
    const key = DAMAGE_TYPES[r.type]?.label || r.type;
    counts[key] = (counts[key] || 0) + 1;
  });
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: $('chartType').value,
    data: { labels: Object.keys(counts), datasets: [{ label: 'Reclamos', data: Object.values(counts) }] },
    options: { responsive: true, plugins: { legend: { display: true } }, scales: $('chartType').value === 'pie' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

async function loadSliderSettings() {
  try {
    const local = localStorage.getItem('satHDP_sliderSettings');
    if (local) sliderSettings = { ...sliderSettings, ...JSON.parse(local) };
    const { data, error } = await supabaseClient.from('app_settings').select('value').eq('key', 'evidence_slider').maybeSingle();
    if (!error && data?.value) sliderSettings = { ...sliderSettings, ...data.value };
  } catch (err) { console.warn('Usando configuración local del slider.', err.message); }
  fillSliderSettingsForm();
}

function fillSliderSettingsForm() {
  if ($('sliderEffect')) $('sliderEffect').value = sliderSettings.effect || 'slide';
  if ($('sliderInterval')) $('sliderInterval').value = Number(sliderSettings.interval) || 4000;
  if ($('sliderAutoplay')) $('sliderAutoplay').checked = sliderSettings.autoplay !== false;
}

async function saveSliderSettings(e) {
  if (e?.preventDefault) e.preventDefault();
  sliderSettings = { effect: $('sliderEffect').value, interval: Number($('sliderInterval').value) || 4000, autoplay: $('sliderAutoplay').checked };
  localStorage.setItem('satHDP_sliderSettings', JSON.stringify(sliderSettings));
  Swal.fire({ title: 'Guardando slider...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const { error } = await supabaseClient.from('app_settings').upsert({ key: 'evidence_slider', value: sliderSettings }, { onConflict: 'key' });
    if (error) throw error;
    renderEvidenceStrip();
    Swal.close();
    notifyToast('Slider actualizado', 'success');
  } catch (err) {
    Swal.close();
    swalError('No se pudo guardar el slider', err.message);
  }
}


async function adminLogin() {
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $('adminEmail').value, password: $('adminPassword').value });
  if (error) return Swal.fire('Acceso denegado', error.message, 'error');
  await checkSession();
}

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  const logged = !!data.session;
  $('loginBox').classList.toggle('hidden', logged);
  $('adminBox').classList.toggle('hidden', !logged);
  if (logged) { renderAdminRows(); renderDamageTypesAdmin(); }
}

function renderAdminRows() {
  const tbody = $('adminRows');
  if (!tbody) return;
  const adminRowsSource = adminStatusFilter === "all" ? allReports : allReports.filter(r => r.status === adminStatusFilter);
  const total = adminRowsSource.length;
  const totalPages = Math.max(1, Math.ceil(total / adminPageSize));
  adminPage = Math.min(Math.max(1, adminPage), totalPages);
  const startIndex = (adminPage - 1) * adminPageSize;
  const pageRows = adminRowsSource.slice(startIndex, startIndex + adminPageSize);

  tbody.innerHTML = '';
  pageRows.forEach(r => {
    const item = DAMAGE_TYPES[r.type] || { emoji: '', label: r.type };
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="admin-row-check" type="checkbox" data-id="${r.id}" ${adminSelectedIds.has(r.id) ? 'checked' : ''} aria-label="Seleccionar reclamo"></td><td>${formatDate(r.created_at)}</td><td>${item.emoji} ${item.label}</td><td>${escapeHtml(r.address)}</td><td>${escapeHtml(r.name)}<br><small>${escapeHtml(r.email)}</small></td><td><span class="badge ${r.status}">${STATUS[r.status] || r.status}</span></td><td>${adminMediaHtml(r)}</td><td class="row-actions"><button data-status="approved">Aprobar</button><button data-status="analysis">En revisión</button><button data-status="resolved">Resuelto</button><button data-edit="1">Editar</button><button data-status="rejected">Rechazar</button></td>`;
    tr.querySelectorAll('button[data-status]').forEach(btn => btn.addEventListener('click', () => updateStatus(r.id, btn.dataset.status)));
    tr.querySelector('button[data-edit]')?.addEventListener('click', () => editReport(r));
    tr.querySelector('.admin-row-check').addEventListener('change', (e) => {
      if (e.target.checked) adminSelectedIds.add(r.id); else adminSelectedIds.delete(r.id);
      updateAdminSelectionUI();
    });
    tbody.appendChild(tr);
  });
  updateAdminPager(total, totalPages);
  updateAdminSelectionUI();
}

function updateAdminPager(total, totalPages) {
  const text = total ? `Página ${adminPage} de ${totalPages} · ${total} reclamos` : 'Sin reclamos';
  ['Top','Bottom'].forEach(pos => {
    const info = $('adminPageInfo' + pos);
    const prev = $('adminPrev' + pos);
    const next = $('adminNext' + pos);
    const size = $('adminPageSize' + pos);
    if (info) info.textContent = text;
    if (prev) prev.disabled = adminPage <= 1;
    if (next) next.disabled = adminPage >= totalPages;
    if (size && String(size.value) !== String(adminPageSize)) size.value = String(adminPageSize);
  });
}

function updateAdminSelectionUI() {
  const selected = adminSelectedIds.size;
  ['selectedCount','selectedCountBottom'].forEach(id => { if ($(id)) $(id).textContent = `${selected} seleccionado${selected === 1 ? '' : 's'}`; });
  const pageChecks = Array.from(document.querySelectorAll('.admin-row-check'));
  const allPageChecked = pageChecks.length > 0 && pageChecks.every(ch => ch.checked);
  ['selectAllTop','selectAllBottom','selectAllHead'].forEach(id => { if ($(id)) { $(id).checked = allPageChecked; $(id).indeterminate = selected > 0 && !allPageChecked; }});
}

function setAdminPageSize(size) {
  adminPageSize = Number(size) || 10;
  adminPage = 1;
  renderAdminRows();
}

function toggleSelectCurrentPage(checked) {
  document.querySelectorAll('.admin-row-check').forEach(ch => {
    ch.checked = checked;
    if (checked) adminSelectedIds.add(ch.dataset.id); else adminSelectedIds.delete(ch.dataset.id);
  });
  updateAdminSelectionUI();
}

async function updateReportsStatus(ids, status) {
  const payload = { status, updated_at: new Date().toISOString() };
  const bulk = await supabaseClient.from('reports').update(payload).in('id', ids);
  if (!bulk.error) return;
  for (const id of ids) {
    const single = await supabaseClient.from('reports').update(payload).eq('id', id);
    if (single.error) throw single.error;
  }
}

async function bulkUpdateStatus(status, evt) {
  if (evt?.preventDefault) evt.preventDefault();
  const ids = Array.from(adminSelectedIds).filter(Boolean);
  if (!ids.length) return Swal.fire('Sin selección', 'Seleccioná uno o más reclamos.', 'info');
  const label = STATUS[status] || status;
  const { isConfirmed } = await Swal.fire({ title: `Actualizar ${ids.length} reclamo${ids.length === 1 ? '' : 's'}`, text: `Se marcarán como: ${label}.`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, actualizar', cancelButtonText: 'Cancelar' });
  if (!isConfirmed) return;
  Swal.fire({ title: 'Actualizando reclamos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    await updateReportsStatus(ids, status);
    adminSelectedIds.clear();
    await loadReports();
    Swal.close();
    notifyToast(`${ids.length} reclamo${ids.length === 1 ? '' : 's'} actualizado${ids.length === 1 ? '' : 's'}`, 'success');
  } catch (error) {
    Swal.close();
    swalError('No se pudo actualizar', error.message);
  }
}

async function bulkDeleteReports(evt) {
  if (evt?.preventDefault) evt.preventDefault();
  const ids = Array.from(adminSelectedIds).filter(Boolean);
  if (!ids.length) return Swal.fire('Sin selección', 'Seleccioná uno o más reclamos.', 'info');
  const { isConfirmed } = await Swal.fire({ title: `¿Eliminar ${ids.length} reclamo(s)?`, text: 'Esta acción no se puede deshacer.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar' });
  if (!isConfirmed) return;
  Swal.fire({ title: 'Eliminando reclamos...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const { error } = await supabaseClient.from('reports').delete().in('id', ids);
    if (error) throw error;
    adminSelectedIds.clear();
    await loadReports();
    Swal.close();
    notifyToast('Reclamos eliminados', 'success');
  } catch (error) {
    Swal.close();
    swalError('No se pudo eliminar', error.message);
  }
}

async function updateStatus(id, status) {
  Swal.fire({ title: 'Actualizando reclamo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    await updateReportsStatus([id], status);
    await loadReports();
    Swal.close();
    notifyToast(`Solicitud marcada como: ${STATUS[status]}`, 'success');
  } catch (error) {
    Swal.close();
    swalError('No se pudo actualizar', error.message);
  }
}


function adminExportRows() {
  return adminStatusFilter === 'all' ? allReports : allReports.filter(r => r.status === adminStatusFilter);
}

function csvEscape(value) {
  const text = String(value ?? '').replace(/\r?\n/g, ' ');
  return /[",;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportReportsCsv() {
  const rows = adminExportRows();
  const headers = ['id','fecha','tipo','estado','direccion','nombre','email','telefono','descripcion','lat','lng','imagenes','video'];
  const lines = [headers.join(';')];
  rows.forEach(r => {
    const item = DAMAGE_TYPES[r.type] || { label: r.type };
    lines.push([
      r.id, formatDate(r.created_at), item.label, STATUS[r.status] || r.status, r.address,
      r.name, r.email, r.phone, r.description, r.lat, r.lng, getReportImages(r).join(' | '), r.video_url || ''
    ].map(csvEscape).join(';'));
  });
  downloadBlob('\ufeff' + lines.join('\n'), `reclamos-${adminStatusFilter}-${new Date().toISOString().slice(0,10)}.csv`, 'text/csv;charset=utf-8');
}

function exportReportsPdf() {
  const rows = adminExportRows();
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) return Swal.fire('PDF no disponible', 'No se pudo cargar la librería jsPDF.', 'error');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text(`Registro de reclamos - ${adminStatusFilter === 'all' ? 'Todos' : (STATUS[adminStatusFilter] || adminStatusFilter)}`, 12, 14);
  doc.setFontSize(8);
  let y = 22;
  const cols = [12, 42, 76, 105, 138, 178, 218, 252];
  ['Fecha','Tipo','Estado','Dirección','Solicitante','Email','Teléfono','Media'].forEach((h, i) => doc.text(h, cols[i], y));
  y += 5;
  doc.line(12, y, 285, y);
  y += 5;
  rows.forEach(r => {
    if (y > 190) { doc.addPage(); y = 16; }
    const item = DAMAGE_TYPES[r.type] || { label: r.type };
    const vals = [formatDate(r.created_at), item.label, STATUS[r.status] || r.status, r.address, r.name, r.email, r.phone || '-', `${getReportImages(r).length} img${r.video_url ? ' + video' : ''}`];
    vals.forEach((v, i) => doc.text(doc.splitTextToSize(String(v ?? ''), i === 3 ? 32 : 28), cols[i], y));
    y += 12;
  });
  doc.save(`reclamos-${adminStatusFilter}-${new Date().toISOString().slice(0,10)}.pdf`);
}

async function editReport(report) {
  const typeOptions = Object.entries(DAMAGE_TYPES).map(([key, t]) => `<option value="${key}" ${report.type === key ? 'selected' : ''}>${escapeHtml(t.emoji + ' ' + t.label)}</option>`).join('');
  const statusOptions = Object.entries(STATUS).map(([key, label]) => `<option value="${key}" ${report.status === key ? 'selected' : ''}>${label}</option>`).join('');
  const html = `<div class="edit-report-form">
    <label>Tipo<select id="editType">${typeOptions}</select></label>
    <label>Estado<select id="editStatus">${statusOptions}</select></label>
    <label>Dirección<input id="editAddress" value="${escapeHtml(report.address)}"></label>
    <label>Descripción<textarea id="editDescription" rows="3">${escapeHtml(report.description || '')}</textarea></label>
    <label>Agregar imágenes<input id="editImages" type="file" accept="image/*" multiple></label>
    <label>URL de imagen<input id="editImageUrl" type="url" placeholder="https://.../foto.jpg"></label>
    <label>URL de video<input id="editVideoUrl" type="url" value="${escapeHtml(report.video_url || '')}"></label>
  </div>`;
  const res = await Swal.fire({ title: 'Editar reclamo', html, width: 720, showCancelButton: true, confirmButtonText: 'Guardar cambios', cancelButtonText: 'Cancelar', focusConfirm: false, preConfirm: () => {
    const files = Array.from(document.getElementById('editImages')?.files || []);
    const validation = validateImages(files);
    if (!validation.ok) { Swal.showValidationMessage(validation.message); return false; }
    const imageUrl = document.getElementById('editImageUrl').value.trim();
    if (imageUrl && !isLikelyImageUrl(imageUrl)) { Swal.showValidationMessage('La URL de imagen no parece válida.'); return false; }
    const videoUrl = document.getElementById('editVideoUrl').value.trim();
    if (videoUrl && !isAllowedVideoUrl(videoUrl)) { Swal.showValidationMessage('La URL de video no es válida.'); return false; }
    return { files, imageUrl, videoUrl, type: document.getElementById('editType').value, status: document.getElementById('editStatus').value, address: document.getElementById('editAddress').value.trim(), description: document.getElementById('editDescription').value.trim() };
  }});
  if (!res.isConfirmed) return;
  try {
    const uploaded = res.value.files.length ? await uploadReportImages(report.id, res.value.files) : [];
    const imageUrls = [...getReportImages(report), ...(res.value.imageUrl ? [res.value.imageUrl] : []), ...uploaded].slice(0, 12);
    const { error } = await supabaseClient.from('reports').update({ type: res.value.type, status: res.value.status, address: res.value.address, description: res.value.description, video_url: res.value.videoUrl || null, image_urls: imageUrls }).eq('id', report.id);
    if (error) throw error;
    await loadReports();
    Swal.fire('Guardado', 'El reclamo fue actualizado.', 'success');
  } catch (error) {
    Swal.fire('No se pudo guardar', error.message || 'Revisá la configuración de Supabase Storage y las políticas RLS.', 'error');
  }
}


function renderDamageTypesAdmin() {
  const wrap = $('damageTypesRows');
  if (!wrap) return;
  wrap.innerHTML = '';
  Object.entries(DAMAGE_TYPES).forEach(([key, t]) => {
    const card = document.createElement('div');
    card.className = 'type-chip';
    card.innerHTML = `<span class="type-emoji" style="background:${t.color}">${t.emoji}</span><div><strong>${t.label}</strong><small>${key} · ${t.active ? 'activo' : 'inactivo'}</small></div><div class="type-actions"><button class="edit">Editar</button><button class="toggle">${t.active ? 'Desactivar' : 'Activar'}</button></div>`;
    card.querySelector('.edit').addEventListener('click', () => { $('damageKey').value = key; $('damageKey').readOnly = true; $('damageLabel').value = t.label; $('damageEmoji').value = t.emoji; $('damageColor').value = t.color; $('damageActive').checked = !!t.active; });
    card.querySelector('.toggle').addEventListener('click', () => saveDamageType({ key, label: t.label, emoji: t.emoji, color: t.color, active: !t.active }));
    wrap.appendChild(card);
  });
}

async function saveDamageType(values) {
  const row = { key: values.key, label: values.label, emoji: values.emoji, color: values.color, active: values.active, sort_order: 100, updated_at: new Date().toISOString() };
  Swal.fire({ title: 'Guardando tipo de daño...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const { error } = await supabaseClient.from('damage_types').upsert(row, { onConflict: 'key' });
    if (error) throw error;
    $('damageTypeForm').reset();
    $('damageKey').readOnly = false;
    $('damageColor').value = '#38bdf8';
    $('damageActive').checked = true;
    await loadDamageTypes();
    renderMap();
    renderChart();
    Swal.close();
    notifyToast('Tipo de daño actualizado', 'success');
  } catch (error) {
    Swal.close();
    swalError('No se pudo guardar el tipo de daño', error.message);
  }
}



function socialIconSvg(name) {
  // SVG gratuitos embebidos (estilo Simple Icons / Bootstrap Icons) para evitar dependencias pagas.
  const icons = {
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.412c0-3.024 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.49 0-1.956.93-1.956 1.886v2.266h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.8 2h8.4A5.8 5.8 0 0 1 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8A5.8 5.8 0 0 1 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2Zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6Zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.75 2c.39 3.05 2.1 4.87 5.1 5.06v3.43c-1.74.17-3.26-.4-5-1.47v6.42c0 8.15-8.88 10.7-12.45 4.86-2.3-3.77-.9-10.38 6.5-10.64v3.62c-.57.09-1.18.23-1.73.42-1.66.56-2.6 1.6-2.34 3.43.5 3.49 6.9 4.52 6.37-2.3V2h3.55Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.12C19.55 3.58 12 3.58 12 3.58s-7.55 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.12c1.85.5 9.4.5 9.4.5s7.55 0 9.4-.5a3 3 0 0 0 2.1-2.12A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8ZM9.55 15.56V8.44L15.82 12l-6.27 3.56Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.04 15.47 8.64 21c.57 0 .82-.25 1.12-.55l2.69-2.59 5.57 4.1c1.02.57 1.74.27 2.02-.95L23.7 3.79c.33-1.54-.55-2.14-1.54-1.77L.64 10.33c-1.47.58-1.45 1.42-.25 1.8l5.5 1.72L18.66 5.8c.6-.4 1.15-.18.7.23L9.04 15.47Z"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.05-4.11A3 3 0 1 0 15 5c0 .24.03.47.08.69L8.03 9.8a3 3 0 1 0 0 4.4l7.12 4.17c-.05.2-.08.41-.08.63a2.93 2.93 0 1 0 2.93-2.92Z"/></svg>'
  };
  return icons[name] || '';
}

function renderSocialIcons() {
  const links = window.APP_CONFIG?.SOCIAL_LINKS || {};
  const items = [['facebook','Facebook'],['instagram','Instagram'],['tiktok','TikTok'],['youtube','YouTube'],['telegram','Telegram'],['share','Compartir']];
  const html = items.map(([key, label]) => {
    const href = key === 'share' ? '#' : (links[key] || '#');
    const target = key === 'share' || href === '#' ? '_self' : '_blank';
    return '<a class="social-btn social-' + key + '" href="' + escapeHtml(href) + '" target="' + target + '" rel="noopener" aria-label="' + label + '" title="' + label + '" data-social="' + key + '">' + socialIconSvg(key) + '</a>';
  }).join('');
  document.querySelectorAll('.social-icons').forEach(el => el.innerHTML = html);
  document.querySelectorAll('[data-social="share"]').forEach(btn => btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const shareData = { title: document.title, text: links.shareText || 'Mapa de Reclamos', url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(location.href);
        Swal.fire('Enlace copiado', 'El link del mapa fue copiado al portapapeles.', 'success');
      }
    } catch (_) {}
  }));
}

function initMobileMenu() {
  const btn = $('mobileMenuBtn');
  const header = document.querySelector('.topbar');
  if (!btn || !header) return;
  const closeMenu = () => { header.classList.remove('menu-open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = header.classList.toggle('menu-open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('#mainNav a, #mainNav button:not(#themeToggle)').forEach(el => el.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (window.innerWidth >= 700) closeMenu(); });
}

function bindEvents() {
  renderSocialIcons();
  initMobileMenu();
  $('reportForm').addEventListener('submit', submitReport);
  $('images')?.addEventListener('change', renderImagePreview);
  ['filterType', 'filterStatus'].forEach(id => $(id).addEventListener('input', () => { renderMap(); renderChart(); }));
  $('chartType').addEventListener('change', renderChart);
  $('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return Swal.fire('Ubicación', 'Tu navegador no permite usar geolocalización.', 'warning');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      map.setCenter({ lat: latitude, lng: longitude });
      map.setZoom(17);
      setSelectedLocation(latitude, longitude);
    }, () => Swal.fire('Ubicación', 'No se pudo obtener tu ubicación. Se mantiene el mapa de Argentina.', 'warning'), { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
  });
  $('adminToggleBtn').addEventListener('click', async () => { $('adminDialog').showModal(); await checkSession(); });
  $('fullscreenBtn')?.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      Swal.fire('Pantalla completa', 'El navegador no permitió cambiar a pantalla completa.', 'info');
    }
  });
  $('closeAdminBtn').addEventListener('click', () => $('adminDialog').close());
  $('loginBox').addEventListener('submit', (e) => { e.preventDefault(); adminLogin(); });
  $('logoutBtn').addEventListener('click', async () => { await supabaseClient.auth.signOut(); await checkSession(); });
  $('refreshAdminBtn').addEventListener('click', async () => { await loadDamageTypes(); await loadReports(); });
  $("exportCsvBtn")?.addEventListener("click", exportReportsCsv);
  $("exportPdfBtn")?.addEventListener("click", exportReportsPdf);

  ['Top','Bottom'].forEach(pos => {
    $('adminPrev' + pos)?.addEventListener('click', () => { adminPage = Math.max(1, adminPage - 1); renderAdminRows(); });
    $('adminNext' + pos)?.addEventListener('click', () => { adminPage += 1; renderAdminRows(); });
    $('adminPageSize' + pos)?.addEventListener('change', (e) => setAdminPageSize(e.target.value));
    $("adminStatusFilter" + pos)?.addEventListener("change", (e) => { adminStatusFilter = e.target.value; adminPage = 1; adminSelectedIds.clear(); ["Top","Bottom"].forEach(p => { const el = $("adminStatusFilter" + p); if (el) el.value = adminStatusFilter; }); renderAdminRows(); });
    $('bulkApprove' + pos)?.addEventListener('click', (e) => bulkUpdateStatus('approved', e));
    $('bulkAnalysis' + pos)?.addEventListener('click', (e) => bulkUpdateStatus('analysis', e));
    $('bulkResolve' + pos)?.addEventListener('click', (e) => bulkUpdateStatus('resolved', e));
    $('bulkReject' + pos)?.addEventListener('click', (e) => bulkUpdateStatus('rejected', e));
    $('bulkDelete' + pos)?.addEventListener('click', bulkDeleteReports);
  });
  ['selectAllTop','selectAllBottom','selectAllHead'].forEach(id => $(id)?.addEventListener('change', (e) => toggleSelectCurrentPage(e.target.checked)));

  $('damageTypeForm').addEventListener('submit', (e) => { e.preventDefault(); saveDamageType({ key: $('damageKey').value.trim(), label: $('damageLabel').value.trim(), emoji: $('damageEmoji').value.trim(), color: $('damageColor').value, active: $('damageActive').checked }); });
  $('sliderSettingsForm')?.addEventListener('submit', saveSliderSettings);
  $('evidencePrev')?.addEventListener('click', () => { nextEvidenceSlide(-1); restartEvidenceAutoplay(); });
  $('evidenceNext')?.addEventListener('click', () => { nextEvidenceSlide(1); restartEvidenceAutoplay(); });
  $('themeToggle').addEventListener('click', toggleTheme);
  $('installBtn').addEventListener('click', promptInstallPWA);
}

function initRealtime() {
  supabaseClient.channel('public-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, loadReports)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'damage_types' }, async () => { await loadDamageTypes(); renderMap(); renderChart(); })
    .subscribe();
}

function initTheme() {
  document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';
  applyHeroMediaConfig();
}

function applyHeroMediaConfig() {
  const cfg = window.APP_CONFIG || {};
  if (cfg.HERO_BACKGROUND_IMAGE) document.documentElement.style.setProperty('--hero-image', `url("${cfg.HERO_BACKGROUND_IMAGE}")`);
  if (cfg.HERO_BACKGROUND_VIDEO) {
    const hero = document.querySelector('.hero-section');
    if (hero && !hero.querySelector('.hero-video')) {
      const video = document.createElement('video');
      video.className = 'hero-video';
      video.autoplay = true; video.muted = true; video.loop = true; video.playsInline = true;
      video.src = cfg.HERO_BACKGROUND_VIDEO;
      hero.prepend(video);
    }
  }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  if (map) map.setOptions({ styles: next === 'dark' ? darkMapStyle : [] });
}

function isPWAInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

async function promptInstallPWA() {
  if (isPWAInstalled()) return;
  const html = deferredPrompt
    ? "Instalá la PWA en tu dispositivo para reportar daños, consultar el mapa y acceder más rápido."
    : (isMobileDevice()
        ? "Para instalarla, abrí el menú del navegador y elegí <b>Agregar a pantalla de inicio</b> o <b>Instalar app</b>."
        : "Tu navegador todavía no habilitó la instalación automática. Usá el botón <b>Instalar PWA</b> o el ícono de instalación de la barra del navegador cuando aparezca.");
  const res = await Swal.fire({
    title: "Instalar MUNIPA-HDP",
    html,
    imageUrl: "/img/8.svg",
    imageWidth: 112,
    imageHeight: 112,
    showCancelButton: true,
    confirmButtonText: deferredPrompt ? "Instalar app" : "Entendido",
    cancelButtonText: "Ahora no",
    customClass: { popup: "install-swal-popup" }
  });
  if (!res.isConfirmed || !deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn")?.classList.add("hidden");
}

function offerInstallPWA(force = false) {
  if (isPWAInstalled()) return;
  const key = "satHDP_install_offered_v12b";
  if (!force && sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  setTimeout(() => promptInstallPWA(), isMobileDevice() ? 900 : 1400);
}

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn")?.classList.remove("hidden");
  offerInstallPWA(true);
});
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] }
];

(async function boot() {
  initTheme();
  initSupabase();
  bindEvents();
  try { await loadSliderSettings(); } catch (err) { console.warn(err); }
  try { await initMap(); } catch (err) { console.error(err); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  offerInstallPWA(false);
})();
