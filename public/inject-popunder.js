/**
 * Adsterra Soft Popunder — must NOT open tabs on page load.
 * Script loads only after the first user click on allowed pages; at most one
 * popunder per tab session (sessionStorage). window.open to ad hosts is
 * blocked unless it follows a recent trusted gesture, and blocked entirely
 * after that session has already spent its one popunder.
 */
(function injectPopunderInHead() {
  var AD_HOST_RE =
    /(?:profitableratecpmnetwork|highrevenueformat|adsterra|effectivegatecpm|clickadu|onclick|pemsrv|revenuecpmnetwork)\./i;
  var GESTURE_MS = 1500;
  var SESSION_KEY = "kstream:popunder-spent";

  var lastUserGestureAt = 0;

  function markUserGesture() {
    lastUserGestureAt = Date.now();
  }

  function recentUserGesture() {
    return Date.now() - lastUserGestureAt <= GESTURE_MS;
  }

  function hasSpentPopunder() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (_e) {
      return Boolean(window.__kstreamPopunderSpent);
    }
  }

  function markPopunderSpent() {
    window.__kstreamPopunderSpent = true;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch (_e) {
      /* private mode / blocked storage — in-memory flag still applies */
    }
  }

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
    window.__kstreamPopunderArmed = false;
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

    document.addEventListener("pointerdown", markUserGesture, true);
    document.addEventListener("keydown", markUserGesture, true);

    var nativeOpen = window.open;
    window.open = function popunderGuard(url, target, features) {
      if (isSuspiciousPopunderUrl(url)) {
        // One popunder per tab session — block every further ad open.
        if (hasSpentPopunder()) return null;
        if (!recentUserGesture()) return null;
        markPopunderSpent();
        unloadPopunderScript();
        disarmPopunderOnGesture();
        pendingCfg = null;
      }
      return nativeOpen.call(window, url, target, features);
    };
  }

  function loadPopunderScript(cfg) {
    var src = cfg.VITE_POPUNDER_SCRIPT_URL;
    if (!src) return;
    if (hasSpentPopunder()) return;

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

  function disarmPopunderOnGesture() {
    document.removeEventListener("pointerdown", onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
    window.__kstreamPopunderArmed = false;
  }

  var pendingCfg = null;

  function onFirstGesture() {
    disarmPopunderOnGesture();
    if (hasSpentPopunder()) return;
    if (pendingCfg) loadPopunderScript(pendingCfg);
  }

  /** Wait for a real click before injecting the network script (blocks load-time popups). */
  function armPopunderOnGesture(cfg) {
    if (hasSpentPopunder()) return;
    if (window.__kstreamPopunderArmed) return;
    if (document.querySelector('script[data-kstream-popunder="1"]')) return;

    pendingCfg = cfg;
    window.__kstreamPopunderArmed = true;
    document.addEventListener("pointerdown", onFirstGesture, true);
    document.addEventListener("keydown", onFirstGesture, true);
  }

  function syncPopunderForPath() {
    try {
      var cfg = window.__CONFIG__ || {};
      var path = window.location.pathname || "/";

      if (cfg.VITE_ENABLE_POPUNDER !== "true" || isAdsOptedOut() || hasSpentPopunder()) {
        disarmPopunderOnGesture();
        unloadPopunderScript();
        pendingCfg = null;
        return;
      }

      if (!isPopunderPath(path)) {
        disarmPopunderOnGesture();
        unloadPopunderScript();
        pendingCfg = null;
        return;
      }

      armPopunderOnGesture(cfg);
    } catch (_err) {
      /* never block app boot */
    }
  }

  window.__kstreamLoadPopunder = syncPopunderForPath;
  window.__kstreamUnloadPopunder = unloadPopunderScript;
  installPopunderGuard();
  syncPopunderForPath();
})();
