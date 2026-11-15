/**
 * Configuracion centralizada de ChalaDev (Suite Chala).
 * Modifica PAYPAL_DONATE_URL o GITHUB_REPO_URL para personalizar los enlaces de comunidad.
 */

export const PAYPAL_DONATE_URL = "https://www.paypal.com/ncp/payment/9ZPGVEYNK89M6";

export const CONFIG = {
  APP_NAME: "ChalaDev",
  VERSION: "1.0.0",
  PAYPAL_DONATE_URL,
  GITHUB_REPO_URL: "https://github.com/joelchala/ChalaDev",
  SUITE_LINKS: {
    chalablock: "https://github.com/joelchala/Chalablock",
    chalavpn: "https://github.com/joelchala/ChalaVPN",
    chalatabs: "https://github.com/joelchala/ChalaTabs"
  },
  COLORS: {
    PRIMARY: "#10B981",
    ACCENT: "#06B6D4",
    BG_DARK: "#0F172A",
    SURFACE: "#1E293B",
    TEXT_MAIN: "#F8FAFC"
  },
  PROTECTED_URL_PREFIXES: [
    "chrome://",
    "edge://",
    "about:",
    "chrome-extension://",
    "extension://",
    "devtools://",
    "view-source:",
    "chrome-search://",
    "https://chrome.google.com/webstore",
    "https://chromewebstore.google.com",
    "https://microsoftedge.microsoft.com/addons"
  ],
  MAX_COLOR_HISTORY: 12,
  STORAGE_KEYS: {
    COLOR_HISTORY: "chaladev_color_history",
    LAST_COLOR: "chaladev_last_color",
    ACTIVE_TAB: "chaladev_active_tab"
  }
};

/**
 * Determina si una URL pertenece a una pagina interna o protegida del navegador
 * donde Chromium no permite ejecutar scripts de contenido.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isRestrictedUrl(rawUrl) {
  if (typeof rawUrl !== "string") {
    return true;
  }
  const normalized = rawUrl.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return CONFIG.PROTECTED_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}
