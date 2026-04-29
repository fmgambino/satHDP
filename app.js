const DEFAULT_DAMAGE_TYPES = {
  cano_roto: { label: 'Caño roto', emoji: '💧', color: '#38bdf8', active: true },
  falta_asfalto: { label: 'Falta asfalto', emoji: '🛣️', color: '#94a3b8', active: true },
  bache: { label: 'Bache', emoji: '🕳️', color: '#f59e0b', active: true },
  poste_caido: { label: 'Poste caído', emoji: '⚡', color: '#facc15', active: true },
  arbol_caido: { label: 'Árbol caído', emoji: '🌳', color: '#22c55e', active: true }
};
let DAMAGE_TYPES = { ...DEFAULT_DAMAGE_TYPES };

const STATUS = { pending: 'Pendiente', analysis: 'En análisis', approved: 'Aprobado', rejected: 'Rechazado' };
let supabaseClient, map, selectedMarker, chart, searchAutocomplete, addressAutocomplete;
let allReports = [], markers = [], deferredPrompt = null;
const $ = (id) => document.getElementById(id);

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function loadGoogleMaps() {
  const key = window.APP_CONFIG?.GOOGLE_MAPS_API_KEY;
  if (!key || key === 'TU_GOOGLE_MAPS_API_KEY') {
    Swal.fire('Falta configurar Google Maps', 'Abrí config.js y cargá GOOGLE_MAPS_API_KEY con una clave válida que tenga Maps JavaScript API y Places API habilitadas.', 'warning');
    return;
  }
  if (window.google?.maps) { window.initMap(); return; }
  let script = document.getElementById('googleMapsScript');
  if (!script) {
    script = document.createElement('script');
    script.id = 'googleMapsScript';
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }
  script.onerror = () => Swal.fire('Google Maps no cargó', 'Verificá la API key, las APIs habilitadas, las restricciones HTTP y que el sitio se publique por HTTPS.', 'error');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=initMap`;
}

window.initMap = async function () {
  map = new google.maps.Map($('map'), {
    center: window.APP_CONFIG.MAP_CENTER,
    zoom: window.APP_CONFIG.MAP_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: document.documentElement.dataset.theme === 'dark' ? darkMapStyle : []
  });
  map.addListener('click', (e) => setSelectedLocation(e.latLng.lat(), e.latLng.lng()));
  initGoogleAutocomplete();
  await loadDamageTypes();
  await loadReports();
  initRealtime();
};

function initGoogleAutocomplete() {
  if (!google.maps.places) {
    Swal.fire('Places API no disponible', 'Habilitá Places API en Google Cloud para que funcione el buscador interactivo.', 'warning');
    return;
  }
  const bounds = new google.maps.Circle({ center: window.APP_CONFIG.MAP_CENTER, radius: window.APP_CONFIG.PLACES_RADIUS_METERS || 30000 }).getBounds();
  const options = {
    bounds,
    strictBounds: false,
    fields: ['formatted_address', 'geometry', 'name'],
    componentRestrictions: window.APP_CONFIG.PLACES_COUNTRY ? { country: window.APP_CONFIG.PLACES_COUNTRY } : undefined
  };
  searchAutocomplete = new google.maps.places.Autocomplete($('searchInput'), options);
  searchAutocomplete.addListener('place_changed', () => handlePlace(searchAutocomplete.getPlace(), false));
  addressAutocomplete = new google.maps.places.Autocomplete($('address'), options);
  addressAutocomplete.addListener('place_changed', () => handlePlace(addressAutocomplete.getPlace(), true));
}

async function geocodeTypedPlace(inputId) {
  const query = $(inputId).value.trim();
  if (!query || !window.google?.maps) return;
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: query, bounds: map.getBounds() }, (results, status) => {
    if (status === 'OK' && results?.[0]) handlePlace({ geometry: results[0].geometry, formatted_address: results[0].formatted_address, name: query }, inputId === 'address');
  });
}

function handlePlace(place, fillAddress) {
  if (!place?.geometry?.location) return;
  const lat = place.geometry.location.lat();
  const lng = place.geometry.location.lng();
  map.panTo({ lat, lng });
  map.setZoom(17);
  setSelectedLocation(lat, lng);
  if (fillAddress) $('address').value = place.formatted_address || place.name || $('address').value;
  renderMap(); renderChart();
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
  $('lat').value = lat.toFixed(7); $('lng').value = lng.toFixed(7);
  if (selectedMarker) selectedMarker.setMap(null);
  selectedMarker = new google.maps.Marker({ position: { lat, lng }, map, draggable: true, title: 'Ubicación seleccionada' });
  selectedMarker.addListener('dragend', () => { const pos = selectedMarker.getPosition(); $('lat').value = pos.lat().toFixed(7); $('lng').value = pos.lng().toFixed(7); });
}

async function loadReports() {
  const { data, error } = await supabaseClient.from('reports').select('*').order('created_at', { ascending: false });
  if (error) return Swal.fire('Error', error.message, 'error');
  allReports = data || [];
  renderMap(); renderChart(); renderAdminRows();
}

function filteredReports() {
  const type = $('filterType').value, status = $('filterStatus').value, q = $('searchInput').value.trim().toLowerCase();
  return allReports.filter(r => {
    const matchType = type === 'all' || r.type === type;
    const matchStatus = status === 'all' || r.status === status;
    const blob = `${r.address} ${r.description} ${r.name} ${DAMAGE_TYPES[r.type]?.label || r.type}`.toLowerCase();
    return matchType && matchStatus && (!q || blob.includes(q));
  });
}

function svgMarker(type) {
  const item = DAMAGE_TYPES[type] || DEFAULT_DAMAGE_TYPES.bache;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="22" r="18" fill="${item.color}" stroke="white" stroke-width="4"/><path d="M26 50 15 35h22L26 50Z" fill="${item.color}" stroke="white" stroke-width="3"/><text x="26" y="30" font-size="22" text-anchor="middle">${item.emoji}</text></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(44, 44) };
}

function renderMap() {
  if (!map) return;
  markers.forEach(m => m.setMap(null)); markers = [];
  filteredReports().forEach(report => {
    const item = DAMAGE_TYPES[report.type] || DEFAULT_DAMAGE_TYPES.bache;
    const marker = new google.maps.Marker({ position: { lat: Number(report.lat), lng: Number(report.lng) }, map, icon: svgMarker(report.type), title: `${item.label} - ${STATUS[report.status]}` });
    const info = new google.maps.InfoWindow({ content: `<div class="info"><strong>${item.emoji} ${item.label}</strong><p>${report.address}</p><p>${report.description}</p><small>Estado: ${STATUS[report.status]}</small></div>` });
    marker.addListener('click', () => info.open({ anchor: marker, map }));
    markers.push(marker);
  });
}

async function submitReport(e) {
  e.preventDefault();
  if (!$('lat').value || !$('lng').value) return Swal.fire('Falta ubicación', 'Seleccioná un punto en el mapa o elegí una dirección de Google Maps.', 'warning');
  const payload = { type: $('type').value, name: $('name').value.trim(), email: $('email').value.trim(), phone: $('phone').value.trim(), address: $('address').value.trim(), description: $('description').value.trim(), lat: Number($('lat').value), lng: Number($('lng').value), status: 'pending' };
  const { error } = await supabaseClient.from('reports').insert(payload);
  if (error) return Swal.fire('No se pudo enviar', error.message, 'error');
  $('reportForm').reset(); if (selectedMarker) selectedMarker.setMap(null);
  Swal.fire('Reclamo enviado', 'Tu solicitud quedó pendiente de aprobación.', 'success');
  await loadReports();
}

function renderChart() {
  const ctx = $('reportsChart'); if (!ctx) return;
  const counts = Object.fromEntries(Object.keys(DAMAGE_TYPES).map(k => [DAMAGE_TYPES[k].label, 0]));
  filteredReports().forEach(r => { const key = DAMAGE_TYPES[r.type]?.label || r.type; counts[key] = (counts[key] || 0) + 1; });
  if (chart) chart.destroy();
  chart = new Chart(ctx, { type: $('chartType').value, data: { labels: Object.keys(counts), datasets: [{ label: 'Reclamos', data: Object.values(counts) }] }, options: { responsive: true, plugins: { legend: { display: true } }, scales: $('chartType').value === 'pie' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
}

async function adminLogin() {
  const { error } = await supabaseClient.auth.signInWithPassword({ email: $('adminEmail').value, password: $('adminPassword').value });
  if (error) return Swal.fire('Acceso denegado', error.message, 'error');
  await checkSession();
}
async function checkSession() { const { data } = await supabaseClient.auth.getSession(); const logged = !!data.session; $('loginBox').classList.toggle('hidden', logged); $('adminBox').classList.toggle('hidden', !logged); if (logged) { renderAdminRows(); renderDamageTypesAdmin(); } }

function renderAdminRows() {
  const tbody = $('adminRows'); if (!tbody) return; tbody.innerHTML = '';
  allReports.forEach(r => {
    const item = DAMAGE_TYPES[r.type] || { emoji: '', label: r.type };
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(r.created_at).toLocaleString('es-AR')}</td><td>${item.emoji} ${item.label}</td><td>${r.address}</td><td>${r.name}<br><small>${r.email}</small></td><td><span class="badge ${r.status}">${STATUS[r.status]}</span></td><td class="row-actions"><button data-status="approved">Aprobar</button><button data-status="analysis">Analizar</button><button data-status="rejected">Rechazar</button></td>`;
    tr.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => updateStatus(r.id, btn.dataset.status)));
    tbody.appendChild(tr);
  });
}

