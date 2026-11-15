import { CONFIG, PAYPAL_DONATE_URL } from "../config.js";
import {
  formatColorFormats,
  processJson,
  encodeBase64Utf8,
  decodeBase64Utf8,
  decodeJwtLocal
} from "../lib/utils.js";
import { renderQRCode } from "../lib/qrcode.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function t(key, substitutions) {
  if (typeof chrome !== "undefined" && chrome.i18n?.getMessage) {
    const msg = chrome.i18n.getMessage(key, substitutions);
    if (msg) return msg;
  }
  return key;
}

function applyLocalization() {
  const uiLang = chrome.i18n?.getUILanguage?.() || "es";
  document.documentElement.lang = uiLang.toLowerCase().startsWith("en") ? "en" : "es";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) {
      el.textContent = t(key);
    }
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
      el.setAttribute("placeholder", t(key));
    }
  });

  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (key) {
      el.setAttribute("title", t(key));
    }
  });
}

function hydrateCopyIcons() {
  document.querySelectorAll(".btn-icon-copy").forEach((btn) => {
    btn.setAttribute("title", t("btnCopy"));
    btn.setAttribute("aria-label", t("btnCopy"));
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      "M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"
    );
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);
    btn.replaceChildren(svg);
  });
}

function wireFooterLinks() {
  const linkMap = {
    "link-paypal": PAYPAL_DONATE_URL,
    "link-github": CONFIG.GITHUB_REPO_URL,
    "link-chalablock": CONFIG.SUITE_LINKS.chalablock,
    "link-chalavpn": CONFIG.SUITE_LINKS.chalavpn,
    "link-chalatabs": CONFIG.SUITE_LINKS.chalatabs
  };

  for (const [id, url] of Object.entries(linkMap)) {
    const el = document.getElementById(id);
    if (el && url) {
      el.href = url;
    }
  }
}

let toastTimer = null;
function showCopyToast(message = t("copiedToast")) {
  const toast = document.getElementById("copy-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1500);
}

async function copyText(text) {
  const value = String(text ?? "").trim();
  if (!value || value === "—" || value === t("seoMissing")) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    showCopyToast(t("copiedToast"));
    return true;
  } catch {
    showCopyToast(t("copyFailed"));
    return false;
  }
}

function bindCopyButtons() {
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-copy-target]");
    if (!btn) return;
    const targetId = btn.getAttribute("data-copy-target");
    const targetEl = targetId ? document.getElementById(targetId) : null;
    if (!targetEl) return;
    const content = "value" in targetEl ? targetEl.value : targetEl.textContent;
    copyText(content);
  });
}

// ============================================================
// NAVEGACION POR PESTANAS
// ============================================================
function initTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  function activateTab(tabName, persist = true) {
    buttons.forEach((btn) => {
      const isMatch = btn.dataset.tab === tabName;
      btn.classList.toggle("is-active", isMatch);
      btn.setAttribute("aria-selected", String(isMatch));
    });

    panels.forEach((panel) => {
      const isMatch = panel.id === `panel-${tabName}`;
      panel.classList.toggle("is-active", isMatch);
    });

    if (persist && chrome.storage?.local) {
      chrome.storage.local.set({ [CONFIG.STORAGE_KEYS.ACTIVE_TAB]: tabName }).catch(() => {});
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab, true);
    });
  });

  if (chrome.storage?.local) {
    chrome.storage.local
      .get(CONFIG.STORAGE_KEYS.ACTIVE_TAB)
      .then((data) => {
        const saved = data?.[CONFIG.STORAGE_KEYS.ACTIVE_TAB];
        if (saved && ["visual", "formatter", "qrseo"].includes(saved)) {
          activateTab(saved, false);
        }
      })
      .catch(() => {});
  }
}

