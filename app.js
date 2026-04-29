const DAMAGE_TYPES = {
  cano_roto: { label: 'Caño roto', emoji: '💧', color: '#38bdf8' },
  falta_asfalto: { label: 'Falta asfalto', emoji: '🛣️', color: '#94a3b8' },
  bache: { label: 'Bache', emoji: '🕳️', color: '#f59e0b' },
  poste_caido: { label: 'Poste caído', emoji: '⚡', color: '#facc15' },
  arbol_caido: { label: 'Árbol caído', emoji: '🌳', color: '#22c55e' }
};

const STATUS = {
  pending: 'Pendiente',
  analysis: 'En análisis',
  approved: 'Aprobado',
  rejected: 'Rechazado'
};

let supabaseClient, map, selectedMarker, chart;
let allReports = [];
let markers = [];
let deferredPrompt = null;

const $ = (id) => document.getElementById(id);

function initSupabase() {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function loadGoogleMaps() {
  const script = $('googleMapsScript');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${window.APP_CONFIG.GOOGLE_MAPS_API_KEY}&callback=initMap`;
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
  await loadReports();
};

function initSelectors() {
  const typeSelects = [$('type'), $('filterType')];
  Object.entries(DAMAGE_TYPES).forEach(([key, item]) => {
    const opt = new Option(`${item.emoji} ${item.label}`, key);
    $('type').appendChild(opt.cloneNode(true));
    $('filterType').appendChild(opt);
  });
}

function setSelectedLocation(lat, lng) {
  $('lat').value = lat.toFixed(7);
  $('lng').value = lng.toFixed(7);
  if (selectedMarker) selectedMarker.setMap(null);
  selectedMarker = new google.maps.Marker({
    position: { lat, lng },
    map,
    draggable: true,
    title: 'Ubicación seleccionada'
  });
  selectedMarker.addListener('dragend', () => {
    const pos = selectedMarker.getPosition();
    $('lat').value = pos.lat().toFixed(7);
    $('lng').value = pos.lng().toFixed(7);
  });
}

async function loadReports() {
  const { data, error } = await supabaseClient
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return Swal.fire('Error', error.message, 'error');
  allReports = data || [];
  renderMap();
  renderChart();
  renderAdminRows();
}

function filteredReports() {
  const type = $('filterType').value;
  const status = $('filterStatus').value;
  const q = $('searchInput').value.trim().toLowerCase();
  return allReports.filter(r => {
    const matchType = type === 'all' || r.type === type;
    const matchStatus = status === 'all' || r.status === status;
    const blob = `${r.address} ${r.description} ${r.name}`.toLowerCase();
    return matchType && matchStatus && (!q || blob.includes(q));
  });
}

function svgMarker(type) {
  const item = DAMAGE_TYPES[type] || DAMAGE_TYPES.bache;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="22" r="18" fill="${item.color}" stroke="white" stroke-width="4"/><path d="M26 50 15 35h22L26 50Z" fill="${item.color}" stroke="white" stroke-width="3"/><text x="26" y="29" font-size="22" text-anchor="middle">${item.emoji}</text></svg>`;
  return { url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, scaledSize: new google.maps.Size(44, 44) };
}

function renderMap() {
  markers.forEach(m => m.setMap(null));
  markers = [];
  filteredReports().forEach(report => {
    const item = DAMAGE_TYPES[report.type] || DAMAGE_TYPES.bache;
    const marker = new google.maps.Marker({
      position: { lat: Number(report.lat), lng: Number(report.lng) },
      map,
      icon: svgMarker(report.type),
      title: `${item.label} - ${STATUS[report.status]}`
    });
    const info = new google.maps.InfoWindow({
      content: `<div class="info"><strong>${item.emoji} ${item.label}</strong><p>${report.address}</p><p>${report.description}</p><small>Estado: ${STATUS[report.status]}</small></div>`
    });
    marker.addListener('click', () => info.open({ anchor: marker, map }));
    markers.push(marker);
  });
}

async function submitReport(e) {
  e.preventDefault();
  if (!$('lat').value || !$('lng').value) return Swal.fire('Falta ubicación', 'Seleccioná un punto en el mapa.', 'warning');
  const payload = {
    type: $('type').value,
    name: $('name').value.trim(),
    email: $('email').value.trim(),
    phone: $('phone').value.trim(),
    address: $('address').value.trim(),
    description: $('description').value.trim(),
    lat: Number($('lat').value),
    lng: Number($('lng').value),
    status: 'pending'
  };
  const { error } = await supabaseClient.from('reports').insert(payload);
  if (error) return Swal.fire('No se pudo enviar', error.message, 'error');
  $('reportForm').reset();
  if (selectedMarker) selectedMarker.setMap(null);
  Swal.fire('Reclamo enviado', 'Tu solicitud quedó pendiente de aprobación.', 'success');
  await loadReports();
}

function renderChart() {
  const ctx = $('reportsChart');
  const counts = Object.fromEntries(Object.keys(DAMAGE_TYPES).map(k => [DAMAGE_TYPES[k].label, 0]));
  filteredReports().forEach(r => counts[DAMAGE_TYPES[r.type]?.label || r.type]++);
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: $('chartType').value,
    data: { labels: Object.keys(counts), datasets: [{ label: 'Reclamos', data: Object.values(counts) }] },
    options: { responsive: true, plugins: { legend: { display: true } }, scales: $('chartType').value === 'pie' ? {} : { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
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
  if (logged) renderAdminRows();
}

function renderAdminRows() {
  const tbody = $('adminRows');
  if (!tbody) return;
  tbody.innerHTML = '';
  allReports.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${new Date(r.created_at).toLocaleString('es-AR')}</td><td>${DAMAGE_TYPES[r.type]?.emoji || ''} ${DAMAGE_TYPES[r.type]?.label || r.type}</td><td>${r.address}</td><td>${r.name}<br><small>${r.email}</small></td><td><span class="badge ${r.status}">${STATUS[r.status]}</span></td><td class="row-actions"><button data-status="approved">Aprobar</button><button data-status="analysis">Analizar</button><button data-status="rejected">Rechazar</button></td>`;
    tr.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => updateStatus(r.id, btn.dataset.status)));
    tbody.appendChild(tr);
  });
}

async function updateStatus(id, status) {
  const { error } = await supabaseClient.from('reports').update({ status }).eq('id', id);
  if (error) return Swal.fire('Error', error.message, 'error');
  Swal.fire('Actualizado', `Solicitud marcada como: ${STATUS[status]}`, 'success');
  await loadReports();
}

function bindEvents() {
  $('reportForm').addEventListener('submit', submitReport);
  ['filterType','filterStatus','searchInput'].forEach(id => $(id).addEventListener('input', () => { renderMap(); renderChart(); }));
  $('chartType').addEventListener('change', renderChart);
  $('locateBtn').addEventListener('click', () => navigator.geolocation?.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setCenter({ lat: latitude, lng: longitude });
    setSelectedLocation(latitude, longitude);
  }, () => Swal.fire('Ubicación', 'No se pudo obtener tu ubicación.', 'warning')));
  $('adminToggleBtn').addEventListener('click', async () => { $('adminDialog').showModal(); await checkSession(); });
  $('closeAdminBtn').addEventListener('click', () => $('adminDialog').close());
  $('loginBtn').addEventListener('click', adminLogin);
  $('logoutBtn').addEventListener('click', async () => { await supabaseClient.auth.signOut(); await checkSession(); });
  $('refreshAdminBtn').addEventListener('click', loadReports);
  $('themeToggle').addEventListener('click', toggleTheme);
  $('installBtn').addEventListener('click', async () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; $('installBtn').classList.add('hidden'); } });
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.dataset.theme = saved;
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  if (map) map.setOptions({ styles: next === 'dark' ? darkMapStyle : [] });
}

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; $('installBtn').classList.remove('hidden'); });

const darkMapStyle = [{ elementType: 'geometry', stylers: [{ color: '#1f2937' }] }, { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] }, { elementType: 'labels.text.fill', stylers: [{ color: '#d1d5db' }] }, { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#374151' }] }, { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] }];

(async function boot() {
  initTheme();
  initSelectors();
  initSupabase();
  bindEvents();
  loadGoogleMaps();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();
