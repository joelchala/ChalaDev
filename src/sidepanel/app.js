import { CONFIG, PAYPAL_DONATE_URL } from "../config.js";
import {
  formatColorFormats,
  parseAnyColorToHex,
  evaluateWcagContrast,
  processJson,
  encodeBase64Utf8,
  decodeBase64Utf8,
  decodeJwtLocal,
  evaluateSeoLength,
  formatSeoReport,
  formatBytes,
  summarizeNetworkResources,
  auditWebAppManifest,
  evaluateSecurityAudit,
  formatSecurityReport
} from "../lib/utils.js";
import { renderQRCode, encodeQRSvg } from "../lib/qrcode.js";

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

async function copyText(text, toastMessage = t("copiedToast")) {
  const value = String(text ?? "").trim();
  if (!value || value === "—" || value === t("seoMissing")) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(value);
    showCopyToast(toastMessage);
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
    const override = targetEl.dataset?.copyValue?.trim();
    const content = override || ("value" in targetEl ? targetEl.value : targetEl.textContent);
    copyText(content);
  });
}

// ============================================================
// CICLO DE VIDA DEL SIDE PANEL (DESACTIVAR INSPECTOR AL CERRAR)
// ============================================================
let sidePanelPort = null;
let sidePanelPingTimer = null;
let isPanelUnloading = false;

function connectSidePanelPort() {
  if (!chrome.runtime?.connect || isPanelUnloading) return;
  try {
    sidePanelPort = chrome.runtime.connect({ name: "chaladev-sidepanel" });
    if (sidePanelPingTimer) clearInterval(sidePanelPingTimer);
    sidePanelPingTimer = setInterval(() => {
      try {
        sidePanelPort?.postMessage({ type: "CHALADEV_PANEL_PING" });
      } catch {
        // Ignorar si el puerto se cerro
      }
    }, 25_000);

    sidePanelPort.onDisconnect.addListener(() => {
      sidePanelPort = null;
      if (sidePanelPingTimer) {
        clearInterval(sidePanelPingTimer);
        sidePanelPingTimer = null;
      }
      if (!isPanelUnloading) {
        setTimeout(connectSidePanelPort, 400);
      }
    });
  } catch {
    // Ignorar en entornos sin runtime.connect
  }
}

window.addEventListener("pagehide", () => {
  isPanelUnloading = true;
  if (sidePanelPingTimer) {
    clearInterval(sidePanelPingTimer);
    sidePanelPingTimer = null;
  }
  if (sidePanelPort) {
    try {
      sidePanelPort.disconnect();
    } catch {
      // Ignorar
    }
    sidePanelPort = null;
  }
});

// ============================================================
// NAVEGACION POR PESTANAS
// ============================================================
const VALID_TABS = ["visual", "formatter", "qrseo", "network", "app", "security"];
let activePanelTabName = "visual";

function refreshActivePanelModule() {
  if (activePanelTabName === "network") {
    refreshNetworkSnapshot();
  } else if (activePanelTabName === "app") {
    refreshAppSnapshot();
  } else if (activePanelTabName === "security") {
    refreshSecuritySnapshot();
  }
}

function initTabs() {
  const buttons = Array.from(document.querySelectorAll(".tab-btn"));
  const panels = Array.from(document.querySelectorAll(".tab-panel"));

  function activateTab(tabName, persist = true) {
    if (!VALID_TABS.includes(tabName)) return;
    activePanelTabName = tabName;

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

    refreshActivePanelModule();
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
        if (saved && VALID_TABS.includes(saved)) {
          activateTab(saved, false);
        }
      })
      .catch(() => {});
  }
}

// ============================================================
// PESTANA 1: CUENTAGOTAS, SELECTOR MANUAL, WCAG E HISTORIAL (MAX 12)
// ============================================================
const colorModuleApi = {
  saveColorToHistory: async () => {},
  setWcagPair: () => {}
};

