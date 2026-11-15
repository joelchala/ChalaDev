import { isRestrictedUrl } from "./config.js";

/**
 * Configura el comportamiento nativo de Chrome/Edge para abrir el Side Panel
 * al hacer clic en el icono de la extension.
 */
async function configureSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {
    // Ignorar en entornos sin soporte completo de sidePanel
  }
}

/**
 * Obtiene la pestana activa de la ventana actual (o la ultima enfocada).
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getActiveTab() {
  const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentTabs && currentTabs[0]) {
    return currentTabs[0];
  }
  const fallbackTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return fallbackTabs?.[0] || null;
}

/**
 * Funcion inyectada en la pestana activa mediante activeTab + scripting
 * para leer metadatos SEO y el estado actual del inspector.
 */
function collectPageContextInTab() {
  const getMetaContent = (selector) => {
    const el = document.querySelector(selector);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };

  const canonicalEl = document.querySelector('link[rel="canonical" i]');
  const inspectorState = window.__CHALADEV_INSPECTOR__ || null;

  return {
    url: window.location.href,
    title: document.title || "",
    seo: {
      title: document.title || "",
      description:
        getMetaContent('meta[name="description" i]') ||
        getMetaContent('meta[name="Description"]'),
      canonical: canonicalEl ? (canonicalEl.getAttribute("href") || "").trim() : "",
      ogTitle: getMetaContent('meta[property="og:title" i]'),
      ogDescription: getMetaContent('meta[property="og:description" i]'),
      ogType: getMetaContent('meta[property="og:type" i]'),
      ogUrl: getMetaContent('meta[property="og:url" i]'),
      ogImage: getMetaContent('meta[property="og:image" i]')
    },
    inspector: {
      active: Boolean(inspectorState?.active),
      locked: Boolean(inspectorState?.locked)
    }
  };
}

/**
 * Clasifica errores esperados de scripting (paginas internas vs falta de activeTab).
 * @param {unknown} err
 */
function classifyScriptingError(err) {
  const message = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  const isInternal =
    message.includes("chrome://") ||
    message.includes("edge://") ||
    message.includes("about:") ||
    message.includes("devtools://") ||
    message.includes("cannot access a chrome") ||
    message.includes("cannot access a edge") ||
    message.includes("extensions gallery") ||
    message.includes("webstore") ||
    message.includes("addons");

  if (isInternal) {
    return { ok: false, restricted: true, needsActivation: false, reason: "RESTRICTED_URL" };
  }
  return { ok: false, restricted: false, needsActivation: true, reason: "NEEDS_ACTIVE_TAB" };
}

/**
 * Extrae el contexto (URL, SEO, estado del inspector) de la pestana activa de forma segura.
 */
async function handleGetTabContext() {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, restricted: true, needsActivation: false, reason: "NO_TAB" };
  }

  const rawUrl = tab.url || tab.pendingUrl || "";
  if (!rawUrl) {
    // Sin permiso "tabs", tab.url solo existe si activeTab ya fue concedido o es pagina accesible.
    return {
      ok: false,
      restricted: false,
      needsActivation: true,
      reason: "NEEDS_ACTIVE_TAB",
      tabId: tab.id
    };
  }

  if (isRestrictedUrl(rawUrl)) {
    return {
      ok: false,
      restricted: true,
      needsActivation: false,
      reason: "RESTRICTED_URL",
      url: rawUrl,
      title: tab.title || "",
      tabId: tab.id
    };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageContextInTab
    });
    const payload = results?.[0]?.result;
    if (!payload) {
      return {
        ok: true,
        restricted: false,
        needsActivation: false,
        tabId: tab.id,
        url: rawUrl,
        title: tab.title || "",
        seo: null,
        inspector: { active: false, locked: false }
      };
    }

    return {
      ok: true,
      restricted: false,
      needsActivation: false,
      tabId: tab.id,
      url: payload.url || rawUrl,
      title: payload.title || tab.title || "",
      seo: payload.seo,
      inspector: payload.inspector
    };
  } catch (err) {
    return {
      ...classifyScriptingError(err),
      url: rawUrl,
      title: tab.title || "",
      tabId: tab.id
    };
  }
}

/**
 * Inyecta bajo demanda content/inspector.js (si no existe aun) y activa/desactiva el inspector.
 * @param {boolean} active
 */
async function handleToggleInspector(active) {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, restricted: true, needsActivation: false, reason: "NO_TAB" };
  }

  const rawUrl = tab.url || tab.pendingUrl || "";
  if (!rawUrl) {
    return { ok: false, restricted: false, needsActivation: true, reason: "NEEDS_ACTIVE_TAB" };
  }

  if (isRestrictedUrl(rawUrl)) {
    return { ok: false, restricted: true, needsActivation: false, reason: "RESTRICTED_URL", url: rawUrl };
  }

  try {
    let alive = false;
    try {
      const ping = await chrome.tabs.sendMessage(tab.id, { type: "CHALADEV_INSPECTOR_PING" });
      alive = Boolean(ping?.alive);
    } catch {
      alive = false;
    }

    if (!alive) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content/inspector.js"]
      });
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CHALADEV_INSPECTOR_SET",
      active: Boolean(active)
    });

    return {
      ok: true,
      active: Boolean(response?.active),
      locked: Boolean(response?.locked),
      tabId: tab.id
    };
  } catch (err) {
    return classifyScriptingError(err);
  }
}

function notifyPanelTabUpdated(tabId) {
  chrome.runtime.sendMessage({ type: "CHALADEV_TAB_UPDATED", tabId }).catch(() => {});
}

export function registerBackgroundListeners() {
  chrome.runtime.onInstalled.addListener(() => {
    configureSidePanelBehavior();
  });

  chrome.runtime.onStartup.addListener(() => {
    configureSidePanelBehavior();
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    notifyPanelTabUpdated(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab?.active && (changeInfo.status === "complete" || changeInfo.url || changeInfo.title)) {
      notifyPanelTabUpdated(tabId);
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Solo mensajes provenientes de paginas internas de la extension (sidepanel)
    if (sender.tab) {
      return false;
    }

    if (message?.type === "CHALADEV_GET_TAB_CONTEXT") {
      handleGetTabContext().then(sendResponse, () => {
        sendResponse({ ok: false, restricted: true, reason: "UNKNOWN_ERROR" });
      });
      return true;
    }

    if (message?.type === "CHALADEV_TOGGLE_INSPECTOR") {
      handleToggleInspector(Boolean(message.active)).then(sendResponse, () => {
        sendResponse({ ok: false, restricted: true, reason: "UNKNOWN_ERROR" });
      });
      return true;
    }

    return false;
  });
}

if (typeof chrome !== "undefined" && chrome.runtime && chrome.sidePanel) {
  configureSidePanelBehavior();
  registerBackgroundListeners();
}
