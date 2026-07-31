(function () {
  var script = document.currentScript;
  var siteKey = script && script.getAttribute("data-site");
  if (!siteKey) return;

  var ENDPOINT = script.src.replace(/\/track\.js.*$/, "/api/track");
  var HEARTBEAT_INTERVAL_MS = 20000;
  var STORAGE_KEY = "tcc_visitor_id";

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getVisitorId() {
    try {
      var id = localStorage.getItem(STORAGE_KEY);
      if (!id) {
        id = uuid();
        localStorage.setItem(STORAGE_KEY, id);
      }
      return id;
    } catch (e) {
      return uuid();
    }
  }

  var visitorId = getVisitorId();

  function send(eventType) {
    var payload = JSON.stringify({
      site_key: siteKey,
      visitor_id: visitorId,
      event_type: eventType,
      page_path: location.pathname,
      referrer: document.referrer || undefined,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }
  }

  send("pageview");

  var heartbeatTimer = null;

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () {
      if (!document.hidden) send("heartbeat");
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopHeartbeat();
    } else {
      send("heartbeat");
      startHeartbeat();
    }
  });

  if (!document.hidden) startHeartbeat();
})();