function initColorModule() {
  const pickBtn = document.getElementById("btn-eyedropper");
  const nativePicker = document.getElementById("color-native-picker");
  const manualInput = document.getElementById("color-manual-input");
  const applyBtn = document.getElementById("btn-color-apply");
  const statusEl = document.getElementById("eyedropper-status");
  const swatchEl = document.getElementById("active-color-swatch");
  const hexEl = document.getElementById("color-hex-val");
  const rgbEl = document.getElementById("color-rgb-val");
  const hslEl = document.getElementById("color-hsl-val");
  const historyGrid = document.getElementById("color-history-grid");
  const historyEmpty = document.getElementById("color-history-empty");
  const clearBtn = document.getElementById("btn-clear-colors");

  const wcagFgPicker = document.getElementById("wcag-fg-picker");
  const wcagFgInput = document.getElementById("wcag-fg-input");
  const wcagBgPicker = document.getElementById("wcag-bg-picker");
  const wcagBgInput = document.getElementById("wcag-bg-input");
  const wcagSwapBtn = document.getElementById("btn-wcag-swap");
  const wcagPreview = document.getElementById("wcag-preview");
  const wcagRatioEl = document.getElementById("wcag-ratio");
  const wcagAaEl = document.getElementById("wcag-aa-badge");
  const wcagAaaEl = document.getElementById("wcag-aaa-badge");
  const wcagAaLargeEl = document.getElementById("wcag-aa-large-badge");
  const wcagAaaLargeEl = document.getElementById("wcag-aaa-large-badge");

  let colorHistory = [];
  let wcagFgHex = CONFIG.COLORS.PRIMARY;
  let wcagBgHex = CONFIG.COLORS.BG_DARK;

  function showEyeDropperMessage(msg, isError = false) {
    if (!msg) {
      statusEl.classList.add("is-hidden");
      return;
    }
    statusEl.textContent = msg;
    statusEl.classList.remove("is-hidden", "is-ok", "is-error");
    statusEl.classList.add(isError ? "is-error" : "is-ok");
  }

  function setPillPassState(el, label, pass) {
    el.textContent = `${label} ${pass ? "✓" : "✕"}`;
    el.classList.remove("is-pass", "is-fail");
    el.classList.add(pass ? "is-pass" : "is-fail");
    el.title = pass ? t("wcagPass") : t("wcagFail");
  }

  function updateWcagContrastUi() {
    wcagFgPicker.value = wcagFgHex;
    wcagFgInput.value = wcagFgHex;
    wcagBgPicker.value = wcagBgHex;
    wcagBgInput.value = wcagBgHex;
    wcagPreview.style.color = wcagFgHex;
    wcagPreview.style.backgroundColor = wcagBgHex;

    const result = evaluateWcagContrast(wcagFgHex, wcagBgHex);
    if (!result) return;
    wcagRatioEl.textContent = result.ratioText;
    wcagRatioEl.classList.remove("is-good", "is-warn", "is-bad");
    if (result.aaNormal) {
      wcagRatioEl.classList.add("is-good");
    } else if (result.aaLarge) {
      wcagRatioEl.classList.add("is-warn");
    } else {
      wcagRatioEl.classList.add("is-bad");
    }

    setPillPassState(wcagAaEl, "AA", result.aaNormal);
    setPillPassState(wcagAaaEl, "AAA", result.aaaNormal);
    setPillPassState(wcagAaLargeEl, "AA+", result.aaLarge);
    setPillPassState(wcagAaaLargeEl, "AAA+", result.aaaLarge);
  }

  function setWcagPair(fgInput, bgInput) {
    const fg = parseAnyColorToHex(fgInput);
    const bg = parseAnyColorToHex(bgInput);
    if (fg) wcagFgHex = fg;
    if (bg) wcagBgHex = bg;
    updateWcagContrastUi();
  }

  function displayColor(rawColor, syncWcagFg = true) {
    const hex = parseAnyColorToHex(rawColor);
    const formatted = hex ? formatColorFormats(hex) : null;
    if (!formatted) return null;
    swatchEl.style.backgroundColor = formatted.hex;
    nativePicker.value = formatted.hex;
    manualInput.value = formatted.hex;
    hexEl.textContent = formatted.hex;
    rgbEl.textContent = formatted.rgb;
    hslEl.textContent = formatted.hsl;
    if (syncWcagFg) {
      wcagFgHex = formatted.hex;
      updateWcagContrastUi();
    }
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
        showEyeDropperMessage("");
        displayColor(hex);
        chrome.storage.local
          .set({ [CONFIG.STORAGE_KEYS.LAST_COLOR]: hex })
          .catch(() => {});
      });
      historyGrid.appendChild(btn);
    }
  }

  async function saveColorToHistory(rawColor, { showToast = false } = {}) {
    const hex = displayColor(rawColor);
    if (!hex) return null;
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
    if (showToast) {
      showCopyToast(t("colorSavedToast"));
    }
    return hex;
  }

  colorModuleApi.saveColorToHistory = saveColorToHistory;
  colorModuleApi.setWcagPair = setWcagPair;

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

  nativePicker.addEventListener("input", () => {
    showEyeDropperMessage("");
    displayColor(nativePicker.value);
  });

  nativePicker.addEventListener("change", () => {
    saveColorToHistory(nativePicker.value);
  });

  async function applyManualColor() {
    showEyeDropperMessage("");
    const parsed = parseAnyColorToHex(manualInput.value);
    if (!parsed) {
      showEyeDropperMessage(t("colorInvalidError"), true);
      return;
    }
    await saveColorToHistory(parsed);
  }

  applyBtn.addEventListener("click", applyManualColor);
  manualInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyManualColor();
    }
  });

  wcagFgPicker.addEventListener("input", () => {
    wcagFgHex = wcagFgPicker.value.toUpperCase();
    updateWcagContrastUi();
  });

  wcagBgPicker.addEventListener("input", () => {
    wcagBgHex = wcagBgPicker.value.toUpperCase();
    updateWcagContrastUi();
  });

  wcagFgInput.addEventListener("change", () => {
    const parsed = parseAnyColorToHex(wcagFgInput.value);
    if (parsed) wcagFgHex = parsed;
    updateWcagContrastUi();
  });

  wcagBgInput.addEventListener("change", () => {
    const parsed = parseAnyColorToHex(wcagBgInput.value);
    if (parsed) wcagBgHex = parsed;
    updateWcagContrastUi();
  });

  wcagSwapBtn.addEventListener("click", () => {
    const prevFg = wcagFgHex;
    wcagFgHex = wcagBgHex;
    wcagBgHex = prevFg;
    updateWcagContrastUi();
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
        showEyeDropperMessage(t("eyeDropperError"), true);
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

  updateWcagContrastUi();
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
  display: () => document.getElementById("insp-display"),
  padding: () => document.getElementById("insp-padding"),
  margin: () => document.getElementById("insp-margin"),
  borderRadius: () => document.getElementById("insp-border-radius"),
  fontFamily: () => document.getElementById("insp-font-family"),
  fontSize: () => document.getElementById("insp-font-size"),
  fontWeight: () => document.getElementById("insp-font-weight"),
  lineHeight: () => document.getElementById("insp-line-height"),
  color: () => document.getElementById("insp-color"),
  colorDot: () => document.getElementById("insp-color-dot"),
  saveColorBtn: () => document.getElementById("btn-insp-save-color"),
  bg: () => document.getElementById("insp-bg"),
  bgDot: () => document.getElementById("insp-bg-dot"),
  saveBgBtn: () => document.getElementById("btn-insp-save-bg"),
  contrastRatio: () => document.getElementById("insp-contrast-ratio"),
  contrastAa: () => document.getElementById("insp-contrast-aa"),
  contrastAaa: () => document.getElementById("insp-contrast-aaa"),
  loadWcagBtn: () => document.getElementById("btn-insp-load-wcag")
};

let lastInspectedPair = { fg: null, bg: null };

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

function resetInspectedMetricsUi() {
  inspectorEls.tag().textContent = "—";
  inspectorEls.dimensions().textContent = "—";
  inspectorEls.display().textContent = "—";
  inspectorEls.padding().textContent = "—";
  inspectorEls.padding().title = "";
  inspectorEls.margin().textContent = "—";
  inspectorEls.margin().title = "";
  inspectorEls.borderRadius().textContent = "—";
  inspectorEls.fontFamily().textContent = "—";
  inspectorEls.fontFamily().title = "";
  inspectorEls.fontSize().textContent = "—";
  inspectorEls.fontWeight().textContent = "—";
  inspectorEls.lineHeight().textContent = "—";

  const colorEl = inspectorEls.color();
  colorEl.textContent = "—";
  delete colorEl.dataset.copyValue;
  inspectorEls.colorDot().style.backgroundColor = "transparent";
  inspectorEls.saveColorBtn().disabled = true;
  delete inspectorEls.saveColorBtn().dataset.hex;

  const bgEl = inspectorEls.bg();
  bgEl.textContent = "—";
  delete bgEl.dataset.copyValue;
  inspectorEls.bgDot().style.backgroundColor = "transparent";
  inspectorEls.saveBgBtn().disabled = true;
  delete inspectorEls.saveBgBtn().dataset.hex;

  inspectorEls.contrastRatio().textContent = "—";
  inspectorEls.contrastAa().classList.add("is-hidden");
  inspectorEls.contrastAaa().classList.add("is-hidden");
  inspectorEls.loadWcagBtn().disabled = true;
  lastInspectedPair = { fg: null, bg: null };
}

function renderInspectedMetrics(data) {
  if (!data) {
    resetInspectedMetricsUi();
    return;
  }
  const tagText = data.selector || data.tag || "—";
  inspectorEls.tag().textContent = data.inShadowDom ? `${tagText} [Shadow]` : tagText;
  inspectorEls.dimensions().textContent = data.dimensions || "—";
  inspectorEls.display().textContent = data.display || "—";
  inspectorEls.padding().textContent = data.padding || "—";
  inspectorEls.padding().title = data.padding || "";
  inspectorEls.margin().textContent = data.margin || "—";
  inspectorEls.margin().title = data.margin || "";
  inspectorEls.borderRadius().textContent = data.borderRadius || "—";
  inspectorEls.fontFamily().textContent = data.fontFamily || "—";
  inspectorEls.fontFamily().title = data.fontFamily || "";
  inspectorEls.fontSize().textContent = data.fontSize || "—";
  inspectorEls.fontWeight().textContent = data.fontWeight || "—";
  inspectorEls.lineHeight().textContent = data.lineHeight || "—";

  const colorEl = inspectorEls.color();
  const hasFgHex = Boolean(data.colorHex && data.colorHex !== "transparent");
  colorEl.textContent = data.colorFormatted || data.colorCss || "—";
  if (hasFgHex) {
    colorEl.dataset.copyValue = data.colorHex;
    inspectorEls.colorDot().style.backgroundColor = data.colorHex;
    inspectorEls.saveColorBtn().disabled = false;
    inspectorEls.saveColorBtn().dataset.hex = data.colorHex;
  } else {
    delete colorEl.dataset.copyValue;
    inspectorEls.colorDot().style.backgroundColor = "transparent";
    inspectorEls.saveColorBtn().disabled = true;
    delete inspectorEls.saveColorBtn().dataset.hex;
  }

  const bgEl = inspectorEls.bg();
  const hasBgHex = Boolean(data.backgroundHex && data.backgroundHex !== "transparent");
  bgEl.textContent = data.backgroundFormatted || data.backgroundCss || "—";
  if (hasBgHex) {
    bgEl.dataset.copyValue = data.backgroundHex;
    inspectorEls.bgDot().style.backgroundColor = data.backgroundHex;
    inspectorEls.saveBgBtn().disabled = false;
    inspectorEls.saveBgBtn().dataset.hex = data.backgroundHex;
  } else {
    delete bgEl.dataset.copyValue;
    inspectorEls.bgDot().style.backgroundColor = "transparent";
    inspectorEls.saveBgBtn().disabled = true;
    delete inspectorEls.saveBgBtn().dataset.hex;
  }

  const contrastFg = hasFgHex ? data.colorHex : null;
  const contrastBg = hasBgHex ? data.backgroundHex : data.effectiveBgHex || "#FFFFFF";
  const wcag = contrastFg && contrastBg ? evaluateWcagContrast(contrastFg, contrastBg) : null;

  const aaEl = inspectorEls.contrastAa();
  const aaaEl = inspectorEls.contrastAaa();
  if (wcag) {
    inspectorEls.contrastRatio().textContent = wcag.ratioText;
    aaEl.classList.remove("is-hidden", "is-pass", "is-fail");
    aaEl.classList.add(wcag.aaNormal ? "is-pass" : "is-fail");
    aaEl.textContent = `AA ${wcag.aaNormal ? "✓" : "✕"}`;

    aaaEl.classList.remove("is-hidden", "is-pass", "is-fail");
    aaaEl.classList.add(wcag.aaaNormal ? "is-pass" : "is-fail");
    aaaEl.textContent = `AAA ${wcag.aaaNormal ? "✓" : "✕"}`;

    lastInspectedPair = { fg: wcag.fgHex, bg: wcag.bgHex };
    inspectorEls.loadWcagBtn().disabled = false;
  } else {
    inspectorEls.contrastRatio().textContent = "—";
    aaEl.classList.add("is-hidden");
    aaaEl.classList.add("is-hidden");
    lastInspectedPair = { fg: null, bg: null };
    inspectorEls.loadWcagBtn().disabled = true;
  }
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

  inspectorEls.saveColorBtn().addEventListener("click", () => {
    const hex = inspectorEls.saveColorBtn().dataset.hex;
    if (hex) {
      colorModuleApi.saveColorToHistory(hex, { showToast: true });
    }
  });

  inspectorEls.saveBgBtn().addEventListener("click", () => {
    const hex = inspectorEls.saveBgBtn().dataset.hex;
    if (hex) {
      colorModuleApi.saveColorToHistory(hex, { showToast: true });
    }
  });

  inspectorEls.loadWcagBtn().addEventListener("click", () => {
    if (lastInspectedPair.fg && lastInspectedPair.bg) {
      colorModuleApi.setWcagPair(lastInspectedPair.fg, lastInspectedPair.bg);
      showCopyToast("WCAG");
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

function formatJwtTimestamp(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat(document.documentElement.lang || "es", {
      dateStyle: "medium",
      timeStyle: "medium"
    }).format(d);
  } catch {
    return isoString;
  }
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
      } else if (typeof result.line === "number" && typeof result.column === "number") {
        setFeedback(
          jsonStatus,
          false,
          t("jsonSyntaxError", [String(result.line), String(result.column), result.error])
        );
      } else {
        setFeedback(jsonStatus, false, t("jsonSyntaxErrorNoCoords", [result.error]));
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
  const b64UrlSafe = document.getElementById("b64-url-safe");

  document.getElementById("btn-b64-encode").addEventListener("click", () => {
    try {
      b64Output.value = encodeBase64Utf8(b64Input.value, { urlSafe: b64UrlSafe.checked });
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
  const jwtAlgBadge = document.getElementById("jwt-alg-badge");
  const jwtExpBadge = document.getElementById("jwt-exp-badge");
  const jwtClaimsDates = document.getElementById("jwt-claims-dates");
  const jwtSigNote = document.getElementById("jwt-sig-note");

  function renderJwtClaimDates(claims) {
    jwtClaimsDates.replaceChildren();
    const rows = [
      { label: t("jwtClaimIat"), iso: claims.iatIso },
      { label: t("jwtClaimNbf"), iso: claims.nbfIso },
      { label: t("jwtClaimExp"), iso: claims.expIso }
    ].filter((r) => Boolean(r.iso));

    if (!rows.length) {
      jwtClaimsDates.classList.add("is-hidden");
      return;
    }

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "jwt-claim-row";
      const lbl = document.createElement("span");
      lbl.className = "jwt-claim-label";
      lbl.textContent = row.label;
      const val = document.createElement("code");
      val.className = "jwt-claim-val";
      val.textContent = formatJwtTimestamp(row.iso);
      val.title = row.iso;
      item.append(lbl, val);
      jwtClaimsDates.appendChild(item);
    }
    jwtClaimsDates.classList.remove("is-hidden");
  }

  function decodeCurrentJwt() {
    const raw = jwtInput.value.trim();
    if (!raw) {
      jwtOutputWrap.classList.add("is-hidden");
      setFeedback(jwtStatus, true, "");
      return;
    }

    const res = decodeJwtLocal(raw);
    if (!res.ok) {
      jwtOutputWrap.classList.add("is-hidden");
      setFeedback(jwtStatus, false, t("jwtErrorInvalid"));
      return;
    }

    setFeedback(jwtStatus, true, t("jwtValidStructure"));
    jwtOutputWrap.classList.remove("is-hidden");
    jwtHeaderPre.textContent = res.headerFormatted;
    jwtPayloadPre.textContent = res.payloadFormatted;

    jwtAlgBadge.classList.remove("is-hidden", "is-accent", "is-danger");
    if (res.isAlgNone) {
      jwtAlgBadge.textContent = t("jwtAlgWarningNone");
      jwtAlgBadge.classList.add("is-danger");
    } else if (res.alg) {
      jwtAlgBadge.textContent = res.alg;
      jwtAlgBadge.classList.add("is-accent");
    } else {
      jwtAlgBadge.classList.add("is-hidden");
    }

    jwtExpBadge.classList.remove("is-primary", "is-danger", "is-warning");
    if (res.claims.tokenStatus === "expired") {
      jwtExpBadge.textContent = t("jwtExpired");
      jwtExpBadge.classList.add("is-danger");
    } else if (res.claims.tokenStatus === "not_yet_valid") {
      jwtExpBadge.textContent = t("jwtNotYetValid");
      jwtExpBadge.classList.add("is-warning");
    } else if (res.claims.tokenStatus === "active") {
      jwtExpBadge.textContent = t("jwtActive");
      jwtExpBadge.classList.add("is-primary");
    } else {
      jwtExpBadge.textContent = t("jwtNoExp");
    }

    renderJwtClaimDates(res.claims);
    jwtSigNote.textContent = res.hasSignature ? t("jwtSignatureLabel") : "";
  }

  document.getElementById("btn-jwt-decode").addEventListener("click", decodeCurrentJwt);
  jwtInput.addEventListener("paste", () => {
    setTimeout(decodeCurrentJwt, 0);
  });
  jwtInput.addEventListener("input", () => {
    const val = jwtInput.value.trim();
    if (!val) {
      jwtOutputWrap.classList.add("is-hidden");
      setFeedback(jwtStatus, true, "");
      return;
    }
    if (val.split(".").length === 3) {
      decodeCurrentJwt();
    }
  });
  document.getElementById("btn-jwt-clear").addEventListener("click", () => {
    jwtInput.value = "";
    jwtOutputWrap.classList.add("is-hidden");
    jwtClaimsDates.replaceChildren();
    jwtClaimsDates.classList.add("is-hidden");
    setFeedback(jwtStatus, true, "");
  });
}

// ============================================================
// PESTANA 3: GENERADOR QR & VISTA RAPIDA SEO
// ============================================================
let currentTabId = null;
let currentTabUrl = "";
let qrUserEdited = false;
let lastSeoData = null;

function setQrActionButtonsDisabled(disabled) {
  document.getElementById("btn-qr-download").disabled = disabled;
  document.getElementById("btn-qr-download-svg").disabled = disabled;
  document.getElementById("btn-qr-copy-img").disabled = disabled;
}

function drawQrFromValue(value) {
  const canvas = document.getElementById("qr-canvas");
  const statusEl = document.getElementById("qr-status");
  const text = String(value || "").trim();

  if (!text) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    statusEl.textContent = t("qrEmptyHint");
    setQrActionButtonsDisabled(true);
    return;
  }

  const res = renderQRCode(canvas, text, {
    targetSize: 220,
    marginModules: 4,
    darkColor: CONFIG.COLORS.BG_DARK,
    lightColor: "#FFFFFF"
  });

  if (!res.ok) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    statusEl.textContent = t("qrErrorTooLong");
    setQrActionButtonsDisabled(true);
    return;
  }

  statusEl.textContent = `QR v${res.version} (${res.size}×${res.size})`;
  setQrActionButtonsDisabled(false);
}

function renderQr512Canvas(text) {
  const offscreen = document.createElement("canvas");
  const res = renderQRCode(offscreen, text, {
    targetSize: 512,
    marginModules: 4,
    exactSize: true,
    darkColor: CONFIG.COLORS.BG_DARK,
    lightColor: "#FFFFFF"
  });
  return res.ok ? offscreen : null;
}

function initQrAndSeoModule() {
  const qrInput = document.getElementById("qr-input");
  const useTabBtn = document.getElementById("btn-qr-current-tab");
  const downloadBtn = document.getElementById("btn-qr-download");
  const downloadSvgBtn = document.getElementById("btn-qr-download-svg");
  const copyImgBtn = document.getElementById("btn-qr-copy-img");
  const seoRefreshBtn = document.getElementById("btn-seo-refresh");
  const seoCopyReportBtn = document.getElementById("btn-seo-copy-report");

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
    const exportCanvas = renderQr512Canvas(qrInput.value.trim());
    if (!exportCanvas) return;
    const link = document.createElement("a");
    link.href = exportCanvas.toDataURL("image/png");
    link.download = "chaladev-qr-512.png";
    link.click();
  });

  downloadSvgBtn.addEventListener("click", () => {
    if (downloadSvgBtn.disabled) return;
    const svgRes = encodeQRSvg(qrInput.value.trim(), {
      sizePx: 512,
      marginModules: 4,
      darkColor: CONFIG.COLORS.BG_DARK,
      lightColor: "#FFFFFF"
    });
    if (!svgRes.ok) return;
    const blob = new Blob([svgRes.svg], { type: "image/svg+xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = "chaladev-qr.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  });

  copyImgBtn.addEventListener("click", async () => {
    if (copyImgBtn.disabled) return;
    const exportCanvas = renderQr512Canvas(qrInput.value.trim());
    if (!exportCanvas || !navigator.clipboard?.write || typeof window.ClipboardItem === "undefined") {
      showCopyToast(t("qrImageCopyFailed"));
      return;
    }
    try {
      const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
      if (!blob) {
        showCopyToast(t("qrImageCopyFailed"));
        return;
      }
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      showCopyToast(t("qrImageCopied"));
    } catch {
      showCopyToast(t("qrImageCopyFailed"));
    }
  });

  seoRefreshBtn.addEventListener("click", () => {
    refreshTabContext();
  });

  seoCopyReportBtn.addEventListener("click", () => {
    if (!lastSeoData) return;
    const report = formatSeoReport(lastSeoData, currentTabUrl);
    copyText(report, t("seoReportCopied"));
  });

  drawQrFromValue("");
}

function setSeoField(elementId, value, countBadgeId = null, optimalRange = null) {
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
      badge.classList.remove("is-good", "is-warn", "is-bad");
      if (optimalRange) {
        const evalRes = evaluateSeoLength(clean, optimalRange[0], optimalRange[1]);
        badge.textContent = t("seoChars", [String(evalRes.length)]);
        badge.classList.add(`is-${evalRes.status}`);
      } else {
        badge.textContent = clean ? t("seoChars", [String(clean.length)]) : "";
      }
    }
  }
}

function renderSeoMetadata(seo) {
  lastSeoData = seo || null;
  const copyReportBtn = document.getElementById("btn-seo-copy-report");
  if (copyReportBtn) {
    copyReportBtn.disabled = !seo;
  }

  const h1Badge = document.getElementById("seo-h1-badge");
  const imgBadge = document.getElementById("seo-images-badge");

  if (!seo) {
    setSeoField("seo-title", "", "seo-title-len");
    setSeoField("seo-description", "", "seo-desc-len");
    setSeoField("seo-canonical", "");
    setSeoField("seo-robots", "");
    setSeoField("seo-lang-charset", "");
    setSeoField("seo-viewport", "");
    setSeoField("seo-h1", "");
    document.getElementById("seo-images-alt").textContent = "—";
    document.getElementById("seo-images-alt").classList.add("is-missing");
    if (h1Badge) {
      h1Badge.textContent = "";
      h1Badge.classList.remove("is-good", "is-warn", "is-bad");
    }
    if (imgBadge) {
      imgBadge.textContent = "";
      imgBadge.classList.remove("is-good", "is-warn", "is-bad");
    }
    setSeoField("seo-og-title", "");
    setSeoField("seo-og-desc", "");
    setSeoField("seo-og-type", "");
    setSeoField("seo-og-url", "");
    setSeoField("seo-og-image", "");
    setSeoField("seo-twitter-card", "");
    setSeoField("seo-twitter-title", "");
    setSeoField("seo-twitter-desc", "");
    setSeoField("seo-twitter-image", "");
    return;
  }

  setSeoField("seo-title", seo.title, "seo-title-len", [30, 60]);
  setSeoField("seo-description", seo.description, "seo-desc-len", [120, 160]);
  setSeoField("seo-canonical", seo.canonical);
  setSeoField("seo-robots", seo.robots);

  const robotsEl = document.getElementById("seo-robots");
  robotsEl.classList.toggle("is-noindex", /noindex/i.test(seo.robots || ""));

  const langPart = (seo.lang || "").trim();
  const charsetPart = (seo.charset || "").trim();
  const langCharset = [langPart, charsetPart].filter(Boolean).join(" / ");
  setSeoField("seo-lang-charset", langCharset);
  setSeoField("seo-viewport", seo.viewport);

  const h1Count = Number.isFinite(seo.h1Count) ? seo.h1Count : 0;
  setSeoField("seo-h1", seo.h1Text || "");
  if (h1Badge) {
    h1Badge.textContent = String(h1Count);
    h1Badge.classList.remove("is-good", "is-warn", "is-bad");
    if (h1Count === 1) {
      h1Badge.classList.add("is-good");
    } else if (h1Count === 0) {
      h1Badge.classList.add("is-bad");
    } else {
      h1Badge.classList.add("is-warn");
    }
  }

  const imgsTotal = Number.isFinite(seo.imagesTotal) ? seo.imagesTotal : 0;
  const imgsMissing = Number.isFinite(seo.imagesMissingAlt) ? seo.imagesMissingAlt : 0;
  const imgsEmpty = Number.isFinite(seo.imagesEmptyAlt) ? seo.imagesEmptyAlt : 0;
  const imgEl = document.getElementById("seo-images-alt");
  imgEl.classList.remove("is-missing");
  if (imgBadge) {
    imgBadge.classList.remove("is-good", "is-warn", "is-bad");
  }
  if (imgsTotal === 0) {
    imgEl.textContent = t("seoImagesNone");
    imgEl.classList.add("is-missing");
    if (imgBadge) imgBadge.textContent = "0";
  } else if (imgsMissing === 0) {
    const emptyNote = imgsEmpty > 0 ? t("seoImagesEmptyNote", [String(imgsEmpty)]) : "";
    imgEl.textContent = t("seoImagesOk", [String(imgsTotal)]) + emptyNote;
    if (imgBadge) {
      imgBadge.textContent = "OK";
      imgBadge.classList.add("is-good");
    }
  } else {
    imgEl.textContent = t("seoImagesMissing", [String(imgsMissing), String(imgsTotal)]);
    if (imgBadge) {
      imgBadge.textContent = String(imgsMissing);
      imgBadge.classList.add("is-bad");
    }
  }

  setSeoField("seo-og-title", seo.ogTitle);
  setSeoField("seo-og-desc", seo.ogDescription);
  setSeoField("seo-og-type", seo.ogType);
  setSeoField("seo-og-url", seo.ogUrl);
  setSeoField("seo-og-image", seo.ogImage);
  setSeoField("seo-twitter-card", seo.twitterCard);
  setSeoField("seo-twitter-title", seo.twitterTitle);
  setSeoField("seo-twitter-desc", seo.twitterDescription);
  setSeoField("seo-twitter-image", seo.twitterImage);
}

// ============================================================
// PESTANA 4: RED (PERFORMANCE API + MONITOR EN VIVO FETCH/XHR)
// ============================================================
let netResources = [];
let netFilterType = "all";
let netSearchQuery = "";
let netLiveEntries = [];

function classifyResourceCategory(initiatorType) {
  const type = String(initiatorType || "").toLowerCase();
  if (type === "fetch" || type === "xmlhttprequest") return "fetch";
  if (type === "script") return "script";
  if (type === "css" || type === "link") return "css";
  if (type === "img" || type === "image") return "img";
  return "other";
}

function updateNetMonitorStatusUi(active) {
  const toggle = document.getElementById("toggle-net-monitor");
  const textEl = document.getElementById("toggle-net-text");
  const badge = document.getElementById("net-live-badge");
  if (!toggle || !textEl || !badge) return;

  toggle.checked = Boolean(active);
  textEl.textContent = active ? t("netLiveStop") : t("netLiveToggle");
  badge.classList.remove("is-accent", "is-primary");
  if (active) {
    badge.textContent = t("netStateLive");
    badge.classList.add("is-accent");
  } else {
    badge.textContent = t("netStateIdle");
  }
}

function renderNetworkResources(navigation = null) {
  const listEl = document.getElementById("net-resources-list");
  const emptyEl = document.getElementById("net-resources-empty");
  const countEl = document.getElementById("net-stat-count");
  const transferEl = document.getElementById("net-stat-transfer");
  const loadEl = document.getElementById("net-stat-load");
  const cacheEl = document.getElementById("net-stat-cache");
  if (!listEl) return;

  const summary = summarizeNetworkResources(netResources);
  countEl.textContent = String(summary.count);
  transferEl.textContent = formatBytes(summary.totalTransferBytes);
  cacheEl.textContent = String(summary.cachedCount);
  if (navigation && (navigation.loadMs > 0 || navigation.domContentLoadedMs > 0)) {
    loadEl.textContent = `${navigation.loadMs || navigation.domContentLoadedMs} ms`;
  } else {
    loadEl.textContent = summary.slowestMs ? `${summary.slowestMs} ms` : "—";
  }

  const query = netSearchQuery.trim().toLowerCase();
  const filtered = netResources.filter((item) => {
    if (netFilterType !== "all" && classifyResourceCategory(item.initiatorType) !== netFilterType) {
      return false;
    }
    if (query && !String(item.name || "").toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  listEl.replaceChildren();
  const shown = filtered.slice(-80).reverse();
  emptyEl.classList.toggle("is-hidden", shown.length > 0);

  for (const item of shown) {
    const row = document.createElement("div");
    row.className = "list-row";

    const head = document.createElement("div");
    head.className = "list-row-head";

    const meta = document.createElement("div");
    meta.className = "list-row-meta";

    const typePill = document.createElement("span");
    typePill.className = "char-badge";
    typePill.textContent = String(item.initiatorType || "other").toUpperCase();
    meta.appendChild(typePill);

    if (item.status > 0) {
      const statusPill = document.createElement("span");
      statusPill.className = `char-badge ${item.status >= 400 ? "is-bad" : "is-good"}`;
      statusPill.textContent = String(item.status);
      meta.appendChild(statusPill);
    }

    if (item.protocol) {
      const protoSpan = document.createElement("span");
      protoSpan.textContent = item.protocol;
      meta.appendChild(protoSpan);
    }

    const durSpan = document.createElement("span");
    durSpan.textContent = `${item.durationMs || 0} ms`;
    meta.appendChild(durSpan);

    const sizeSpan = document.createElement("span");
    sizeSpan.textContent = item.cached ? "cache" : formatBytes(item.transferSize || item.decodedBodySize);
    meta.appendChild(sizeSpan);

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-copy-mini";
    copyBtn.textContent = t("btnCopy");
    copyBtn.addEventListener("click", () => copyText(item.name));

    head.append(meta, copyBtn);

    const urlEl = document.createElement("div");
    urlEl.className = "list-row-url";
    urlEl.textContent = item.name || "";

    row.append(head, urlEl);
    listEl.appendChild(row);
  }
}

function renderNetLiveEntries() {
  const listEl = document.getElementById("net-live-list");
  const emptyEl = document.getElementById("net-live-empty");
  const countEl = document.getElementById("net-live-count");
  const copyJsonBtn = document.getElementById("btn-net-copy-json");
  const clearBtn = document.getElementById("btn-net-clear-live");
  if (!listEl) return;

  const hasEntries = netLiveEntries.length > 0;
  countEl.textContent = String(netLiveEntries.length);
  emptyEl.classList.toggle("is-hidden", hasEntries);
  copyJsonBtn.disabled = !hasEntries;
  clearBtn.disabled = !hasEntries;

  listEl.replaceChildren();
  for (const entry of netLiveEntries) {
    const row = document.createElement("div");
    row.className = "list-row";

    const head = document.createElement("div");
    head.className = "list-row-head";

    const meta = document.createElement("div");
    meta.className = "list-row-meta";

    const methodBadge = document.createElement("span");
    methodBadge.className = "char-badge";
    methodBadge.textContent = `${entry.method || "GET"} · ${entry.kind || "fetch"}`;
    meta.appendChild(methodBadge);

    const statusBadge = document.createElement("span");
    const st = Number(entry.status || 0);
    const stClass = st >= 200 && st < 300 ? "is-good" : st >= 300 && st < 400 ? "is-warn" : "is-bad";
    statusBadge.className = `char-badge ${stClass}`;
    statusBadge.textContent = st > 0 ? String(st) : "ERR";
    meta.appendChild(statusBadge);

    const durSpan = document.createElement("span");
    durSpan.textContent = `${entry.durationMs || 0} ms`;
    meta.appendChild(durSpan);

    if (entry.sizeBytes) {
      const sizeSpan = document.createElement("span");
      sizeSpan.textContent = formatBytes(entry.sizeBytes);
      meta.appendChild(sizeSpan);
    }

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "btn-copy-mini";
    copyBtn.textContent = t("btnCopy");
    copyBtn.addEventListener("click", () => copyText(entry.url));

    head.append(meta, copyBtn);

    const urlEl = document.createElement("div");
    urlEl.className = "list-row-url";
    urlEl.textContent = entry.url || "";
    row.append(head, urlEl);

    if (entry.preview) {
      const pre = document.createElement("pre");
      pre.className = "list-row-preview";
      pre.textContent = entry.preview;
      row.appendChild(pre);
    }

    listEl.appendChild(row);
  }
}

async function refreshNetworkSnapshot() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHALADEV_GET_NETWORK_SNAPSHOT" });
    if (!res?.ok) {
      netResources = [];
      renderNetworkResources(null);
      updateNetMonitorStatusUi(false);
      return;
    }
    netResources = Array.isArray(res.resources) ? res.resources : [];
    renderNetworkResources(res.navigation || null);
    updateNetMonitorStatusUi(Boolean(res.liveCaptureActive));
  } catch {
    netResources = [];
    renderNetworkResources(null);
    updateNetMonitorStatusUi(false);
  }
}

function initNetworkModule() {
  const refreshBtn = document.getElementById("btn-net-refresh");
  const filterWrap = document.getElementById("net-type-filters");
  const searchInput = document.getElementById("net-search-input");
  const toggleMonitor = document.getElementById("toggle-net-monitor");
  const copyJsonBtn = document.getElementById("btn-net-copy-json");
  const clearLiveBtn = document.getElementById("btn-net-clear-live");

  refreshBtn.addEventListener("click", refreshNetworkSnapshot);

  filterWrap.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-net-filter]");
    if (!btn) return;
    netFilterType = btn.dataset.netFilter || "all";
    filterWrap.querySelectorAll("[data-net-filter]").forEach((el) => {
      el.classList.toggle("is-active", el === btn);
    });
    renderNetworkResources();
  });

  searchInput.addEventListener("input", () => {
    netSearchQuery = searchInput.value;
    renderNetworkResources();
  });

  toggleMonitor.addEventListener("change", async () => {
    const desired = toggleMonitor.checked;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CHALADEV_TOGGLE_NET_MONITOR",
        active: desired
      });
      if (!response?.ok) {
        updateNetMonitorStatusUi(false);
        applyNoticeFromResponse(response);
        return;
      }
      updateNetMonitorStatusUi(Boolean(response.active));
    } catch {
      updateNetMonitorStatusUi(false);
    }
  });

  copyJsonBtn.addEventListener("click", () => {
    if (!netLiveEntries.length) return;
    copyText(JSON.stringify(netLiveEntries, null, 2));
  });

  clearLiveBtn.addEventListener("click", () => {
    netLiveEntries = [];
    renderNetLiveEntries();
  });

  renderNetLiveEntries();
}

