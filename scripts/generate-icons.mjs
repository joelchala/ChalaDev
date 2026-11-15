import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ICONS_DIR = path.resolve(__dirname, "..", "icons");

const SIZES = [16, 32, 48, 128];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter None
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0))
  ]);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function mixColor(c1, c2, t) {
  const k = clamp(t, 0, 1);
  return [
    c1[0] + (c2[0] - c1[0]) * k,
    c1[1] + (c2[1] - c1[1]) * k,
    c1[2] + (c2[2] - c1[2]) * k,
    c1[3] + (c2[3] - c1[3]) * k
  ];
}

function blendOver(dst, src, alpha) {
  const a = clamp(alpha * (src[3] / 255), 0, 1);
  if (a <= 0) return dst;
  const outA = a + dst[3] / 255 * (1 - a);
  if (outA <= 0) return [0, 0, 0, 0];
  const r = (src[0] * a + dst[0] * (dst[3] / 255) * (1 - a)) / outA;
  const g = (src[1] * a + dst[1] * (dst[3] / 255) * (1 - a)) / outA;
  const b = (src[2] * a + dst[2] * (dst[3] / 255) * (1 - a)) / outA;
  return [r, g, b, outA * 255];
}

function sdRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(px - cx) - (halfW - r);
  const dy = Math.abs(py - cy) - (halfH - r);
  const outDist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inDist = Math.min(Math.max(dx, dy), 0);
  return outDist + inDist - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const denom = bax * bax + bay * bay || 1;
  const h = clamp((pax * bax + pay * bay) / denom, 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function sdPolygon(px, py, poly) {
  let minDist = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = sdSegment(px, py, a[0], a[1], b[0], b[1]);
    if (d < minDist) minDist = d;
  }
  return pointInPoly(px, py, poly) ? -minDist : minDist;
}

function makeShieldPoly(cx, topY, halfW, midY, bottomY) {
  return [
    [cx, topY],
    [cx + halfW, topY + (midY - topY) * 0.3],
    [cx + halfW, midY],
    [cx + halfW * 0.72, midY + (bottomY - midY) * 0.56],
    [cx, bottomY],
    [cx - halfW * 0.72, midY + (bottomY - midY) * 0.56],
    [cx - halfW, midY],
    [cx - halfW, topY + (midY - topY) * 0.3]
  ];
}

const OUTER_SHIELD = makeShieldPoly(64, 16, 40, 62, 114);
const INNER_SHIELD = makeShieldPoly(64, 23, 33, 61, 106);

const COL_BG_1 = [15, 23, 42, 255];      // #0F172A
const COL_BG_2 = [30, 41, 59, 255];      // #1E293B
const COL_PRIMARY = [16, 185, 129, 255]; // #10B981
const COL_ACCENT = [6, 182, 212, 255];   // #06B6D4
const COL_TEXT = [248, 250, 252, 255];   // #F8FAFC

function coverage(dist, pxScale) {
  const aa = Math.max(0.85, pxScale * 0.75);
  return clamp(0.5 - dist / aa, 0, 1);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const pxScale = 128 / size;
  const strokeHalf = size <= 16 ? 4.4 : 3.2;
  const slashHalf = size <= 16 ? 3.8 : 2.8;
  const dotRadius = size <= 16 ? 4.5 : 3.9;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const ux = ((x + 0.5) / size) * 128;
      const uy = ((y + 0.5) / size) * 128;

      let color = [0, 0, 0, 0];

      // 1. Fondo redondeado Escudo Cibernetico
      const dBg = sdRoundedBox(ux, uy, 64, 64, 60, 60, 28);
      const aBg = coverage(dBg, pxScale);
      if (aBg > 0) {
        const bgGrad = mixColor(COL_BG_1, COL_BG_2, (ux + uy) / 256);
        color = blendOver(color, bgGrad, aBg);

        // Borde sutil del tile
        const dTileStroke = Math.abs(dBg) - 2.0;
        const aTileStroke = coverage(dTileStroke, pxScale) * aBg;
        if (aTileStroke > 0) {
          color = blendOver(color, COL_BG_2, aTileStroke);
        }
      }

      // 2. Escudo exterior degradado #10B981 -> #06B6D4
      const dOuter = sdPolygon(ux, uy, OUTER_SHIELD);
      const aOuter = coverage(dOuter, pxScale);
      if (aOuter > 0) {
        const shieldGrad = mixColor(COL_PRIMARY, COL_ACCENT, (ux + uy - 40) / 176);
        color = blendOver(color, shieldGrad, aOuter);
      }

      // 3. Nucleo del escudo #0F172A
      const dInner = sdPolygon(ux, uy, INNER_SHIELD);
      const aInner = coverage(dInner, pxScale);
      if (aInner > 0) {
        color = blendOver(color, COL_BG_1, aInner);
      }

      // 4. Simbolo </> dentro del escudo
      const dLeftTop = sdSegment(ux, uy, 51, 50, 39, 62);
      const dLeftBot = sdSegment(ux, uy, 39, 62, 51, 74);
      const dLeft = Math.min(dLeftTop, dLeftBot) - strokeHalf;
      const aLeft = coverage(dLeft, pxScale);
      if (aLeft > 0) {
        color = blendOver(color, COL_PRIMARY, aLeft);
      }

      const dRightTop = sdSegment(ux, uy, 77, 50, 89, 62);
      const dRightBot = sdSegment(ux, uy, 89, 62, 77, 74);
      const dRight = Math.min(dRightTop, dRightBot) - strokeHalf;
      const aRight = coverage(dRight, pxScale);
      if (aRight > 0) {
        color = blendOver(color, COL_ACCENT, aRight);
      }

      const dSlash = sdSegment(ux, uy, 68, 46, 60, 78) - slashHalf;
      const aSlash = coverage(dSlash, pxScale);
      if (aSlash > 0) {
        color = blendOver(color, COL_TEXT, aSlash);
      }

      // 5. Puntos de paleta inferior
      if (size >= 32) {
        const dots = [
          [52, 89, COL_PRIMARY],
          [64, 89, COL_ACCENT],
          [76, 89, COL_TEXT]
        ];
        for (const [dx, dy, dotCol] of dots) {
          const dDot = Math.hypot(ux - dx, uy - dy) - dotRadius;
          const aDot = coverage(dDot, pxScale);
          if (aDot > 0) {
            color = blendOver(color, dotCol, aDot);
          }
        }
      }

      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(clamp(color[0], 0, 255));
      rgba[idx + 1] = Math.round(clamp(color[1], 0, 255));
      rgba[idx + 2] = Math.round(clamp(color[2], 0, 255));
      rgba[idx + 3] = Math.round(clamp(color[3], 0, 255));
    }
  }

  return encodePng(size, size, rgba);
}

function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  for (const size of SIZES) {
    const outPath = path.join(ICONS_DIR, `icon${size}.png`);
    const pngBuffer = renderIcon(size);
    fs.writeFileSync(outPath, pngBuffer);
    console.log(`Generated ${path.relative(process.cwd(), outPath)} (${pngBuffer.length} bytes)`);
  }
}

main();
