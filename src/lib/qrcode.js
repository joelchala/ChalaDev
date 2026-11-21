/**
 * Generador de codigos QR 100% local (JavaScript puro, ISO/IEC 18004).
 * Soporta codificacion Byte UTF-8 para versiones 1 a 40 con correccion de errores Nivel M,
 * evaluacion de las 8 mascaras estandar, zona de silencio de 4 modulos y exportacion PNG/SVG.
 */

export const QR_MAX_VERSION = 40;
export const QR_QUIET_ZONE_MODULES = 4;

const ALIGNMENT_POSITIONS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90],
  21: [6, 28, 50, 72, 94],
  22: [6, 26, 50, 74, 98],
  23: [6, 30, 54, 78, 102],
  24: [6, 28, 54, 80, 106],
  25: [6, 32, 58, 84, 110],
  26: [6, 30, 58, 86, 114],
  27: [6, 34, 62, 90, 118],
  28: [6, 26, 50, 74, 98, 122],
  29: [6, 30, 54, 78, 102, 126],
  30: [6, 26, 52, 78, 104, 130],
  31: [6, 30, 56, 82, 108, 134],
  32: [6, 34, 60, 86, 112, 138],
  33: [6, 30, 58, 86, 114, 142],
  34: [6, 34, 62, 90, 118, 146],
  35: [6, 30, 54, 78, 102, 126, 150],
  36: [6, 24, 50, 76, 102, 128, 154],
  37: [6, 28, 54, 80, 106, 132, 158],
  38: [6, 32, 58, 84, 110, 136, 162],
  39: [6, 26, 54, 82, 110, 138, 166],
  40: [6, 30, 58, 86, 114, 142, 170]
};

// Tabla de bloques Reed-Solomon para Nivel M (ISO/IEC 18004):
// [ecPorBloque, g1Bloques, g1Datos, g2Bloques, g2Datos]
const RS_BLOCKS_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51],
  12: [22, 6, 36, 2, 37],
  13: [22, 8, 37, 1, 38],
  14: [24, 4, 40, 5, 41],
  15: [24, 5, 41, 5, 42],
  16: [28, 7, 45, 3, 46],
  17: [28, 10, 46, 1, 47],
  18: [26, 9, 43, 4, 44],
  19: [26, 3, 44, 11, 45],
  20: [26, 3, 41, 13, 42],
  21: [26, 17, 42, 0, 0],
  22: [28, 17, 46, 0, 0],
  23: [28, 4, 47, 14, 48],
  24: [28, 6, 45, 14, 46],
  25: [28, 8, 47, 13, 48],
  26: [28, 19, 46, 4, 47],
  27: [28, 22, 45, 3, 46],
  28: [28, 3, 45, 23, 46],
  29: [28, 21, 45, 7, 46],
  30: [28, 19, 47, 10, 48],
  31: [28, 2, 46, 29, 47],
  32: [28, 10, 46, 23, 47],
  33: [28, 14, 46, 21, 47],
  34: [28, 14, 46, 23, 47],
  35: [28, 12, 47, 26, 48],
  36: [28, 6, 47, 34, 48],
  37: [28, 29, 46, 14, 47],
  38: [28, 13, 46, 32, 47],
  39: [28, 40, 47, 7, 48],
  40: [28, 18, 47, 31, 48]
};

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function buildGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const factor = [1, GF_EXP[i]];
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      for (let k = 0; k < factor.length; k += 1) {
        next[j + k] ^= gfMul(poly[j], factor[k]);
      }
    }
    poly = next;
  }
  return poly;
}