// ============================================================
// PESTANA 5: APLICACION (MANIFEST, WEBMCP, STORAGE, SW)
// ============================================================
let appSnapshot = null;
let appStorageTab = "localStorage";
let appStorageSearch = "";
let manifestAuditResult = null;

function renderAppManifestSection() {
  const urlEl = document.getElementById("app-manifest-url");
  const statusEl = document.getElementById("app-manifest-status");
  const chipsEl = document.getElementById("app-manifest-checks");
  const validateBtn = document.getElementById("btn-app-validate-manifest");
  if (!urlEl) return;

  chipsEl.replaceChildren();
  const linkInfo = appSnapshot?.manifestLink;

  if (!linkInfo || !linkInfo.present) {
    urlEl.textContent = t("appManifestMissing");
    urlEl.classList.add("is-missing");
    validateBtn.disabled = true;
    statusEl.classList.add("is-hidden");
    return;
  }

  urlEl.textContent = linkInfo.resolvedUrl || linkInfo.href;
  urlEl.classList.remove("is-missing");

  if (!linkInfo.sameOrigin) {
    validateBtn.disabled = true;
    statusEl.textContent = t("appManifestCrossOrigin");
    statusEl.classList.remove("is-hidden", "is-ok", "is-error");
    statusEl.classList.add("is-error");
    return;
  }

  validateBtn.disabled = false;
  if (!manifestAuditResult) {
    statusEl.classList.add("is-hidden");
    return;
  }

  statusEl.textContent = manifestAuditResult.valid ? t("appManifestValid") : t("appManifestIssues");
  statusEl.classList.remove("is-hidden", "is-ok", "is-error");
  statusEl.classList.add(manifestAuditResult.valid ? "is-ok" : "is-error");

  for (const chk of manifestAuditResult.checks || []) {
    const chip = document.createElement("span");
    chip.className = `char-badge is-${chk.status === "good" ? "good" : chk.status === "warn" ? "warn" : "bad"}`;
    chip.textContent = `${chk.id}: ${chk.detail}`;
    chipsEl.appendChild(chip);
  }
}

