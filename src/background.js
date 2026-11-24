import { isRestrictedUrl } from "./config.js";

let connectedPanelPorts = new Set();
let activeInspectorTabs = new Set();
let activeNetMonitorTabs = new Set();

/**
 * Configura el comportamiento nativo para que action.onClicked siempre se dispare,
 * otorgando activeTab y abriendo el Side Panel a nivel de ventana (sin cerrarse al cambiar de pestana).
 */
export async function configureSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) return;
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
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
 * Clasifica errores esperados de scripting (paginas internas vs falta de activeTab).
 * @param {unknown} err
 */
function classifyScriptingError(err) {
  const message = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  const isInternal =
    message.includes("chrome:") ||
    message.includes("edge:") ||
    message.includes("about:") ||
    message.includes("devtools:") ||
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
 * Ejecuta un manejador solo si la pestana activa existe, tiene URL visible y no esta restringida.
 * @param {(tab: chrome.tabs.Tab, rawUrl: string) => Promise<any>} handler
 */
async function withAccessibleActiveTab(handler) {
  const tab = await getActiveTab();
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, restricted: true, needsActivation: false, reason: "NO_TAB" };
  }

  const rawUrl = tab.url || tab.pendingUrl || "";
  if (!rawUrl) {
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
    return await handler(tab, rawUrl);
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
 * Funcion inyectada en la pestana activa mediante activeTab + scripting
 * para leer metadatos SEO locales y el estado actual del inspector.
 */
function collectPageContextInTab() {
  const getMetaContent = (selector) => {
    const el = document.querySelector(selector);
    return el ? (el.getAttribute("content") || "").trim() : "";
  };

  const canonicalEl = document.querySelector('link[rel="canonical" i]');
  const charsetEl = document.querySelector("meta[charset]");
  const h1Nodes = Array.from(document.querySelectorAll("h1"));
  const imgNodes = Array.from(document.querySelectorAll("img"));

  let imagesMissingAlt = 0;
  let imagesEmptyAlt = 0;
  for (const img of imgNodes) {
    if (!img.hasAttribute("alt")) {
      imagesMissingAlt += 1;
    } else if (!(img.getAttribute("alt") || "").trim()) {
      imagesEmptyAlt += 1;
    }
  }

  const inspectorState = window.__CHALADEV_INSPECTOR__ || null;
  const netBridgeState = window.__CHALADEV_NET_BRIDGE__ || null;

  return {
    url: window.location.href,
    title: document.title || "",
    seo: {
      title: document.title || "",
      description:
        getMetaContent('meta[name="description" i]') ||
        getMetaContent('meta[name="Description"]'),
      canonical: canonicalEl ? (canonicalEl.getAttribute("href") || "").trim() : "",
      robots: getMetaContent('meta[name="robots" i]'),
      viewport: getMetaContent('meta[name="viewport" i]'),
      lang: (document.documentElement?.getAttribute("lang") || "").trim(),
      charset: (document.characterSet || charsetEl?.getAttribute("charset") || "").trim(),
      h1Count: h1Nodes.length,
      h1Text: (h1Nodes[0]?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120),
      imagesTotal: imgNodes.length,
      imagesMissingAlt,
      imagesEmptyAlt,
      ogTitle: getMetaContent('meta[property="og:title" i]'),
      ogDescription: getMetaContent('meta[property="og:description" i]'),
      ogType: getMetaContent('meta[property="og:type" i]'),
      ogUrl: getMetaContent('meta[property="og:url" i]'),
      ogImage: getMetaContent('meta[property="og:image" i]'),
      twitterCard:
        getMetaContent('meta[name="twitter:card" i]') ||
        getMetaContent('meta[property="twitter:card" i]'),
      twitterTitle:
        getMetaContent('meta[name="twitter:title" i]') ||
        getMetaContent('meta[property="twitter:title" i]'),
      twitterDescription:
        getMetaContent('meta[name="twitter:description" i]') ||
        getMetaContent('meta[property="twitter:description" i]'),
      twitterImage:
        getMetaContent('meta[name="twitter:image" i]') ||
        getMetaContent('meta[property="twitter:image" i]')
    },
    inspector: {
      active: Boolean(inspectorState?.active),
      locked: Boolean(inspectorState?.locked)
    },
    netMonitor: {
      active: Boolean(netBridgeState?.active)
    }
  };
}

/**
 * Lee metricas de navegacion y recursos de Performance API en la pestana activa (100% local).
 */
function collectNetworkSnapshotInTab() {
  const navEntry = performance.getEntriesByType("navigation")?.[0];
  const navigation = navEntry
    ? {
        type: navEntry.type || "navigate",
        protocol: navEntry.nextHopProtocol || "",
        transferSize: Number(navEntry.transferSize || 0),
        decodedBodySize: Number(navEntry.decodedBodySize || 0),
        domContentLoadedMs: Math.round(navEntry.domContentLoadedEventEnd || 0),
        loadMs: Math.round(navEntry.loadEventEnd || 0),
        responseStatus: Number(navEntry.responseStatus || 0)
      }
    : null;

  const rawResources = performance.getEntriesByType("resource") || [];
  const resources = rawResources.slice(-200).map((entry) => ({
    name: entry.name,
    initiatorType: entry.initiatorType || "other",
    protocol: entry.nextHopProtocol || "",
    durationMs: Math.round(entry.duration || 0),
    transferSize: Number(entry.transferSize || 0),
    decodedBodySize: Number(entry.decodedBodySize || 0),
    cached: entry.transferSize === 0 && entry.decodedBodySize > 0,
    status: Number(entry.responseStatus || 0)
  }));

  return {
    url: window.location.href,
    navigation,
    resources,
    liveCaptureActive: Boolean(window.__CHALADEV_NET_BRIDGE__?.active)
  };
}

/**
 * Lee estado de Manifest link, Storage, Cookies JS, IndexedDB, Cache Storage, Service Workers y WebMCP DOM.
 */
async function collectAppSnapshotInTab() {
  const manifestEl = document.querySelector('link[rel="manifest" i]');
  const manifestHref = manifestEl ? (manifestEl.getAttribute("href") || "").trim() : "";
  let manifestResolvedUrl = "";
  let manifestSameOrigin = false;
  if (manifestHref) {
    try {
      const parsed = new URL(manifestHref, window.location.href);
      manifestResolvedUrl = parsed.href;
      manifestSameOrigin = parsed.origin === window.location.origin;
    } catch {
      manifestResolvedUrl = manifestHref;
    }
  }

  const readStorage = (storeObj) => {
    const entries = [];
    let totalBytes = 0;
    let count = 0;
    try {
      count = storeObj.length;
      const limit = Math.min(count, 100);
      for (let i = 0; i < count; i += 1) {
        const key = storeObj.key(i);
        if (key === null) continue;
        const val = storeObj.getItem(key) || "";
        totalBytes += (key.length + val.length) * 2;
        if (entries.length < limit) {
          entries.push({
            key,
            value: val.length > 2000 ? `${val.slice(0, 2000)}…` : val,
            truncated: val.length > 2000
          });
        }
      }
    } catch {
      return { count: 0, totalBytes: 0, entries: [], inaccessible: true };
    }
    return { count, totalBytes, entries, inaccessible: false };
  };

  const cookies = [];
  try {
    const rawCookie = document.cookie || "";
    if (rawCookie.trim()) {
      for (const pair of rawCookie.split(";")) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx === -1) {
          const name = pair.trim();
          if (name) cookies.push({ name, value: "" });
        } else {
          const name = pair.slice(0, eqIdx).trim();
          const value = pair.slice(eqIdx + 1).trim();
          if (name) cookies.push({ name, value });
        }
      }
    }
  } catch {
    // Ignorar errores de acceso a document.cookie
  }

  let storageEstimate = null;
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      storageEstimate = {
        usage: Number(est?.usage || 0),
        quota: Number(est?.quota || 0)
      };
    }
  } catch {
    storageEstimate = null;
  }

  let indexedDb = [];
  try {
    if (typeof indexedDB !== "undefined" && typeof indexedDB.databases === "function") {
      const dbs = await indexedDB.databases();
      indexedDb = (dbs || [])
        .slice(0, 50)
        .map((db) => ({ name: db.name || "(unnamed)", version: db.version || 0 }));
    }
  } catch {
    indexedDb = [];
  }

  let cacheStorage = [];
  try {
    if (typeof caches !== "undefined" && typeof caches.keys === "function") {
      const keys = await caches.keys();
      cacheStorage = (keys || []).slice(0, 50);
    }
  } catch {
    cacheStorage = [];
  }

  let serviceWorkers = [];
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      serviceWorkers = (regs || []).slice(0, 20).map((reg) => {
        const worker = reg.active || reg.waiting || reg.installing;
        return {
          scope: reg.scope || "",
          state: worker?.state || "registered",
          scriptURL: worker?.scriptURL || ""
        };
      });
    }
  } catch {
    serviceWorkers = [];
  }

  const declarativeForms = Array.from(document.querySelectorAll("form[toolname]")).map((form) => ({
    toolname: (form.getAttribute("toolname") || "").trim(),
    tooldescription: (form.getAttribute("tooldescription") || "").trim(),
    toolautosubmit: form.hasAttribute("toolautosubmit"),
    fields: Array.from(form.elements || [])
      .map((el) => el.getAttribute?.("name") || el.id || "")
      .filter(Boolean)
      .slice(0, 15)
  }));

  const mcpTags = Array.from(
    document.querySelectorAll('link[rel*="mcp" i], meta[name*="mcp" i]')
  ).map((el) => ({
    tag: el.tagName.toLowerCase(),
    name: el.getAttribute("rel") || el.getAttribute("name") || "",
    value: el.getAttribute("href") || el.getAttribute("content") || ""
  }));

  return {
    url: window.location.href,
    manifestLink: {
      present: Boolean(manifestEl),
      href: manifestHref,
      resolvedUrl: manifestResolvedUrl,
      sameOrigin: manifestSameOrigin
    },
    localStorage: readStorage(window.localStorage),
    sessionStorage: readStorage(window.sessionStorage),
    cookies,
    storageEstimate,
    indexedDb,
    cacheStorage,
    serviceWorkers,
    webMcpDom: {
      declarativeForms,
      mcpTags
    }
  };
}

