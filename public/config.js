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
  VITE_NORMAL_ROUTER: true,

  // The backend URL(s) to communicate with - can be a single URL or comma-separated list (e.g., "https://server1.com,https://server2.com")
  VITE_BACKEND_URL: null,

  // Supabase Auth (anon/publishable key only — never a service role key)
  VITE_SUPABASE_URL: "https://khplnaovkxvzhbimuvzn.supabase.co",
  VITE_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtocGxuYW92a3h2emhiaW11dnpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMjM2MzAsImV4cCI6MjA5Nzc5OTYzMH0.bUotBQaOZGQMFuUP8jcn4vaMKO4YZiIv3PQBDi13i9w",

  // A comma separated list of disallowed IDs in the case of a DMCA claim - in the format "series-<id>" and "movie-<id>"
  VITE_DISALLOWED_IDS: "movie-831988",
  // Allowing FEBBOX API TO BE AENBALED.
  VITE_ALLOW_FEBBOX_KEY: "true",
};
