/**
 * Adsterra Soft Popunder — must NOT open tabs on page load.
 * Script loads only after the first user click on allowed pages; at most
 * MAX_POPUNDERS_PER_TAB opens per tab session (sessionStorage). window.open
 * to ad / external hosts is blocked unless it follows a recent trusted gesture,
 * and blocked entirely after the tab has spent its popunder budget.
 */
(function injectPopunderInHead() {
  var AD_HOST_RE =
    /(?:profitableratecpmnetwork|highrevenueformat|adsterra|effectivegatecpm|clickadu|onclick|pemsrv|revenuecpmnetwork|alwingroup|tzegilo|llvpn|92mim|484r|exoclick|juicyads|nitropay|onclicka|propellerads|popads|popcash|hilltopads|admaven)\./i;
  var GESTURE_MS = 1500;
  var BURST_MS = 4000;
  var SESSION_KEY = "kstream:popunder-spent";
  var SESSION_COUNT_KEY = "kstream:popunder-count";
  var MAX_POPUNDERS_PER_TAB = 2;

  var lastUserGestureAt = 0;
  var lastPopunderOpenAt = 0;
  var popunderNetworkLoaded = false;

  function markUserGesture() {
    lastUserGestureAt = Date.now();
  }

  function recentUserGesture() {
    return Date.now() - lastUserGestureAt <= GESTURE_MS;
  }

  function getPopunderCount() {
    if (typeof window.__kstreamPopunderCount === "number") {
      return window.__kstreamPopunderCount;
    }
    try {
      return parseInt(sessionStorage.getItem(SESSION_COUNT_KEY) || "0", 10) || 0;
    } catch (_e) {
      return 0;
    }
  }

  function hasSpentPopunder() {
    if (getPopunderCount() >= MAX_POPUNDERS_PER_TAB) return true;
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

  function recordPopunderOpen() {
    var next = getPopunderCount() + 1;
    window.__kstreamPopunderCount = next;
    try {
      sessionStorage.setItem(SESSION_COUNT_KEY, String(next));
    } catch (_e) {
      /* ignore */
    }
    lastPopunderOpenAt = Date.now();
    if (next >= MAX_POPUNDERS_PER_TAB) {
      markPopunderSpent();
    }
  }

  function isPlayerPath(path) {
    if (!path) return false;
    if (path.indexOf("/media/") === 0) return true;
    if (path.indexOf("/manga/") === 0) return true;
    return false;
  }

  function isPopunderPath(path) {
    if (!path || isPlayerPath(path)) return false;
    if (path === "/") return true;
    if (path === "/browse" || path.indexOf("/browse/") === 0) return true;
    if (path === "/read-history") return true;
    if (path === "/algorithm") return true;
    if (path === "/about") return true;
    return false;
  }

  function isAdsOptedOut() {
    if (window.__KSTREAM_DESKTOP_IPC__ || window.__PSTREAM_DESKTOP__) return true;
    if (window.innerWidth < 1024) return true;
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
    popunderNetworkLoaded = false;
  }

  function isExternalHttpUrl(url) {
    if (url == null || url === "" || url === "about:blank") return false;
    var s = String(url);
    if (s.indexOf("blob:") === 0 || s.indexOf("data:") === 0) return false;
    try {
      var parsed = new URL(s, window.location.href);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      return parsed.origin !== window.location.origin;
    } catch (_e) {
      return true;
    }
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

  function shouldTreatAsPopunder(url) {
    if (isSuspiciousPopunderUrl(url)) return true;
    // After the network script is live, any external open is almost certainly the ad.
    return popunderNetworkLoaded && isExternalHttpUrl(url);
  }

  function installPopunderGuard() {
    if (window.__kstreamPopunderGuardInstalled) return;
    window.__kstreamPopunderGuardInstalled = true;

    document.addEventListener("pointerdown", markUserGesture, true);
    document.addEventListener("keydown", markUserGesture, true);

    var nativeOpen = window.open;
    window.open = function popunderGuard(url, target, features) {
      if (isPlayerPath(window.location.pathname || "/")) return null;
      if (!shouldTreatAsPopunder(url)) {
        return nativeOpen.call(window, url, target, features);
      }
      if (hasSpentPopunder()) return null;
      if (!recentUserGesture()) return null;
      if (
        getPopunderCount() > 0 &&
        Date.now() - lastPopunderOpenAt < BURST_MS
      ) {
        return null;
      }
      recordPopunderOpen();
      unloadPopunderScript();
      disarmPopunderOnGesture();
      pendingCfg = null;
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
    script.addEventListener("load", function () {
      popunderNetworkLoaded = true;
    });
    script.addEventListener("error", function () {
      popunderNetworkLoaded = false;
    });
    popunderNetworkLoaded = true;
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
