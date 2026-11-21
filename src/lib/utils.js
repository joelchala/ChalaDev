/**
 * Utilidades puras y 100% locales para ChalaDev:
 * - Conversion de colores (HEX, RGB, HSL y CSS Color 4: oklch, oklab, color(srgb/display-p3))
 * - Verificador de contraste WCAG 2.1 (AA / AAA)
 * - Formateador / Validador JSON con deteccion exacta de linea y columna
 * - Conversor Base64 / Base64URL UTF-8
 * - Decodificador JWT offline (exp, iat, nbf, alg)
 * - Evaluacion y reporte SEO local
 */

function clamp01(val) {
  return val < 0 ? 0 : val > 1 ? 1 : val;
}

function linearToSrgbChannel(c) {
  const clamped = clamp01(c);
  if (clamped <= 0.0031308) {
    return 12.92 * clamped;
  }
  return 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function srgbToLinearChannel(c) {
  const clamped = clamp01(c);
  if (clamped <= 0.04045) {
    return clamped / 12.92;
  }
  return Math.pow((clamped + 0.055) / 1.055, 2.4);
}

function rgbNumbersToHex(r, g, b) {
  const toHexByte = (v) => {
    const clamped = Math.max(0, Math.min(255, Math.round(Number(v))));
    return clamped.toString(16).padStart(2, "0").toUpperCase();
  };
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function parseAlphaToken(token) {
  if (token === undefined || token === null) return 1;
  const clean = String(token).trim().toLowerCase();
  if (!clean) return 1;
  if (clean === "none") return 0;
  if (clean.endsWith("%")) {
    const num = parseFloat(clean.slice(0, -1));
    return Number.isFinite(num) ? num / 100 : NaN;
  }
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : NaN;
}

function parseCssAngleDeg(token) {
  const clean = String(token).trim().toLowerCase();
  if (clean === "none") return 0;
  const match = clean.match(/^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(deg|rad|grad|turn)?$/i);
  if (!match) return NaN;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return NaN;
  const unit = match[2] || "deg";
  switch (unit) {
    case "rad":
      return (value * 180) / Math.PI;
    case "grad":
      return value * 0.9;
    case "turn":
      return value * 360;
    default:
      return value;
  }
}

function parseCssNumberOrPercent(token, percentScale = 1) {
  const clean = String(token).trim().toLowerCase();
  if (clean === "none") return 0;
  if (clean.endsWith("%")) {
    const num = parseFloat(clean.slice(0, -1));
    return Number.isFinite(num) ? (num / 100) * percentScale : NaN;
  }
  const num = parseFloat(clean);
  return Number.isFinite(num) ? num : NaN;
}

function splitCssArgsAndAlpha(rawBody) {
  const slashIdx = rawBody.indexOf("/");
  let mainPart = rawBody;
  let alpha = 1;
  if (slashIdx !== -1) {
    mainPart = rawBody.slice(0, slashIdx);
    const alphaPart = rawBody.slice(slashIdx + 1).trim();
    alpha = parseAlphaToken(alphaPart);
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

  return rgbNumbersToHex(
    linearToSrgbChannel(rLin) * 255,
    linearToSrgbChannel(gLin) * 255,
    linearToSrgbChannel(bLin) * 255
  );
}

function hslToRgbNumbers(hDeg, sPct, lPct) {
  const h = ((hDeg % 360) + 360) % 360;
  const s = clamp01(sPct / 100);
  const l = clamp01(lPct / 100);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c; gp = x; bp = 0;
  } else if (h < 120) {
    rp = x; gp = c; bp = 0;
  } else if (h < 180) {
    rp = 0; gp = c; bp = x;
  } else if (h < 240) {
    rp = 0; gp = x; bp = c;
  } else if (h < 300) {
    rp = x; gp = 0; bp = c;
  } else {
    rp = c; gp = 0; bp = x;
  }

  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255
  };
}

/**
 * Normaliza un codigo hexadecimal (#RGB, #RGBA, #RRGGBB o #RRGGBBAA) a #RRGGBB en mayusculas.
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
  } else if (/^[0-9a-fA-F]{4}$/.test(cleaned)) {
    const a = parseInt(cleaned[3] + cleaned[3], 16);
    if (a <= 0) return null;
    cleaned = cleaned
      .slice(0, 3)
      .split("")
      .map((ch) => ch + ch)
      .join("");
  } else if (/^[0-9a-fA-F]{8}$/.test(cleaned)) {
    const a = parseInt(cleaned.slice(6, 8), 16);
    if (a <= 0) return null;
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
 * Convierte cualquier color CSS moderno (rgb/rgba, hsl/hsla, oklch, oklab, color(srgb|srgb-linear|display-p3), hex)
 * a #RRGGBB. Devuelve null si es invalido o totalmente transparente (alfa <= 0).
 * @param {string} cssColor
 * @returns {string|null}
 */
export function cssColorToHex(cssColor) {
  if (typeof cssColor !== "string") return null;
  const trimmed = cssColor.trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === "transparent") return null;

  if (trimmed.startsWith("#")) {
    return normalizeHex(trimmed);
  }

  const fnMatch = trimmed.match(/^([a-z0-9-]+)\((.*)\)$/i);
  if (!fnMatch) return null;
  const fnName = fnMatch[1].toLowerCase();
  const body = fnMatch[2].trim();

  if (fnName === "rgb" || fnName === "rgba") {
    const parsed = splitCssArgsAndAlpha(body);
    if (!parsed) return null;
    const { tokens } = parsed;
    let alpha = parsed.alpha;
    if (tokens.length === 4 && body.includes(",")) {
      alpha = parseAlphaToken(tokens[3]);
    } else if (tokens.length !== 3) {
      return null;
    }
    if (!Number.isFinite(alpha) || alpha <= 0) return null;

    const r = parseCssNumberOrPercent(tokens[0], 255);
    const g = parseCssNumberOrPercent(tokens[1], 255);
    const b = parseCssNumberOrPercent(tokens[2], 255);
    if (![r, g, b].every(Number.isFinite)) return null;
    return rgbNumbersToHex(r, g, b);
  }

  if (fnName === "hsl" || fnName === "hsla") {
    const parsed = splitCssArgsAndAlpha(body);
    if (!parsed) return null;
    const { tokens } = parsed;
    let alpha = parsed.alpha;
    if (tokens.length === 4 && body.includes(",")) {
      alpha = parseAlphaToken(tokens[3]);
    } else if (tokens.length !== 3) {
      return null;
    }
    if (!Number.isFinite(alpha) || alpha <= 0) return null;

    const h = parseCssAngleDeg(tokens[0]);
    const s = parseCssNumberOrPercent(tokens[1], 100);
    const l = parseCssNumberOrPercent(tokens[2], 100);
    if (![h, s, l].every(Number.isFinite)) return null;
    const rgb = hslToRgbNumbers(h, s, l);
    return rgbNumbersToHex(rgb.r, rgb.g, rgb.b);
  }

  if (fnName === "oklab") {
    const parsed = splitCssArgsAndAlpha(body);
    if (!parsed || parsed.tokens.length !== 3 || parsed.alpha <= 0) return null;
    const L = parseCssNumberOrPercent(parsed.tokens[0], 1);
    const a = parseCssNumberOrPercent(parsed.tokens[1], 0.4);
    const b = parseCssNumberOrPercent(parsed.tokens[2], 0.4);
    if (![L, a, b].every(Number.isFinite)) return null;
    return oklabToHex(L, a, b);
  }

  if (fnName === "oklch") {
    const parsed = splitCssArgsAndAlpha(body);
    if (!parsed || parsed.tokens.length !== 3 || parsed.alpha <= 0) return null;
    const L = parseCssNumberOrPercent(parsed.tokens[0], 1);
    const C = Math.max(0, parseCssNumberOrPercent(parsed.tokens[1], 0.4));
    const H = parseCssAngleDeg(parsed.tokens[2]);
    if (![L, C, H].every(Number.isFinite)) return null;
    const rad = (H * Math.PI) / 180;
    return oklabToHex(L, C * Math.cos(rad), C * Math.sin(rad));
  }

  if (fnName === "color") {
    const parsed = splitCssArgsAndAlpha(body);
    if (!parsed || parsed.tokens.length !== 4 || parsed.alpha <= 0) return null;
    const space = parsed.tokens[0].toLowerCase();
    const c1 = parseCssNumberOrPercent(parsed.tokens[1], 1);
    const c2 = parseCssNumberOrPercent(parsed.tokens[2], 1);
    const c3 = parseCssNumberOrPercent(parsed.tokens[3], 1);
    if (![c1, c2, c3].every(Number.isFinite)) return null;

    if (space === "srgb") {
      return rgbNumbersToHex(clamp01(c1) * 255, clamp01(c2) * 255, clamp01(c3) * 255);
    }
    if (space === "srgb-linear") {
      return rgbNumbersToHex(
        linearToSrgbChannel(c1) * 255,
        linearToSrgbChannel(c2) * 255,
        linearToSrgbChannel(c3) * 255
      );
    }
    if (space === "display-p3") {
      const rP3 = srgbToLinearChannel(c1);
      const gP3 = srgbToLinearChannel(c2);
      const bP3 = srgbToLinearChannel(c3);
      // Display P3 lineal -> CIE XYZ (D65) -> sRGB lineal (CSS Color 4)
      const X = 0.4865709486482162 * rP3 + 0.26566769316909306 * gP3 + 0.1982172852343625 * bP3;
      const Y = 0.2289745640697488 * rP3 + 0.6917385218365064 * gP3 + 0.079286914093745 * bP3;
      const Z = 0.0000000000000000 * rP3 + 0.04511338185890264 * gP3 + 1.043944368900976 * bP3;

      const rSrgb = 3.2409699419045213 * X - 1.5373831775700935 * Y - 0.4986107602930033 * Z;
      const gSrgb = -0.9692436362808798 * X + 1.8759675015077206 * Y + 0.04155505740717561 * Z;
      const bSrgb = 0.05563007969699361 * X - 0.20397695888897657 * Y + 1.0569715142428786 * Z;

      return rgbNumbersToHex(
        linearToSrgbChannel(rSrgb) * 255,
        linearToSrgbChannel(gSrgb) * 255,
        linearToSrgbChannel(bSrgb) * 255
      );
    }
  }

  return null;
}

