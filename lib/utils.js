/**
 * Utilidades puras y 100% locales para ChalaDev:
 * - Conversion de colores (HEX, RGB, HSL)
 * - Formateador / Validador JSON con deteccion de linea y columna
 * - Conversor Base64 UTF-8
 * - Decodificador JWT offline
 */

/**
 * Normaliza un codigo hexadecimal (#RGB o #RRGGBB o #RRGGBBAA) a #RRGGBB en mayusculas.
 * @param {string} rawHex
 * @returns {string|null}
 */
export function normalizeHex(rawHex) {
  if (typeof rawHex !== "string") return null;
  let cleaned = rawHex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    cleaned = cleaned
      .split("")
      .map((ch) => ch + ch)
      .join("");
  } else if (/^[0-9a-fA-F]{8}$/.test(cleaned)) {
    cleaned = cleaned.slice(0, 6);
  } else if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return null;
  }
  return `#${cleaned.toUpperCase()}`;
}

/**
 * Convierte #RRGGBB a objeto { r, g, b }.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }|null}
 */
export function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const intVal = parseInt(normalized.slice(1), 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
}

/**
 * Convierte RGB (0-255) a HSL ({ h: 0-360, s: 0-100, l: 0-100 }).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{ h: number, s: number, l: number }}
 */
export function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

/**
 * Convierte #RRGGBB a objeto HSL.
 * @param {string} hex
 * @returns {{ h: number, s: number, l: number }|null}
 */
export function hexToHsl(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/**
 * Convierte un color CSS rgb(...) o rgba(...) a #RRGGBB.
 * Devuelve null si es invalido o totalmente transparente (alfa = 0).
 * @param {string} cssColor
 * @returns {string|null}
 */
export function rgbCssToHex(cssColor) {
  if (typeof cssColor !== "string") return null;
  const match = cssColor
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!match) return null;

  if (match[4] !== undefined) {
    const rawAlpha = match[4].endsWith("%")
      ? parseFloat(match[4]) / 100
      : parseFloat(match[4]);
    if (Number.isFinite(rawAlpha) && rawAlpha <= 0) {
      return null;
    }
  }

  const toHexByte = (v) => {
    const clamped = Math.max(0, Math.min(255, Math.round(Number(v))));
    return clamped.toString(16).padStart(2, "0").toUpperCase();
  };

  return `#${toHexByte(match[1])}${toHexByte(match[2])}${toHexByte(match[3])}`;
}

/**
 * Formatea un color HEX en sus tres representaciones listas para copiar: HEX, RGB y HSL.
 * @param {string} rawHex
 * @returns {{ hex: string, rgb: string, hsl: string }|null}
 */
export function formatColorFormats(rawHex) {
  const hex = normalizeHex(rawHex);
  if (!hex) return null;
  const rgbObj = hexToRgb(hex);
  const hslObj = rgbToHsl(rgbObj.r, rgbObj.g, rgbObj.b);
  return {
    hex,
    rgb: `rgb(${rgbObj.r}, ${rgbObj.g}, ${rgbObj.b})`,
    hsl: `hsl(${hslObj.h}, ${hslObj.s}%, ${hslObj.l}%)`
  };
}

/**
 * Calcula linea y columna (1-based) a partir de una posicion en texto.
 * @param {string} text
 * @param {number} index
 * @returns {{ line: number, column: number }}
 */
function offsetToLineColumn(text, index) {
  const safeIndex = Math.max(0, Math.min(text.length, index));
  const slice = text.slice(0, safeIndex);
  const lines = slice.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1
  };
}

/**
 * Procesa JSON localmente: valida, formatea con 2 espacios o minifica.
 * @param {string} input
 * @param {"format"|"minify"|"validate"} mode
 */
export function processJson(input, mode = "format") {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, empty: true, error: "Empty JSON" };
  }

  try {
    const parsed = JSON.parse(input);
    const output =
      mode === "minify"
        ? JSON.stringify(parsed)
        : JSON.stringify(parsed, null, 2);

    let typeLabel = typeof parsed;
    if (Array.isArray(parsed)) {
      typeLabel = `Array(${parsed.length})`;
    } else if (parsed === null) {
      typeLabel = "null";
    } else if (typeof parsed === "object") {
      typeLabel = `Object(${Object.keys(parsed).length})`;
    }

    return {
      ok: true,
      output,
      parsed,
      typeLabel,
      charCount: output.length
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    let line = 1;
    let column = 1;

    const lineColMatch = msg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lineColMatch) {
      line = Number(lineColMatch[1]) || 1;
      column = Number(lineColMatch[2]) || 1;
    } else {
      const posMatch = msg.match(/position\s+(\d+)/i);
      if (posMatch) {
        const coords = offsetToLineColumn(input, Number(posMatch[1]));
        line = coords.line;
        column = coords.column;
      }
    }

    return {
      ok: false,
      empty: false,
      error: msg,
      line,
      column
    };
  }
}

/**
 * Codifica texto UTF-8 a Base64 estandar de forma segura para caracteres multibyte.
 * @param {string} text
 * @returns {string}
 */
export function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Decodifica una cadena Base64 o Base64Url a texto UTF-8.
 * @param {string} base64Input
 * @returns {string}
 */
export function decodeBase64Utf8(base64Input) {
  if (typeof base64Input !== "string") {
    throw new Error("Input must be a string");
  }
  const stripped = base64Input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!stripped) {
    return "";
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(stripped)) {
    throw new Error("Invalid Base64 characters");
  }
  const mod = stripped.length % 4;
  if (mod === 1) {
    throw new Error("Invalid Base64 length");
  }
  const padded = mod === 0 ? stripped : stripped + "=".repeat(4 - mod);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/**
 * Decodifica un token JWT localmente (sin enviar datos ni verificar firma en servidor).
 * @param {string} rawToken
 * @param {number} [nowMs=Date.now()]
 */
export function decodeJwtLocal(rawToken, nowMs = Date.now()) {
  if (typeof rawToken !== "string") {
    return { ok: false, errorCode: "INVALID_STRUCTURE" };
  }
  const cleaned = rawToken.trim().replace(/^Bearer\s+/i, "");
  const parts = cleaned.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    return { ok: false, errorCode: "INVALID_STRUCTURE" };
  }

  try {
    const headerRaw = decodeBase64Utf8(parts[0]);
    const payloadRaw = decodeBase64Utf8(parts[1]);
    const header = JSON.parse(headerRaw);
    const payload = JSON.parse(payloadRaw);

    const claims = {
      expStatus: "none",
      expIso: null,
      iatIso: null,
      nbfIso: null
    };

    if (payload && typeof payload === "object") {
      if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
        const expMs = payload.exp * 1000;
        claims.expIso = new Date(expMs).toISOString();
        claims.expStatus = expMs < nowMs ? "expired" : "active";
      }
      if (typeof payload.iat === "number" && Number.isFinite(payload.iat)) {
        claims.iatIso = new Date(payload.iat * 1000).toISOString();
      }
      if (typeof payload.nbf === "number" && Number.isFinite(payload.nbf)) {
        claims.nbfIso = new Date(payload.nbf * 1000).toISOString();
      }
    }

    return {
      ok: true,
      header,
      payload,
      headerFormatted: JSON.stringify(header, null, 2),
      payloadFormatted: JSON.stringify(payload, null, 2),
      signature: parts[2],
      hasSignature: parts[2].length > 0,
      claims
    };
  } catch {
    return { ok: false, errorCode: "DECODE_FAILED" };
  }
}