function renderWebMcpSection() {
  const badgeEl = document.getElementById("app-webmcp-badge");
  const listEl = document.getElementById("app-webmcp-list");
  const emptyEl = document.getElementById("app-webmcp-empty");
  if (!badgeEl || !listEl) return;

  listEl.replaceChildren();
  const api = appSnapshot?.webMcpApi || { supported: false, methods: [], registeredTools: [] };
  const dom = appSnapshot?.webMcpDom || { declarativeForms: [], mcpTags: [] };

  badgeEl.classList.remove("is-primary", "is-accent");
  if (api.supported) {
    badgeEl.textContent = t("appWebMcpSupported");
    badgeEl.classList.add("is-primary");
  } else {
    badgeEl.textContent = t("appWebMcpUnsupported");
  }

  const rows = [];
  if (api.methods?.length) {
    rows.push({ title: "navigator.modelContext", value: api.methods.join(", ") });
  }
  for (const tool of api.registeredTools || []) {
    rows.push({ title: `tool: ${tool.name}`, value: tool.description || "(registered)" });
  }
  for (const form of dom.declarativeForms || []) {
    rows.push({
      title: `${t("appWebMcpDeclarative")}: ${form.toolname}`,
      value: `${form.tooldescription || "—"} [${form.fields.join(", ")}]`
    });
  }
  for (const tag of dom.mcpTags || []) {
    rows.push({ title: `<${tag.tag}> ${tag.name}`, value: tag.value || "—" });
  }

  emptyEl.classList.toggle("is-hidden", rows.length > 0);
  for (const r of rows) {
    const item = document.createElement("div");
    item.className = "list-row";
    const titleEl = document.createElement("strong");
    titleEl.className = "sec-check-title";
    titleEl.textContent = r.title;
    const valEl = document.createElement("span");
    valEl.className = "list-row-val";
    valEl.textContent = r.value;
    item.append(titleEl, valEl);
    listEl.appendChild(item);
  }
}

