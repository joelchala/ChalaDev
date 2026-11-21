# INSTALACIÓN (dist)

## Google Chrome / Microsoft Edge

1. Descarga y descomprime `ChalaDev_<version>.chromium.zip` (o `ChalaDev_<version>.edge.zip` desde [Releases](https://github.com/joelchala/ChalaDev/releases)), o ejecuta localmente:
   ```bash
   node tools/make-mv3.mjs
   ```
2. Abre `chrome://extensions/` en Chrome o `edge://extensions/` en Microsoft Edge.
3. Activa el **Modo de desarrollador**.
4. Haz clic en **Cargar descomprimida**.
5. Selecciona la carpeta `dist/build/ChalaDev.chromium/`.

## Cómo conservar tus colores guardados al actualizar manualmente

- Conserva la extensión cargada desde la misma ruta local y reemplaza únicamente el contenido de la carpeta cuando actualices manualmente para mantener `chrome.storage.local` (historial de 12 colores y pestaña activa).