// ============================================================
// PESTANA 1: CUENTAGOTAS & HISTORIAL (MAX 12)
// ============================================================
function initColorModule() {
  const pickBtn = document.getElementById("btn-eyedropper");
  const statusEl = document.getElementById("eyedropper-status");
  const swatchEl = document.getElementById("active-color-swatch");
  const hexEl = document.getElementById("color-hex-val");
  const rgbEl = document.getElementById("color-rgb-val");
  const hslEl = document.getElementById("color-hsl-val");
  const historyGrid = document.getElementById("color-history-grid");
  const historyEmpty = document.getElementById("color-history-empty");
  const clearBtn = document.getElementById("btn-clear-colors");

  let colorHistory = [];

  function showEyeDropperMessage(msg, isError = false) {
    if (!msg) {
      statusEl.classList.add("is-hidden");
      return;
    }
    statusEl.textContent = msg;
    statusEl.classList.remove("is-hidden", "is-ok", "is-error");
    statusEl.classList.add(isError ? "is-error" : "is-ok");
  }

  function displayColor(rawHex) {
    const formatted = formatColorFormats(rawHex);
    if (!formatted) return null;
    swatchEl.style.backgroundColor = formatted.hex;
    hexEl.textContent = formatted.hex;
    rgbEl.textContent = formatted.rgb;
    hslEl.textContent = formatted.hsl;
    return formatted.hex;
  }

  function renderHistory() {
    historyGrid.replaceChildren();
    const hasItems = colorHistory.length > 0;
    historyEmpty.classList.toggle("is-hidden", hasItems);
    clearBtn.classList.toggle("is-hidden", !hasItems);

    for (const hex of colorHistory) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-swatch-btn";
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.setAttribute("aria-label", hex);
      btn.addEventListener("click", () => {
        displayColor(hex);
        chrome.storage.local
          .set({ [CONFIG.STORAGE_KEYS.LAST_COLOR]: hex })
          .catch(() => {});
      });
      historyGrid.appendChild(btn);
    }
  }

  async function saveColorToHistory(rawHex) {
    const hex = displayColor(rawHex);
    if (!hex) return;
    colorHistory = [hex, ...colorHistory.filter((c) => c !== hex)].slice(
      0,
      CONFIG.MAX_COLOR_HISTORY
    );
    renderHistory();
    await chrome.storage.local
      .set({
        [CONFIG.STORAGE_KEYS.COLOR_HISTORY]: colorHistory,
        [CONFIG.STORAGE_KEYS.LAST_COLOR]: hex
      })
      .catch(() => {});
  }

  chrome.storage.local
    .get([CONFIG.STORAGE_KEYS.COLOR_HISTORY, CONFIG.STORAGE_KEYS.LAST_COLOR])
    .then((data) => {
      const savedHistory = data?.[CONFIG.STORAGE_KEYS.COLOR_HISTORY];
      if (Array.isArray(savedHistory)) {
        colorHistory = savedHistory.slice(0, CONFIG.MAX_COLOR_HISTORY);
      }
      const lastColor = data?.[CONFIG.STORAGE_KEYS.LAST_COLOR] || colorHistory[0] || CONFIG.COLORS.PRIMARY;
      displayColor(lastColor);
      renderHistory();
    })
    .catch(() => {
      displayColor(CONFIG.COLORS.PRIMARY);
      renderHistory();
    });

  pickBtn.addEventListener("click", async () => {
    showEyeDropperMessage("");
    if (!("EyeDropper" in window)) {
      showEyeDropperMessage(t("eyeDropperUnsupported"), true);
      return;
    }

    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) {
        await saveColorToHistory(result.sRGBHex);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        showEyeDropperMessage(t("eyeDropperCancelled"), false);
      } else {
        showEyeDropperMessage(t("eyeDropperCancelled"), false);
      }
    }
  });

  clearBtn.addEventListener("click", async () => {
    colorHistory = [];
    renderHistory();
    await chrome.storage.local
      .remove([CONFIG.STORAGE_KEYS.COLOR_HISTORY])
      .catch(() => {});
  });
}

