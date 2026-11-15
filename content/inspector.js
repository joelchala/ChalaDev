(() => {
  if (window.__CHALADEV_INSPECTOR__?.initialized) {
    return;
  }

  const ACCENT_CYAN = "#06B6D4";
  const PRIMARY_EMERALD = "#10B981";
  const BG_DARK = "#0F172A";
  const TEXT_MAIN = "#F8FAFC";

  const state = {
    initialized: true,
    active: false,
    locked: false,
    currentElement: null,
    overlayEl: null,
    badgeEl: null,
    rafId: null,
    pendingPoint: null
  };

  window.__CHALADEV_INSPECTOR__ = state;

  function rgbCssToHexLocal(cssColor) {
    if (typeof cssColor !== "string") return null;
    const match = cssColor
      .trim()
      .match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
    if (!match) return null;

    if (match[4] !== undefined) {
      const alpha = match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]);
      if (Number.isFinite(alpha) && alpha <= 0) return "transparent";
    }

    const toHex = (val) =>
      Math.max(0, Math.min(255, Math.round(Number(val))))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();

    return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  }

  function formatColorValue(rawCss) {
    const hex = rgbCssToHexLocal(rawCss);
    if (hex === "transparent") return "transparent";
    if (!hex) return rawCss || "—";
    return `${hex} (${rawCss})`;
  }

  function buildElementLabel(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    let classes = "";
    if (typeof el.className === "string" && el.className.trim()) {
      const parts = el.className.trim().split(/\s+/).slice(0, 2);
      if (parts.length) {
        classes = `.${parts.join(".")}`;
      }
    }
    return `<${tag}>${id}${classes}`;
  }

  function createOverlayElements() {
    if (state.overlayEl && state.badgeEl) return;

    const overlay = document.createElement("div");
    overlay.id = "chaladev-inspector-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: "0px",
      height: "0px",
      pointerEvents: "none",
      zIndex: "2147483646",
      border: `2px solid ${ACCENT_CYAN}`,
      backgroundColor: "rgba(6, 182, 212, 0.12)",
      boxSizing: "border-box",
      borderRadius: "2px",
      transition: "border-color 120ms ease, background-color 120ms ease",
      display: "none"
    });

    const badge = document.createElement("div");
    badge.id = "chaladev-inspector-badge";
    Object.assign(badge.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      pointerEvents: "none",
      zIndex: "2147483647",
      backgroundColor: BG_DARK,
      color: TEXT_MAIN,
      border: `1px solid ${ACCENT_CYAN}`,
      borderRadius: "4px",
      padding: "2px 6px",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: "11px",
      fontWeight: "600",
      lineHeight: "1.35",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 12px rgba(15, 23, 42, 0.45)",
      display: "none"
    });

    document.documentElement.appendChild(overlay);
    document.documentElement.appendChild(badge);
    state.overlayEl = overlay;
    state.badgeEl = badge;
  }

  function removeOverlayElements() {
    if (state.overlayEl) {
      state.overlayEl.remove();
      state.overlayEl = null;
    }
    if (state.badgeEl) {
      state.badgeEl.remove();
      state.badgeEl = null;
    }
  }

  function isOwnOverlay(el) {
    if (!el) return true;
    return el === state.overlayEl || el === state.badgeEl;
  }

  function extractElementMetrics(el) {
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const widthPx = Math.round(rect.width * 10) / 10;
    const heightPx = Math.round(rect.height * 10) / 10;

    return {
      tag: `<${el.tagName.toLowerCase()}>`,
      selector: buildElementLabel(el),
      width: widthPx,
      height: heightPx,
      dimensions: `${widthPx}px × ${heightPx}px`,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      colorCss: cs.color,
      colorHex: rgbCssToHexLocal(cs.color),
      colorFormatted: formatColorValue(cs.color),
      backgroundCss: cs.backgroundColor,
      backgroundHex: rgbCssToHexLocal(cs.backgroundColor),
      backgroundFormatted: formatColorValue(cs.backgroundColor),
      padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
      margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`
    };
  }

  function updateOverlayPosition(el) {
    if (!el || !state.overlayEl || !state.badgeEl || !el.isConnected) return;

    const rect = el.getBoundingClientRect();
    const borderColor = state.locked ? PRIMARY_EMERALD : ACCENT_CYAN;
    const fillColor = state.locked ? "rgba(16, 185, 129, 0.14)" : "rgba(6, 182, 212, 0.12)";

    Object.assign(state.overlayEl.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderColor,
      backgroundColor: fillColor
    });

    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    state.badgeEl.textContent = `${buildElementLabel(el)} · ${w}×${h}px${state.locked ? " [LOCKED]" : ""}`;
    state.badgeEl.style.display = "block";
    state.badgeEl.style.borderColor = borderColor;

    const badgeRect = state.badgeEl.getBoundingClientRect();
    const topPos = rect.top >= badgeRect.height + 6 ? rect.top - badgeRect.height - 4 : Math.min(window.innerHeight - badgeRect.height - 4, rect.bottom + 4);
    const leftPos = Math.max(4, Math.min(window.innerWidth - badgeRect.width - 4, rect.left));

    state.badgeEl.style.top = `${Math.max(4, topPos)}px`;
    state.badgeEl.style.left = `${leftPos}px`;
  }

  function sendMetricsToPanel(el) {
    const data = extractElementMetrics(el);
    chrome.runtime
      .sendMessage({
        type: "CHALADEV_ELEMENT_INSPECTED",
        data,
        locked: state.locked
      })
      .catch(() => {});
  }

  function inspectTargetAtPoint(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    if (!target || isOwnOverlay(target) || target === document.documentElement) {
      return;
    }
    if (target !== state.currentElement) {
      state.currentElement = target;
      sendMetricsToPanel(target);
    }
    updateOverlayPosition(target);
  }

  function onMouseMove(event) {
    if (!state.active || state.locked) return;
    state.pendingPoint = { x: event.clientX, y: event.clientY };
    if (state.rafId !== null) return;
    state.rafId = window.requestAnimationFrame(() => {
      state.rafId = null;
      if (state.pendingPoint && state.active && !state.locked) {
        inspectTargetAtPoint(state.pendingPoint.x, state.pendingPoint.y);
      }
    });
  }

  function onClick(event) {
    if (!state.active) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (state.locked) {
      state.locked = false;
      inspectTargetAtPoint(event.clientX, event.clientY);
      if (state.currentElement) {
        sendMetricsToPanel(state.currentElement);
      }
      return;
    }

    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (target && !isOwnOverlay(target) && target !== document.documentElement) {
      state.currentElement = target;
    }
    state.locked = true;
    if (state.currentElement) {
      updateOverlayPosition(state.currentElement);
      sendMetricsToPanel(state.currentElement);
    }
  }

  function onScrollOrResize() {
    if (!state.active || !state.currentElement) return;
    updateOverlayPosition(state.currentElement);
  }

  function onKeyDown(event) {
    if (!state.active) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      deactivateInspector(true);
    }
  }

  function activateInspector() {
    if (state.active) return;
    state.active = true;
    state.locked = false;
    state.currentElement = null;
    createOverlayElements();
    document.addEventListener("mousemove", onMouseMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize, true);
  }

  function deactivateInspector(notifyPanel = false) {
    state.active = false;
    state.locked = false;
    state.currentElement = null;
    if (state.rafId !== null) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("scroll", onScrollOrResize, true);
    window.removeEventListener("resize", onScrollOrResize, true);
    removeOverlayElements();

    if (notifyPanel) {
      chrome.runtime
        .sendMessage({
          type: "CHALADEV_INSPECTOR_STATE",
          active: false,
          locked: false
        })
        .catch(() => {});
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "CHALADEV_INSPECTOR_PING") {
      sendResponse({ alive: true, active: state.active, locked: state.locked });
      return false;
    }

    if (message?.type === "CHALADEV_INSPECTOR_SET") {
      if (message.active) {
        activateInspector();
      } else {
        deactivateInspector(false);
      }
      sendResponse({ active: state.active, locked: state.locked });
      return false;
    }

    return false;
  });
})();
