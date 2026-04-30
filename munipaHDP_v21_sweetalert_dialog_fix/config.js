// 1) Copiá este proyecto a GitHub Pages.
// 2) Reemplazá estos valores por los tuyos.
// 3) En Supabase ejecutá database/database.sql.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://qnqqsjibwyyzqvkynbgk.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_WkaMiLMlK2og6pcutR5w1w_rWab9GBj',
  SUPABASE_STORAGE_BUCKET: 'report-images',
  GOOGLE_MAPS_API_KEY: 'AIzaSyCmzR5POCqdoiZRpIRzRcness-Az4i7xXc',
  MAP_CENTER: { lat: -38.4161, lng: -63.6167 },
  MAP_ZOOM: 5,
  DEVICE_MAP_ZOOM: 15,
  PLACES_RADIUS_METERS: 30000,
  // Opcional: limita sugerencias por país. Argentina = 'ar'. Usá null para global.
  PLACES_COUNTRY: 'ar',
  // Imagen fallback para popup cuando el reclamo no tiene imágenes.
  DEFAULT_REPORT_IMAGE: '',
  // Enlaces de redes sociales. Reemplazá '#' por tus URLs oficiales.
  SOCIAL_LINKS: {
    facebook: '#',
    instagram: '#',
    tiktok: '#',
    youtube: '#',
    telegram: '#',
    shareText: 'Mapa de Reclamos MUNIPA-HDP'
  }
};
