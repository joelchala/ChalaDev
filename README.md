<h1 align="center">
<img src="src/icons/icon.svg" height="56" width="56" alt="ChalaDev Logo">
<br>
ChalaDev
</h1>

<p align="center">
Suite de utilidades rápidas para desarrolladores web y diseñadores UI/UX en Chrome y Microsoft Edge.<br>
<strong>100% gratuita · 100% local · Manifest V3 · Código abierto (MIT)</strong>
</p>

<p align="center">
  <a href="https://microsoftedge.microsoft.com/addons/detail/chaladev-%E2%80%94-utilidades-web/bnebgppenkhencmjledfhbphbdmneogi">Microsoft Edge Add-ons</a> ·
  <a href="https://chaladev.site/">Portal Suite Chala</a> ·
  <a href="PRIVACY.md">Política de Privacidad</a> ·
  <a href="#instalación">Instalación</a> ·
  <a href="#módulos-incluidos">Módulos</a> ·
  <a href="https://www.paypal.com/ncp/payment/9ZPGVEYNK89M6">Donar vía PayPal</a>
</p>

- **Sitio oficial:** [chaladev.site](https://chaladev.site/) · **Contacto:** [info@chaladev.site](mailto:info@chaladev.site)

---

## Qué es ChalaDev

**ChalaDev** es una extensión **Manifest V3** integrada directamente en el **Panel Lateral (`chrome.sidePanel`)** de Google Chrome y Microsoft Edge. Te permite interactuar con la página web a la izquierda mientras utilizas herramientas visuales, formateadores y utilidades SEO a la derecha, sin enviar jamás un solo byte a servidores externos.

### Principios de Arquitectura y Privacidad
- **Cero código remoto:** Todo el código JavaScript (incluido el generador de códigos QR ISO/IEC 18004 en `src/lib/qrcode.js`) se ejecuta localmente cumpliendo las políticas CSP de Chrome Web Store y Edge Add-ons (`script-src 'self'; object-src 'self'`).
- **Permisos mínimos indispensables:** Solo solicita `"sidePanel"`, `"activeTab"`, `"scripting"` y `"storage"`. No solicita `<all_urls>` ni `host_permissions`.
- **Manejo limpio de páginas internas:** Detecta automáticamente URLs restringidas como `chrome://`, `edge://`, `about:` o tiendas de extensiones mostrando un aviso amigable sin arrojar errores en consola.
- **Bilingüe (`_locales`):** Español (`es`, predeterminado) e Inglés (`en`).

---

## Módulos incluidos

### 1. Inspector Visual y Color (Página Activa)
- **Cuentagotas, Selector Manual y Contraste WCAG:** Captura cualquier píxel en pantalla (`window.EyeDropper()`), ingresa colores manualmente (`#HEX`, `rgb()`, `hsl()`, `oklch()`, `color(srgb ...)`) o con selector nativo, copia **HEX**, **RGB** y **HSL** en un clic, guarda un historial local de los últimos **12 colores** y comprueba el ratio de contraste **WCAG 2.1 (AA / AAA)**.
- **Inspector de Tipografía y Caja (Hover DOM):** Interruptor bajo demanda que inyecta `src/content/inspector.js` sobre la pestaña activa (compatible con **Shadow DOM abierto** y **CSS Color 4**), con resaltado `#06B6D4` / `#10B981`, desactivación con `Esc` o al cerrar el Side Panel, mostrando:
  - Etiqueta HTML, dimensiones (`px`), `display`, `border-radius`, `padding` y `margin`
  - `font-family`, `font-size`, `font-weight`, `line-height`
  - Colores computados (con copia de **HEX limpio**, envío al historial y verificación directa de contraste WCAG)

### 2. Formateador y Decodificador Local
- **JSON Formatter / Validator:** Valida, formatea con indentación de 2 espacios o minifica JSON al instante, indicando línea y columna exactas incluso cuando el motor JS no las incluye en el mensaje de error.
- **Conversor Base64 / Base64URL (UTF-8):** Codifica y decodifica cadenas UTF-8 con opción **Base64URL** e intercambio de entrada/salida en un clic.
- **Decodificador JWT (100% Offline):** Auto-decodifica al pegar el **Header** y **Payload**, muestra insignia de algoritmo (`alg`, con alerta si es `none`), valida `exp` y `nbf`, y renderiza fechas legibles para `iat`, `nbf` y `exp` sin enviar tokens a ningún servidor.

### 3. QR y Vista Rápida SEO
- **Generador QR Local (`src/lib/qrcode.js`):** Soporta versiones **1 a 40** (hasta 2,331 bytes UTF-8) con zona de silencio ISO/IEC 18004 de **4 módulos**, vista previa de la pestaña activa, descarga en **PNG 512px**, **SVG** vectorial y copia directa de imagen al portapapeles.
- **Metadatos Rápidos SEO:** Inspecciona de un vistazo **Título** (semáforo 30–60), **Description** (semáforo 120–160), **Canonical**, **Robots**, **Viewport**, **Lang / Charset**, conteo de **H1**, imágenes sin `alt`, **OpenGraph** y **Twitter Cards** (solo texto, sin cargar imágenes remotas) y permite copiar el reporte SEO completo.

### 4. Red (Recursos y Monitor en Vivo)
- **Resumen de Performance API:** Lista recursos cargados con tipo (`fetch`, `script`, `css`, `img`), estado, protocolo, duración, caché y tamaño transferido, con filtros por tipo y búsqueda.
- **Monitor en Vivo (`fetch` / `XHR`):** Interruptor bajo demanda (`src/content/net-monitor-{main,bridge}.js`) que registra llamadas en tiempo real (máx. 100, con vista previa de texto/JSON y exportación JSON), desactivándose automáticamente al cerrar el Side Panel. Todo con permisos mínimos (sin `debugger`, sin `<all_urls>` ni captura TCP/Wireshark).

### 5. Aplicación (Manifest, WebMCP, Storage y Workers)
- **Web App Manifest (PWA):** Detecta `<link rel="manifest">` y valida bajo clic (same-origin) `name`, `start_url`, `display`, iconos 192/512 y `theme_color`.
- **WebMCP:** Detecta soporte de `navigator.modelContext`, herramientas registradas y formularios declarativos `form[toolname]`.
- **Storage y Service Workers:** Inspecciona uso/cuota (`navigator.storage.estimate()`), `localStorage`, `sessionStorage` (copia y eliminación segura), cookies accesibles a JS, bases `IndexedDB`, `Cache Storage` y `Service Workers`.

### 6. Seguridad (Security Overview)
- **Auditoría Local y Cabeceras HTTP:** Evalúa HTTPS / `isSecureContext`, contenido mixto, CSP, SRI en scripts externos, `iframe[sandbox]`, enlaces `target="_blank"`, formularios en HTTP y nombres de claves sensibles en JS Storage (sin exportar valores), además de auditoría `HEAD` same-origin bajo clic para HSTS, XFO, `nosniff`, Referrer-Policy y Permissions-Policy con puntaje `0–100` y reporte copiable.

---

## Arquitectura del Proyecto

```text
ChalaDev/
├── .github/workflows/
│   └── build.yml                  # Compilación y release automático en GitHub Actions
├── dist/
│   ├── README.md                  # Instrucciones de instalación desde dist/
│   ├── version                    # Versión de compilación (1.0.0)
│   └── build/                     # Salida generada por tools/make-mv3.mjs (gitignored)
├── docs/
│   ├── index.html                 # Página de documentación local
│   └── README.md
├── src/
│   ├── _locales/                  # Traducciones es (predeterminado) y en
│   ├── content/
│   │   ├── inspector.js           # Overlay DOM bajo demanda (Shadow DOM + CSS Color 4)
│   │   ├── net-monitor-bridge.js  # Puente ISOLATED para monitor fetch/XHR
│   │   └── net-monitor-main.js    # Monitor fetch/XHR en mundo MAIN bajo demanda
│   ├── icons/                     # Logotipo SVG e iconos PNG (16, 32, 48, 128)
│   ├── lib/
│   │   ├── qrcode.js              # Generador QR puro en JS (v1–40, PNG y SVG)
│   │   └── utils.js               # Colores + WCAG, JSON, Base64URL, JWT, SEO, Red, Manifest y Seguridad
│   ├── sidepanel/                 # Interfaz del Panel Lateral (index.html, styles.css, app.js)
│   ├── background.js              # Service worker MV3 (sidePanel + activeTab + lifecycle)
│   ├── config.js                  # Constantes, URLs restringidas y PAYPAL_DONATE_URL
│   └── manifest.json              # Manifiesto V3 con permisos mínimos
├── store/
│   ├── ficha-tienda.md            # Ficha lista para Microsoft Edge Add-ons
│   ├── ficha-chrome-web-store.md  # Ficha lista para Chrome Web Store
│   ├── logo-300x300.png           # Logo de tienda (300×300)
│   ├── promo-440x280.png          # Mosaico promocional (440×280)
│   ├── destacada-1400x560.png     # Banner destacado (1400×560)
│   ├── captura-1-visual-color.png # Captura 1280×800
│   ├── captura-2-json-jwt.png     # Captura 1280×800
│   ├── captura-3-qr-seo.png       # Captura 1280×800
│   ├── captura-4-red-app-seguridad.png # Captura 1280×800
│   └── paquetes/                  # ZIPs generados para tiendas (gitignored)
├── tests/
│   └── verify.mjs                 # Suite de verificación automatizada
├── tools/
│   ├── generate-icons.mjs         # Generador PNG nativo en Node.js
│   ├── make-mv3.mjs               # Empaquetador Chromium/Edge (.zip y unpacked)
│   ├── make-mv3.sh                # Wrapper Bash del empaquetador
│   └── make-clean.sh              # Limpieza de dist/build
├── LICENSE.txt                    # Licencia MIT
├── PRIVACY.md                     # Política de privacidad bilingüe (ES + EN)
├── package.json                   # Scripts build, icons y test (Node >=22)
└── README.md
```

---

## Instalación

- **Tienda oficial (Microsoft Edge Add-ons):** [ChalaDev — Utilidades web](https://microsoftedge.microsoft.com/addons/detail/chaladev-%E2%80%94-utilidades-web/bnebgppenkhencmjledfhbphbdmneogi)

Para instalación manual o desarrollo:

1. Descarga el paquete desde [Releases](https://github.com/joelchala/ChalaDev/releases) o compila localmente (ver abajo).
2. Abre `chrome://extensions` en Google Chrome o `edge://extensions` en Microsoft Edge.
3. Activa el **Modo de desarrollador** (*Developer mode*).
4. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona `dist/build/ChalaDev.chromium/` (o `src/`).
5. Haz clic en el icono de **ChalaDev** en la barra de herramientas para abrir el Panel Lateral.

---

## Compilar / Empaquetar y Pruebas

Requisitos: Node.js 22 o superior (sin dependencias externas de `npm`).

```bash
npm run build
npm test
```

También puedes usar el script Bash:

```bash
bash tools/make-mv3.sh
```

La compilación genera `dist/build/ChalaDev.chromium/` y los paquetes listos para tienda en `store/paquetes/ChalaDev_1.0.0.chromium.zip` y `store/paquetes/ChalaDev_1.0.0.edge.zip`.

---

## Versión y Compatibilidad (`v1.0.0`)

- **Versión actual:** `1.0.0` (Manifest V3).
- **Navegadores soportados:** **Google Chrome >= 116** y **Microsoft Edge >= 116** (requerido por `chrome.sidePanel.open()` a nivel de ventana y ejecución en `world: "MAIN"` bajo `activeTab`).
- **Entorno de compilación y pruebas:** **Node.js >= 22** (actualizado desde `>= 20`, sin dependencias externas).
- **Detección progresiva de APIs:** `window.EyeDropper()` y **WebMCP** (`navigator.modelContext`) se detectan de forma segura en tiempo de ejecución para mantener compatibilidad sin errores en navegadores o contextos donde no estén expuestos.

---

## Suite Chala y Donaciones

**ChalaDev** forma parte de la **Suite Chala** ([chaladev.site](https://chaladev.site/) · [info@chaladev.site](mailto:info@chaladev.site)) de herramientas de código abierto enfocadas en privacidad y productividad:
- **[Chalablock](https://github.com/joelchala/Chalablock)** — Bloqueador de anuncios y rastreadores ligero (Manifest V3)
- **[ChalaCookiesEdit](https://github.com/joelchala/ChalaCookiesEdit)** — Editor de cookies local con soporte CHIPS, incógnito, bloqueo e inspector JWT
- **[ChalaDev](https://github.com/joelchala/ChalaDev)** — Utilidades rápidas locales en el Panel Lateral
- **[ChalaReader](https://github.com/joelchala/ChalaReader)** — Modo lectura limpio con Shadow DOM, temas visuales, Markdown, PDF y guardado offline
- **[ChalaScrape](https://github.com/joelchala/ChalaScrape)** — Extractor visual de tablas, listas y tarjetas web a Excel (`.xlsx`) y CSV
- **[ChalaTabs](https://github.com/joelchala/ChalaTabs)** — Gestor de espacios de trabajo y ahorro de memoria RAM
- **[ChalaVPN](https://github.com/joelchala/ChalaVPN)** — Conectividad segura mediante proxy HTTPS/SOCKS5 con protección WebRTC

Si esta herramienta te ahorra tiempo en tu flujo de desarrollo o diseño, puedes apoyar su mantenimiento continuo:
- **[Donar vía PayPal](https://www.paypal.com/ncp/payment/9ZPGVEYNK89M6)** (configurable en `PAYPAL_DONATE_URL` dentro de `src/config.js`)

Licenciado bajo la licencia [MIT](LICENSE.txt).
