import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG, PAYPAL_DONATE_URL, isRestrictedUrl } from "../config.js";
import {
  normalizeHex,
  hexToRgb,
  rgbToHsl,
  rgbCssToHex,
  formatColorFormats,
  processJson,
  encodeBase64Utf8,
  decodeBase64Utf8,
  decodeJwtLocal
} from "../lib/utils.js";
import { encodeQRMatrix } from "../lib/qrcode.js";
import { registerBackgroundListeners } from "../background.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

let passed = 0;
function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === "function") {
      return res.then(() => {
        passed += 1;
        console.log(`  [PASS] ${name}`);
      });
    }
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    throw err;
  }
}

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(abs));
    } else if (entry.isFile() && /\.(m?js)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

async function main() {
  console.log("Running ChalaDev verification suite...\n");

  await test("Syntax check (node --check) for all JS/MJS files", () => {
    const files = collectJsFiles(ROOT);
    assert.ok(files.length >= 8, "Expected at least 8 JS/MJS files");
    for (const file of files) {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    }
  });

  await test("Manifest V3 permissions, entrypoints, and CSP compliance", () => {
    const manifestPath = path.join(ROOT, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.default_locale, "es");
    assert.deepEqual(manifest.permissions, ["sidePanel", "activeTab", "scripting", "storage"]);
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(manifest.side_panel?.default_path, "sidepanel/index.html");
    assert.equal(manifest.background?.service_worker, "background.js");
    assert.match(manifest.content_security_policy?.extension_pages || "", /script-src 'self'/);

    assert.ok(fs.existsSync(path.join(ROOT, manifest.side_panel.default_path)));
    assert.ok(fs.existsSync(path.join(ROOT, manifest.background.service_worker)));
    assert.ok(fs.existsSync(path.join(ROOT, "content/inspector.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "lib/qrcode.js")));
    assert.ok(fs.existsSync(path.join(ROOT, "lib/utils.js")));
  });

  await test("No remote code references in sidepanel HTML or extension scripts", () => {
    const html = fs.readFileSync(path.join(ROOT, "sidepanel/index.html"), "utf8");
    assert.ok(!/<script[^>]+src=["']https?:/i.test(html), "No remote script tags allowed");
    assert.ok(!/<link[^>]+href=["']https?:/i.test(html), "No remote stylesheet links allowed");

    for (const rel of ["background.js", "content/inspector.js", "lib/qrcode.js", "lib/utils.js"]) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.ok(!/https?:\/\//i.test(src), `Unexpected external URL in ${rel}`);
    }
  });

  await test("PNG icons exist and match declared IHDR dimensions", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    for (const [sizeStr, relPath] of Object.entries(manifest.icons)) {
      const size = Number(sizeStr);
      const buf = fs.readFileSync(path.join(ROOT, relPath));
      assert.ok(buf.subarray(0, 8).equals(pngSig), `${relPath} missing PNG signature`);
      assert.equal(buf.toString("ascii", 12, 16), "IHDR");
      assert.equal(buf.readUInt32BE(16), size, `${relPath} width mismatch`);
      assert.equal(buf.readUInt32BE(20), size, `${relPath} height mismatch`);
    }
  });

  await test("i18n locales (es & en) parity and sidepanel key coverage", () => {
    const es = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales/es/messages.json"), "utf8"));
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales/en/messages.json"), "utf8"));

    const esKeys = Object.keys(es).sort();
    const enKeys = Object.keys(en).sort();
    assert.deepEqual(esKeys, enKeys, "es and en locales must have identical keys");

    for (const key of esKeys) {
      assert.ok(es[key].message?.trim().length > 0, `es.${key} is empty`);
      assert.ok(en[key].message?.trim().length > 0, `en.${key} is empty`);
    }

    const html = fs.readFileSync(path.join(ROOT, "sidepanel/index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(ROOT, "sidepanel/app.js"), "utf8");

    const htmlKeys = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]);
    const jsKeys = [...appJs.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]);

    for (const key of new Set([...htmlKeys, ...jsKeys])) {
      assert.ok(key in es, `Missing es i18n key: ${key}`);
      assert.ok(key in en, `Missing en i18n key: ${key}`);
    }
  });

  await test("Config constants, PayPal link, palette, and restricted URL detection", () => {
    assert.equal(PAYPAL_DONATE_URL, "https://www.paypal.com/ncp/payment/9ZPGVEYNK89M6");
    assert.equal(CONFIG.PAYPAL_DONATE_URL, PAYPAL_DONATE_URL);
    assert.equal(CONFIG.MAX_COLOR_HISTORY, 12);
    assert.equal(CONFIG.COLORS.PRIMARY, "#10B981");
    assert.equal(CONFIG.COLORS.ACCENT, "#06B6D4");
    assert.equal(CONFIG.COLORS.BG_DARK, "#0F172A");
    assert.equal(CONFIG.COLORS.SURFACE, "#1E293B");
    assert.equal(CONFIG.COLORS.TEXT_MAIN, "#F8FAFC");

    assert.equal(isRestrictedUrl("chrome://extensions"), true);
    assert.equal(isRestrictedUrl("edge://settings/profiles"), true);
    assert.equal(isRestrictedUrl("about:blank"), true);
    assert.equal(isRestrictedUrl("devtools://devtools/bundled/inspector.html"), true);
    assert.equal(isRestrictedUrl("https://chromewebstore.google.com/detail/xyz"), true);
    assert.equal(isRestrictedUrl(""), true);
    assert.equal(isRestrictedUrl("http://localhost:5173/dashboard"), false);
    assert.equal(isRestrictedUrl("https://developer.mozilla.org/"), false);
  });

  await test("Color conversion utilities (HEX, RGB, HSL, CSS rgba)", () => {
    assert.equal(normalizeHex("#0f8"), "#00FF88");
    assert.equal(normalizeHex("10b981"), "#10B981");
    assert.deepEqual(hexToRgb("#06B6D4"), { r: 6, g: 182, b: 212 });
    assert.deepEqual(rgbToHsl(16, 185, 129), { h: 160, s: 84, l: 39 });

    const formatted = formatColorFormats("#10B981");
    assert.deepEqual(formatted, {
      hex: "#10B981",
      rgb: "rgb(16, 185, 129)",
      hsl: "hsl(160, 84%, 39%)"
    });

    assert.equal(rgbCssToHex("rgb(15, 23, 42)"), "#0F172A");
    assert.equal(rgbCssToHex("rgba(0, 0, 0, 0)"), null);
  });

  await test("JSON Formatter / Validator (2-space indent, minify, syntax coords)", () => {
    const formatted = processJson('{"b":2,"a":[1,true]}', "format");
    assert.equal(formatted.ok, true);
    assert.equal(formatted.output, '{\n  "b": 2,\n  "a": [\n    1,\n    true\n  ]\n}');
    assert.equal(formatted.typeLabel, "Object(2)");

    const minified = processJson('{\n  "ok": true\n}', "minify");
    assert.equal(minified.ok, true);
    assert.equal(minified.output, '{"ok":true}');

    const invalid = processJson('{\n  "a": 1,\n  "b": \n}', "validate");
    assert.equal(invalid.ok, false);
    assert.equal(invalid.empty, false);
    assert.ok(invalid.line >= 1 && invalid.column >= 1);

    const empty = processJson("   ", "format");
    assert.equal(empty.ok, false);
    assert.equal(empty.empty, true);
  });

  await test("Base64 UTF-8 encode/decode round-trip and JWT local decoder", () => {
    const sample = "¡Hola ChalaDev! Config: áéíóúñ & cian #06B6D4";
    const encoded = encodeBase64Utf8(sample);
    assert.equal(decodeBase64Utf8(encoded), sample);

    const toB64Url = (obj) =>
      encodeBase64Utf8(JSON.stringify(obj))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const nowSec = Math.floor(Date.now() / 1000);
    const activeToken = `${toB64Url({ alg: "HS256", typ: "JWT" })}.${toB64Url({
      sub: "user_42",
      name: "Joel Chala",
      exp: nowSec + 3600
    })}.fakeSignature123`;

    const decodedActive = decodeJwtLocal(activeToken, nowSec * 1000);
    assert.equal(decodedActive.ok, true);
    assert.equal(decodedActive.header.alg, "HS256");
    assert.equal(decodedActive.payload.name, "Joel Chala");
    assert.equal(decodedActive.claims.expStatus, "active");

    const expiredToken = `Bearer ${toB64Url({ alg: "RS256" })}.${toB64Url({
      exp: nowSec - 60
    })}.sig`;
    const decodedExpired = decodeJwtLocal(expiredToken, nowSec * 1000);
    assert.equal(decodedExpired.ok, true);
    assert.equal(decodedExpired.claims.expStatus, "expired");

    const invalidJwt = decodeJwtLocal("not.a.valid.jwt.token");
    assert.equal(invalidJwt.ok, false);
  });

  await test("Local QR generator produces valid matrices for short and long URLs", () => {
    const cases = [
      "https://github.com/joelchala/ChalaDev",
      "http://localhost:3000/api/v1/health?debug=true&theme=dark",
      "https://example.com/path/with/many/segments?" + "param=value&".repeat(22),
      "ChalaDev Escudo Cibernético Español UTF-8"
    ];

    for (const input of cases) {
      const qr = encodeQRMatrix(input);
      assert.equal(qr.ok, true, `Failed to encode QR for length ${input.length}`);
      assert.equal(qr.size, qr.version * 4 + 17);
      // Finder top-left 7x7 corners
      assert.equal(qr.matrix[0][0], 1);
      assert.equal(qr.matrix[0][6], 1);
      assert.equal(qr.matrix[6][0], 1);
      assert.equal(qr.matrix[6][6], 1);
      assert.equal(qr.matrix[1][1], 0);
      assert.equal(qr.matrix[3][3], 1);
      // Dark module
      assert.equal(qr.matrix[4 * qr.version + 9][8], 1);
    }

    const tooLong = encodeQRMatrix("x".repeat(1200));
    assert.equal(tooLong.ok, false);
    assert.equal(tooLong.error, "TOO_LONG");
  });

  await test("Background service worker handles chrome:// and edge:// cleanly without scripting errors", async () => {
    let messageHandler = null;
    let scriptingCalls = 0;

    globalThis.chrome = {
      sidePanel: { setPanelBehavior: async () => {} },
      runtime: {
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onMessage: { addListener: (fn) => { messageHandler = fn; } },
        sendMessage: async () => {}
      },
      tabs: {
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
        query: async () => [{ id: 7, url: "edge://settings/profiles", title: "Settings" }]
      },
      scripting: {
        executeScript: async () => {
          scriptingCalls += 1;
          return [];
        }
      }
    };

    registerBackgroundListeners();
    assert.equal(typeof messageHandler, "function");

    const ctxRes = await new Promise((resolve) => {
      messageHandler({ type: "CHALADEV_GET_TAB_CONTEXT" }, {}, resolve);
    });
    assert.equal(ctxRes.ok, false);
    assert.equal(ctxRes.restricted, true);
    assert.equal(ctxRes.reason, "RESTRICTED_URL");
    assert.equal(scriptingCalls, 0);

    const inspRes = await new Promise((resolve) => {
      messageHandler({ type: "CHALADEV_TOGGLE_INSPECTOR", active: true }, {}, resolve);
    });
    assert.equal(inspRes.ok, false);
    assert.equal(inspRes.restricted, true);
    assert.equal(scriptingCalls, 0);

    delete globalThis.chrome;
  });

  console.log(`\nAll ${passed} verification checks passed successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