function renderAppStorageSection() {
  const quotaEl = document.getElementById("app-quota-pill");
  const listEl = document.getElementById("app-storage-list");
  const emptyEl = document.getElementById("app-storage-empty");
  const cookiesNoteEl = document.getElementById("app-cookies-note");
  if (!listEl) return;

  const est = appSnapshot?.storageEstimate;
  quotaEl.textContent = est ? `${formatBytes(est.usage)} / ${formatBytes(est.quota)}` : "";
  cookiesNoteEl.classList.toggle("is-hidden", appStorageTab !== "cookies");

  listEl.replaceChildren();
  const query = appStorageSearch.trim().toLowerCase();

  if (!appSnapshot) {
    emptyEl.classList.remove("is-hidden");
    return;
  }

  if (appStorageTab === "localStorage" || appStorageTab === "sessionStorage") {
    const storeData = appSnapshot[appStorageTab] || { entries: [] };
    const filtered = (storeData.entries || []).filter(
      (e) =>
        !query ||
        e.key.toLowerCase().includes(query) ||
        String(e.value || "").toLowerCase().includes(query)
    );
    emptyEl.classList.toggle("is-hidden", filtered.length > 0);

    for (const entry of filtered) {
      const row = document.createElement("div");
      row.className = "list-row";

      const head = document.createElement("div");
      head.className = "list-row-head";
      const keyEl = document.createElement("code");
      keyEl.className = "metric-val accent-text truncate";
      keyEl.textContent = entry.key;

      const actions = document.createElement("div");
      actions.className = "metric-actions";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn-copy-mini";
      copyBtn.textContent = t("btnCopy");
      copyBtn.addEventListener("click", () => copyText(entry.value));

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-copy-mini";
      delBtn.textContent = t("appStorageDeleteBtn");
      delBtn.addEventListener("click", async () => {
        if (delBtn.dataset.confirm !== "1") {
          delBtn.dataset.confirm = "1";
          delBtn.textContent = "?";
          setTimeout(() => {
            if (delBtn.isConnected && delBtn.dataset.confirm === "1") {
              delete delBtn.dataset.confirm;
              delBtn.textContent = t("appStorageDeleteBtn");
            }
          }, 2500);
          return;
        }
        await chrome.runtime.sendMessage({
          type: "CHALADEV_DELETE_STORAGE_KEY",
          area: appStorageTab,
          key: entry.key
        });
        refreshAppSnapshot();
      });

      actions.append(copyBtn, delBtn);
      head.append(keyEl, actions);

      const valEl = document.createElement("div");
      valEl.className = "list-row-val";
      valEl.textContent = entry.value;

      row.append(head, valEl);
      listEl.appendChild(row);
    }
    return;
  }

  if (appStorageTab === "cookies") {
    const filtered = (appSnapshot.cookies || []).filter(
      (c) =>
        !query ||
        c.name.toLowerCase().includes(query) ||
        String(c.value || "").toLowerCase().includes(query)
    );
    emptyEl.classList.toggle("is-hidden", filtered.length > 0);
    for (const cookie of filtered) {
      const row = document.createElement("div");
      row.className = "list-row";
      const head = document.createElement("div");
      head.className = "list-row-head";
      const nameEl = document.createElement("code");
      nameEl.className = "metric-val accent-text truncate";
      nameEl.textContent = cookie.name;
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn-copy-mini";
      copyBtn.textContent = t("btnCopy");
      copyBtn.addEventListener("click", () => copyText(cookie.value));
      head.append(nameEl, copyBtn);

      const valEl = document.createElement("div");
      valEl.className = "list-row-val";
      valEl.textContent = cookie.value;
      row.append(head, valEl);
      listEl.appendChild(row);
    }
    return;
  }

  // Workers / IndexedDB / Cache Storage
  const idbs = (appSnapshot.indexedDb || []).filter(
    (d) => !query || String(d.name || "").toLowerCase().includes(query)
  );
  const cachesList = (appSnapshot.cacheStorage || []).filter(
    (name) => !query || String(name).toLowerCase().includes(query)
  );
  const sws = (appSnapshot.serviceWorkers || []).filter(
    (sw) =>
      !query ||
      String(sw.scope || "").toLowerCase().includes(query) ||
      String(sw.scriptURL || "").toLowerCase().includes(query)
  );

  const totalWorkers = idbs.length + cachesList.length + sws.length;
  emptyEl.classList.toggle("is-hidden", totalWorkers > 0);

  const addSection = (title, items, renderItem) => {
    if (!items.length) return;
    const h = document.createElement("div");
    h.className = "storage-section-title";
    h.textContent = `${title} (${items.length})`;
    listEl.appendChild(h);
    for (const item of items) {
      listEl.appendChild(renderItem(item));
    }
  };

  addSection(t("appIdbLabel"), idbs, (db) => {
    const row = document.createElement("div");
    row.className = "list-row";
    const txt = document.createElement("div");
    txt.className = "list-row-val";
    txt.textContent = `${db.name} (v${db.version})`;
    row.appendChild(txt);
    return row;
  });

  addSection(t("appCacheLabel"), cachesList, (name) => {
    const row = document.createElement("div");
    row.className = "list-row";
    const txt = document.createElement("div");
    txt.className = "list-row-val";
    txt.textContent = name;
    row.appendChild(txt);
    return row;
  });

  addSection(t("appSwLabel"), sws, (sw) => {
    const row = document.createElement("div");
    row.className = "list-row";
    const titleEl = document.createElement("strong");
    titleEl.className = "sec-check-title";
    titleEl.textContent = `${sw.state} · ${sw.scope}`;
    const valEl = document.createElement("div");
    valEl.className = "list-row-url";
    valEl.textContent = sw.scriptURL || "";
    row.append(titleEl, valEl);
    return row;
  });
}

