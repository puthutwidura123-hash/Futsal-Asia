/* ISI DUA NILAI INI dari Supabase: Project Settings → API.
 * Anon key aman diletakkan di frontend karena data dilindungi Row Level Security (lihat schema.sql).
 * Jika dibiarkan kosong, game tetap jalan dalam mode offline (lawan CPU saja). */
window.FG = window.FG || {};
window.FG.CONFIG = {
  SUPABASE_URL: '',      // contoh: 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: ''  // contoh: 'eyJhbGciOi...'
};
