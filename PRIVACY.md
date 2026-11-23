# Política de privacidad de ChalaDev

*Última actualización: 21 de noviembre de 2026* · [English version below](#chaladev-privacy-policy)

ChalaDev es una extensión de navegador de código abierto perteneciente a la **Suite Chala** que reúne utilidades locales para desarrolladores y diseñadores UI/UX en el Panel Lateral (cuentagotas, contraste WCAG, inspector DOM, JSON/Base64/JWT offline, generador QR y auditoría SEO). Publicada por Joel Chala bajo la licencia MIT.

## Resumen

**ChalaDev no recopila, transmite, vende ni comparte ningún dato personal ni de navegación.** No tiene servidores propios, no incluye analíticas ni telemetría y no requiere crear una cuenta. Todo el procesamiento se ejecuta **100% en local** dentro de tu navegador.

## Qué datos se manejan y dónde

- **Historial de colores y pestaña activa:** únicamente se guardan en tu navegador mediante `chrome.storage.local` los últimos **12 colores** capturados o aplicados (`chaladev_color_history` y `chaladev_last_color`) y la última pestaña seleccionada en el panel (`chaladev_active_tab`). Puedes limpiar el historial en cualquier momento desde la propia interfaz o desinstalando la extensión.
- **Inspección de página, Red, Aplicación, Seguridad, JSON, Base64, JWT, QR y SEO:** todo ocurre en memoria dentro de tu dispositivo. Ningún JSON, token JWT, texto Base64, color, registro de red, almacenamiento local ni metadato de la pestaña activa sale de tu navegador ni se envía a servidores de terceros.
- **Imágenes y recursos SEO:** el auditor SEO únicamente lee texto y atributos presentes en el DOM (`og:image`, `twitter:image`, etiquetas `<img>`, etc.) sin descargar ni cargar imágenes remotas desde URLs externas.

## Conexiones de red

En su uso normal, ChalaDev **no realiza ninguna conexión a servidores externos** y no solicita `<all_urls>`, `debugger`, `webRequest` ni `cookies`.

Las únicas acciones de red que ocurren bajo petición directa tuya dentro de la extensión son:

- **Validar Manifest y Auditar cabeceras HTTP (opcional, bajo clic):** cuando pulsas explícitamente «Validar Manifest» o «Auditar cabeceras HTTP», la pestaña activa realiza una consulta `GET` o `HEAD` estrictamente al **mismo origen** de la página que ya estás viendo, sin contactar ningún servidor externo ni enviar datos de telemetría.
- **Repositorio de código abierto (GitHub) y enlaces de la Suite Chala:** abren las páginas de proyecto en GitHub. Aplica la política de privacidad de GitHub.
- **Donaciones (PayPal):** el botón «Donar vía PayPal» abre una página de PayPal. ChalaDev no recibe ni procesa datos de pago; aplica la política de privacidad de PayPal. Donar es opcional y no desbloquea ninguna función.

## Permisos que solicita la extensión

| Permiso | Para qué se usa |
|---|---|
| `sidePanel` | Mostrar la interfaz de herramientas de ChalaDev dentro del Panel Lateral de Google Chrome y Microsoft Edge |
| `activeTab` | Conceder acceso temporal bajo demanda a la pestaña activa únicamente cuando el usuario hace clic en el icono de la extensión |
| `scripting` | Inyectar bajo demanda el inspector DOM (`content/inspector.js`), el monitor ligero `fetch`/`XHR` (`content/net-monitor-*.js`) y leer localmente métricas de Red, Aplicación (Manifest, Storage, WebMCP), Seguridad y SEO en la pestaña activa |
| `storage` | Guardar localmente en `chrome.storage.local` el historial de los últimos 12 colores, el último color usado y la pestaña activa del panel |

ChalaDev **no** solicita `<all_urls>` ni `host_permissions`. Ninguno de los permisos solicitados se utiliza para recopilar o transmitir información.

## Cambios a esta política

Cualquier cambio se publicará en este mismo archivo; el historial completo es público en el [repositorio](https://github.com/joelchala/ChalaDev/commits/main/PRIVACY.md).

## Contacto

Para preguntas sobre privacidad escribe a <mailto:info@chaladev.site>, visita <https://chaladev.site/#privacidad> o abre un reporte en <https://github.com/joelchala/ChalaDev/issues>.

---

# ChalaDev Privacy Policy

*Last updated: November 21, 2026*

ChalaDev is an open-source browser extension from the **Chala Suite** providing local utilities for web developers and UI/UX designers in the browser Side Panel (EyeDropper, WCAG contrast checker, DOM inspector, offline JSON/Base64/JWT tools, local QR generator, and quick SEO audit). Published by Joel Chala under the MIT license.

## Summary

**ChalaDev does not collect, transmit, sell, or share any personal or browsing data.** It has no servers of its own, includes no analytics or telemetry, and requires no account. All processing runs **100% locally** inside your browser.

## What data is handled, and where

- **Color history and active tool tab:** only the last **12 captured or applied colors** (`chaladev_color_history` and `chaladev_last_color`) and the last selected panel tab (`chaladev_active_tab`) are stored locally in `chrome.storage.local`. You can clear your color history at any time from the UI or by uninstalling the extension.
- **Page inspection, Network, Application, Security, JSON, Base64, JWT, QR, and SEO:** all operations run locally in memory on your device. No JSON payloads, JWT tokens, Base64 strings, captured colors, network logs, storage entries, or page metadata ever leave your browser.
- **SEO metadata and images:** the SEO auditor only reads text and attributes already present in the active page DOM (such as `og:image`, `twitter:image`, and `<img>` alt attributes) without fetching or rendering remote images.

## Network connections

In normal use, ChalaDev **makes no connection to external servers** and requests no `<all_urls>`, `debugger`, `webRequest`, or `cookies` permissions.

The only network actions triggered by your own direct click are:

- **Validate Manifest & Audit HTTP Headers (optional, click-triggered):** when you explicitly click "Validate Manifest" or "Audit HTTP Headers", the active tab performs a `GET` or `HEAD` request strictly to the **same origin** of the page you are viewing, without contacting any external servers or sending telemetry.
- **GitHub repository & Chala Suite links:** open the project pages on GitHub. GitHub's privacy policy applies.
- **Donations (PayPal):** the "Donate via PayPal" button opens a PayPal page. ChalaDev does not receive or process payment data; PayPal's privacy policy applies. Donating is optional and unlocks no features.

## Permissions requested by the extension

| Permission | What it is used for |
|---|---|
| `sidePanel` | Rendering the ChalaDev tool suite inside the Chrome and Microsoft Edge Side Panel |
| `activeTab` | Granting temporary, on-demand access to the active tab only when you click the ChalaDev toolbar icon |
| `scripting` | Injecting the lightweight DOM inspector (`content/inspector.js`) and live `fetch`/`XHR` monitor (`content/net-monitor-*.js`) on demand, and reading local Network, Application (Manifest, Storage, WebMCP), Security, and SEO metrics from the active tab |
| `storage` | Storing the last 12 colors, last picked color, and active panel tab preference in `chrome.storage.local` |

ChalaDev does **not** request `<all_urls>` or `host_permissions`. None of the requested permissions is used to collect or transmit information.

## Changes to this policy

Any change will be published in this same file; the full history is public in the [repository](https://github.com/joelchala/ChalaDev/commits/main/PRIVACY.md).

## Contact

For privacy questions, email <mailto:info@chaladev.site>, visit <https://chaladev.site/#privacidad>, or open an issue at <https://github.com/joelchala/ChalaDev/issues>.
