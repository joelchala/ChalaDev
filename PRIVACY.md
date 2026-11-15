# Política de Privacidad — ChalaDev

**Última actualización:** Noviembre 2026

ChalaDev es una extensión de código abierto perteneciente a la **Suite Chala** diseñada bajo una premisa estricta de **procesamiento 100% local**.

## 1. Datos que NO recopilamos
- **Cero telemetría y analíticas:** ChalaDev no incluye Google Analytics, rastreadores ni contadores de uso.
- **Cero transmisión externa:** Ningún código JSON, token JWT, texto Base64, color capturado, metadato de página o URL se envía a servidores propios ni de terceros.
- **Sin cuentas ni registro:** No se solicita correo electrónico, usuario ni clave de licencia.

## 2. Almacenamiento local (`chrome.storage.local`)
La extensión únicamente guarda en el almacenamiento local de tu navegador:
- Los últimos 12 códigos de color capturados con el cuentagotas (`chaladev_color_history` y `chaladev_last_color`).
- La última pestaña seleccionada dentro del panel lateral (`chaladev_active_tab`).

Puedes borrar el historial de colores en cualquier momento desde el botón **Limpiar** en la propia interfaz o desinstalando la extensión.

## 3. Justificación de permisos (Manifest V3)
ChalaDev solicita exclusivamente los permisos mínimos necesarios:
- `sidePanel`: Permite mostrar la interfaz de herramientas en el Panel Lateral de Chrome y Edge.
- `activeTab`: Otorga acceso temporal a la pestaña activa únicamente cuando haces clic en el icono de ChalaDev. No solicita `<all_urls>`.
- `scripting`: Inyecta bajo demanda el script ligero del inspector DOM (`content/inspector.js`) y lee metadatos SEO locales en la pestaña activa.
- `storage`: Guarda en local el historial de los últimos 12 colores y la preferencia de pestaña activa.

## 4. Código abierto
Todo el código fuente es auditable en el repositorio público bajo licencia MIT:
- [https://github.com/joelchala/ChalaDev](https://github.com/joelchala/ChalaDev)
