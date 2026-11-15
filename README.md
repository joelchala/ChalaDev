<h1 align="center">
<img src="icons/icon.svg" height="56" width="56" alt="ChalaDev Logo">
<br>
ChalaDev
</h1>

<p align="center">
Suite de utilidades rápidas para desarrolladores web y diseñadores UI/UX en Chrome y Microsoft Edge.<br>
<strong>100% gratuita · 100% local · Manifest V3 · Código abierto (MIT)</strong>
</p>

<p align="center">
  <a href="PRIVACY.md">Política de Privacidad</a> ·
  <a href="#instalaci%C3%B3n-local-chrome-y-edge">Instalación</a> ·
  <a href="#m%C3%B3dulos-incluidos">Módulos</a> ·
  <a href="https://www.paypal.com/ncp/payment/9ZPGVEYNK89M6">Donar vía PayPal</a>
</p>

---

## Qué es ChalaDev

**ChalaDev** es una extensión **Manifest V3** integrada directamente en el **Panel Lateral (`chrome.sidePanel`)** de Google Chrome y Microsoft Edge. Te permite interactuar con la página web a la izquierda mientras utilizas herramientas visuales, formateadores y utilidades SEO a la derecha, sin enviar jamás un solo byte a servidores externos.

### Principios de Arquitectura y Privacidad
- **Cero código remoto:** Todo el código JavaScript (incluido el generador de códigos QR ISO/IEC 18004 en `lib/qrcode.js`) se ejecuta localmente cumpliendo las políticas CSP de Chrome Web Store y Edge Add-ons (`script-src 'self'; object-src 'self'`).
- **Permisos mínimos indispensables:** Solo solicita `"sidePanel"`, `"activeTab"`, `"scripting"` y `"storage"`. No solicita `<all_urls>` ni permisos invasivos.
- **Manejo limpio de páginas internas:** Detecta automáticamente URLs restringidas como `chrome://`, `edge://`, `about:` o tiendas de extensiones mostrando un aviso amigable sin arrojar errores en consola.
- **Bilingüe (`_locales`):** Español (`es`, predeterminado) e Inglés (`en`).

---

## Módulos incluidos

### 1. Inspector Visual y Color (Página Activa)
- **Cuentagotas de Pantalla (`window.EyeDropper()`):** Captura cualquier píxel en pantalla y muestra al instante su valor en **HEX**, **RGB** y **HSL**, con copia en un clic y un historial persistente local de los últimos **12 colores** capturados.
- **Inspector de Tipografía y Caja (Hover DOM):** Interruptor bajo demanda que inyecta `content/inspector.js` sobre la pestaña activa para resaltar elementos con borde `#06B6D4` (y fijarlos al hacer clic con `#10B981`, o salir con `Esc`), mostrando en tiempo real:
  - Etiqueta HTML y selector resumido
  - Dimensiones (`px`)
  - `font-family`, `font-size`, `font-weight`, `line-height`
  - Colores computados (`color` y `background-color` en HEX y RGB)

### 2. Formateador y Decodificador Local
- **JSON Formatter / Validator:** Valida, formatea con indentación de 2 espacios o minifica JSON al instante, indicando línea y columna exactas ante errores de sintaxis.
- **Conversor Base64 (UTF-8):** Codifica y decodifica cadenas UTF-8 (compatible con Base64 y Base64Url) e intercambia entrada/salida en un clic.
- **Decodificador JWT (100% Offline):** Decodifica localmente el **Header** y **Payload** de tokens JWT e inspecciona claims temporales (`exp`, `iat`, `nbf`) indicando si el token está vigente o expirado, sin enviar tokens a ningún servidor.

