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

  let colorProbeCtx = null;

  function clamp01(val) {
    return val < 0 ? 0 : val > 1 ? 1 : val;
  }

  function linearToSrgbChannel(c) {
    const clamped = clamp01(c);
    if (clamped <= 0.0031308) return 12.92 * clamped;
    return 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  }

  function srgbToLinearChannel(c) {
    const clamped = clamp01(c);
    if (clamped <= 0.04045) return clamped / 12.92;
    return Math.pow((clamped + 0.055) / 1.055, 2.4);
  }

  function rgbBytesToHex(r, g, b) {
    const toHex = (val) =>
      Math.max(0, Math.min(255, Math.round(Number(val))))
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function parseAlpha(token) {
    if (token === undefined || token === null) return 1;
    const clean = String(token).trim().toLowerCase();
    if (!clean) return 1;
    if (clean === "none") return 0;
    const val = clean.endsWith("%") ? parseFloat(clean) / 100 : parseFloat(clean);
    return Number.isFinite(val) ? val : NaN;
  }

  function parseNumOrPct(token, pctScale = 1) {
    const clean = String(token).trim().toLowerCase();
    if (clean === "none") return 0;
    if (clean.endsWith("%")) {
      const val = parseFloat(clean.slice(0, -1));
      return Number.isFinite(val) ? (val / 100) * pctScale : NaN;
    }
    const val = parseFloat(clean);
    return Number.isFinite(val) ? val : NaN;
  }

  function parseAngle(token) {
    const clean = String(token).trim().toLowerCase();
    if (clean === "none") return 0;
    const m = clean.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|rad|grad|turn)?$/i);
    if (!m) return NaN;
    const val = parseFloat(m[1]);
    const unit = m[2] || "deg";
    if (unit === "rad") return (val * 180) / Math.PI;
    if (unit === "grad") return val * 0.9;
    if (unit === "turn") return val * 360;
    return val;
  }

  function splitArgsAndAlpha(rawBody) {
    const slashIdx = rawBody.indexOf("/");
    let mainPart = rawBody;
    let alpha = 1;
    if (slashIdx !== -1) {
      mainPart = rawBody.slice(0, slashIdx);
      alpha = parseAlpha(rawBody.slice(slashIdx + 1));
      if (!Number.isFinite(alpha)) return null;
    }
    const tokens = mainPart.includes(",")
      ? mainPart.split(",").map((s) => s.trim()).filter(Boolean)
      : mainPart.trim().split(/\s+/).filter(Boolean);
    return { tokens, alpha };
  }

  function oklabToHex(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    return rgbBytesToHex(
      linearToSrgbChannel(rLin) * 255,
      linearToSrgbChannel(gLin) * 255,
      linearToSrgbChannel(bLin) * 255
    );
  }

  function resolveColorViaCanvas(cssColor) {
    try {
      if (!colorProbeCtx) {
        const c = document.createElement("canvas");
        c.width = 1;
        c.height = 1;
        colorProbeCtx = c.getContext("2d", { willReadFrequently: true });
      }
      if (!colorProbeCtx) return null;
      colorProbeCtx.clearRect(0, 0, 1, 1);
      colorProbeCtx.fillStyle = "rgba(0, 0, 0, 0)";
      colorProbeCtx.fillStyle = cssColor;
      colorProbeCtx.fillRect(0, 0, 1, 1);
      const data = colorProbeCtx.getImageData(0, 0, 1, 1).data;
      if (data[3] === 0) return "transparent";
      return rgbBytesToHex(data[0], data[1], data[2]);
    } catch {
      return null;
    }
  }

  function parseCssColorToHex(cssColor) {
    if (typeof cssColor !== "string") return null;
    const trimmed = cssColor.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase() === "transparent") return "transparent";

    if (trimmed.startsWith("#")) {
      const clean = trimmed.slice(1);
      if (/^[0-9a-fA-F]{3}$/.test(clean)) {
        return `#${clean.split("").map((ch) => ch + ch).join("").toUpperCase()}`;
      }
      if (/^[0-9a-fA-F]{6}$/.test(clean)) {
        return `#${clean.toUpperCase()}`;
      }
      if (/^[0-9a-fA-F]{8}$/.test(clean)) {
        if (parseInt(clean.slice(6, 8), 16) <= 0) return "transparent";
        return `#${clean.slice(0, 6).toUpperCase()}`;
      }
    }

    const fnMatch = trimmed.match(/^([a-z0-9-]+)\((.*)\)$/i);
    if (fnMatch) {
      const fnName = fnMatch[1].toLowerCase();
      const body = fnMatch[2].trim();

      if (fnName === "rgb" || fnName === "rgba") {
        const parsed = splitArgsAndAlpha(body);
        if (parsed) {
          let alpha = parsed.alpha;
          if (parsed.tokens.length === 4 && body.includes(",")) {
            alpha = parseAlpha(parsed.tokens[3]);
          }
          if (Number.isFinite(alpha) && alpha <= 0) return "transparent";
          if (parsed.tokens.length >= 3) {
            const r = parseNumOrPct(parsed.tokens[0], 255);
            const g = parseNumOrPct(parsed.tokens[1], 255);
            const b = parseNumOrPct(parsed.tokens[2], 255);
            if ([r, g, b].every(Number.isFinite)) {
              return rgbBytesToHex(r, g, b);
            }
          }
        }
      }

      if (fnName === "oklab") {
        const parsed = splitArgsAndAlpha(body);
        if (parsed && parsed.tokens.length === 3) {
          if (parsed.alpha <= 0) return "transparent";
          const L = parseNumOrPct(parsed.tokens[0], 1);
          const a = parseNumOrPct(parsed.tokens[1], 0.4);
          const b = parseNumOrPct(parsed.tokens[2], 0.4);
          if ([L, a, b].every(Number.isFinite)) {
            return oklabToHex(L, a, b);
          }
        }
      }

      if (fnName === "oklch") {
        const parsed = splitArgsAndAlpha(body);
        if (parsed && parsed.tokens.length === 3) {
          if (parsed.alpha <= 0) return "transparent";
          const L = parseNumOrPct(parsed.tokens[0], 1);
          const C = Math.max(0, parseNumOrPct(parsed.tokens[1], 0.4));
          const H = parseAngle(parsed.tokens[2]);
          if ([L, C, H].every(Number.isFinite)) {
            const rad = (H * Math.PI) / 180;
            return oklabToHex(L, C * Math.cos(rad), C * Math.sin(rad));
          }
        }
      }

      if (fnName === "color") {
        const parsed = splitArgsAndAlpha(body);
        if (parsed && parsed.tokens.length === 4) {
          if (parsed.alpha <= 0) return "transparent";
          const space = parsed.tokens[0].toLowerCase();
          const c1 = parseNumOrPct(parsed.tokens[1], 1);
          const c2 = parseNumOrPct(parsed.tokens[2], 1);
          const c3 = parseNumOrPct(parsed.tokens[3], 1);
          if ([c1, c2, c3].every(Number.isFinite)) {
            if (space === "srgb") {
              return rgbBytesToHex(clamp01(c1) * 255, clamp01(c2) * 255, clamp01(c3) * 255);
            }
            if (space === "srgb-linear") {
              return rgbBytesToHex(
                linearToSrgbChannel(c1) * 255,
                linearToSrgbChannel(c2) * 255,
                linearToSrgbChannel(c3) * 255
              );
            }
            if (space === "display-p3") {
              const rP3 = srgbToLinearChannel(c1);
              const gP3 = srgbToLinearChannel(c2);
              const bP3 = srgbToLinearChannel(c3);
              const X = 0.4865709486482162 * rP3 + 0.26566769316909306 * gP3 + 0.1982172852343625 * bP3;
              const Y = 0.2289745640697488 * rP3 + 0.6917385218365064 * gP3 + 0.079286914093745 * bP3;
              const Z = 0.04511338185890264 * gP3 + 1.043944368900976 * bP3;
              const rSrgb = 3.2409699419045213 * X - 1.5373831775700935 * Y - 0.4986107602930033 * Z;
              const gSrgb = -0.9692436362808798 * X + 1.8759675015077206 * Y + 0.04155505740717561 * Z;
              const bSrgb = 0.05563007969699361 * X - 0.20397695888897657 * Y + 1.0569715142428786 * Z;
              return rgbBytesToHex(
                linearToSrgbChannel(rSrgb) * 255,
                linearToSrgbChannel(gSrgb) * 255,
                linearToSrgbChannel(bSrgb) * 255
              );
            }
          }
        }
      }
    }

    return resolveColorViaCanvas(trimmed);
  }

  function formatColorValue(rawCss) {
    const hex = parseCssColorToHex(rawCss);
    if (hex === "transparent") return "transparent";
    if (!hex) return rawCss || "—";
    return `${hex} (${rawCss})`;
  }

  function formatBoxSpacing(t, r, b, l) {
    if (t === r && r === b && b === l) return t;
    if (t === b && r === l) return `${t} ${r}`;
    if (r === l) return `${t} ${r} ${b}`;
    return `${t} ${r} ${b} ${l}`;
  }

  function buildElementLabel(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    let classes = "";
    const rawClass = el.getAttribute("class") || "";
    if (rawClass.trim()) {
      const parts = rawClass.trim().split(/\s+/).slice(0, 2);
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

  function deepElementFromPoint(clientX, clientY) {
    let el = document.elementFromPoint(clientX, clientY);
    let depth = 0;
    while (el && el.shadowRoot && depth < 20) {
      const inner = el.shadowRoot.elementFromPoint(clientX, clientY);
      if (!inner || inner === el) break;
      el = inner;
      depth += 1;
    }
    return el;
  }

  function getParentAcrossShadow(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode?.();
    if (root && root.host && root.host.nodeType === 1) {
      return root.host;
    }
    return null;
  }

  function getEffectiveBackgroundColor(el) {
    let curr = el;
    while (curr && curr.nodeType === 1) {
      const bg = window.getComputedStyle(curr).backgroundColor;
      const hex = parseCssColorToHex(bg);
      if (hex && hex !== "transparent") {
        return { css: bg, hex };
      }
      curr = getParentAcrossShadow(curr);
    }
    return {
      css: window.getComputedStyle(el).backgroundColor,
      hex: "transparent"
    };
  }

  function extractElementMetrics(el) {
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const widthPx = Math.round(rect.width * 10) / 10;
    const heightPx = Math.round(rect.height * 10) / 10;

    const colorHex = parseCssColorToHex(cs.color);
    const effectiveBg = getEffectiveBackgroundColor(el);
    const backgroundHex = effectiveBg.hex;
    const effectiveBgHex =
      backgroundHex && backgroundHex !== "transparent" ? backgroundHex : "#FFFFFF";

    return {
      tag: `<${el.tagName.toLowerCase()}>`,
      selector: buildElementLabel(el),
      inShadowDom: Boolean(el.getRootNode?.()?.host),
      width: widthPx,
      height: heightPx,
      dimensions: `${widthPx}px × ${heightPx}px`,
      display: cs.display,
      borderRadius: cs.borderRadius,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      colorCss: cs.color,
      colorHex,
      colorFormatted: formatColorValue(cs.color),
      backgroundCss: effectiveBg.css,
      backgroundHex,
      effectiveBgHex,
      backgroundFormatted:
        backgroundHex === "transparent" ? "transparent" : formatColorValue(effectiveBg.css),
      padding: formatBoxSpacing(cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft),
      margin: formatBoxSpacing(cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft)
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
    const shadowTag = el.getRootNode?.()?.host ? " [Shadow]" : "";
    state.badgeEl.textContent = `${buildElementLabel(el)} · ${w}×${h}px${shadowTag}${state.locked ? " [LOCKED]" : ""}`;
    state.badgeEl.style.display = "block";
    state.badgeEl.style.borderColor = borderColor;

    const badgeRect = state.badgeEl.getBoundingClientRect();
    const topPos =
      rect.top >= badgeRect.height + 6
        ? rect.top - badgeRect.height - 4
        : Math.min(window.innerHeight - badgeRect.height - 4, rect.bottom + 4);
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
    const target = deepElementFromPoint(clientX, clientY);
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

    const target = deepElementFromPoint(event.clientX, event.clientY);
    if (target && !isOwnOverlay(target) && target !== document.documentElement) {
      state.currentElement = target;
    }
    state.locked = true;
    if (state.currentElement) {
      updateOverlayPosition(state.currentElement);
      sendMetricsToPanel(state.currentElement);
    }
  }

  function suppressMouseEvent(event) {
    if (!state.active) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function onScrollOrResize() {
    if (!state.active || !state.currentElement) return;
    if (!state.currentElement.isConnected) {
      state.currentElement = null;
      state.locked = false;
      if (state.overlayEl) state.overlayEl.style.display = "none";
      if (state.badgeEl) state.badgeEl.style.display = "none";
      return;
    }
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
    document.addEventListener("mousedown", suppressMouseEvent, true);
    document.addEventListener("mouseup", suppressMouseEvent, true);
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
    document.removeEventListener("mousedown", suppressMouseEvent, true);
    document.removeEventListener("mouseup", suppressMouseEvent, true);
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