async function updateStatus(id, status) { const { error } = await supabaseClient.from('reports').update({ status }).eq('id', id); if (error) return Swal.fire('Error', error.message, 'error'); Swal.fire('Actualizado', `Solicitud marcada como: ${STATUS[status]}`, 'success'); await loadReports(); }

function renderDamageTypesAdmin() {
  const wrap = $('damageTypesRows'); if (!wrap) return; wrap.innerHTML = '';
  Object.entries(DAMAGE_TYPES).forEach(([key, t]) => {
    const card = document.createElement('div'); card.className = 'type-chip';
    card.innerHTML = `<span class="type-emoji" style="background:${t.color}">${t.emoji}</span><div><strong>${t.label}</strong><small>${key} · ${t.active ? 'activo' : 'inactivo'}</small></div><button class="edit">Editar</button><button class="toggle">${t.active ? 'Desactivar' : 'Activar'}</button>`;
    card.querySelector('.edit').addEventListener('click', () => { $('damageKey').value = key; $('damageKey').readOnly = true; $('damageLabel').value = t.label; $('damageEmoji').value = t.emoji; $('damageColor').value = t.color; $('damageActive').checked = !!t.active; });
    card.querySelector('.toggle').addEventListener('click', () => saveDamageType({ key, label: t.label, emoji: t.emoji, color: t.color, active: !t.active }));
    wrap.appendChild(card);
  });
}