// ============================================================
// PESTANA 1: INSPECTOR DE TIPOGRAFIA Y CAJA (HOVER DOM)
// ============================================================
const inspectorEls = {
  toggle: () => document.getElementById("toggle-inspector"),
  toggleText: () => document.getElementById("toggle-inspector-text"),
  badge: () => document.getElementById("inspector-badge"),
  tag: () => document.getElementById("insp-tag"),
  dimensions: () => document.getElementById("insp-dimensions"),
  fontFamily: () => document.getElementById("insp-font-family"),
  fontSize: () => document.getElementById("insp-font-size"),
  fontWeight: () => document.getElementById("insp-font-weight"),
  lineHeight: () => document.getElementById("insp-line-height"),
  color: () => document.getElementById("insp-color"),
  colorDot: () => document.getElementById("insp-color-dot"),
  bg: () => document.getElementById("insp-bg"),
  bgDot: () => document.getElementById("insp-bg-dot")
};

function updateInspectorStatusUi(active, locked = false) {
  const toggle = inspectorEls.toggle();
  const toggleText = inspectorEls.toggleText();
  const badge = inspectorEls.badge();

  toggle.checked = active;
  toggleText.textContent = active ? t("inspectorStopLabel") : t("inspectorToggleLabel");

  badge.classList.remove("is-accent", "is-primary");
  if (!active) {
    badge.textContent = t("inspectorStateIdle");
  } else if (locked) {
    badge.textContent = t("inspectorStateLocked");
    badge.classList.add("is-primary");
  } else {
    badge.textContent = t("inspectorStateActive");
    badge.classList.add("is-accent");
  }
}

function renderInspectedMetrics(data) {
  if (!data) return;
  inspectorEls.tag().textContent = data.selector || data.tag || "—";
  inspectorEls.dimensions().textContent = data.dimensions || "—";
  inspectorEls.fontFamily().textContent = data.fontFamily || "—";
  inspectorEls.fontFamily().title = data.fontFamily || "";
  inspectorEls.fontSize().textContent = data.fontSize || "—";
  inspectorEls.fontWeight().textContent = data.fontWeight || "—";
  inspectorEls.lineHeight().textContent = data.lineHeight || "—";

  inspectorEls.color().textContent = data.colorFormatted || data.colorCss || "—";
  inspectorEls.colorDot().style.backgroundColor = data.colorHex && data.colorHex !== "transparent"
    ? data.colorHex
    : "transparent";

  inspectorEls.bg().textContent = data.backgroundFormatted || data.backgroundCss || "—";
  inspectorEls.bgDot().style.backgroundColor = data.backgroundHex && data.backgroundHex !== "transparent"
    ? data.backgroundHex
    : "transparent";
}

function initInspectorModule() {
  const toggle = inspectorEls.toggle();

  toggle.addEventListener("change", async () => {
    const desired = toggle.checked;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CHALADEV_TOGGLE_INSPECTOR",
        active: desired
      });

      if (!response?.ok) {
        updateInspectorStatusUi(false, false);
        applyNoticeFromResponse(response);
        return;
      }

      updateInspectorStatusUi(Boolean(response.active), Boolean(response.locked));
    } catch {
      updateInspectorStatusUi(false, false);
    }
  });
}

// ============================================================
// PESTANA 2: FORMATEADOR JSON, BASE64 Y JWT OFFLINE
// ============================================================
function setFeedback(el, ok, message) {
  if (!message) {
    el.classList.add("is-hidden");
    return;
  }
  el.textContent = message;
  el.classList.remove("is-hidden", "is-ok", "is-error");
  el.classList.add(ok ? "is-ok" : "is-error");
}

