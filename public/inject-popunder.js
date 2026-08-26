/**
 * Adsterra Popunder must load from <head> (before </head>), not <body>.
 * Runs synchronously right after /config.js on first paint; App.tsx re-calls
 * __kstreamLoadPopunder on SPA navigations.
 */
(function injectPopunderInHead() {
  function isPopunderPath(path) {
    if (!path || path.indexOf("/media/") === 0) return false;
    if (path === "/") return true;
    if (path === "/browse" || path.indexOf("/browse/") === 0) return true;
    if (path === "/read-history") return true;
    if (path === "/algorithm") return true;
    if (path === "/about") return true;
    return false;
  }

  function loadPopunderIfAllowed() {
    try {
      var cfg = window.__CONFIG__ || {};
      if (cfg.VITE_ENABLE_POPUNDER !== "true") return;

      var src = cfg.VITE_POPUNDER_SCRIPT_URL;
      if (!src) return;

      var path = window.location.pathname || "/";
      if (!isPopunderPath(path)) return;

      // Desktop shell + user opt-out (same rules as areAdsBlocked).
      if (window.__KSTREAM_DESKTOP_IPC__ || window.__PSTREAM_DESKTOP__) return;
      try {
        var raw = localStorage.getItem("__MW::ads");
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && parsed.state && parsed.state.adsDisabled) return;
        }
      } catch (_e) {
        /* ignore */
      }

      if (document.querySelector('script[data-kstream-popunder="1"]')) return;

      var zone = cfg.VITE_POPUNDER_ZONE_ID;
      if (zone && document.querySelector('script[data-zone="' + zone + '"]')) {
        return;
      }

      var script = document.createElement("script");
      script.type = "text/javascript";
      script.src = src;
      script.setAttribute("data-kstream-popunder", "1");
      if (zone) script.setAttribute("data-zone", zone);
      document.head.appendChild(script);
    } catch (_err) {
      /* never block app boot */
    }
  }

  window.__kstreamLoadPopunder = loadPopunderIfAllowed;
  loadPopunderIfAllowed();
})();
