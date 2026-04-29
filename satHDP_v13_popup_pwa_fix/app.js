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
let supabaseClient, map, selectedMarker, chart, allReports = [], markers = [], deferredPrompt = null, googleMapsPromise = null;
let sliderSettings = { effect: "slide", interval: 4000, autoplay: true };
let evidenceIndex = 0, evidenceTimer = null;
let adminPage = 1, adminPageSize = 10;
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
  map.addListener('click', (e) => setSelectedLocation(e.latLng.lat(), e.latLng.lng()));
  await initGoogleAutocomplete();
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
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place?.geometry?.location) return;
    handlePlace({ lat: place.geometry.location.lat(), lng: place.geometry.location.lng(), address: place.formatted_address || place.name || input.value }, fillAddress);
  });
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
  e?.preventDefault();
  sliderSettings = { effect: $('sliderEffect').value, interval: Number($('sliderInterval').value) || 4000, autoplay: $('sliderAutoplay').checked };
  localStorage.setItem('satHDP_sliderSettings', JSON.stringify(sliderSettings));
  try {
    await supabaseClient.from('app_settings').upsert({ key: 'evidence_slider', value: sliderSettings }, { onConflict: 'key' });
  } catch (err) { console.warn('No se pudo guardar en Supabase app_settings.', err.message); }
  renderEvidenceStrip();
  Swal.fire('Slider actualizado', 'La configuración del slider fue guardada.', 'success');
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
  const total = allReports.length;
  const totalPages = Math.max(1, Math.ceil(total / adminPageSize));
  adminPage = Math.min(Math.max(1, adminPage), totalPages);
  const startIndex = (adminPage - 1) * adminPageSize;
  const pageRows = allReports.slice(startIndex, startIndex + adminPageSize);

  tbody.innerHTML = '';
  pageRows.forEach(r => {
    const item = DAMAGE_TYPES[r.type] || { emoji: '', label: r.type };
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="admin-row-check" type="checkbox" data-id="${r.id}" ${adminSelectedIds.has(r.id) ? 'checked' : ''} aria-label="Seleccionar reclamo"></td><td>${formatDate(r.created_at)}</td><td>${item.emoji} ${item.label}</td><td>${escapeHtml(r.address)}</td><td>${escapeHtml(r.name)}<br><small>${escapeHtml(r.email)}</small></td><td><span class="badge ${r.status}">${STATUS[r.status] || r.status}</span></td><td>${adminMediaHtml(r)}</td><td class="row-actions"><button data-status="approved">Aprobar</button><button data-status="analysis">En revisión</button><button data-status="resolved">Resuelto</button><button data-status="rejected">Rechazar</button></td>`;
    tr.querySelectorAll('button[data-status]').forEach(btn => btn.addEventListener('click', () => updateStatus(r.id, btn.dataset.status)));
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

async function bulkUpdateStatus(status) {
  const ids = Array.from(adminSelectedIds);
  if (!ids.length) return Swal.fire('Sin selección', 'Seleccioná uno o más reclamos.', 'info');
  const { isConfirmed } = await Swal.fire({ title: `¿Marcar ${ids.length} reclamo(s) como ${STATUS[status]}?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Sí, actualizar', cancelButtonText: 'Cancelar' });
  if (!isConfirmed) return;
  const { error } = await supabaseClient.from('reports').update({ status }).in('id', ids);
  if (error) return Swal.fire('Error', error.message, 'error');
  adminSelectedIds.clear();
  await loadReports();
  Swal.fire('Actualizado', 'Los reclamos seleccionados fueron actualizados.', 'success');
}

async function bulkDeleteReports() {
  const ids = Array.from(adminSelectedIds);
  if (!ids.length) return Swal.fire('Sin selección', 'Seleccioná uno o más reclamos.', 'info');
  const { isConfirmed } = await Swal.fire({ title: `¿Eliminar ${ids.length} reclamo(s)?`, text: 'Esta acción no se puede deshacer.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar' });
  if (!isConfirmed) return;
  const { error } = await supabaseClient.from('reports').delete().in('id', ids);
  if (error) return Swal.fire('Error', error.message, 'error');
  adminSelectedIds.clear();
  await loadReports();
  Swal.fire('Eliminado', 'Los reclamos seleccionados fueron eliminados.', 'success');
}

async function updateStatus(id, status) {
  const { error } = await supabaseClient.from('reports').update({ status }).eq('id', id);
  if (error) return Swal.fire('Error', error.message, 'error');
  Swal.fire('Actualizado', `Solicitud marcada como: ${STATUS[status]}`, 'success');
  await loadReports();
}

function renderDamageTypesAdmin() {
  const wrap = $('damageTypesRows');
  if (!wrap) return;
  wrap.innerHTML = '';
  Object.entries(DAMAGE_TYPES).forEach(([key, t]) => {
    const card = document.createElement('div');
    card.className = 'type-chip';
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
  $('damageTypeForm').reset();
  $('damageKey').readOnly = false;
  $('damageColor').value = '#38bdf8';
  $('damageActive').checked = true;
  await loadDamageTypes();
  renderMap();
  renderChart();
}

function bindEvents() {
  $('reportForm').addEventListener('submit', submitReport);
  $('images')?.addEventListener('change', renderImagePreview);
  ['filterType', 'filterStatus'].forEach(id => $(id).addEventListener('input', () => { renderMap(); renderChart(); }));
  $('chartType').addEventListener('change', renderChart);
  $('locateBtn').addEventListener('click', () => navigator.geolocation?.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    map.setCenter({ lat: latitude, lng: longitude });
    map.setZoom(17);
    setSelectedLocation(latitude, longitude);
  }, () => Swal.fire('Ubicación', 'No se pudo obtener tu ubicación.', 'warning')));
  $('adminToggleBtn').addEventListener('click', async () => { $('adminDialog').showModal(); await checkSession(); });
  $('closeAdminBtn').addEventListener('click', () => $('adminDialog').close());
  $('loginBox').addEventListener('submit', (e) => { e.preventDefault(); adminLogin(); });
  $('logoutBtn').addEventListener('click', async () => { await supabaseClient.auth.signOut(); await checkSession(); });
  $('refreshAdminBtn').addEventListener('click', async () => { await loadDamageTypes(); await loadReports(); });

  ['Top','Bottom'].forEach(pos => {
    $('adminPrev' + pos)?.addEventListener('click', () => { adminPage = Math.max(1, adminPage - 1); renderAdminRows(); });
    $('adminNext' + pos)?.addEventListener('click', () => { adminPage += 1; renderAdminRows(); });
    $('adminPageSize' + pos)?.addEventListener('change', (e) => setAdminPageSize(e.target.value));
    $('bulkApprove' + pos)?.addEventListener('click', () => bulkUpdateStatus('approved'));
    $('bulkAnalysis' + pos)?.addEventListener('click', () => bulkUpdateStatus('analysis'));
    $('bulkResolve' + pos)?.addEventListener('click', () => bulkUpdateStatus('resolved'));
    $('bulkReject' + pos)?.addEventListener('click', () => bulkUpdateStatus('rejected'));
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
  const canInstall = !!deferredPrompt;
  const message = canInstall
    ? "Instalá la PWA en tu dispositivo para reportar daños, consultar el mapa y acceder más rápido."
    : (isMobileDevice()
        ? "Para instalarla, abrí el menú del navegador y elegí <b>Agregar a pantalla de inicio</b> o <b>Instalar app</b>. En Chrome/Edge también puede aparecer el ícono de instalación en la barra."
        : "Cuando el navegador habilite la instalación, presioná <b>Instalar PWA</b> o el ícono de instalación de la barra. Verificá que estés usando HTTPS o localhost, manifest válido y service worker activo.");
  const res = await Swal.fire({
    title: "Instalar MUNIPA-HDP",
    html: `<div class="install-logo-wrap"><img src="icons/icon-192.png" alt="MUNIPA-HDP"></div><p>${message}</p>`,
    showCancelButton: true,
    confirmButtonText: canInstall ? "Instalar app" : "Entendido",
    cancelButtonText: "Ahora no",
    allowOutsideClick: false,
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
  const key = "satHDP_install_offered_v13";
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
window.addEventListener("load", () => {
  if (!isPWAInstalled()) {
    setTimeout(() => offerInstallPWA(false), isMobileDevice() ? 1200 : 1800);
  }
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
