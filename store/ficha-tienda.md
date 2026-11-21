# ChalaDev: ficha para Edge Add-ons

Material listo para copiar y pegar en **Microsoft Partner Center (Edge Add-ons)**. Sirve también para la Chrome Web Store, cambiando el paquete.

## 1. Packages (paquete)

| Tienda | Archivo a subir |
|---|---|
| Edge Add-ons | `store/paquetes/ChalaDev_1.0.0.edge.zip` |
| Chrome Web Store | `store/paquetes/ChalaDev_1.0.0.chromium.zip` |

Ambos se generan localmente con `node tools/make-mv3.mjs` o en GitHub Actions al publicar una etiqueta en <https://github.com/joelchala/ChalaDev/releases>.

## 2. Availability (disponibilidad)

- **Visibility:** Public
- **Markets:** todos

## 3. Properties (propiedades)

- **Category:** Developer Tools
- **Privacy policy requirements:** la extensión **no** accede, recopila ni transmite información personal → responder **No**
- **Privacy policy URL:** `https://github.com/joelchala/ChalaDev/blob/main/PRIVACY.md`
- **Website URL:** `https://github.com/joelchala/ChalaDev`
- **Support contact details:** `https://github.com/joelchala/ChalaDev/issues`
- **Mature content:** No

## 4. Privacy (privacidad)

**Single purpose (propósito único):**

> ChalaDev provides a local Side Panel toolkit for web developers and UI/UX designers featuring an EyeDropper with WCAG contrast checking, an on-demand DOM inspector, offline JSON/Base64URL/JWT utilities, a local QR & SEO inspector, plus lightweight Network, Application (Manifest/Storage/WebMCP), and Security Overview audits using minimal permissions.

**Justificación de permisos** (pegar en el campo de cada permiso):

| Permiso | Justificación |
|---|---|
| `sidePanel` | Displays the ChalaDev utility suite cleanly inside the browser Side Panel alongside the active web page. |
| `activeTab` | Grants temporary, user-initiated access to the currently active tab only when the user clicks the ChalaDev toolbar button, avoiding broad `<all_urls>` permissions. |
| `scripting` | Injects the lightweight on-demand DOM inspector (`content/inspector.js`) and optional fetch/XHR monitor (`content/net-monitor-*.js`), and reads local SEO, Network, Application (Manifest, Storage, WebMCP), and Security Overview metrics on the active tab. |
| `storage` | Saves the user's last 12 picked colors, last active color, and last selected tool tab locally in `chrome.storage.local`. |

**Remote code:** No. All code (including the ISO/IEC 18004 QR generator) is bundled locally inside the package.

**Data usage:** the extension does not collect or transmit any user data. No marcar ninguna categoría de datos y aceptar las tres declaraciones de cumplimiento.

## 5. Store listings (ficha)

Crear dos idiomas: **Spanish** y **English**. El nombre y la descripción corta se leen del paquete (`_locales`).

### Imágenes (carpeta `store/`)

| Campo | Archivo | Tamaño |
|---|---|---|
| Extension logo | `logo-300x300.png` | 300×300 |
| Small promotional tile | `promo-440x280.png` | 440×280 |
| Marquee promotional tile | `destacada-1400x560.png` | 1400×560 |
| Screenshots | `captura-1-visual-color.png`, `captura-2-json-jwt.png`, `captura-3-qr-seo.png`, `captura-4-red-app-seguridad.png` | 1280×800 |

### Descripción (español)

```
ChalaDev es una suite de utilidades web rápidas, gratuita y de código abierto en el Panel Lateral (Side Panel) para desarrolladores y diseñadores UI/UX en Chrome y Microsoft Edge, diseñada con procesamiento 100% local.

CARACTERÍSTICAS
• Cuentagotas, selector manual y contraste WCAG 2.1: captura colores con EyeDropper o introduce HEX, rgb(), hsl(), oklch() o color(srgb ...), copia HEX/RGB/HSL en un clic, guarda un historial local de 12 colores y evalúa contraste AA/AAA al instante.
• Inspector de Tipografía y Caja (DOM): inspección bajo demanda con soporte para Shadow DOM abierto y CSS Color 4; muestra dimensiones, display, padding, margin, border-radius, tipografía, copia de HEX limpio y contraste WCAG directo.
• JSON Formatter / Validator: formatea a 2 espacios, minifica y valida JSON con detección exacta de línea y columna.
• Conversor Base64 / Base64URL (UTF-8): codifica y decodifica cadenas UTF-8 con opción Base64URL e intercambio rápido.
• Decodificador JWT 100% Offline: auto-decodifica Header y Payload al pegar, muestra insignia de algoritmo (alg, alertando alg: none), valida exp y nbf, y muestra fechas legibles de iat/nbf/exp.
• Generador QR local (v1–v40): genera códigos QR ISO/IEC 18004 para la pestaña actual o cualquier texto (hasta 2,331 bytes UTF-8) con zona de silencio de 4 módulos, descarga en PNG 512px, SVG y copia de imagen.
• Metadatos Rápidos SEO: semáforo de longitud para Título (30–60) y Description (120–160), Canonical, Robots, Viewport, Lang/Charset, conteo H1, imágenes sin alt, OpenGraph, Twitter Cards y copia de reporte completo (sin cargar imágenes remotas).
• Red (Recursos y Monitor en Vivo): métricas de Performance API con filtros y monitor opcional de fetch/XHR en la pestaña activa con exportación JSON (sin permiso debugger).
• Aplicación (Manifest, WebMCP y Storage): validación same-origin de Web App Manifest, detección de navigator.modelContext / form[toolname], cuota, localStorage, sessionStorage, cookies JS, IndexedDB, Cache Storage y Service Workers.
• Seguridad (Security Overview): evaluación local 0–100 de HTTPS, contenido mixto, CSP, SRI, iframes sin sandbox, target="_blank", formularios, claves sensibles y auditoría HEAD same-origin de cabeceras HTTP.

PRIVACIDAD Y CÓDIGO ABIERTO
ChalaDev no recopila, transmite, vende ni comparte ningún dato personal ni de navegación. Solo solicita permisos mínimos (sidePanel, activeTab, scripting, storage), sin <all_urls> ni rastreadores.

Código fuente bajo licencia MIT: https://github.com/joelchala/ChalaDev
ChalaDev es 100% gratuito. Las donaciones por PayPal son opcionales y no desbloquean funciones.
```