async function refreshAppSnapshot() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHALADEV_GET_APP_SNAPSHOT" });
    appSnapshot = res?.ok ? res : null;
  } catch {
    appSnapshot = null;
  }
  renderAppManifestSection();
  renderWebMcpSection();
  renderAppStorageSection();
}

function initAppModule() {
  const refreshBtn = document.getElementById("btn-app-refresh");
  const validateBtn = document.getElementById("btn-app-validate-manifest");
  const storageTabs = document.getElementById("app-storage-tabs");
  const searchInput = document.getElementById("app-storage-search");

  refreshBtn.addEventListener("click", refreshAppSnapshot);

  validateBtn.addEventListener("click", async () => {
    const statusEl = document.getElementById("app-manifest-status");
    try {
      const res = await chrome.runtime.sendMessage({ type: "CHALADEV_FETCH_MANIFEST" });
      if (!res?.ok) {
        manifestAuditResult = null;
        renderAppManifestSection();
        statusEl.textContent =
          res?.reason === "CROSS_ORIGIN_MANIFEST" ? t("appManifestCrossOrigin") : t("appManifestError");
        statusEl.classList.remove("is-hidden", "is-ok");
        statusEl.classList.add("is-error");
        return;
      }
      manifestAuditResult = auditWebAppManifest(res.manifest);
      renderAppManifestSection();
    } catch {
      statusEl.textContent = t("appManifestError");
      statusEl.classList.remove("is-hidden", "is-ok");
      statusEl.classList.add("is-error");
    }
  });

  storageTabs.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-storage-tab]");
    if (!btn) return;
    appStorageTab = btn.dataset.storageTab || "localStorage";
    storageTabs.querySelectorAll("[data-storage-tab]").forEach((el) => {
      el.classList.toggle("is-active", el === btn);
    });
    renderAppStorageSection();
  });

  searchInput.addEventListener("input", () => {
    appStorageSearch = searchInput.value;
    renderAppStorageSection();
  });
}