/**
 * Alias retrocompatible para convertir un color CSS a #RRGGBB.
 * @param {string} cssColor
 * @returns {string|null}
 */
export function rgbCssToHex(cssColor) {
  return cssColorToHex(cssColor);
}

/**
 * Acepta HEX (con o sin #) o cualquier notacion CSS soportada y devuelve #RRGGBB.
 * @param {string} input
 * @returns {string|null}
 */
export function parseAnyColorToHex(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^#?[0-9a-fA-F]{3,8}$/.test(trimmed)) {
    return normalizeHex(trimmed);
  }
  return cssColorToHex(trimmed);
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
 * Calcula la luminancia relativa WCAG 2.1 (0 a 1) de un color RGB (0-255).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
export function getRelativeLuminance(r, g, b) {
  const rl = srgbToLinearChannel(r / 255);
  const gl = srgbToLinearChannel(g / 255);
  const bl = srgbToLinearChannel(b / 255);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/**
 * Calcula el ratio de contraste WCAG 2.1 entre dos colores HEX (1.00 a 21.00).
 * @param {string} fgHex
 * @param {string} bgHex
 * @returns {number|null}
 */
export function getContrastRatio(fgHex, bgHex) {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  if (!fg || !bg) return null;
  const l1 = getRelativeLuminance(fg.r, fg.g, fg.b);
  const l2 = getRelativeLuminance(bg.r, bg.g, bg.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Evalua cumplimiento WCAG AA/AAA (texto normal y texto grande).
 * @param {string} fgInput
 * @param {string} bgInput
 */
export function evaluateWcagContrast(fgInput, bgInput) {
  const fgHex = parseAnyColorToHex(fgInput);
  const bgHex = parseAnyColorToHex(bgInput);
  if (!fgHex || !bgHex) return null;
  const ratio = getContrastRatio(fgHex, bgHex);
  if (ratio === null) return null;

  const aaNormal = ratio >= 4.5;
  const aaaNormal = ratio >= 7.0;
  const aaLarge = ratio >= 3.0;
  const aaaLarge = ratio >= 4.5;

  let level = "Fail";
  if (aaaNormal) {
    level = "AAA";
  } else if (aaNormal) {
    level = "AA";
  } else if (aaLarge) {
    level = "AA Large";
  }

  return {
    fgHex,
    bgHex,
    ratio,
    ratioText: `${ratio.toFixed(2)}:1`,
    aaNormal,
    aaaNormal,
    aaLarge,
    aaaLarge,
    level
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
 * Localizador RFC 8259 del primer error de sintaxis JSON cuando V8 no incluye position/line.
 * @param {string} text
 * @returns {number|null}
 */
function locateJsonSyntaxError(text) {
  let pos = 0;
  const len = text.length;

  const skipWs = () => {
    while (pos < len) {
      const code = text.charCodeAt(pos);
      if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
        pos += 1;
      } else {
        break;
      }
    }
  };

  const failAt = (index = pos) => {
    throw { offset: Math.max(0, Math.min(len, index)) };
  };

  const parseString = () => {
    if (text[pos] !== '"') failAt();
    pos += 1;
    while (pos < len) {
      const ch = text[pos];
      const code = text.charCodeAt(pos);
      if (ch === '"') {
        pos += 1;
        return;
      }
      if (code < 0x20) {
        failAt(pos);
      }
      if (ch === "\\") {
        pos += 1;
        if (pos >= len) failAt(pos);
        const esc = text[pos];
        if ('"\\/bfnrt'.includes(esc)) {
          pos += 1;
        } else if (esc === "u") {
          pos += 1;
          for (let i = 0; i < 4; i += 1) {
            if (pos >= len || !/[0-9a-fA-F]/.test(text[pos])) failAt(pos);
            pos += 1;
          }
        } else {
          failAt(pos);
        }
      } else {
        pos += 1;
      }
    }
    failAt(pos);
  };

  const parseNumber = () => {
    if (text[pos] === "-") {
      pos += 1;
      if (pos >= len) failAt(pos);
    }
    if (text[pos] === "0") {
      pos += 1;
      if (pos < len && text[pos] >= "0" && text[pos] <= "9") failAt(pos);
    } else if (text[pos] >= "1" && text[pos] <= "9") {
      while (pos < len && text[pos] >= "0" && text[pos] <= "9") pos += 1;
    } else {
      failAt(pos);
    }
    if (text[pos] === ".") {
      pos += 1;
      if (pos >= len || text[pos] < "0" || text[pos] > "9") failAt(pos);
      while (pos < len && text[pos] >= "0" && text[pos] <= "9") pos += 1;
    }
    if (text[pos] === "e" || text[pos] === "E") {
      pos += 1;
      if (text[pos] === "+" || text[pos] === "-") pos += 1;
      if (pos >= len || text[pos] < "0" || text[pos] > "9") failAt(pos);
      while (pos < len && text[pos] >= "0" && text[pos] <= "9") pos += 1;
    }
  };

  const parseLiteral = (lit) => {
    for (let i = 0; i < lit.length; i += 1) {
      if (text[pos] !== lit[i]) failAt(pos);
      pos += 1;
    }
  };

  const parseValue = () => {
    skipWs();
    if (pos >= len) failAt(pos);
    const ch = text[pos];
    if (ch === "{") {
      pos += 1;
      skipWs();
      if (text[pos] === "}") {
        pos += 1;
        return;
      }
      while (true) {
        skipWs();
        if (text[pos] !== '"') failAt(pos);
        parseString();
        skipWs();
        if (text[pos] !== ":") failAt(pos);
        pos += 1;
        parseValue();
        skipWs();
        if (text[pos] === "}") {
          pos += 1;
          return;
        }
        if (text[pos] !== ",") failAt(pos);
        pos += 1;
      }
    } else if (ch === "[") {
      pos += 1;
      skipWs();
      if (text[pos] === "]") {
        pos += 1;
        return;
      }
      while (true) {
        parseValue();
        skipWs();
        if (text[pos] === "]") {
          pos += 1;
          return;
        }
        if (text[pos] !== ",") failAt(pos);
        pos += 1;
      }
    } else if (ch === '"') {
      parseString();
    } else if (ch === "t") {
      parseLiteral("true");
    } else if (ch === "f") {
      parseLiteral("false");
    } else if (ch === "n") {
      parseLiteral("null");
    } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
      parseNumber();
    } else {
      failAt(pos);
    }
  };

  try {
    parseValue();
    skipWs();
    if (pos < len) {
      return pos;
    }
    return null;
  } catch (err) {
    return typeof err?.offset === "number" ? err.offset : null;
  }
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
    let line = null;
    let column = null;

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
      } else {
        const offset = locateJsonSyntaxError(input);
        if (typeof offset === "number") {
          const coords = offsetToLineColumn(input, offset);
          line = coords.line;
          column = coords.column;
        }
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
 * Codifica texto UTF-8 a Base64 estandar o Base64URL (urlSafe=true).
 * @param {string} text
 * @param {{ urlSafe?: boolean }} [options]
 * @returns {string}
 */
export function encodeBase64Utf8(text, options = {}) {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const encoded = btoa(binary);
  if (options?.urlSafe) {
    return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return encoded;
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

    if (
      !header ||
      typeof header !== "object" ||
      Array.isArray(header) ||
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      return { ok: false, errorCode: "INVALID_STRUCTURE" };
    }

    const safeToIsoString = (sec) => {
      if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
      const ms = sec * 1000;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };

    const alg = typeof header.alg === "string" && header.alg.trim() ? header.alg.trim() : null;
    const isAlgNone = Boolean(alg && alg.toLowerCase() === "none");

    const claims = {
      expStatus: "none",
      nbfStatus: "none",
      tokenStatus: "none",
      exp: null,
      iat: null,
      nbf: null,
      expIso: null,
      iatIso: null,
      nbfIso: null
    };

    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      const expIso = safeToIsoString(payload.exp);
      if (expIso) {
        claims.exp = payload.exp;
        claims.expIso = expIso;
        claims.expStatus = payload.exp * 1000 < nowMs ? "expired" : "active";
      }
    }
    if (typeof payload.iat === "number" && Number.isFinite(payload.iat)) {
      const iatIso = safeToIsoString(payload.iat);
      if (iatIso) {
        claims.iat = payload.iat;
        claims.iatIso = iatIso;
      }
    }
    if (typeof payload.nbf === "number" && Number.isFinite(payload.nbf)) {
      const nbfIso = safeToIsoString(payload.nbf);
      if (nbfIso) {
        claims.nbf = payload.nbf;
        claims.nbfIso = nbfIso;
        claims.nbfStatus = payload.nbf * 1000 > nowMs ? "not_yet_valid" : "valid";
      }
    }

    if (claims.expStatus === "expired") {
      claims.tokenStatus = "expired";
    } else if (claims.nbfStatus === "not_yet_valid") {
      claims.tokenStatus = "not_yet_valid";
    } else if (claims.expStatus === "active") {
      claims.tokenStatus = "active";
    } else if (claims.nbfStatus === "valid") {
      claims.tokenStatus = "active";
    }

    return {
      ok: true,
      alg,
      isAlgNone,
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

/**
 * Evalua la longitud optima de metadatos SEO (por ejemplo title 30-60 o description 120-160).
 * @param {string} value
 * @param {number} minOptimal
 * @param {number} maxOptimal
 * @returns {{ length: number, status: "good"|"warn"|"bad" }}
 */
export function evaluateSeoLength(value, minOptimal, maxOptimal) {
  const clean = typeof value === "string" ? value.trim() : "";
  const length = clean.length;
  if (length === 0) {
    return { length: 0, status: "bad" };
  }
  if (length >= minOptimal && length <= maxOptimal) {
    return { length, status: "good" };
  }
  if (length < minOptimal) {
    return { length, status: "warn" };
  }
  return { length, status: "bad" };
}

/**
 * Genera un reporte SEO en texto plano listo para copiar al portapapeles.
 * @param {Record<string, any>|null} seo
 * @param {string} [pageUrl=""]
 * @returns {string}
 */
export function formatSeoReport(seo, pageUrl = "") {
  if (!seo || typeof seo !== "object") return "";
  const val = (v) => (typeof v === "string" && v.trim() ? v.trim() : "(missing)");
  const titleEval = evaluateSeoLength(seo.title, 30, 60);
  const descEval = evaluateSeoLength(seo.description, 120, 160);
  const h1Count = Number.isFinite(seo.h1Count) ? seo.h1Count : 0;
  const imgsTotal = Number.isFinite(seo.imagesTotal) ? seo.imagesTotal : 0;
  const imgsMissing = Number.isFinite(seo.imagesMissingAlt) ? seo.imagesMissingAlt : 0;
  const imgsEmpty = Number.isFinite(seo.imagesEmptyAlt) ? seo.imagesEmptyAlt : 0;

  const lines = [
    "# ChalaDev SEO Report",
    `URL: ${val(pageUrl)}`,
    `Title (${titleEval.length} chars, ${titleEval.status}, ideal 30-60): ${val(seo.title)}`,
    `Description (${descEval.length} chars, ${descEval.status}, ideal 120-160): ${val(seo.description)}`,
    `Canonical: ${val(seo.canonical)}`,
    `Robots: ${val(seo.robots)}`,
    `Viewport: ${val(seo.viewport)}`,
    `Lang / Charset: ${val(seo.lang)} / ${val(seo.charset)}`,
    `H1 Count: ${h1Count}${seo.h1Text ? ` (${seo.h1Text})` : ""}`,
    `Images: ${imgsTotal} total, ${imgsMissing} missing alt, ${imgsEmpty} empty alt=""`,
    `og:title: ${val(seo.ogTitle)}`,
    `og:description: ${val(seo.ogDescription)}`,
    `og:type: ${val(seo.ogType)}`,
    `og:url: ${val(seo.ogUrl)}`,
    `og:image: ${val(seo.ogImage)}`,
    `twitter:card: ${val(seo.twitterCard)}`,
    `twitter:title: ${val(seo.twitterTitle)}`,
    `twitter:description: ${val(seo.twitterDescription)}`,
    `twitter:image: ${val(seo.twitterImage)}`
  ];
  return lines.join("\n");
}

/**
 * Formatea una cantidad de bytes en B, KB, MB o GB.
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = num;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  const formatted = idx === 0 ? String(Math.round(val)) : val.toFixed(1).replace(/\.0$/, "");
  return `${formatted} ${units[idx]}`;
}

/**
 * Resume metricas agregadas de recursos cargados (PerformanceResourceTiming).
 * @param {Array<Record<string, any>>} resources
 */
export function summarizeNetworkResources(resources = []) {
  const list = Array.isArray(resources) ? resources : [];
  let totalTransferBytes = 0;
  let totalDecodedBytes = 0;
  let cachedCount = 0;
  let errorCount = 0;
  let slowestMs = 0;
  const byType = {};

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.initiatorType || "other").toLowerCase();
    byType[type] = (byType[type] || 0) + 1;

    const transfer = Number(item.transferSize);
    if (Number.isFinite(transfer) && transfer > 0) {
      totalTransferBytes += transfer;
    }
    const decoded = Number(item.decodedBodySize);
    if (Number.isFinite(decoded) && decoded > 0) {
      totalDecodedBytes += decoded;
    }
    const dur = Number(item.durationMs);
    if (Number.isFinite(dur) && dur > slowestMs) {
      slowestMs = Math.round(dur);
    }
    if (item.cached) {
      cachedCount += 1;
    }
    const status = Number(item.status);
    if (Number.isFinite(status) && status >= 400) {
      errorCount += 1;
    }
  }

  return {
    count: list.length,
    totalTransferBytes,
    totalDecodedBytes,
    cachedCount,
    errorCount,
    slowestMs,
    byType
  };
}

/**
 * Valida localmente un objeto Web App Manifest (PWA).
 * @param {Record<string, any>|null} manifest
 */
export function auditWebAppManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return {
      valid: false,
      summary: null,
      checks: [{ id: "json", status: "bad", detail: "Invalid manifest JSON" }]
    };
  }

  const name = typeof manifest.name === "string" ? manifest.name.trim() : "";
  const shortName = typeof manifest.short_name === "string" ? manifest.short_name.trim() : "";
  const startUrl = typeof manifest.start_url === "string" ? manifest.start_url.trim() : "";
  const display = typeof manifest.display === "string" ? manifest.display.trim().toLowerCase() : "";
  const themeColor = typeof manifest.theme_color === "string" ? manifest.theme_color.trim() : "";
  const backgroundColor =
    typeof manifest.background_color === "string" ? manifest.background_color.trim() : "";

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  let hasIcon192 = false;
  let hasIcon512 = false;
  let hasMaskable = false;

  for (const icon of icons) {
    if (!icon || typeof icon !== "object") continue;
    const purpose = String(icon.purpose || "").toLowerCase();
    if (purpose.includes("maskable")) {
      hasMaskable = true;
    }
    const sizesStr = String(icon.sizes || "").toLowerCase();
    if (sizesStr.includes("any")) {
      hasIcon192 = true;
      hasIcon512 = true;
    }
    for (const token of sizesStr.split(/\s+/)) {
      const m = token.match(/^(\d+)x(\d+)$/);
      if (m) {
        const w = Number(m[1]);
        const h = Number(m[2]);
        if (w >= 192 && h >= 192) hasIcon192 = true;
        if (w >= 512 && h >= 512) hasIcon512 = true;
      }
    }
  }

  const checks = [
    {
      id: "name",
      status: name || shortName ? "good" : "bad",
      detail: name || shortName || "Missing name / short_name"
    },
    {
      id: "start_url",
      status: startUrl ? "good" : "warn",
      detail: startUrl || "Missing start_url"
    },
    {
      id: "display",
      status: ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"].includes(display)
        ? "good"
        : "warn",
      detail: display || "Missing display"
    },
    {
      id: "icons",
      status: icons.length === 0 ? "bad" : hasIcon192 && hasIcon512 ? "good" : "warn",
      detail: `${icons.length} icons${hasIcon192 ? " · 192+" : ""}${hasIcon512 ? " · 512+" : ""}${hasMaskable ? " · maskable" : ""}`
    },
    {
      id: "theme_color",
      status: themeColor ? "good" : "warn",
      detail: themeColor || "Missing theme_color"
    }
  ];

  const valid = checks.every((c) => c.status !== "bad");

  return {
    valid,
    summary: {
      name,
      shortName,
      startUrl,
      display,
      themeColor,
      backgroundColor,
      iconCount: icons.length,
      hasIcon192,
      hasIcon512,
      hasMaskable
    },
    checks
  };
}

/**
 * Evalua la postura de seguridad de la pagina activa combinando DOM y cabeceras HTTP opcionales.
 * @param {Record<string, any>} secData
 * @param {Record<string, string>|null} [headers=null]
 */
export function evaluateSecurityAudit(secData = {}, headers = null) {
  const data = secData && typeof secData === "object" ? secData : {};
  let normalizedHeaders = null;
  if (headers && typeof headers === "object" && !Array.isArray(headers)) {
    normalizedHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      if (typeof v === "string") {
        normalizedHeaders[k.toLowerCase()] = v.trim();
      }
    }
  }

  const protocol = String(data.protocol || "").toLowerCase();
  const isHttps = protocol === "https:";
  const isSecureContext = Boolean(data.isSecureContext);
  const mixedCount = Array.isArray(data.mixedContent)
    ? data.mixedContent.length
    : Number(data.mixedContentCount || 0);
  const metaCsp = typeof data.metaCsp === "string" ? data.metaCsp.trim() : "";
  const metaReferrer = typeof data.metaReferrer === "string" ? data.metaReferrer.trim() : "";
  const externalScriptsTotal = Number(data.externalScriptsTotal || 0);
  const externalScriptsWithoutSri = Number(data.externalScriptsWithoutSri || 0);
  const iframesTotal = Number(data.iframesTotal || 0);
  const iframesWithoutSandbox = Number(data.iframesWithoutSandbox || 0);
  const unsafeTargetBlankLinks = Number(data.unsafeTargetBlankLinks || 0);
  const passwordFieldsOnHttp = Number(data.passwordFieldsOnHttp || 0);
  const insecureForms = Number(data.insecureForms || 0);
  const sensitiveKeys = Array.isArray(data.sensitiveStorageKeys) ? data.sensitiveStorageKeys : [];

  const checks = [];
  let score = 100;

  const pushCheck = (id, status, value, penalty = 0) => {
    checks.push({ id, status, value });
    score -= penalty;
  };

  // 1. HTTPS y Contexto Seguro
  if (isHttps && isSecureContext) {
    pushCheck("https", "good", "HTTPS · SecureContext");
  } else if (isSecureContext) {
    pushCheck("https", "warn", `${protocol || "local"} · SecureContext`, 7);
  } else {
    pushCheck("https", "bad", `${protocol || "http:"} · Insecure`, 25);
  }

  // 2. Contenido Mixto
  if (mixedCount === 0) {
    pushCheck("mixedContent", "good", "0");
  } else {
    pushCheck("mixedContent", "bad", String(mixedCount), 20);
  }

  // 3. Content Security Policy (HTTP header o <meta>)
  const headerCsp = normalizedHeaders?.["content-security-policy"] || "";
  const effectiveCsp = headerCsp || metaCsp;
  if (normalizedHeaders) {
    if (!effectiveCsp) {
      pushCheck("csp", "bad", "Missing", 18);
    } else if (/unsafe-inline|unsafe-eval/i.test(effectiveCsp)) {
      pushCheck("csp", "warn", effectiveCsp.slice(0, 120), 7);
    } else {
      pushCheck("csp", "good", effectiveCsp.slice(0, 120));
    }
  } else if (metaCsp) {
    if (/unsafe-inline|unsafe-eval/i.test(metaCsp)) {
      pushCheck("csp", "warn", metaCsp.slice(0, 120), 7);
    } else {
      pushCheck("csp", "good", metaCsp.slice(0, 120));
    }
  } else {
    pushCheck("csp", "info", "No <meta> CSP");
  }

  // 4-6. Cabeceras HTTP (cuando fueron auditadas bajo clic del usuario)
  if (normalizedHeaders) {
    const hstsVal = normalizedHeaders["strict-transport-security"] || "";
    if (!isHttps) {
      pushCheck("hsts", "info", "N/A (HTTP)");
    } else if (!hstsVal) {
      pushCheck("hsts", "bad", "Missing", 15);
    } else {
      const ageMatch = hstsVal.match(/max-age=(\d+)/i);
      const maxAge = ageMatch ? Number(ageMatch[1]) : 0;
      if (maxAge >= 15552000) {
        pushCheck("hsts", "good", hstsVal);
      } else {
        pushCheck("hsts", "warn", hstsVal, 6);
      }
    }

    const xfo = normalizedHeaders["x-frame-options"] || "";
    const hasFrameAncestors = /frame-ancestors\b/i.test(effectiveCsp);
    if (/^(deny|sameorigin)$/i.test(xfo) || hasFrameAncestors) {
      pushCheck("clickjacking", "good", xfo || "CSP frame-ancestors");
    } else {
      pushCheck("clickjacking", "warn", xfo || "Missing", 6);
    }

    const xcto = normalizedHeaders["x-content-type-options"] || "";
    if (xcto.toLowerCase().includes("nosniff")) {
      pushCheck("nosniff", "good", xcto);
    } else {
      pushCheck("nosniff", "warn", xcto || "Missing", 6);
    }
  }

  // 7. Referrer-Policy (Header o <meta>)
  const refVal = normalizedHeaders?.["referrer-policy"] || metaReferrer;
  if (refVal) {
    pushCheck("referrerPolicy", "good", refVal);
  } else if (normalizedHeaders) {
    pushCheck("referrerPolicy", "warn", "Missing", 5);
  } else {
    pushCheck("referrerPolicy", "info", "No <meta> referrer");
  }

  // 8. Permissions-Policy (si headers disponibles)
  if (normalizedHeaders) {
    const ppVal = normalizedHeaders["permissions-policy"] || "";
    if (ppVal) {
      pushCheck("permissionsPolicy", "good", ppVal.slice(0, 100));
    } else {
      pushCheck("permissionsPolicy", "info", "Missing");
    }
  }

  // 9. SRI en scripts externos
  if (externalScriptsWithoutSri > 0) {
    pushCheck("sri", "warn", `${externalScriptsWithoutSri}/${externalScriptsTotal}`, 6);
  } else {
    pushCheck("sri", "good", externalScriptsTotal > 0 ? `${externalScriptsTotal}/${externalScriptsTotal}` : "0");
  }

  // 10. Iframes sin sandbox
  if (iframesWithoutSandbox > 0) {
    pushCheck("iframes", "warn", `${iframesWithoutSandbox}/${iframesTotal}`, 6);
  } else {
    pushCheck("iframes", "good", "0");
  }

  // 11. Enlaces target="_blank" sin noopener/noreferrer
  if (unsafeTargetBlankLinks > 0) {
    pushCheck("targetBlank", "warn", String(unsafeTargetBlankLinks), 5);
  } else {
    pushCheck("targetBlank", "good", "0");
  }

  // 12. Formularios / campos password en HTTP
  if (passwordFieldsOnHttp > 0 || insecureForms > 0) {
    pushCheck(
      "formsAndPasswords",
      "bad",
      `pw:${passwordFieldsOnHttp} forms:${insecureForms}`,
      20
    );
  } else {
    pushCheck("formsAndPasswords", "good", "OK");
  }

  // 13. Claves potencialmente sensibles en Storage / Cookies JS (solo nombres, nunca valores)
  if (sensitiveKeys.length > 0) {
    pushCheck("sensitiveStorage", "warn", sensitiveKeys.slice(0, 6).join(", "), 7);
  } else {
    pushCheck("sensitiveStorage", "good", "0");
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const counts = { good: 0, warn: 0, bad: 0, info: 0 };
  for (const chk of checks) {
    if (chk.status in counts) {
      counts[chk.status] += 1;
    }
  }

  const level = finalScore >= 80 ? "good" : finalScore >= 50 ? "warn" : "bad";

  return {
    score: finalScore,
    level,
    headersAudited: Boolean(normalizedHeaders),
    counts,
    checks
  };
}

/**
 * Genera un reporte de seguridad en texto plano listo para copiar al portapapeles (sin exponer valores de storage).
 * @param {Record<string, any>|null} secData
 * @param {Record<string, string>|null} [headers=null]
 * @param {string} [pageUrl=""]
 * @returns {string}
 */
export function formatSecurityReport(secData, headers = null, pageUrl = "") {
  if (!secData || typeof secData !== "object") return "";
  const audit = evaluateSecurityAudit(secData, headers);
  const lines = [
    "# ChalaDev Security Overview Report",
    `URL: ${pageUrl || "(unknown)"}`,
    `Score: ${audit.score}/100 (${audit.level.toUpperCase()}) · Headers audited: ${audit.headersAudited ? "yes" : "no"}`,
    `Summary: ${audit.counts.good} good, ${audit.counts.warn} warnings, ${audit.counts.bad} risks`
  ];

  for (const chk of audit.checks) {
    lines.push(`- [${chk.status.toUpperCase()}] ${chk.id}: ${chk.value}`);
  }

  if (Array.isArray(secData.mixedContent) && secData.mixedContent.length > 0) {
    lines.push(`Mixed content URLs (${secData.mixedContent.length}): ${secData.mixedContent.slice(0, 5).join(", ")}`);
  }
  if (Array.isArray(secData.sensitiveStorageKeys) && secData.sensitiveStorageKeys.length > 0) {
    lines.push(`Sensitive JS storage/cookie key names (values omitted): ${secData.sensitiveStorageKeys.join(", ")}`);
  }

  return lines.join("\n");
}
