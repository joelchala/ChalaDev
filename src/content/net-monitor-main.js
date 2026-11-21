(() => {
  if (window.__CHALADEV_NET_MAIN__?.initialized) {
    return;
  }

  const origFetch = window.fetch;
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  const xhrMeta = new WeakMap();

  let active = false;
  let seq = 0;

  function emitEntry(entry) {
    if (!active) return;
    try {
      window.dispatchEvent(
        new CustomEvent("__chaladev_net_data__", {
          detail: JSON.stringify(entry)
        })
      );
    } catch {
      // Ignorar si la pagina bloquea eventos personalizados
    }
  }

  function patchedFetch(input, init) {
    if (!active) {
      return origFetch.apply(this, arguments);
    }

    const start = performance.now();
    const method = String(
      init?.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET") || "GET"
    ).toUpperCase();

    let url = "";
    try {
      if (typeof input === "string") {
        url = input;
      } else if (typeof URL !== "undefined" && input instanceof URL) {
        url = input.href;
      } else if (input && typeof input.url === "string") {
        url = input.url;
      } else {
        url = String(input || "");
      }
      url = new URL(url, window.location.href).href;
    } catch {
      url = String(url || "");
    }

    return origFetch.apply(this, arguments).then(
      (res) => {
        const durationMs = Math.round(performance.now() - start);
        let contentType = "";
        let lenHeader = 0;
        try {
          contentType = res.headers?.get("content-type") || "";
          lenHeader = Number(res.headers?.get("content-length") || 0);
        } catch {
          contentType = "";
        }

        const baseEntry = {
          id: ++seq,
          kind: "fetch",
          method,
          url,
          status: res.status,
          ok: res.ok,
          durationMs,
          contentType,
          sizeBytes: Number.isFinite(lenHeader) && lenHeader > 0 ? lenHeader : null,
          preview: "",
          timestamp: Date.now()
        };

        const isTextual = /json|text|xml|javascript|html|csv|svg/i.test(contentType);
        if (res.type !== "opaque" && isTextual && (!lenHeader || lenHeader <= 65536)) {
          try {
            res
              .clone()
              .text()
              .then((txt) => {
                baseEntry.preview = txt.slice(0, 400);
                if (!baseEntry.sizeBytes) {
                  baseEntry.sizeBytes = txt.length;
                }
                emitEntry(baseEntry);
              })
              .catch(() => emitEntry(baseEntry));
          } catch {
            emitEntry(baseEntry);
          }
        } else {
          emitEntry(baseEntry);
        }
        return res;
      },
      (err) => {
        emitEntry({
          id: ++seq,
          kind: "fetch",
          method,
          url,
          status: 0,
          ok: false,
          durationMs: Math.round(performance.now() - start),
          contentType: "",
          sizeBytes: null,
          preview: err instanceof Error ? err.message : String(err || "Network error"),
          error: true,
          timestamp: Date.now()
        });
        throw err;
      }
    );
  }

  function patchedXhrOpen(method, url) {
    let resolvedUrl = String(url || "");
    try {
      resolvedUrl = new URL(resolvedUrl, window.location.href).href;
    } catch {
      // Conservar cadena original
    }
    xhrMeta.set(this, {
      method: String(method || "GET").toUpperCase(),
      url: resolvedUrl
    });
    return origXhrOpen.apply(this, arguments);
  }

  function patchedXhrSend() {
    if (!active) {
      return origXhrSend.apply(this, arguments);
    }

    const meta = xhrMeta.get(this) || { method: "GET", url: "" };
    const start = performance.now();
    const xhr = this;

    xhr.addEventListener(
      "loadend",
      () => {
        const durationMs = Math.round(performance.now() - start);
        let contentType = "";
        let lenHeader = 0;
        let preview = "";
        let sizeBytes = null;

        try {
          contentType = xhr.getResponseHeader("content-type") || "";
          lenHeader = Number(xhr.getResponseHeader("content-length") || 0);
          if (Number.isFinite(lenHeader) && lenHeader > 0) {
            sizeBytes = lenHeader;
          }
        } catch {
          // Ignorar errores de acceso a cabeceras
        }

        if (xhr.responseType === "" || xhr.responseType === "text") {
          try {
            const text = typeof xhr.responseText === "string" ? xhr.responseText : "";
            if (text) {
              preview = text.slice(0, 400);
              if (!sizeBytes) sizeBytes = text.length;
            }
          } catch {
            // Ignorar InvalidStateError
          }
        }

        emitEntry({
          id: ++seq,
          kind: "xhr",
          method: meta.method,
          url: meta.url,
          status: Number(xhr.status) || 0,
          ok: xhr.status >= 200 && xhr.status < 400,
          durationMs,
          contentType,
          sizeBytes,
          preview,
          error: xhr.status === 0,
          timestamp: Date.now()
        });
      },
      { once: true }
    );

    return origXhrSend.apply(this, arguments);
  }

  function setMonitorActive(nextActive) {
    const desired = Boolean(nextActive);
    if (desired === active) return;
    active = desired;
    if (active) {
      window.fetch = patchedFetch;
      XMLHttpRequest.prototype.open = patchedXhrOpen;
      XMLHttpRequest.prototype.send = patchedXhrSend;
    } else {
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origXhrOpen;
      XMLHttpRequest.prototype.send = origXhrSend;
    }
  }

  window.addEventListener("__chaladev_net_cmd__", (event) => {
    try {
      const payload = typeof event?.detail === "string" ? JSON.parse(event.detail) : event?.detail;
      if (payload && typeof payload.active === "boolean") {
        setMonitorActive(payload.active);
      }
    } catch {
      // Ignorar eventos mal formados
    }
  });

  window.__CHALADEV_NET_MAIN__ = {
    initialized: true,
    isActive: () => active
  };
})();