// ============================================================
// PESTANA 6: SEGURIDAD (SECURITY OVERVIEW)
// ============================================================
let secSnapshot = null;
let secHeaders = null;

const SEC_CHECK_LABELS = {
  https: "secCheckHttps",
  mixedContent: "secCheckMixed",
  csp: "secCheckCsp",
  hsts: "secCheckHsts",
  clickjacking: "secCheckClickjacking",
  nosniff: "secCheckNosniff",
  referrerPolicy: "secCheckReferrer",
  permissionsPolicy: "secCheckPermissions",
  sri: "secCheckSri",
  iframes: "secCheckIframes",
  targetBlank: "secCheckTargetBlank",
  formsAndPasswords: "secCheckForms",
  sensitiveStorage: "secCheckSensitive"
};

const SEC_STATUS_LABELS = {
  good: { key: "secStatusGood", cls: "is-good" },
  warn: { key: "secStatusWarn", cls: "is-warn" },
  bad: { key: "secStatusBad", cls: "is-bad" },
  info: { key: "secStatusInfo", cls: "" }
};

function renderSecurityOverview() {
  const scoreBadge = document.getElementById("sec-score-badge");
  const listEl = document.getElementById("sec-checks-list");
  const detailsBox = document.getElementById("sec-details-box");
  const copyBtn = document.getElementById("btn-sec-copy-report");
  if (!scoreBadge || !listEl) return;

  listEl.replaceChildren();
  detailsBox.replaceChildren();
  detailsBox.classList.add("is-hidden");

  if (!secSnapshot) {
    scoreBadge.textContent = "—";
    scoreBadge.classList.remove("is-primary", "is-warning", "is-danger");
    copyBtn.disabled = true;
    return;
  }

  const audit = evaluateSecurityAudit(secSnapshot, secHeaders);
  copyBtn.disabled = false;

  scoreBadge.textContent = `${t("secScoreLabel")}: ${audit.score}/100`;
  scoreBadge.classList.remove("is-primary", "is-warning", "is-danger");
  if (audit.level === "good") {
    scoreBadge.classList.add("is-primary");
  } else if (audit.level === "warn") {
    scoreBadge.classList.add("is-warning");
  } else {
    scoreBadge.classList.add("is-danger");
  }

  for (const chk of audit.checks) {
    const row = document.createElement("div");
    row.className = "sec-check-row";

    const main = document.createElement("div");
    main.className = "sec-check-main";

    const titleEl = document.createElement("span");
    titleEl.className = "sec-check-title";
    titleEl.textContent = t(SEC_CHECK_LABELS[chk.id] || chk.id);

    const valEl = document.createElement("code");
    valEl.className = "sec-check-val";
    valEl.textContent = chk.value;

    main.append(titleEl, valEl);

    const stInfo = SEC_STATUS_LABELS[chk.status] || SEC_STATUS_LABELS.info;
    const badge = document.createElement("span");
    badge.className = `char-badge ${stInfo.cls}`.trim();
    badge.textContent = t(stInfo.key);

    row.append(main, badge);
    listEl.appendChild(row);
  }

  const hasMixed = Array.isArray(secSnapshot.mixedContent) && secSnapshot.mixedContent.length > 0;
  const hasSensitive =
    Array.isArray(secSnapshot.sensitiveStorageKeys) && secSnapshot.sensitiveStorageKeys.length > 0;

  if (hasMixed || hasSensitive) {
    detailsBox.classList.remove("is-hidden");
    if (hasMixed) {
      const h = document.createElement("strong");
      h.textContent = t("secMixedListTitle");
      const ul = document.createElement("ul");
      ul.className = "sec-details-list";
      for (const u of secSnapshot.mixedContent.slice(0, 10)) {
        const li = document.createElement("li");
        li.textContent = u;
        ul.appendChild(li);
      }
      detailsBox.append(h, ul);
    }
    if (hasSensitive) {
      const note = document.createElement("span");
      note.textContent = `${t("secSensitiveNote")} (${secSnapshot.sensitiveStorageKeys.join(", ")})`;
      detailsBox.appendChild(note);
    }
  }
}