/**
 * Inspecciona API WebMCP en mundo MAIN sin mutar la pagina.
 */
async function collectWebMcpInMainWorld() {
  const mc = navigator.modelContext;
  const supported = Boolean(mc && typeof mc === "object");
  const methods = supported
    ? ["registerTool", "unregisterTool", "provideContext", "clearContext"].filter(
        (m) => typeof mc[m] === "function"
      )
    : [];

  let registeredTools = [];
  try {
    const testingApi = navigator.modelContextTesting;
    if (testingApi && typeof testingApi.listTools === "function") {
      const list = await Promise.resolve(testingApi.listTools());
      if (Array.isArray(list)) {
        registeredTools = list.slice(0, 30).map((item) => ({
          name: String(item?.name || ""),
          description: String(item?.description || "")
        }));
      }
    }
  } catch {
    registeredTools = [];
  }

  return {
    supported,
    methods,
    registeredTools
  };
}

/**
 * Obtiene y parsea el Web App Manifest del mismo origen cuando el usuario pulsa "Validar Manifest".
 */
async function fetchManifestInTab() {
  const manifestEl = document.querySelector('link[rel="manifest" i]');
  const href = manifestEl ? (manifestEl.getAttribute("href") || "").trim() : "";
  if (!href) {
    return { ok: false, reason: "NO_MANIFEST" };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(href, window.location.href);
  } catch {
    return { ok: false, reason: "INVALID_MANIFEST_URL" };
  }

  if (parsedUrl.origin !== window.location.origin) {
    return { ok: false, reason: "CROSS_ORIGIN_MANIFEST", url: parsedUrl.href };
  }

  const res = await fetch(parsedUrl.href, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) {
    return { ok: false, reason: "HTTP_ERROR", status: res.status, url: parsedUrl.href };
  }
  const manifest = await res.json();
  return { ok: true, url: parsedUrl.href, manifest };
}