### Description (English)

```
ChalaDev is a fast, free, open-source Side Panel utility suite for web developers and UI/UX designers in Chrome and Microsoft Edge, engineered for 100% local processing.

FEATURES
• Screen EyeDropper, Manual Color Picker & WCAG 2.1 Contrast: sample screen pixels or input HEX, rgb(), hsl(), oklch(), or color(srgb ...), copy HEX/RGB/HSL in one click, keep a local 12-color history, and verify AA/AAA contrast ratios.
• DOM Typography & Box Inspector: on-demand inspection with open Shadow DOM and CSS Color 4 support; view dimensions, display, padding, margin, border-radius, font metrics, clean HEX copy, and live WCAG contrast.
• JSON Formatter / Validator: pretty-print (2 spaces), minify, and validate JSON with accurate line and column error reporting.
• Base64 / Base64URL Converter (UTF-8): encode and decode UTF-8 text with URL-safe toggle and instant input/output swap.
• 100% Offline JWT Decoder: auto-decodes Header and Payload on paste, highlights the alg badge (warning on alg: none), validates exp and nbf, and displays readable iat/nbf/exp timestamps.
• Local QR Generator (v1–v40): offline ISO/IEC 18004 QR generator for the current tab or custom text (up to 2,331 UTF-8 bytes) with 4-module quiet zone, 512px PNG download, SVG export, and clipboard image copy.
• Quick SEO Metadata Audit: length traffic lights for Title (30–60) and Description (120–160), Canonical, Robots, Viewport, Lang/Charset, H1 count, missing img alt check, OpenGraph, Twitter Cards, and one-click report copy (without fetching remote images).
• Network (Resources & Live Monitor): Performance API resource breakdown with filters plus an optional on-demand fetch/XHR monitor with JSON export (no debugger permission required).
• Application (Manifest, WebMCP & Storage): same-origin Web App Manifest validation, navigator.modelContext / form[toolname] detection, storage quota, localStorage, sessionStorage, JS cookies, IndexedDB, Cache Storage, and Service Workers.
• Security Overview: local 0–100 audit for HTTPS, mixed content, CSP, SRI, unsandboxed iframes, target="_blank" links, HTTP forms, sensitive key names, and optional same-origin HEAD security header checks.

PRIVACY & OPEN SOURCE
ChalaDev does not collect, transmit, sell, or share any personal or browsing data. It uses only minimal permissions (sidePanel, activeTab, scripting, storage), with no <all_urls> and no trackers.

MIT open-source repository: https://github.com/joelchala/ChalaDev
ChalaDev is 100% free. Optional PayPal donations unlock no features.
```

### Search terms (máximo 7)

```
developer tools
color picker
wcag contrast
json formatter
jwt decoder
qr code generator
seo inspector
```

## 6. Notes for certification (notas para el revisor)

```
ChalaDev is a 100% free, open-source (MIT) Manifest V3 developer and UI/UX utility suite running in the Side Panel. Source code: https://github.com/joelchala/ChalaDev

No account or credentials are needed to test it.

How to test:
1. Open any regular website (e.g. https://example.com) and click the ChalaDev toolbar icon to grant activeTab and open the Side Panel.
2. In "Visual & Color", pick a color or enter a CSS color (e.g. oklch(0.7 0.15 160)), test WCAG contrast, and toggle "Inspect element" to hover/click elements (automatically turns off when closing the Side Panel or pressing Esc).
3. In "JSON / JWT", format/validate JSON, encode/decode Base64/Base64URL, and paste any JWT to inspect header, payload, alg, and readable iat/nbf/exp dates offline.
4. In "QR & SEO", export the active tab QR as 512px PNG or SVG, and review or copy the SEO metadata report.
5. In "Network", review loaded resources or toggle the live fetch/XHR capture; in "Application", inspect localStorage/sessionStorage/WebMCP/Service Workers or validate a same-origin manifest; in "Security", inspect the local Security Overview and optionally click "Audit HTTP Headers".

The extension uses only minimal permissions (sidePanel, activeTab, scripting, storage), has no <all_urls> or debugger permissions, contains no remote code, and makes zero automatic network requests (Manifest validation and HTTP header auditing are user-clicked same-origin requests only).
```

## Antes de enviar

- [ ] Subir `store/paquetes/ChalaDev_1.0.0.edge.zip` en **Packages**.
- [ ] Verificar que el nombre «ChalaDev» y la descripción corta (`<= 132` caracteres) aparezcan correctamente desde `_locales`.
- [ ] Subir las imágenes de `store/` (`logo-300x300.png`, `promo-440x280.png`, `destacada-1400x560.png`, `captura-1-visual-color.png`, `captura-2-json-jwt.png`, `captura-3-qr-seo.png`, `captura-4-red-app-seguridad.png`).