function initFormattersModule() {
  // 1. JSON Formatter / Validator
  const jsonInput = document.getElementById("json-input");
  const jsonStatus = document.getElementById("json-status");

  function runJsonMode(mode) {
    const result = processJson(jsonInput.value, mode);
    if (!result.ok) {
      if (result.empty) {
        setFeedback(jsonStatus, false, t("jsonEmptyError"));
      } else {
        setFeedback(
          jsonStatus,
          false,
          t("jsonSyntaxError", [String(result.line), String(result.column), result.error])
        );
      }
      return;
    }

    if (mode !== "validate") {
      jsonInput.value = result.output;
    }
    setFeedback(jsonStatus, true, t("jsonValidMsg", [result.typeLabel]));
  }

  document.getElementById("btn-json-format").addEventListener("click", () => runJsonMode("format"));
  document.getElementById("btn-json-minify").addEventListener("click", () => runJsonMode("minify"));
  document.getElementById("btn-json-validate").addEventListener("click", () => runJsonMode("validate"));
  document.getElementById("btn-json-copy").addEventListener("click", () => copyText(jsonInput.value));
  document.getElementById("btn-json-clear").addEventListener("click", () => {
    jsonInput.value = "";
    setFeedback(jsonStatus, true, "");
  });

  // 2. Base64 Converter
  const b64Input = document.getElementById("b64-input");
  const b64Output = document.getElementById("b64-output");
  const b64Status = document.getElementById("b64-status");

  document.getElementById("btn-b64-encode").addEventListener("click", () => {
    try {
      b64Output.value = encodeBase64Utf8(b64Input.value);
      setFeedback(b64Status, true, "");
    } catch {
      setFeedback(b64Status, false, t("base64Error"));
    }
  });

  document.getElementById("btn-b64-decode").addEventListener("click", () => {
    try {
      b64Output.value = decodeBase64Utf8(b64Input.value);
      setFeedback(b64Status, true, "");
    } catch {
      setFeedback(b64Status, false, t("base64Error"));
    }
  });

  document.getElementById("btn-b64-swap").addEventListener("click", () => {
    const prevOut = b64Output.value;
    b64Output.value = b64Input.value;
    b64Input.value = prevOut;
    setFeedback(b64Status, true, "");
  });

  document.getElementById("btn-b64-copy").addEventListener("click", () => {
    copyText(b64Output.value || b64Input.value);
  });

  document.getElementById("btn-b64-clear").addEventListener("click", () => {
    b64Input.value = "";
    b64Output.value = "";
    setFeedback(b64Status, true, "");
  });

  // 3. JWT Decoder 100% Offline
  const jwtInput = document.getElementById("jwt-input");
  const jwtStatus = document.getElementById("jwt-status");
  const jwtOutputWrap = document.getElementById("jwt-output-wrap");
  const jwtHeaderPre = document.getElementById("jwt-header-pre");
  const jwtPayloadPre = document.getElementById("jwt-payload-pre");
  const jwtExpBadge = document.getElementById("jwt-exp-badge");
  const jwtSigNote = document.getElementById("jwt-sig-note");

  function decodeCurrentJwt() {
    const res = decodeJwtLocal(jwtInput.value);
    if (!res.ok) {
      jwtOutputWrap.classList.add("is-hidden");
      setFeedback(jwtStatus, false, t("jwtErrorInvalid"));
      return;
    }

    setFeedback(jwtStatus, true, t("jwtValidStructure"));
    jwtOutputWrap.classList.remove("is-hidden");
    jwtHeaderPre.textContent = res.headerFormatted;
    jwtPayloadPre.textContent = res.payloadFormatted;

    jwtExpBadge.classList.remove("is-primary", "is-danger");
    if (res.claims.expStatus === "expired") {
      jwtExpBadge.textContent = t("jwtExpired");
      jwtExpBadge.classList.add("is-danger");
    } else if (res.claims.expStatus === "active") {
      jwtExpBadge.textContent = t("jwtActive");
      jwtExpBadge.classList.add("is-primary");
    } else {
      jwtExpBadge.textContent = t("jwtNoExp");
    }

    jwtSigNote.textContent = res.hasSignature ? t("jwtSignatureLabel") : "";
  }

  document.getElementById("btn-jwt-decode").addEventListener("click", decodeCurrentJwt);
  document.getElementById("btn-jwt-clear").addEventListener("click", () => {
    jwtInput.value = "";
    jwtOutputWrap.classList.add("is-hidden");
    setFeedback(jwtStatus, true, "");
  });
}

