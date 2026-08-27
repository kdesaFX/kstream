/**
 * Adsterra Popunder must load from <head> (before </head>), not <body>.
 * Runs synchronously right after /config.js on first paint; App.tsx re-calls
 * __kstreamLoadPopunder on SPA navigations.
 *
 * Important: once injected, the network script hooks document clicks globally.
 * On SPA navigation to player/manga/search we must unload the tag AND guard
 * window.open — otherwise popunders keep firing after leaving the homepage.
 */
(function injectPopunderInHead() {
  var AD_HOST_RE =
    /(?:profitableratecpmnetwork|highrevenueformat|adsterra|effectivegatecpm|clickadu|onclick|pemsrv|revenuecpmnetwork)\./i;

  function isPopunderPath(path) {
    if (!path || path.indexOf("/media/") === 0) return false;
    if (path.indexOf("/manga/") === 0) return false;
    if (path === "/") return true;
    if (path === "/browse" || path.indexOf("/browse/") === 0) return true;
    if (path === "/read-history") return true;
    if (path === "/algorithm") return true;
    if (path === "/about") return true;
    return false;
  }

  function isAdsOptedOut() {
    if (window.__KSTREAM_DESKTOP_IPC__ || window.__PSTREAM_DESKTOP__) return true;
    try {
      var raw = localStorage.getItem("__MW::ads");
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.state && parsed.state.adsDisabled) return true;
      }
    } catch (_e) {
      /* ignore */
    }
    return false;
  }

  function unloadPopunderScript() {
    document.querySelectorAll('script[data-kstream-popunder="1"]').forEach(function (node) {
      node.parentNode && node.parentNode.removeChild(node);
    });
  }

  function isSuspiciousPopunderUrl(url) {
    if (url == null || url === "" || url === "about:blank") return true;
    var s = String(url);
    if (s.indexOf("blob:") === 0 || s.indexOf("data:") === 0) return false;
    try {
      var host = new URL(s, window.location.href).hostname;
      if (AD_HOST_RE.test(host)) return true;
    } catch (_e) {
      return true;
    }
    return false;
  }

  function installPopunderGuard() {
    if (window.__kstreamPopunderGuardInstalled) return;
    window.__kstreamPopunderGuardInstalled = true;

    var nativeOpen = window.open;
    window.open = function popunderGuard(url, target, features) {
      var path = window.location.pathname || "/";
      if (isPopunderPath(path)) {
        return nativeOpen.call(window, url, target, features);
      }
      if (isSuspiciousPopunderUrl(url)) {
        return null;
      }
      return nativeOpen.call(window, url, target, features);
    };
  }

  function loadPopunderScript(cfg) {
    var src = cfg.VITE_POPUNDER_SCRIPT_URL;
    if (!src) return;

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
  }

  function syncPopunderForPath() {
    try {
      var cfg = window.__CONFIG__ || {};
      var path = window.location.pathname || "/";

      if (cfg.VITE_ENABLE_POPUNDER !== "true" || isAdsOptedOut()) {
        unloadPopunderScript();
        return;
      }

      if (!isPopunderPath(path)) {
        unloadPopunderScript();
        installPopunderGuard();
        return;
      }

      loadPopunderScript(cfg);
    } catch (_err) {
      /* never block app boot */
    }
  }

  window.__kstreamLoadPopunder = syncPopunderForPath;
  window.__kstreamUnloadPopunder = unloadPopunderScript;
  installPopunderGuard();
  syncPopunderForPath();
})();