function computeReedSolomon(dataBytes, ecCount) {
  const gen = buildGeneratorPoly(ecCount);
  const buffer = new Uint8Array(dataBytes.length + ecCount);
  buffer.set(dataBytes, 0);

  for (let i = 0; i < dataBytes.length; i += 1) {
    const coef = buffer[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j += 1) {
        buffer[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return buffer.slice(dataBytes.length);
}

function getTotalDataCodewords(version) {
  const [, g1B, g1D, g2B, g2D] = RS_BLOCKS_M[version];
  return g1B * g1D + g2B * g2D;
}

export function getQrCapacityInfo(version) {
  const [ecCount, g1B, g1D, g2B, g2D] = RS_BLOCKS_M[version];
  const dataCodewords = g1B * g1D + g2B * g2D;
  const totalCodewords = g1B * (g1D + ecCount) + g2B * (g2D + ecCount);
  const headerBytes = version <= 9 ? 2 : 3;
  return {
    version,
    size: version * 4 + 17,
    dataCodewords,
    totalCodewords,
    maxUtf8Bytes: dataCodewords - headerBytes
  };
}

function selectVersion(byteLength) {
  for (let v = 1; v <= QR_MAX_VERSION; v += 1) {
    const countBits = v <= 9 ? 8 : 16;
    const headerBits = 4 + countBits;
    const neededBits = headerBits + byteLength * 8;
    const maxBits = getTotalDataCodewords(v) * 8;
    if (neededBits <= maxBits) {
      return v;
    }
  }
  return -1;
}

function encodeDataCodewords(bytes, version) {
  const totalDataCw = getTotalDataCodewords(version);
  const totalDataBits = totalDataCw * 8;
  const bits = [];

  const pushBits = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) {
      bits.push((value >>> i) & 1);
    }
  };

  // Modo Byte (0100)
  pushBits(0b0100, 4);
  pushBits(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) {
    pushBits(b, 8);
  }

  // Terminador hasta 4 ceros
  const terminatorLen = Math.min(4, totalDataBits - bits.length);
  for (let i = 0; i < terminatorLen; i += 1) {
    bits.push(0);
  }

  // Alinear a byte
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let j = 0; j < 8; j += 1) {
      val = (val << 1) | bits[i + j];
    }
    codewords.push(val);
  }

  // Padding alternado 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (codewords.length < totalDataCw) {
    codewords.push(padBytes[padIdx % 2]);
    padIdx += 1;
  }

  return new Uint8Array(codewords);
}

function interleaveBlocks(dataCodewords, version) {
  const [ecCount, g1B, g1D, g2B, g2D] = RS_BLOCKS_M[version];
  const dataBlocks = [];
  const ecBlocks = [];

  let offset = 0;
  for (let i = 0; i < g1B; i += 1) {
    const block = dataCodewords.slice(offset, offset + g1D);
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecCount));
    offset += g1D;
  }
  for (let i = 0; i < g2B; i += 1) {
    const block = dataCodewords.slice(offset, offset + g2D);
    dataBlocks.push(block);
    ecBlocks.push(computeReedSolomon(block, ecCount));
    offset += g2D;
  }

  const result = [];
  const maxDataLen = Math.max(g1D, g2D);
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) result.push(block[i]);
    }
  }
  for (let i = 0; i < ecCount; i += 1) {
    for (const ec of ecBlocks) {
      result.push(ec[i]);
    }
  }
  return result;
}

function createMatrix(size, fillValue) {
  return Array.from({ length: size }, () => new Int8Array(size).fill(fillValue));
}

function drawFinderPattern(modules, isFunction, row, col) {
  const size = modules.length;
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const r = row + dy;
      const c = col + dx;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const inOuter = dy >= 0 && dy <= 6 && (dx === 0 || dx === 6);
      const inOuterH = dx >= 0 && dx <= 6 && (dy === 0 || dy === 6);
      const inInner = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      modules[r][c] = inOuter || inOuterH || inInner ? 1 : 0;
      isFunction[r][c] = 1;
    }
  }
}

function drawAlignmentPattern(modules, isFunction, centerRow, centerCol) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dist = Math.max(Math.abs(dy), Math.abs(dx));
      modules[centerRow + dy][centerCol + dx] = dist === 2 || dist === 0 ? 1 : 0;
      isFunction[centerRow + dy][centerCol + dx] = 1;
    }
  }
}

function getFormatBits(maskIndex) {
  // Nivel M = 0b00
  const data = (0b00 << 3) | (maskIndex & 7);
  let rem = data << 10;
  const gen = 0b10100110111;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rem >>> i) & 1) {
      rem ^= gen << (i - 10);
    }
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function drawFormatBits(modules, isFunction, maskIndex) {
  const size = modules.length;
  const bits = getFormatBits(maskIndex);

  const coordsA = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i += 1) {
    const bit = (bits >>> (14 - i)) & 1;
    const [r, c] = coordsA[i];
    modules[r][c] = bit;
    isFunction[r][c] = 1;
  }

  for (let i = 0; i < 7; i += 1) {
    const bit = (bits >>> (14 - i)) & 1;
    modules[size - 1 - i][8] = bit;
    isFunction[size - 1 - i][8] = 1;
  }
  for (let i = 7; i < 15; i += 1) {
    const bit = (bits >>> (14 - i)) & 1;
    modules[8][size - 15 + i] = bit;
    isFunction[8][size - 15 + i] = 1;
  }
}

function drawVersionBits(modules, isFunction, version) {
  if (version < 7) return;
  const size = modules.length;
  let rem = version << 12;
  const gen = 0b1111100100101;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rem >>> i) & 1) {
      rem ^= gen << (i - 12);
    }
  }
  const bits = (version << 12) | rem;

  for (let i = 0; i < 18; i += 1) {
    const bit = (bits >>> i) & 1;
    const a = Math.floor(i / 3);
    const b = size - 11 + (i % 3);
    modules[a][b] = bit;
    isFunction[a][b] = 1;
    modules[b][a] = bit;
    isFunction[b][a] = 1;
  }
}