async function saveDamageType(values) {
  const row = { key: values.key, label: values.label, emoji: values.emoji, color: values.color, active: values.active, sort_order: 100 };
  const { error } = await supabaseClient.from('damage_types').upsert(row, { onConflict: 'key' });
  if (error) return Swal.fire('Error', error.message, 'error');
  Swal.fire('Guardado', 'El tipo de daño fue actualizado.', 'success');
  $('damageTypeForm').reset(); $('damageKey').readOnly = false; $('damageColor').value = '#38bdf8'; $('damageActive').checked = true;
  await loadDamageTypes(); renderMap(); renderChart();
}

function bindEvents() {
  $('reportForm').addEventListener('submit', submitReport);
  ['filterType','filterStatus','searchInput'].forEach(id => $(id).addEventListener('input', () => { renderMap(); renderChart(); }));
  $('chartType').addEventListener('change', renderChart);
  $('locateBtn').addEventListener('click', () => navigator.geolocation?.getCurrentPosition(pos => { const { latitude, longitude } = pos.coords; map.setCenter({ lat: latitude, lng: longitude }); map.setZoom(17); setSelectedLocation(latitude, longitude); }, () => Swal.fire('Ubicación', 'No se pudo obtener tu ubicación.', 'warning')));
  $('adminToggleBtn').addEventListener('click', async () => { $('adminDialog').showModal(); await checkSession(); });
  $('closeAdminBtn').addEventListener('click', () => $('adminDialog').close());
  $('loginBox').addEventListener('submit', (e) => { e.preventDefault(); adminLogin(); });
  $('logoutBtn').addEventListener('click', async () => { await supabaseClient.auth.signOut(); await checkSession(); });
  $('refreshAdminBtn').addEventListener('click', async () => { await loadDamageTypes(); await loadReports(); });
  $('damageTypeForm').addEventListener('submit', (e) => { e.preventDefault(); saveDamageType({ key: $('damageKey').value.trim(), label: $('damageLabel').value.trim(), emoji: $('damageEmoji').value.trim(), color: $('damageColor').value, active: $('damageActive').checked }); });
  $('themeToggle').addEventListener('click', toggleTheme);
  $('installBtn').addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; $('installBtn').classList.add('hidden'); } });
  ['searchInput','address'].forEach(id => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); geocodeTypedPlace(id); } }));
}

function initRealtime() {
  supabaseClient.channel('public-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, loadReports)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'damage_types' }, loadDamageTypes)
    .subscribe();
}
function initTheme() { document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark'; }
function toggleTheme() { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem('theme', next); if (map) map.setOptions({ styles: next === 'dark' ? darkMapStyle : [] }); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden'); });
const darkMapStyle = [{ elementType: 'geometry', stylers: [{ color: '#1f2937' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] }];
(async function boot() { initTheme(); initSupabase(); bindEvents(); loadGoogleMaps(); if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js'); })();