/**
 * Elimina una clave de localStorage o sessionStorage en la pestana activa.
 */
function deleteStorageKeyInTab(area, key) {
  if (area !== "localStorage" && area !== "sessionStorage") {
    return { ok: false, reason: "INVALID_AREA" };
  }
  window[area].removeItem(key);
  return { ok: true };
}

/**
 * Recolecta metricas locales de seguridad del DOM y almacenamiento (sin enviar valores).
 */
function collectSecuritySnapshotInTab() {
  const protocol = window.location.protocol.toLowerCase();
  const isHttpsPage = protocol === "https:";
  const mixedSet = new Set();

  if (isHttpsPage) {
    const selectors = [
      ["script[src]", "src"],
      ["img[src]", "src"],
      ["link[href]", "href"],
      ["iframe[src]", "src"],
      ["video[src]", "src"],
      ["audio[src]", "src"],
      ["source[src]", "src"],
      ["object[data]", "data"]
    ];
    for (const [sel, attr] of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const raw = (el.getAttribute(attr) || "").trim();
        if (!raw) continue;
        try {
          const u = new URL(raw, window.location.href);
          if (u.protocol === "http:") {
            mixedSet.add(u.href);
          }
        } catch {
          // Ignorar URLs no validas
        }
      }
    }
    for (const res of performance.getEntriesByType("resource") || []) {
      try {
        const u = new URL(res.name);
        if (u.protocol === "http:") {
          mixedSet.add(u.href);
        }
      } catch {
        // Ignorar
      }
    }
  }

  let externalScriptsTotal = 0;
  let externalScriptsWithoutSri = 0;
  for (const script of document.querySelectorAll("script[src]")) {
    const raw = (script.getAttribute("src") || "").trim();
    if (!raw) continue;
    try {
      const u = new URL(raw, window.location.href);
      if (u.origin !== window.location.origin) {
        externalScriptsTotal += 1;
        if (!(script.getAttribute("integrity") || "").trim()) {
          externalScriptsWithoutSri += 1;
        }
      }
    } catch {
      // Ignorar
    }
  }

  const iframes = Array.from(document.querySelectorAll("iframe"));
  const iframesWithoutSandbox = iframes.filter((f) => !f.hasAttribute("sandbox")).length;

  let unsafeTargetBlankLinks = 0;
  for (const a of document.querySelectorAll('a[target="_blank" i]')) {
    const relTokens = (a.getAttribute("rel") || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!relTokens.includes("noopener") && !relTokens.includes("noreferrer")) {
      unsafeTargetBlankLinks += 1;
    }
  }

  const passwordFieldsOnHttp = isHttpsPage
    ? 0
    : document.querySelectorAll('input[type="password" i]').length;

  let insecureForms = 0;
  if (isHttpsPage) {
    for (const form of document.querySelectorAll("form[action]")) {
      const raw = (form.getAttribute("action") || "").trim();
      if (!raw) continue;
      try {
        const u = new URL(raw, window.location.href);
        if (u.protocol === "http:") {
          insecureForms += 1;
        }
      } catch {
        // Ignorar
      }
    }
  }

  const sensitivePattern = /(token|jwt|auth|secret|api[-_]?key|session|pass|bearer|credential)/i;
  const sensitiveStorageKeys = [];
  const pushSensitive = (prefix, name) => {
    if (sensitivePattern.test(name) && sensitiveStorageKeys.length < 15) {
      sensitiveStorageKeys.push(`${prefix}:${name}`);
    }
  };

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k) pushSensitive("localStorage", k);
    }
  } catch {
    // Ignorar
  }
  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (k) pushSensitive("sessionStorage", k);
    }
  } catch {
    // Ignorar
  }

  let jsCookieCount = 0;
  try {
    const rawCookie = document.cookie || "";
    if (rawCookie.trim()) {
      for (const pair of rawCookie.split(";")) {
        const name = pair.split("=")[0].trim();
        if (name) {
          jsCookieCount += 1;
          pushSensitive("cookie", name);
        }
      }
    }
  } catch {
    // Ignorar
  }

  const metaCsp =
    document
      .querySelector('meta[http-equiv="Content-Security-Policy" i]')
      ?.getAttribute("content")
      ?.trim() || "";
  const metaReferrer =
    document.querySelector('meta[name="referrer" i]')?.getAttribute("content")?.trim() || "";

  const mixedContent = Array.from(mixedSet).slice(0, 20);

  return {
    url: window.location.href,
    protocol,
    origin: window.location.origin,
    isSecureContext: Boolean(window.isSecureContext),
    crossOriginIsolated: Boolean(window.crossOriginIsolated),
    metaCsp,
    metaReferrer,
    mixedContent,
    mixedContentCount: mixedSet.size,
    externalScriptsTotal,
    externalScriptsWithoutSri,
    iframesTotal: iframes.length,
    iframesWithoutSandbox,
    unsafeTargetBlankLinks,
    passwordFieldsOnHttp,
    insecureForms,
    jsCookieCount,
    sensitiveStorageKeys
  };
}