async function refreshSecuritySnapshot() {
  const statusEl = document.getElementById("sec-status");
  if (statusEl) statusEl.classList.add("is-hidden");
  try {
    const res = await chrome.runtime.sendMessage({ type: "CHALADEV_GET_SECURITY_SNAPSHOT" });
    secSnapshot = res?.ok ? res.security : null;
  } catch {
    secSnapshot = null;
  }
  renderSecurityOverview();
}

function initSecurityModule() {
  const refreshBtn = document.getElementById("btn-sec-refresh");
  const auditBtn = document.getElementById("btn-sec-audit-headers");
  const copyBtn = document.getElementById("btn-sec-copy-report");
  const statusEl = document.getElementById("sec-status");

  refreshBtn.addEventListener("click", refreshSecuritySnapshot);

  auditBtn.addEventListener("click", async () => {
    if (!secSnapshot) await refreshSecuritySnapshot();
    auditBtn.disabled = true;
    auditBtn.textContent = t("secAuditingHeaders");
    statusEl.classList.add("is-hidden");

    try {
      const res = await chrome.runtime.sendMessage({ type: "CHALADEV_AUDIT_SECURITY_HEADERS" });
      if (!res?.ok) {
        statusEl.textContent = t("secAuditHeadersFailed");
        statusEl.classList.remove("is-hidden", "is-ok");
        statusEl.classList.add("is-error");
      } else {
        secHeaders = res.headers || {};
        renderSecurityOverview();
      }
    } catch {
      statusEl.textContent = t("secAuditHeadersFailed");
      statusEl.classList.remove("is-hidden", "is-ok");
      statusEl.classList.add("is-error");
    } finally {
      auditBtn.disabled = false;
      auditBtn.textContent = t("secAuditHeadersBtn");
    }
  });

  copyBtn.addEventListener("click", () => {
    if (!secSnapshot) return;
    const report = formatSecurityReport(secSnapshot, secHeaders, currentTabUrl);
    copyText(report, t("secReportCopied"));
  });
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
  const netToggle = document.getElementById("toggle-net-monitor");

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
    if (netToggle) netToggle.disabled = true;
    updateNetMonitorStatusUi(false);
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
    if (netToggle) netToggle.disabled = false;
    updateNetMonitorStatusUi(false);
    return;
  }

  banner.classList.add("is-hidden");
  banner.classList.remove("is-info");
  ctxDot.classList.remove("is-warning");
  inspectorToggle.disabled = false;
  if (netToggle) netToggle.disabled = false;

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
    const tabChanged =
      (typeof response?.tabId === "number" && currentTabId !== null && response.tabId !== currentTabId) ||
      (response?.url && currentTabUrl && response.url !== currentTabUrl);

    if (typeof response?.tabId === "number") {
      currentTabId = response.tabId;
    }
    if (tabChanged) {
      resetInspectedMetricsUi();
      netLiveEntries = [];
      renderNetLiveEntries();
      manifestAuditResult = null;
      secHeaders = null;
    }

    applyNoticeFromResponse(response);

    if (response?.ok) {
      currentTabUrl = response.url || "";
      renderSeoMetadata(response.seo);
      updateInspectorStatusUi(
        Boolean(response.inspector?.active),
        Boolean(response.inspector?.locked)
      );
      updateNetMonitorStatusUi(Boolean(response.netMonitor?.active));

      const qrInput = document.getElementById("qr-input");
      if (!qrUserEdited && currentTabUrl) {
        qrInput.value = currentTabUrl;
        drawQrFromValue(currentTabUrl);
      }

      refreshActivePanelModule();
    } else {
      currentTabUrl = "";
      renderSeoMetadata(null);
      resetInspectedMetricsUi();
      netResources = [];
      renderNetworkResources(null);
      appSnapshot = null;
      renderAppManifestSection();
      renderWebMcpSection();
      renderAppStorageSection();
      secSnapshot = null;
      renderSecurityOverview();
      const qrInput = document.getElementById("qr-input");
      if (!qrUserEdited) {
        qrInput.value = "";
        drawQrFromValue("");
      }
    }
  } catch {
    applyNoticeFromResponse({ restricted: true });
    renderSeoMetadata(null);
    resetInspectedMetricsUi();
  }
}

function registerRuntimeListeners() {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type === "CHALADEV_ELEMENT_INSPECTED") {
      if (sender?.tab?.id && currentTabId !== null && sender.tab.id !== currentTabId) {
        return;
      }
      renderInspectedMetrics(message.data);
      updateInspectorStatusUi(true, Boolean(message.locked));
      return;
    }

    if (message?.type === "CHALADEV_INSPECTOR_STATE") {
      if (sender?.tab?.id && currentTabId !== null && sender.tab.id !== currentTabId) {
        return;
      }
      updateInspectorStatusUi(Boolean(message.active), Boolean(message.locked));
      return;
    }

    if (message?.type === "CHALADEV_NET_CAPTURE_EVENT") {
      if (sender?.tab?.id && currentTabId !== null && sender.tab.id !== currentTabId) {
        return;
      }
      if (message.entry && typeof message.entry === "object") {
        netLiveEntries.unshift(message.entry);
        if (netLiveEntries.length > 100) {
          netLiveEntries.length = 100;
        }
        renderNetLiveEntries();
      }
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
  connectSidePanelPort();
  initTabs();
  initColorModule();
  initInspectorModule();
  initFormattersModule();
  initQrAndSeoModule();
  initNetworkModule();
  initAppModule();
  initSecurityModule();
  registerRuntimeListeners();
  refreshTabContext();
});