// ============================================================
// PESTANA 3: GENERADOR QR & VISTA RAPIDA SEO
// ============================================================
let currentTabUrl = "";
let qrUserEdited = false;

function drawQrFromValue(value) {
  const canvas = document.getElementById("qr-canvas");
  const statusEl = document.getElementById("qr-status");
  const downloadBtn = document.getElementById("btn-qr-download");
  const text = String(value || "").trim();

  if (!text) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    statusEl.textContent = t("qrEmptyHint");
    downloadBtn.disabled = true;
    return;
  }

  const res = renderQRCode(canvas, text, {
    targetSize: 220,
    marginModules: 3,
    darkColor: CONFIG.COLORS.BG_DARK,
    lightColor: "#FFFFFF"
  });

  if (!res.ok) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    statusEl.textContent = t("qrErrorTooLong");
    downloadBtn.disabled = true;
    return;
  }

  statusEl.textContent = `QR v${res.version} (${res.size}×${res.size})`;
  downloadBtn.disabled = false;
}

function initQrAndSeoModule() {
  const qrInput = document.getElementById("qr-input");
  const qrCanvas = document.getElementById("qr-canvas");
  const useTabBtn = document.getElementById("btn-qr-current-tab");
  const downloadBtn = document.getElementById("btn-qr-download");
  const seoRefreshBtn = document.getElementById("btn-seo-refresh");

  qrInput.addEventListener("input", () => {
    qrUserEdited = true;
    drawQrFromValue(qrInput.value);
  });

  useTabBtn.addEventListener("click", () => {
    qrUserEdited = false;
    qrInput.value = currentTabUrl || "";
    drawQrFromValue(qrInput.value);
  });

  downloadBtn.addEventListener("click", () => {
    if (downloadBtn.disabled) return;
    const dataUrl = qrCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "chaladev-qr.png";
    link.click();
  });

  seoRefreshBtn.addEventListener("click", () => {
    refreshTabContext();
  });

  drawQrFromValue("");
}

function setSeoField(elementId, value, countBadgeId = null) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const clean = typeof value === "string" ? value.trim() : "";
  if (clean) {
    el.textContent = clean;
    el.classList.remove("is-missing");
  } else {
    el.textContent = t("seoMissing");
    el.classList.add("is-missing");
  }

  if (countBadgeId) {
    const badge = document.getElementById(countBadgeId);
    if (badge) {
      badge.textContent = clean ? t("seoChars", [String(clean.length)]) : "";
    }
  }
}

function renderSeoMetadata(seo) {
  if (!seo) {
    setSeoField("seo-title", "", "seo-title-len");
    setSeoField("seo-description", "", "seo-desc-len");
    setSeoField("seo-canonical", "");
    setSeoField("seo-og-title", "");
    setSeoField("seo-og-desc", "");
    setSeoField("seo-og-type", "");
    setSeoField("seo-og-url", "");
    setSeoField("seo-og-image", "");
    return;
  }

  setSeoField("seo-title", seo.title, "seo-title-len");
  setSeoField("seo-description", seo.description, "seo-desc-len");
  setSeoField("seo-canonical", seo.canonical);
  setSeoField("seo-og-title", seo.ogTitle);
  setSeoField("seo-og-desc", seo.ogDescription);
  setSeoField("seo-og-type", seo.ogType);
  setSeoField("seo-og-url", seo.ogUrl);
  setSeoField("seo-og-image", seo.ogImage);
}

