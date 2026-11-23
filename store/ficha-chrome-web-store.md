# ChalaDev: ficha para Chrome Web Store

Material listo para pegar en <https://chrome.google.com/webstore/devconsole> (cuenta de desarrollador `info@chaladev.site`). Los textos largos de descripción son los mismos de [ficha-tienda.md](ficha-tienda.md), sección 5.

## 0. Antes de empezar

- En **Account**: correo de contacto `info@chaladev.site` verificado y declaración de **non-trader** (proyecto gratuito sin ventas).
- Si al subir el paquete aparece el diálogo **«Aceptar subidas de CRX verificadas»**, pulsar **Cancelar** si no deseas gestionar firma manual de CRX.

## 1. Package (paquete)

Subir `store/paquetes/ChalaDev_1.0.0.chromium.zip` (también disponible al crear releases en <https://github.com/joelchala/ChalaDev/releases>).

## 2. Store listing (ficha)

| Campo | Valor |
|---|---|
| Title / Summary | Se leen del paquete (`_locales`: «ChalaDev» y descripción corta `<= 132` caracteres) |
| Description | Texto en español de `ficha-tienda.md`; añadir English como segundo idioma |
| Category | **Productivity > Developer Tools** (o **Productivity > Workflow & Planning**) |
| Language | Español (añadir English como segundo idioma) |
| Store icon (128×128) | `src/icons/icon128.png` (y `store/logo-300x300.png` si se solicita logo de 300×300) |
| Screenshots (1280×800) | `captura-1-visual-color.png`, `captura-2-json-jwt.png`, `captura-3-qr-seo.png`, `captura-4-red-app-seguridad.png` |
| Small promo tile (440×280) | `promo-440x280.png` |
| Marquee promo tile (1400×560) | `destacada-1400x560.png` (opcional) |
| Official URL | Dejar en «None» |
| Homepage URL | `https://chaladev.site` (o `https://github.com/joelchala/ChalaDev`) |
| Support URL | `https://chaladev.site/#privacidad` (o `https://github.com/joelchala/ChalaDev/issues`) |
| Mature content | No |

## 3. Privacy practices (prácticas de privacidad)

**Single purpose:**

```
ChalaDev provides a local Side Panel toolkit for web developers and UI/UX designers: WCAG color picker, on-demand DOM inspector, offline JSON/Base64URL/JWT tools, local QR/SEO, and lightweight Network, Application (Manifest/Storage/WebMCP), and Security Overview audits.
```

**Permission justifications** (un campo por permiso):

| Permiso | Texto |
|---|---|
| `sidePanel` | Displays the ChalaDev utility suite inside the Chrome Side Panel alongside the active web page. |
| `activeTab` | Grants temporary, user-initiated access to the active tab only when the user clicks the ChalaDev toolbar icon, avoiding `<all_urls>`. |
| `scripting` | Injects the lightweight DOM inspector (`content/inspector.js`) and optional fetch/XHR monitor (`content/net-monitor-*.js`) on demand, and reads local SEO, Network, Application, and Security metrics on the active tab. |
| `storage` | Stores the user's last 12 colors, last picked color, and active panel tab locally in `chrome.storage.local`. Nothing leaves the device. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** no marcar ninguna categoría de datos. Marcar las tres certificaciones.

**Privacy policy URL:** `https://github.com/joelchala/ChalaDev/blob/main/PRIVACY.md`

## 4. Distribution (distribución)

- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

## 5. Test instructions (instrucciones de prueba)

Usuario y contraseña: dejar vacíos. Pegar en «Additional instructions» (menos de 500 caracteres):

```
No login needed.
1. Open any webpage and click the ChalaDev icon to grant activeTab and open the Side Panel.
2. Visual/Color: test WCAG & DOM inspector. JSON/JWT: format JSON, Base64URL, offline JWT.
3. QR/SEO: export 512px PNG/SVG & SEO report.
4. Network/App/Security: inspect resources or capture fetch/XHR, check Storage/WebMCP/Manifest & run Security Overview.
MIT open source, minimal permissions (no <all_urls>/debugger), no remote code.
Source: https://github.com/joelchala/ChalaDev
```