/**
 * Audita cabeceras HTTP mediante HEAD same-origin a la URL actual (solo bajo accion explicita del usuario).
 */
async function auditSecurityHeadersInTab() {
  const res = await fetch(window.location.href, {
    method: "HEAD",
    credentials: "same-origin",
    cache: "no-store"
  });
  const names = [
    "strict-transport-security",
    "content-security-policy",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-embedder-policy",
    "server",
    "x-powered-by"
  ];
  const headers = {};
  for (const name of names) {
    const val = res.headers.get(name);
    if (val !== null) {
      headers[name] = val;
    }
  }
  return { ok: true, status: res.status, headers };
}

/**
 * Extrae el contexto (URL, SEO, estado del inspector) de la pestana activa de forma segura.
 */
async function handleGetTabContext() {
  return withAccessibleActiveTab(async (tab, rawUrl) => {
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
        inspector: { active: false, locked: false },
        netMonitor: { active: false }
      };
    }

    if (payload.inspector?.active) {
      activeInspectorTabs.add(tab.id);
    } else {
      activeInspectorTabs.delete(tab.id);
    }

    if (payload.netMonitor?.active) {
      activeNetMonitorTabs.add(tab.id);
    } else {
      activeNetMonitorTabs.delete(tab.id);
    }

    return {
      ok: true,
      restricted: false,
      needsActivation: false,
      tabId: tab.id,
      url: payload.url || rawUrl,
      title: payload.title || tab.title || "",
      seo: payload.seo,
      inspector: payload.inspector,
      netMonitor: payload.netMonitor
    };
  });
}

