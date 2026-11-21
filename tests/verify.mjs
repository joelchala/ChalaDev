import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONFIG, PAYPAL_DONATE_URL, isRestrictedUrl } from "../src/config.js";
import {
  normalizeHex,
  hexToRgb,
  rgbToHsl,
  rgbCssToHex,
  cssColorToHex,
  parseAnyColorToHex,
  formatColorFormats,
  getRelativeLuminance,
  getContrastRatio,
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
} from "../src/lib/utils.js";
import {
  QR_MAX_VERSION,
  QR_QUIET_ZONE_MODULES,
  getQrCapacityInfo,
  encodeQRMatrix,
  encodeQRSvg
} from "../src/lib/qrcode.js";
import { configureSidePanelBehavior, registerBackgroundListeners } from "../src/background.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

let passed = 0;
function test(name, fn) {
  try {
    const res = fn();
    if (res && typeof res.then === "function") {
      return res.then(() => {
        passed += 1;
        console.log(`  [PASS] ${name}`);
      }).catch((err) => {
        console.error(`  [FAIL] ${name}`);
        throw err;
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
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(abs));
    } else if (entry.isFile() && /\.(m?js)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function assertPngDimensions(filePath, expectedWidth, expectedHeight, requireNoAlpha = false) {
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(fs.existsSync(filePath), `Missing PNG file: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length > 26, `PNG too small: ${filePath}`);
  assert.ok(buf.subarray(0, 8).equals(pngSig), `${path.basename(filePath)} missing PNG signature`);
  assert.equal(buf.toString("ascii", 12, 16), "IHDR");
  assert.equal(buf.readUInt32BE(16), expectedWidth, `${path.basename(filePath)} width mismatch`);
  assert.equal(buf.readUInt32BE(20), expectedHeight, `${path.basename(filePath)} height mismatch`);
  if (requireNoAlpha) {
    assert.equal(buf[25], 2, `${path.basename(filePath)} must be 24-bit RGB without alpha (colorType=2)`);
  }
}

function assertValidZipPackage(zipPath) {
  assert.ok(fs.existsSync(zipPath), `Missing zip package: ${zipPath}`);
  const buf = fs.readFileSync(zipPath);
  assert.ok(buf.length > 1000, `Zip package too small: ${zipPath}`);
  assert.equal(buf.readUInt32LE(0), 0x04034b50, `Invalid ZIP local header signature: ${zipPath}`);
  assert.ok(buf.includes(Buffer.from("manifest.json", "utf8")), `Zip missing manifest.json: ${zipPath}`);
}

async function main() {
  console.log("Running ChalaDev verification suite...\n");

  await test("Syntax check (node --check) for all JS/MJS files in src/, tools/, and tests/", () => {
    const files = collectJsFiles(ROOT);
    assert.ok(files.length >= 9, "Expected at least 9 JS/MJS files");
    for (const file of files) {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    }
  });

  await test("Root directory layout matches ChalaTabs standard (no legacy MV3 files in root)", () => {
    const forbiddenAtRoot = [
      "manifest.json",
      "background.js",
      "config.js",
      "_locales",
      "content",
      "icons",
      "lib",
      "sidepanel",
      "scripts",
      "LICENSE"
    ];
    for (const item of forbiddenAtRoot) {
      assert.equal(fs.existsSync(path.join(ROOT, item)), false, `Legacy root item still present: ${item}`);
    }

    const requiredFiles = [
      "LICENSE.txt",
      "PRIVACY.md",
      "README.md",
      "package.json",
      ".gitignore",
      "dist/version",
      "dist/README.md",
      "docs/README.md",
      "docs/index.html",
      ".github/workflows/build.yml",
      "tools/make-mv3.mjs",
      "tools/make-mv3.sh",
      "tools/make-clean.sh",
      "tools/generate-icons.mjs"
    ];
    for (const rel of requiredFiles) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `Missing required project file: ${rel}`);
    }

    const privacyMd = fs.readFileSync(path.join(ROOT, "PRIVACY.md"), "utf8");
    assert.match(privacyMd, /Política de privacidad de ChalaDev/i);
    assert.match(privacyMd, /ChalaDev Privacy Policy/i);
    assert.match(privacyMd, /\|\s*`?sidePanel`?\s*\|/);
    assert.match(privacyMd, /\|\s*`?activeTab`?\s*\|/);
    assert.match(privacyMd, /\|\s*`?scripting`?\s*\|/);
    assert.match(privacyMd, /\|\s*`?storage`?\s*\|/);
  });

  await test("Manifest V3 permissions, entrypoints, and CSP compliance in src/", () => {
    const manifestPath = path.join(SRC, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.default_locale, "es");
    assert.deepEqual(manifest.permissions, ["sidePanel", "activeTab", "scripting", "storage"]);
    assert.equal(manifest.host_permissions, undefined);
    assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
    assert.equal(manifest.side_panel?.default_path, "sidepanel/index.html");
    assert.equal(manifest.background?.service_worker, "background.js");
    assert.match(manifest.content_security_policy?.extension_pages || "", /script-src 'self'/);

    assert.ok(fs.existsSync(path.join(SRC, manifest.side_panel.default_path)));
    assert.ok(fs.existsSync(path.join(SRC, manifest.background.service_worker)));
    assert.ok(fs.existsSync(path.join(SRC, "content/inspector.js")));
    assert.ok(fs.existsSync(path.join(SRC, "content/net-monitor-main.js")));
    assert.ok(fs.existsSync(path.join(SRC, "content/net-monitor-bridge.js")));
    assert.ok(fs.existsSync(path.join(SRC, "lib/qrcode.js")));
    assert.ok(fs.existsSync(path.join(SRC, "lib/utils.js")));
  });

  await test("No remote code references or remote images in src/", () => {
    const html = fs.readFileSync(path.join(SRC, "sidepanel/index.html"), "utf8");
    assert.ok(!/<script[^>]+src=["']https?:/i.test(html), "No remote script tags allowed");
    assert.ok(!/<link[^>]+href=["']https?:/i.test(html), "No remote stylesheet links allowed");
    assert.ok(!/<img[^>]+src=["']https?:/i.test(html), "No remote image tags allowed");

    for (const rel of [
      "background.js",
      "content/inspector.js",
      "content/net-monitor-main.js",
      "content/net-monitor-bridge.js",
      "lib/qrcode.js",
      "lib/utils.js",
      "sidepanel/app.js"
    ]) {
      const src = fs.readFileSync(path.join(SRC, rel), "utf8");
      const withoutSvgNs = src.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "");
      assert.ok(!/https?:\/\//i.test(withoutSvgNs), `Unexpected external URL in src/${rel}`);
    }
  });

  await test("Extension PNG icons exist in src/icons and match declared IHDR dimensions", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
    for (const [sizeStr, relPath] of Object.entries(manifest.icons)) {
      const size = Number(sizeStr);
      assertPngDimensions(path.join(SRC, relPath), size, size);
    }
  });

  await test("i18n locales (es & en) parity, store length limits (<= 132), and sidepanel coverage", () => {
    const es = JSON.parse(fs.readFileSync(path.join(SRC, "_locales/es/messages.json"), "utf8"));
    const en = JSON.parse(fs.readFileSync(path.join(SRC, "_locales/en/messages.json"), "utf8"));

    const esKeys = Object.keys(es).sort();
    const enKeys = Object.keys(en).sort();
    assert.deepEqual(esKeys, enKeys, "es and en locales must have identical keys");

    for (const key of esKeys) {
      assert.ok(es[key].message?.trim().length > 0, `es.${key} is empty`);
      assert.ok(en[key].message?.trim().length > 0, `en.${key} is empty`);
    }

    assert.ok(
      es.extDescription.message.length <= 132,
      `es.extDescription exceeds 132 chars (${es.extDescription.message.length})`
    );
    assert.ok(
      en.extDescription.message.length <= 132,
      `en.extDescription exceeds 132 chars (${en.extDescription.message.length})`
    );
    assert.ok(es.extName.message.length <= 45, `es.extName exceeds 45 chars`);
    assert.ok(en.extName.message.length <= 45, `en.extName exceeds 45 chars`);

    const html = fs.readFileSync(path.join(SRC, "sidepanel/index.html"), "utf8");
    const appJs = fs.readFileSync(path.join(SRC, "sidepanel/app.js"), "utf8");

    const htmlKeys = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]);
    const jsKeys = [...appJs.matchAll(/\bt\(\s*"([^"]+)"/g)].map((m) => m[1]);

    for (const key of new Set([...htmlKeys, ...jsKeys])) {
      assert.ok(key in es, `Missing es i18n key: ${key}`);
      assert.ok(key in en, `Missing en i18n key: ${key}`);
    }
  });

  await test("Build output (dist/), store packages (store/paquetes/*.zip), listings, and store PNG dimensions", () => {
    const fileVersion = fs.readFileSync(path.join(ROOT, "dist", "version"), "utf8").trim();
    assert.ok(fileVersion.length > 0, "dist/version must not be empty");
    const targetVersion = (process.env.VERSION || "").trim() || fileVersion;

    const builtManifestPath = path.join(ROOT, "dist", "build", "ChalaDev.chromium", "manifest.json");
    assert.ok(fs.existsSync(builtManifestPath), "Missing dist/build/ChalaDev.chromium/manifest.json");
    const builtManifest = JSON.parse(fs.readFileSync(builtManifestPath, "utf8"));
    assert.equal(builtManifest.version, targetVersion);

    const chromiumZip = path.join(ROOT, "store", "paquetes", `ChalaDev_${targetVersion}.chromium.zip`);
    const edgeZip = path.join(ROOT, "store", "paquetes", `ChalaDev_${targetVersion}.edge.zip`);
    assertValidZipPackage(chromiumZip);
    assertValidZipPackage(edgeZip);

    assert.ok(fs.existsSync(path.join(ROOT, "store", "ficha-tienda.md")), "Missing store/ficha-tienda.md");
    assert.ok(
      fs.existsSync(path.join(ROOT, "store", "ficha-chrome-web-store.md")),
      "Missing store/ficha-chrome-web-store.md"
    );

    assertPngDimensions(path.join(ROOT, "store", "logo-300x300.png"), 300, 300);
    assertPngDimensions(path.join(ROOT, "store", "promo-440x280.png"), 440, 280, true);
    assertPngDimensions(path.join(ROOT, "store", "destacada-1400x560.png"), 1400, 560, true);
    assertPngDimensions(path.join(ROOT, "store", "captura-1-visual-color.png"), 1280, 800, true);
    assertPngDimensions(path.join(ROOT, "store", "captura-2-json-jwt.png"), 1280, 800, true);
    assertPngDimensions(path.join(ROOT, "store", "captura-3-qr-seo.png"), 1280, 800, true);
    assertPngDimensions(path.join(ROOT, "store", "captura-4-red-app-seguridad.png"), 1280, 800, true);
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

  await test("Color conversion utilities (HEX, RGB, HSL, CSS Color 4) and WCAG 2.1 contrast", () => {
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
    assert.equal(cssColorToHex("hsl(160 84% 39%)"), "#10B77F");
    assert.equal(cssColorToHex("color(srgb 0.0627 0.7255 0.5059)"), "#10B981");
    assert.equal(cssColorToHex("color(display-p3 1 0 0)"), "#FF0000");
    assert.equal(cssColorToHex("oklch(0 0 0)"), "#000000");
    assert.equal(cssColorToHex("oklch(1 0 0)"), "#FFFFFF");
    assert.equal(parseAnyColorToHex("oklab(0.7 0.1 -0.05)") !== null, true);
    assert.equal(parseAnyColorToHex("not-a-color"), null);

    assert.equal(getRelativeLuminance(0, 0, 0), 0);
    assert.equal(Math.round(getRelativeLuminance(255, 255, 255) * 1000) / 1000, 1);
    assert.equal(getContrastRatio("#000000", "#FFFFFF"), 21);

    const wcagPass = evaluateWcagContrast("#10B981", "#0F172A");
    assert.ok(wcagPass.ratio > 7);
    assert.equal(wcagPass.aaNormal, true);
    assert.equal(wcagPass.aaaNormal, true);
    assert.equal(wcagPass.level, "AAA");

    const wcagFail = evaluateWcagContrast("#334155", "#1E293B");
    assert.equal(wcagFail.aaNormal, false);
    assert.equal(wcagFail.level, "Fail");
  });

  await test("JSON Formatter / Validator reports exact line/column even without V8 position", () => {
    const formatted = processJson('{"b":2,"a":[1,true]}', "format");
    assert.equal(formatted.ok, true);
    assert.equal(formatted.output, '{\n  "b": 2,\n  "a": [\n    1,\n    true\n  ]\n}');
    assert.equal(formatted.typeLabel, "Object(2)");

    const minified = processJson('{\n  "ok": true\n}', "minify");
    assert.equal(minified.ok, true);
    assert.equal(minified.output, '{"ok":true}');

    // Multiline error on line 4 column 1 (missing value before closing brace)
    const invalid = processJson('{\n  "a": 1,\n  "b": \n}', "validate");
    assert.equal(invalid.ok, false);
    assert.equal(invalid.empty, false);
    assert.equal(invalid.line, 4);
    assert.equal(invalid.column, 1);

    // Trailing comma error on line 3 column 3
    const trailingComma = processJson('{\n  "a": 1,\n  }', "validate");
    assert.equal(trailingComma.ok, false);
    assert.equal(trailingComma.line, 3);
    assert.equal(trailingComma.column, 3);

    const empty = processJson("   ", "format");
    assert.equal(empty.ok, false);
    assert.equal(empty.empty, true);
  });

  await test("Base64 / Base64URL UTF-8 encode/decode and JWT local decoder (exp, nbf, alg)", () => {
    const sample = "¡Hola ChalaDev! Config: áéíóúñ & cian #06B6D4";
    const encoded = encodeBase64Utf8(sample);
    assert.equal(decodeBase64Utf8(encoded), sample);

    const urlSafeInput = "subjects?_d=1+2/3== ñáé";
    const encodedUrl = encodeBase64Utf8(urlSafeInput, { urlSafe: true });
    assert.equal(/[+/=]/.test(encodedUrl), false, "Base64URL must omit +, / and =");
    assert.equal(decodeBase64Utf8(encodedUrl), urlSafeInput);

    const toB64Url = (obj) => encodeBase64Utf8(JSON.stringify(obj), { urlSafe: true });

    const nowSec = Math.floor(Date.now() / 1000);
    const activeToken = `${toB64Url({ alg: "HS256", typ: "JWT" })}.${toB64Url({
      sub: "user_42",
      name: "Joel Chala",
      iat: nowSec - 120,
      nbf: nowSec - 60,
      exp: nowSec + 3600
    })}.fakeSignature123`;

    const decodedActive = decodeJwtLocal(activeToken, nowSec * 1000);
    assert.equal(decodedActive.ok, true);
    assert.equal(decodedActive.alg, "HS256");
    assert.equal(decodedActive.isAlgNone, false);
    assert.equal(decodedActive.payload.name, "Joel Chala");
    assert.equal(decodedActive.claims.expStatus, "active");
    assert.equal(decodedActive.claims.nbfStatus, "valid");
    assert.equal(decodedActive.claims.tokenStatus, "active");
    assert.ok(decodedActive.claims.iatIso && decodedActive.claims.nbfIso && decodedActive.claims.expIso);

    const futureNbfToken = `${toB64Url({ alg: "none" })}.${toB64Url({
      nbf: nowSec + 600,
      exp: nowSec + 3600
    })}.`;
    const decodedFuture = decodeJwtLocal(futureNbfToken, nowSec * 1000);
    assert.equal(decodedFuture.ok, true);
    assert.equal(decodedFuture.isAlgNone, true);
    assert.equal(decodedFuture.claims.nbfStatus, "not_yet_valid");
    assert.equal(decodedFuture.claims.tokenStatus, "not_yet_valid");

    const expiredToken = `Bearer ${toB64Url({ alg: "RS256" })}.${toB64Url({
      exp: nowSec - 60
    })}.sig`;
    const decodedExpired = decodeJwtLocal(expiredToken, nowSec * 1000);
    assert.equal(decodedExpired.ok, true);
    assert.equal(decodedExpired.claims.expStatus, "expired");
    assert.equal(decodedExpired.claims.tokenStatus, "expired");

    const invalidJwt = decodeJwtLocal("not.a.valid.jwt.token");
    assert.equal(invalidJwt.ok, false);

    const primitiveJwt = `${toB64Url(123)}.${toB64Url("payload")}.sig`;
    const decodedPrim = decodeJwtLocal(primitiveJwt);
    assert.equal(decodedPrim.ok, false);
    assert.equal(decodedPrim.errorCode, "INVALID_STRUCTURE");

    const hugeExpJwt = `${toB64Url({ alg: "HS256" })}.${toB64Url({ exp: 1e20, iat: -1e20, nbf: 1e20 })}.sig`;
    const decodedHuge = decodeJwtLocal(hugeExpJwt);
    assert.equal(decodedHuge.ok, true);
    assert.equal(decodedHuge.claims.expIso, null);
    assert.equal(decodedHuge.claims.expStatus, "none");
    assert.equal(decodedHuge.claims.nbfStatus, "none");
    assert.equal(decodedHuge.claims.iatIso, null);
  });

  await test("SEO length evaluator and local report formatter", () => {
    assert.equal(evaluateSeoLength("", 30, 60).status, "bad");
    assert.equal(evaluateSeoLength("Short", 30, 60).status, "warn");
    assert.equal(evaluateSeoLength("ChalaDev — Local Web Utilities Suite", 30, 60).status, "good");
    assert.equal(evaluateSeoLength("A".repeat(75), 30, 60).status, "bad");

    const report = formatSeoReport(
      {
        title: "ChalaDev — Utilidades Web Locales",
        description: "A".repeat(130),
        canonical: "https://example.com/",
        robots: "index, follow",
        viewport: "width=device-width, initial-scale=1",
        lang: "es",
        charset: "UTF-8",
        h1Count: 1,
        h1Text: "ChalaDev",
        imagesTotal: 4,
        imagesMissingAlt: 1,
        imagesEmptyAlt: 0,
        ogTitle: "ChalaDev",
        ogImage: "https://example.com/og.png",
        twitterCard: "summary_large_image"
      },
      "https://example.com/"
    );
    assert.match(report, /ChalaDev SEO Report/);
    assert.match(report, /1 missing alt/);
    assert.match(report, /twitter:card: summary_large_image/);
  });

  await test("Network summary, Web App Manifest audit, Security Overview evaluation & report", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(1536), "1.5 KB");
    assert.equal(formatBytes(2 * 1024 * 1024), "2 MB");

    const netSum = summarizeNetworkResources([
      { initiatorType: "script", transferSize: 4000, decodedBodySize: 10000, durationMs: 42, cached: false, status: 200 },
      { initiatorType: "fetch", transferSize: 0, decodedBodySize: 500, durationMs: 120, cached: true, status: 404 }
    ]);
    assert.equal(netSum.count, 2);
    assert.equal(netSum.totalTransferBytes, 4000);
    assert.equal(netSum.cachedCount, 1);
    assert.equal(netSum.errorCount, 1);
    assert.equal(netSum.slowestMs, 120);
    assert.equal(netSum.byType.script, 1);

    const goodManifest = auditWebAppManifest({
      name: "Chala App",
      short_name: "Chala",
      start_url: "/",
      display: "standalone",
      theme_color: "#10B981",
      icons: [
        { src: "/192.png", sizes: "192x192", purpose: "any maskable" },
        { src: "/512.png", sizes: "512x512" }
      ]
    });
    assert.equal(goodManifest.valid, true);
    assert.equal(goodManifest.summary.hasIcon192, true);
    assert.equal(goodManifest.summary.hasIcon512, true);
    assert.equal(goodManifest.summary.hasMaskable, true);

    const badManifest = auditWebAppManifest({ display: "browser" });
    assert.equal(badManifest.valid, false);

    const cleanAudit = evaluateSecurityAudit(
      {
        protocol: "https:",
        isSecureContext: true,
        mixedContent: [],
        externalScriptsTotal: 1,
        externalScriptsWithoutSri: 0,
        iframesTotal: 1,
        iframesWithoutSandbox: 0,
        unsafeTargetBlankLinks: 0,
        passwordFieldsOnHttp: 0,
        insecureForms: 0,
        sensitiveStorageKeys: []
      },
      {
        "strict-transport-security": "max-age=31536000; includeSubDomains",
        "content-security-policy": "default-src 'self'",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
        "referrer-policy": "strict-origin-when-cross-origin",
        "permissions-policy": "geolocation=()"
      }
    );
    assert.equal(cleanAudit.score, 100);
    assert.equal(cleanAudit.level, "good");
    assert.equal(cleanAudit.headersAudited, true);

    const riskySecData = {
      protocol: "http:",
      isSecureContext: false,
      metaCsp: "default-src * 'unsafe-inline'",
      mixedContent: ["http://cdn.insecure.test/app.js"],
      externalScriptsTotal: 2,
      externalScriptsWithoutSri: 2,
      iframesTotal: 1,
      iframesWithoutSandbox: 1,
      unsafeTargetBlankLinks: 3,
      passwordFieldsOnHttp: 1,
      insecureForms: 1,
      sensitiveStorageKeys: ["localStorage:auth_token"]
    };
    const riskyAudit = evaluateSecurityAudit(riskySecData, null);
    assert.ok(riskyAudit.score < 50, `Expected low security score, got ${riskyAudit.score}`);
    assert.equal(riskyAudit.level, "bad");

    const secReport = formatSecurityReport(riskySecData, null, "http://demo.local/");
    assert.match(secReport, /ChalaDev Security Overview Report/);
    assert.match(secReport, /localStorage:auth_token/);
    assert.match(secReport, /cdn\.insecure\.test/);
  });

  await test("Local QR generator supports v1-v40, 4-module quiet zone, long URLs, and SVG export", () => {
    for (let v = 1; v <= QR_MAX_VERSION; v += 1) {
      const info = getQrCapacityInfo(v);
      assert.ok(info.maxUtf8Bytes > 0, `Invalid capacity at v${v}`);
      const payload = "A".repeat(info.maxUtf8Bytes);
      const qr = encodeQRMatrix(payload);
      assert.equal(qr.ok, true, `Failed max capacity for v${v}`);
      assert.equal(qr.version, v, `Expected version ${v} for ${info.maxUtf8Bytes} bytes`);
      assert.equal(qr.size, v * 4 + 17);
      assert.equal(qr.matrix[0][0], 1);
      assert.equal(qr.matrix[0][6], 1);
      assert.equal(qr.matrix[6][0], 1);
      assert.equal(qr.matrix[4 * v + 9][8], 1);
    }

    const longUrl = "https://example.com/search?" + "param=value&".repeat(120);
    const longQr = encodeQRMatrix(longUrl);
    assert.equal(longQr.ok, true);
    assert.ok(longQr.version > 15, `Expected QR version > 15 for long URL, got v${longQr.version}`);

    const svgRes = encodeQRSvg("https://github.com/joelchala/ChalaDev");
    assert.equal(svgRes.ok, true);
    assert.equal(svgRes.marginModules, QR_QUIET_ZONE_MODULES);
    assert.equal(QR_QUIET_ZONE_MODULES, 4);
    assert.ok(svgRes.svg.includes(`viewBox="0 0 ${svgRes.size + 8} ${svgRes.size + 8}"`));
    assert.ok(svgRes.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));

    const tooLong = encodeQRMatrix("x".repeat(2400));
    assert.equal(tooLong.ok, false);
    assert.equal(tooLong.error, "TOO_LONG");
  });

  await test("Background service worker: activeTab + window-scoped sidePanel, disconnect cleanup, and internal URLs", async () => {
    let messageHandler = null;
    let actionClickHandler = null;
    let connectHandler = null;
    let scriptingCalls = 0;
    let panelBehaviorArg = null;
    let openedPanelArgs = null;
    const sentTabMessages = [];
    const runtimeMessages = [];

    const scriptInjections = [];
    let inspectorInjected = false;
    let netBridgeInjected = false;

    globalThis.chrome = {
      sidePanel: {
        setPanelBehavior: async (arg) => {
          panelBehaviorArg = arg;
        },
        open: async (arg) => {
          openedPanelArgs = arg;
        }
      },
      runtime: {
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onConnect: { addListener: (fn) => { connectHandler = fn; } },
        onMessage: { addListener: (fn) => { messageHandler = fn; } },
        sendMessage: async (msg) => {
          runtimeMessages.push(msg);
        }
      },
      action: {
        onClicked: { addListener: (fn) => { actionClickHandler = fn; } }
      },
      tabs: {
        onActivated: { addListener: () => {} },
        onUpdated: { addListener: () => {} },
        onRemoved: { addListener: () => {} },
        query: async () => [{ id: 7, windowId: 99, url: "edge://settings/profiles", title: "Settings" }],
        sendMessage: async (tabId, msg) => {
          sentTabMessages.push({ tabId, msg });
          if (msg?.type === "CHALADEV_INSPECTOR_PING") {
            return { alive: inspectorInjected };
          }
          if (msg?.type === "CHALADEV_NET_MONITOR_PING") {
            return { alive: netBridgeInjected };
          }
          return { alive: true, active: msg.active ?? false, locked: false };
        }
      },
      scripting: {
        executeScript: async (opts) => {
          scriptingCalls += 1;
          scriptInjections.push(opts);
          if (opts?.files?.includes("content/inspector.js")) inspectorInjected = true;
          if (opts?.files?.includes("content/net-monitor-bridge.js")) netBridgeInjected = true;
          return [];
        }
      }
    };

    await configureSidePanelBehavior();
    assert.deepEqual(panelBehaviorArg, { openPanelOnActionClick: false });

    registerBackgroundListeners();
    assert.equal(typeof messageHandler, "function");
    assert.equal(typeof actionClickHandler, "function");
    assert.equal(typeof connectHandler, "function");

    // 1. Clicking toolbar icon opens sidePanel by windowId (not tabId) so it stays open across tab switches
    actionClickHandler({ id: 42, windowId: 99 });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(openedPanelArgs, { windowId: 99 });
    assert.ok(runtimeMessages.some((m) => m.type === "CHALADEV_TAB_UPDATED" && m.tabId === 42));

    // 2. Restricted internal URLs never invoke scripting
    const ctxRes = await new Promise((resolve) => {
      messageHandler({ type: "CHALADEV_GET_TAB_CONTEXT" }, {}, resolve);
    });
    assert.equal(ctxRes.ok, false);
    assert.equal(ctxRes.restricted, true);
    assert.equal(ctxRes.reason, "RESTRICTED_URL");
    assert.equal(scriptingCalls, 0);

    const inspRestricted = await new Promise((resolve) => {
      messageHandler({ type: "CHALADEV_TOGGLE_INSPECTOR", active: true }, {}, resolve);
    });
    assert.equal(inspRestricted.ok, false);
    assert.equal(inspRestricted.restricted, true);
    assert.equal(scriptingCalls, 0);

    // 3. Side Panel port disconnect disables active inspector & net monitor on the inspected tab
    globalThis.chrome.tabs.query = async () => [
      { id: 55, windowId: 99, url: "https://example.com/", title: "Example" }
    ];
    let disconnectCb = null;
    connectHandler({
      name: "chaladev-sidepanel",
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: (fn) => { disconnectCb = fn; } }
    });
    assert.equal(typeof disconnectCb, "function");

    const inspOn = await new Promise((resolve) => {
      messageHandler({ type: "CHALADEV_TOGGLE_INSPECTOR", active: true }, {}, resolve);
    });
    assert.equal(inspOn.ok, true);
    assert.equal(inspOn.active, true);

    const netOn = await new Promise((resolve) => {
      messageHandler({ type: "CHALADEV_TOGGLE_NET_MONITOR", active: true }, {}, resolve);
    });
    assert.equal(netOn.ok, true);
    assert.equal(netOn.active, true);
    assert.ok(
      scriptInjections.some((s) => s.world === "MAIN" && s.files?.includes("content/net-monitor-main.js")),
      "Net monitor must inject MAIN world interceptor"
    );
    assert.ok(
      scriptInjections.some((s) => s.world === "ISOLATED" && s.files?.includes("content/net-monitor-bridge.js")),
      "Net monitor must inject ISOLATED world bridge"
    );

    sentTabMessages.length = 0;
    disconnectCb();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(
      sentTabMessages.some(
        (entry) => entry.tabId === 55 && entry.msg?.type === "CHALADEV_INSPECTOR_SET" && entry.msg.active === false
      ),
      "Disconnecting Side Panel port must deactivate DOM inspector"
    );
    assert.ok(
      sentTabMessages.some(
        (entry) => entry.tabId === 55 && entry.msg?.type === "CHALADEV_NET_MONITOR_SET" && entry.msg.active === false
      ),
      "Disconnecting Side Panel port must deactivate live network monitor"
    );

    delete globalThis.chrome;
  });

  console.log(`\nAll ${passed} verification checks passed successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