function setupFunctionPatterns(version) {
  const size = version * 4 + 17;
  const modules = createMatrix(size, 0);
  const isFunction = createMatrix(size, 0);

  // Tres patrones buscadores + separadores
  drawFinderPattern(modules, isFunction, 0, 0);
  drawFinderPattern(modules, isFunction, 0, size - 7);
  drawFinderPattern(modules, isFunction, size - 7, 0);

  // Patrones de temporizacion
  for (let i = 8; i < size - 8; i += 1) {
    const val = i % 2 === 0 ? 1 : 0;
    modules[6][i] = val;
    isFunction[6][i] = 1;
    modules[i][6] = val;
    isFunction[i][6] = 1;
  }

  // Patrones de alineacion (omitiendo unicamente las 3 esquinas ocupadas por finder patterns)
  const alignPos = ALIGNMENT_POSITIONS[version] || [];
  const lastIdx = alignPos.length - 1;
  for (let i = 0; i < alignPos.length; i += 1) {
    for (let j = 0; j < alignPos.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === lastIdx) || (i === lastIdx && j === 0)) {
        continue;
      }
      drawAlignmentPattern(modules, isFunction, alignPos[i], alignPos[j]);
    }
  }

  // Modulo oscuro obligatorio
  modules[4 * version + 9][8] = 1;
  isFunction[4 * version + 9][8] = 1;

  // Reservar espacio de formato y version para que no se coloquen datos ahi
  drawFormatBits(modules, isFunction, 0);
  drawVersionBits(modules, isFunction, version);

  return { modules, isFunction };
}

function placeDataBits(modules, isFunction, codewords) {
  const size = modules.length;
  const allBits = [];
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b -= 1) {
      allBits.push((cw >>> b) & 1);
    }
  }

  let bitIndex = 0;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol -= 1; // Saltar columna de temporizacion
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let dx = 0; dx < 2; dx += 1) {
        const col = rightCol - dx;
        if (isFunction[row][col]) continue;
        modules[row][col] = bitIndex < allBits.length ? allBits[bitIndex] : 0;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function isMasked(maskIndex, r, c) {
  switch (maskIndex) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
    case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
    case 7: return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
    default: return false;
  }
}

function applyMask(baseModules, isFunction, maskIndex) {
  const size = baseModules.length;
  const masked = baseModules.map((row) => new Int8Array(row));
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!isFunction[r][c] && isMasked(maskIndex, r, c)) {
        masked[r][c] ^= 1;
      }
    }
  }
  drawFormatBits(masked, createMatrix(size, 0), maskIndex);
  return masked;
}

function computePenalty(matrix) {
  const size = matrix.length;
  let penalty = 0;

  // N1: 5 o mas modulos consecutivos del mismo color en filas y columnas
  for (let r = 0; r < size; r += 1) {
    let runColor = matrix[r][0];
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      if (matrix[r][c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }
  for (let c = 0; c < size; c += 1) {
    let runColor = matrix[0][c];
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      if (matrix[r][c] === runColor) {
        runLen += 1;
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5);
        runColor = matrix[r][c];
        runLen = 1;
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5);
  }

  // N2: Bloques 2x2 del mismo color
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const color = matrix[r][c];
      if (
        matrix[r][c + 1] === color &&
        matrix[r + 1][c] === color &&
        matrix[r + 1][c + 1] === color
      ) {
        penalty += 3;
      }
    }
  }

  // N3: Patrones parecidos a finder (1:1:3:1:1 con 4 blancos antes o despues)
  const checkLine = (getVal) => {
    for (let i = 0; i <= size - 11; i += 1) {
      const p1 =
        getVal(i) === 1 && getVal(i + 1) === 0 && getVal(i + 2) === 1 &&
        getVal(i + 3) === 1 && getVal(i + 4) === 1 && getVal(i + 5) === 0 &&
        getVal(i + 6) === 1 && getVal(i + 7) === 0 && getVal(i + 8) === 0 &&
        getVal(i + 9) === 0 && getVal(i + 10) === 0;
      const p2 =
        getVal(i) === 0 && getVal(i + 1) === 0 && getVal(i + 2) === 0 &&
        getVal(i + 3) === 0 && getVal(i + 4) === 1 && getVal(i + 5) === 0 &&
        getVal(i + 6) === 1 && getVal(i + 7) === 1 && getVal(i + 8) === 1 &&
        getVal(i + 9) === 0 && getVal(i + 10) === 1;
      if (p1 || p2) penalty += 40;
    }
  };
  for (let r = 0; r < size; r += 1) checkLine((c) => matrix[r][c]);
  for (let c = 0; c < size; c += 1) checkLine((r) => matrix[r][c]);

  // N4: Proporcion de modulos oscuros vs 50%
  let darkCount = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r][c] === 1) darkCount += 1;
    }
  }
  const percent = (darkCount * 100) / (size * size);
  const prev5 = Math.floor(percent / 5) * 5;
  const next5 = prev5 + 5;
  penalty += Math.min(Math.abs(prev5 - 50) / 5, Math.abs(next5 - 50) / 5) * 10;

  return penalty;
}