### 3. QR y Vista Rápida SEO
- **Generador QR Local (`lib/qrcode.js`):** Genera códigos QR limpios de forma automática para la URL de la pestaña activa (ideal para probar `localhost` o entornos de desarrollo en tu móvil) o cualquier texto/URL personalizado, con descarga directa en **PNG**.
- **Metadatos Rápidos:** Inspecciona de un vistazo **Título**, **Description** (con contador de caracteres), **Canonical** y etiquetas **OpenGraph** básicas (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`).

---

## Arquitectura del Proyecto

```text
ChalaDev/
├── _locales/
│   ├── en/messages.json       # Traducciones al inglés
│   └── es/messages.json       # Traducciones al español (predeterminado)
├── content/
│   └── inspector.js           # Overlay DOM ligero inyectado bajo demanda (activeTab)
├── icons/
│   ├── icon.svg               # Logotipo vectorial "Escudo Cibernético"
│   └── icon{16,32,48,128}.png # Iconos PNG generados localmente
├── lib/
│   ├── qrcode.js              # Generador QR puro en JS (sin dependencias remotas)
│   └── utils.js               # Conversión de colores, JSON, Base64 UTF-8 y JWT
├── scripts/
│   └── generate-icons.mjs     # Generador PNG nativo en Node.js
├── sidepanel/
│   ├── index.html             # Interfaz compacta de 3 pestañas + pie de comunidad
│   ├── styles.css             # Sistema visual Escudo Cibernético (#0F172A / #10B981 / #06B6D4)
│   └── app.js                 # Lógica de UI, EyeDropper, almacenamiento y mensajería
├── tests/
│   └── verify.mjs             # Verificación de sintaxis, manifest, PNGs y lógica pura
├── background.js              # Service worker MV3 (sidePanel + puente activeTab)
├── config.js                  # Constantes de marca, URLs restringidas y PAYPAL_DONATE_URL
├── manifest.json              # Manifiesto V3 con permisos mínimos
├── LICENSE                    # Licencia MIT
├── PRIVACY.md                 # Declaración de privacidad 100% local
└── README.md
```

---

## Instalación local (Chrome y Edge)

1. Clona o descarga este repositorio:
   ```bash
   git clone https://github.com/joelchala/ChalaDev.git
   ```
2. Abre `chrome://extensions` en Google Chrome o `edge://extensions` en Microsoft Edge.
3. Activa el **Modo de desarrollador** (*Developer mode*).
4. Haz clic en **Cargar descomprimida** (*Load unpacked*) y selecciona la carpeta raíz `ChalaDev`.
5. Haz clic en el icono de **ChalaDev** en la barra de herramientas para abrir el Panel Lateral sobre cualquier página web.

---

## Verificación y pruebas

Requisitos: Node.js 20 o superior (sin dependencias externas de `npm`).

```bash
npm test
```

El script `tests/verify.mjs` valida:
- Sintaxis JavaScript (`node --check`) en todos los archivos `.js` y `.mjs`.
- Estructura del `manifest.json`, permisos mínimos permitidos (`sidePanel`, `activeTab`, `scripting`, `storage`) y CSP estricta.
- Cabeceras e integridad dimensional de los iconos PNG (`16`, `32`, `48`, `128`).
- Paridad completa de claves entre `_locales/es/messages.json` y `_locales/en/messages.json`.
- Pruebas unitarias de conversión de colores, JSON Formatter/Validator, Base64 UTF-8, decodificador JWT offline, detección de URLs internas (`chrome://`, `edge://`) y generación de matrices QR (incluyendo recuento exacto de módulos en versiones 1–15).

---

## Suite Chala y Donaciones

**ChalaDev** forma parte de la **Suite Chala** de herramientas de código abierto enfocadas en privacidad y productividad:
- **Chalablock** — Bloqueador ligero enfocado en privacidad
- **ChalaVPN** — Conectividad segura sin rastreo
- **ChalaTabs** — Gestor de espacios de trabajo y ahorro de memoria RAM
- **ChalaDev** — Utilidades rápidas locales en el Panel Lateral

Si esta herramienta te ahorra tiempo en tu flujo de desarrollo o diseño, puedes apoyar su mantenimiento continuo:
- **[Donar vía PayPal](https://www.paypal.com/ncp/payment/9ZPGVEYNK89M6)** (configurable en `PAYPAL_DONATE_URL` dentro de `config.js`)

Licenciado bajo la licencia [MIT](LICENSE).
