(() => {
  if (window.__CHALADEV_NET_BRIDGE__?.initialized) {
    return;
  }

  const state = {
    initialized: true,
    active: false
  };

  window.__CHALADEV_NET_BRIDGE__ = state;

  window.addEventListener("__chaladev_net_data__", (event) => {
    if (!state.active) return;
    try {
      const entry = typeof event?.detail === "string" ? JSON.parse(event.detail) : event?.detail;
      if (!entry || typeof entry !== "object") return;
      chrome.runtime
        .sendMessage({
          type: "CHALADEV_NET_CAPTURE_EVENT",
          entry
        })
        .catch(() => {});
    } catch {
      // Ignorar payload invalido
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CHALADEV_NET_MONITOR_PING") {
      sendResponse({ alive: true, active: state.active });
      return false;
    }

    if (message?.type === "CHALADEV_NET_MONITOR_SET") {
      state.active = Boolean(message.active);
      try {
        window.dispatchEvent(
          new CustomEvent("__chaladev_net_cmd__", {
            detail: JSON.stringify({ active: state.active })
          })
        );
      } catch {
        // Ignorar errores de despacho al mundo MAIN
      }
      sendResponse({ active: state.active });
      return false;
    }

    return false;
  });
})();