/**
 * Codifica texto UTF-8 en una matriz booleana/numerica QR lista para dibujar.
 * @param {string} text
 * @returns {{ ok: boolean, version?: number, size?: number, matrix?: Int8Array[], mask?: number, error?: string }}
 */
export function encodeQRMatrix(text) {
  if (typeof text !== "string" || !text.length) {
    return { ok: false, error: "EMPTY" };
  }

  const bytes = new TextEncoder().encode(text);
  const version = selectVersion(bytes.length);
  if (version === -1) {
    return { ok: false, error: "TOO_LONG" };
  }

  const dataCodewords = encodeDataCodewords(bytes, version);
  const finalCodewords = interleaveBlocks(dataCodewords, version);
  const { modules, isFunction } = setupFunctionPatterns(version);
  placeDataBits(modules, isFunction, finalCodewords);

  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestMatrix = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = applyMask(modules, isFunction, mask);
    const penalty = computePenalty(candidate);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestMatrix = candidate;
    }
  }

  return {
    ok: true,
    version,
    size: bestMatrix.length,
    mask: bestMask,
    matrix: bestMatrix
  };
}

/**
 * Dibuja el codigo QR en un elemento <canvas> con zona de silencio de 4 modulos (ISO/IEC 18004).
 * @param {HTMLCanvasElement} canvas
 * @param {string} text
 * @param {{ targetSize?: number, marginModules?: number, exactSize?: boolean, darkColor?: string, lightColor?: string }} [options]
 */
export function renderQRCode(canvas, text, options = {}) {
  const encoded = encodeQRMatrix(text);
  if (!encoded.ok) {
    return encoded;
  }

  const {
    targetSize = 240,
    marginModules = QR_QUIET_ZONE_MODULES,
    exactSize = false,
    darkColor = "#0F172A",
    lightColor = "#FFFFFF"
  } = options;

  const { size, matrix } = encoded;
  const totalModules = size + marginModules * 2;
  const modulePx = Math.max(1, Math.floor(targetSize / totalModules));
  const canvasPx = exactSize ? targetSize : totalModules * modulePx;
  const offsetPx = exactSize
    ? Math.floor((canvasPx - size * modulePx) / 2)
    : marginModules * modulePx;

  canvas.width = canvasPx;
  canvas.height = canvasPx;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, canvasPx, canvasPx);

  ctx.fillStyle = darkColor;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (matrix[r][c] === 1) {
        ctx.fillRect(
          offsetPx + c * modulePx,
          offsetPx + r * modulePx,
          modulePx,
          modulePx
        );
      }
    }
  }

  return { ...encoded, canvasPx, totalModules, marginModules };
}

/**
 * Genera una cadena SVG vectorial limpia y autonoma con zona de silencio de 4 modulos.
 * @param {string} text
 * @param {{ sizePx?: number, marginModules?: number, darkColor?: string, lightColor?: string }} [options]
 */
export function encodeQRSvg(text, options = {}) {
  const encoded = encodeQRMatrix(text);
  if (!encoded.ok) {
    return encoded;
  }

  const {
    sizePx = 512,
    marginModules = QR_QUIET_ZONE_MODULES,
    darkColor = "#0F172A",
    lightColor = "#FFFFFF"
  } = options;

  const { size, matrix, version } = encoded;
  const totalModules = size + marginModules * 2;
  const pathParts = [];

  for (let r = 0; r < size; r += 1) {
    let runStart = -1;
    for (let c = 0; c <= size; c += 1) {
      const isDark = c < size && matrix[r][c] === 1;
      if (isDark && runStart === -1) {
        runStart = c;
      } else if (!isDark && runStart !== -1) {
        const runLen = c - runStart;
        pathParts.push(`M${runStart + marginModules} ${r + marginModules}h${runLen}v1h-${runLen}z`);
        runStart = -1;
      }
    }
  }

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges">`,
    `<rect width="${totalModules}" height="${totalModules}" fill="${lightColor}"/>`,
    `<path fill="${darkColor}" d="${pathParts.join("")}"/>`,
    "</svg>"
  ].join("");

  return {
    ok: true,
    version,
    size,
    totalModules,
    marginModules,
    svg
  };
}