// ============================================================
// CONTEXTO DE PESTANA ACTIVA Y AVISO AMIGABLE
// ============================================================
function applyNoticeFromResponse(response) {
  const banner = document.getElementById("page-notice");
  const titleEl = document.getElementById("notice-title");
  const descEl = document.getElementById("notice-desc");
  const ctxDot = document.getElementById("context-dot");
  const ctxLabel = document.getElementById("context-label");
  const ctxPill = document.getElementById("context-pill");
  const inspectorToggle = inspectorEls.toggle();

  if (response?.restricted) {
    banner.classList.remove("is-hidden", "is-info");
    titleEl.textContent = t("restrictedTitle");
    descEl.textContent = t("restrictedDesc");
    ctxDot.classList.add("is-warning");

    let shortLabel = "internal://";
    if (response.url) {
      const schemeMatch = response.url.match(/^([a-z-]+:\/\/[^/]*)/i);
      shortLabel = schemeMatch ? schemeMatch[1] : response.url;
    }
    ctxLabel.textContent = shortLabel;
    ctxPill.title = response.url || shortLabel;

    inspectorToggle.disabled = true;
    updateInspectorStatusUi(false, false);
    return;
  }

  if (response?.needsActivation) {
    banner.classList.remove("is-hidden");
    banner.classList.add("is-info");
    titleEl.textContent = t("permissionHintTitle");
    descEl.textContent = t("permissionHintDesc");
    ctxDot.classList.add("is-warning");
    ctxLabel.textContent = "activeTab";
    ctxPill.title = t("permissionHintDesc");

    inspectorToggle.disabled = false;
    updateInspectorStatusUi(false, false);
    return;
  }

  banner.classList.add("is-hidden");
  banner.classList.remove("is-info");
  ctxDot.classList.remove("is-warning");
  inspectorToggle.disabled = false;

  if (response?.url) {
    try {
      const parsed = new URL(response.url);
      ctxLabel.textContent = parsed.hostname || parsed.protocol;
    } catch {
      ctxLabel.textContent = response.url;
    }
    ctxPill.title = response.url;
  }
}

async function refreshTabContext() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHALADEV_GET_TAB_CONTEXT" });
    applyNoticeFromResponse(response);

    if (response?.ok) {
      currentTabUrl = response.url || "";
      renderSeoMetadata(response.seo);
      updateInspectorStatusUi(
        Boolean(response.inspector?.active),
        Boolean(response.inspector?.locked)
      );

      const qrInput = document.getElementById("qr-input");
      if (!qrUserEdited && currentTabUrl) {
        qrInput.value = currentTabUrl;
        drawQrFromValue(currentTabUrl);
      }
    } else {
      currentTabUrl = "";
      renderSeoMetadata(null);
      const qrInput = document.getElementById("qr-input");
      if (!qrUserEdited) {
        qrInput.value = "";
        drawQrFromValue("");
      }
    }
  } catch {
    applyNoticeFromResponse({ restricted: true });
    renderSeoMetadata(null);
  }
}

function registerRuntimeListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CHALADEV_ELEMENT_INSPECTED") {
      renderInspectedMetrics(message.data);
      updateInspectorStatusUi(true, Boolean(message.locked));
      return;
    }

    if (message?.type === "CHALADEV_INSPECTOR_STATE") {
      updateInspectorStatusUi(Boolean(message.active), Boolean(message.locked));
      return;
    }

    if (message?.type === "CHALADEV_TAB_UPDATED") {
      refreshTabContext();
    }
  });
}

// ============================================================
// INICIALIZACION
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  applyLocalization();
  hydrateCopyIcons();
  wireFooterLinks();
  bindCopyButtons();
  initTabs();
  initColorModule();
  initInspectorModule();
  initFormattersModule();
  initQrAndSeoModule();
  registerRuntimeListeners();
  refreshTabContext();
});