/**
 * Inyecta bajo demanda content/inspector.js (si no existe aun) y activa/desactiva el inspector.
 * @param {boolean} active
 */
async function handleToggleInspector(active) {
  return withAccessibleActiveTab(async (tab) => {
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

    const isActive = Boolean(response?.active);
    if (isActive) {
      activeInspectorTabs.add(tab.id);
    } else {
      activeInspectorTabs.delete(tab.id);
    }

    return {
      ok: true,
      active: isActive,
      locked: Boolean(response?.locked),
      tabId: tab.id
    };
  });
}

async function handleGetNetworkSnapshot() {
  return withAccessibleActiveTab(async (tab, rawUrl) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectNetworkSnapshotInTab
    });
    const payload = results?.[0]?.result;
    return {
      ok: true,
      tabId: tab.id,
      url: payload?.url || rawUrl,
      navigation: payload?.navigation || null,
      resources: payload?.resources || [],
      liveCaptureActive: Boolean(payload?.liveCaptureActive)
    };
  });
}

async function handleToggleNetMonitor(active) {
  return withAccessibleActiveTab(async (tab) => {
    let alive = false;
    try {
      const ping = await chrome.tabs.sendMessage(tab.id, { type: "CHALADEV_NET_MONITOR_PING" });
      alive = Boolean(ping?.alive);
    } catch {
      alive = false;
    }

    if (!alive) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        files: ["content/net-monitor-main.js"]
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        files: ["content/net-monitor-bridge.js"]
      });
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "CHALADEV_NET_MONITOR_SET",
      active: Boolean(active)
    });

    const isActive = Boolean(response?.active);
    if (isActive) {
      activeNetMonitorTabs.add(tab.id);
    } else {
      activeNetMonitorTabs.delete(tab.id);
    }

    return {
      ok: true,
      active: isActive,
      tabId: tab.id
    };
  });
}

