window.__CONFIG__ = {
  // Same-origin scrape proxy (Vercel /api/proxy). Must NOT end with a slash.
  // Relative paths are resolved against the current site origin at runtime.
  VITE_CORS_PROXY_URL: "/api/proxy",

  // Base URL for HLS proxy routes (/m3u8-proxy, /ts-proxy). Must NOT end with a slash.
  VITE_M3U8_PROXY_URL: "/api",

  // First-watch setup (extension vs continue). Keep true so new browsers
  // still see the onboarding screen before playback.
  VITE_HAS_ONBOARDING: "true",

  // The READ API key to access TMDB
  VITE_TMDB_READ_API_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjYTg3NmZkYmVhMjNhMzI3ODY0ZjRjN2U5MzMwZTYxNiIsIm5iZiI6MTc4MjIwOTQ0NC45OTksInN1YiI6IjZhM2E1YmE0ZmMzZGFiNGNmYzMzNjIxMCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.WlSOswQDdxdbKu0jARJoruV6PlteoTXB1Oj4gRaibBI",

  // The DMCA email displayed in the footer, null to hide the DMCA link
  VITE_DMCA_EMAIL: null,

  // Whether to disable hash-based routing, leave this as false if you don't know what this is
  VITE_NORMAL_ROUTER: "true",

  // The backend URL(s) to communicate with - can be a single URL or comma-separated list (e.g., "https://server1.com,https://server2.com")
  VITE_BACKEND_URL: null,

  // Supabase Auth (anon/publishable key only — never a service role key)
  VITE_SUPABASE_URL: "https://khplnaovkxvzhbimuvzn.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocGxuYW92a3h2emhiaW11dnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjM2MzAsImV4cCI6MjA5Nzc5OTYzMH0.bUotBQaOZGQMFuUP8jcn4vaMKO4YZiIv3PQBDi13i9w",

  // A comma separated list of disallowed IDs in the case of a DMCA claim - in the format "series-<id>" and "movie-<id>"
  VITE_DISALLOWED_IDS: "movie-831988",
  // Allowing FEBBOX API TO BE AENBALED.
  VITE_ALLOW_FEBBOX_KEY: "true",

  // --- Ads (Adsterra banners only; no player placements, no popunder) ---
  // Tier A live:
  VITE_ADSTERRA_SCRIPT_HOST: "https://www.highrevenueformat.com",
  VITE_ENABLE_HOME_AD: "true",
  VITE_HOME_AD_ZONE_ID: "d56373d865242f2b129220783c979952", // 728x90
  VITE_HOME_AD_MOBILE_ZONE_ID: "5b495d1b87680daa6bd47f0f1b07f96c", // 320x50
  VITE_ENABLE_SECONDARY_AD: "true",
  VITE_SECONDARY_AD_ZONE_ID: "27a236da45ab26448de038920af87337", // 300x250 mid-home
  VITE_SECONDARY_AD_SKYSCRAPER_ZONE_ID: "78f365b3820dd67709f7fdd363bba49b", // 160x600 ultra-wide rail
  VITE_ENABLE_BOOKMARKS_AD: "true",
  VITE_BOOKMARKS_AD_ZONE_ID: "27a236da45ab26448de038920af87337", // 300x250
  VITE_ENABLE_DETAILS_AD: "true",
  VITE_DETAILS_AD_ZONE_ID: "27a236da45ab26448de038920af87337", // 300x250 next to trailers
  VITE_ENABLE_POPUNDER: "false",
  VITE_ENABLE_PRIMARY_BANNER_GIF: "false",

  // Tier B/C deferred (ask to enable later):
  // 468x60: 9892ee4f111b1de1153026c1d13f385c — footer / compact strip
  // 160x300: 1acd97db364bcc22c93d4698d289ffb0 — optional rail
  // Native container: e8a04cad2b3910cf896ceda231564b07 (confirm format before use)
  // Placements: home→discover seam, search under tabs, history feet, manga mid, footer
};