async function handleGetAppSnapshot() {
  return withAccessibleActiveTab(async (tab, rawUrl) => {
    const [isolatedRes, mainRes] = await Promise.all([
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: collectAppSnapshotInTab
      }),
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: collectWebMcpInMainWorld
        })
        .catch(() => [{ result: { supported: false, methods: [], registeredTools: [] } }])
    ]);

    const appData = isolatedRes?.[0]?.result || {};
    const webMcpApi = mainRes?.[0]?.result || { supported: false, methods: [], registeredTools: [] };

    return {
      ok: true,
      tabId: tab.id,
      url: appData.url || rawUrl,
      ...appData,
      webMcpApi
    };
  });
}

async function handleFetchManifest() {
  return withAccessibleActiveTab(async (tab) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchManifestInTab
    });
    return results?.[0]?.result || { ok: false, reason: "UNKNOWN_ERROR" };
  });
}

async function handleDeleteStorageKey(area, key) {
  return withAccessibleActiveTab(async (tab) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: deleteStorageKeyInTab,
      args: [String(area || ""), String(key || "")]
    });
    return results?.[0]?.result || { ok: false, reason: "UNKNOWN_ERROR" };
  });
}

async function handleGetSecuritySnapshot() {
  return withAccessibleActiveTab(async (tab, rawUrl) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectSecuritySnapshotInTab
    });
    const secData = results?.[0]?.result || null;
    return {
      ok: Boolean(secData),
      tabId: tab.id,
      url: secData?.url || rawUrl,
      security: secData
    };
  });
}

async function handleAuditSecurityHeaders() {
  return withAccessibleActiveTab(async (tab) => {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: auditSecurityHeadersInTab
    });
    return results?.[0]?.result || { ok: false, reason: "UNKNOWN_ERROR" };
  });
}

async function deactivateAllActiveTabTools() {
  const inspectorTargets = new Set(activeInspectorTabs);
  const netTargets = new Set(activeNetMonitorTabs);
  activeInspectorTabs.clear();
  activeNetMonitorTabs.clear();

  try {
    const activeTab = await getActiveTab();
    if (activeTab && typeof activeTab.id === "number") {
      const rawUrl = activeTab.url || activeTab.pendingUrl || "";
      if (rawUrl && !isRestrictedUrl(rawUrl)) {
        inspectorTargets.add(activeTab.id);
        netTargets.add(activeTab.id);
      }
    }
  } catch {
    // Ignorar errores al consultar pestana activa durante el cierre
  }

  await Promise.allSettled([
    ...Array.from(inspectorTargets).map((tabId) =>
      chrome.tabs
        .sendMessage(tabId, { type: "CHALADEV_INSPECTOR_SET", active: false })
        .catch(() => {})
    ),
    ...Array.from(netTargets).map((tabId) =>
      chrome.tabs
        .sendMessage(tabId, { type: "CHALADEV_NET_MONITOR_SET", active: false })
        .catch(() => {})
    )
  ]);
}

function notifyPanelTabUpdated(tabId) {
  chrome.runtime.sendMessage({ type: "CHALADEV_TAB_UPDATED", tabId }).catch(() => {});
}

export function registerBackgroundListeners() {
  connectedPanelPorts = new Set();
  activeInspectorTabs = new Set();
  activeNetMonitorTabs = new Set();

  chrome.runtime.onInstalled.addListener(() => {
    configureSidePanelBehavior();
  });

  chrome.runtime.onStartup.addListener(() => {
    configureSidePanelBehavior();
  });

  if (chrome.action?.onClicked) {
    chrome.action.onClicked.addListener((tab) => {
      // Llamar sidePanel.open() o sidebarAction.open() sincronamente para conservar el gesto de usuario
      if (chrome.sidePanel?.open && typeof tab?.windowId === "number") {
        Promise.resolve(chrome.sidePanel.open({ windowId: tab.windowId }))
          .catch(() => {})
          .finally(() => {
            notifyPanelTabUpdated(tab?.id ?? null);
          });
      } else {
        const firefoxSidebarOpen =
          globalThis.browser?.sidebarAction?.open || chrome.sidebarAction?.open;
        if (typeof firefoxSidebarOpen === "function") {
          Promise.resolve(firefoxSidebarOpen())
            .catch(() => {})
            .finally(() => {
              notifyPanelTabUpdated(tab?.id ?? null);
            });
        } else {
          notifyPanelTabUpdated(tab?.id ?? null);
        }
      }
    });
  }

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    notifyPanelTabUpdated(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab?.active && (changeInfo.status === "complete" || changeInfo.url || changeInfo.title)) {
      notifyPanelTabUpdated(tabId);
    }
  });

  if (chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
      activeInspectorTabs.delete(tabId);
      activeNetMonitorTabs.delete(tabId);
    });
  }

  if (chrome.runtime.onConnect) {
    chrome.runtime.onConnect.addListener((port) => {
      if (port?.name !== "chaladev-sidepanel") return;
      connectedPanelPorts.add(port);

      if (port.onMessage?.addListener) {
        port.onMessage.addListener(() => {
          // Keepalive del puerto del Side Panel
        });
      }

      if (port.onDisconnect?.addListener) {
        port.onDisconnect.addListener(() => {
          connectedPanelPorts.delete(port);
          if (connectedPanelPorts.size === 0) {
            deactivateAllActiveTabTools();
          }
        });
      }
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.tab) {
      if (message?.type === "CHALADEV_INSPECTOR_STATE" && !message.active && typeof sender.tab.id === "number") {
        activeInspectorTabs.delete(sender.tab.id);
      }
      return false;
    }

    const actionMap = {
      CHALADEV_GET_TAB_CONTEXT: () => handleGetTabContext(),
      CHALADEV_TOGGLE_INSPECTOR: () => handleToggleInspector(Boolean(message.active)),
      CHALADEV_GET_NETWORK_SNAPSHOT: () => handleGetNetworkSnapshot(),
      CHALADEV_TOGGLE_NET_MONITOR: () => handleToggleNetMonitor(Boolean(message.active)),
      CHALADEV_GET_APP_SNAPSHOT: () => handleGetAppSnapshot(),
      CHALADEV_FETCH_MANIFEST: () => handleFetchManifest(),
      CHALADEV_DELETE_STORAGE_KEY: () => handleDeleteStorageKey(message.area, message.key),
      CHALADEV_GET_SECURITY_SNAPSHOT: () => handleGetSecuritySnapshot(),
      CHALADEV_AUDIT_SECURITY_HEADERS: () => handleAuditSecurityHeaders()
    };

    const handler = actionMap[message?.type];
    if (!handler) {
      return false;
    }

    handler().then(sendResponse, () => {
      sendResponse({ ok: false, restricted: true, reason: "UNKNOWN_ERROR" });
    });
    return true;
  });
}

if (
  typeof chrome !== "undefined" &&
  chrome.runtime &&
  (chrome.sidePanel || globalThis.browser?.sidebarAction || chrome.sidebarAction)
) {
  configureSidePanelBehavior();
  registerBackgroundListeners();
}
