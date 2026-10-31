# Backlog tracker — xDEX-UI

Portado desde `edex-ui/docs/evaluation/10-feature-backlog.md` y actualizado al
estado real tras la release `v3.0.0`. Etiquetas: `P0 bloqueante` `P1 paridad`
`P2 diferenciación` `P3 experimental`. Estado: ✅ shipped · ◐ parcial · ◻ pendiente.

## P0 — Bloqueantes — ✅ todos shipped en 3.0.0

| # | Item | Estado | Nota |
|---|---|---|---|
| P0-1 | CVE-2023-30856 | ✅ | loopback-only + origen validado + 6 tests regresión (`src/tests/cve-2023-30856.test.js`) |
| P0-2 | Electron 12→43 | ✅ | 43.8.6, Chromium 150-class |
| P0-3 | contextIsolation + preload | ✅ | `nodeIntegration:false` + sandbox + shims `window.edex/fs/remote` |
| P0-4 | Sanear deps críticas | ✅ | 0 críticas/altas; sqlite3@6, overrides node-gyp/tar |
| P0-5 | CI multi-plataforma | ✅ | win/linux-x64/arm64/armv7l/darwin x64+arm64 verdes |
| P0-6 | Releases + checksums + SBOM | ✅ | `SHA256SUMS.txt` + CycloneDX SBOM en v3.0.0. Firma: se activa con secrets `CSC_*`/`APPLE_*` (pipeline ya lo soporta) |
| P0-7 | Tests mínimos | ✅ | `node --test`: 57 unit/module + 10 E2E Playwright (`src/tests/`) |
| P0-8 | SECURITY.md | ✅ | `SECURITY.md` + modelo de amenazas en `docs/design/PLUGIN-THREAT-MODEL.md` |

## P1 — Paridad

| # | Item | Estado |
|---|---|---|
| P1-1 | Restauración tabs+PTYs | ✅ |
| P1-2 | Ultrawide/DPI | ✅ |
| P1-3 | Proxy support | ✅ |
| P1-4 | Iconos FS | ✅ |
| P1-5 | macOS arm64 | ✅ (dmg publicado) |
| P1-6 | Búsqueda en terminal | ✅ `Ctrl+Shift+F`, barra flotante, Escape-safe |
| P1-7 | xterm.js 5 + WebGL | ✅ `@xterm/*` scoped + fallback canvas |
| P1-8 | Wayland nativo | ✅ auto-detect `XDG_SESSION_TYPE`/`WAYLAND_DISPLAY` → `ozone-platform-hint:auto` + `WaylandWindowDecorations` (`_boot.js`) |
| P1-9 | Polling configurable + pausa | ✅ `monitorPollScale` + pausable registry + pausa por modo/widget |
| P1-10 | Panel de puertos | ✅ |
| P1-11 | Temperaturas + discos | ✅ `gpuinfo` + `tempinfo` (si.cpuTemperature) + `diskinfo` (si.fsSize/diskLayout) |

## P2 — Diferenciación

| # | Item | Estado |
|---|---|---|
| P2-1 | Modos inmersivo/productivo/ligero | ✅ hot-swap + capabilities (`docs/UI-MODES.md`) |
| P2-2 | Workspaces persistentes | ✅ modelo + CRUD + restauración segura |
| P2-3 | Monitor modular | ✅ widgets on/off + GPU + historial + alertas |
| P2-4 | Temas + importador | ✅ importador JSON con validación+preview+revert + tema high-contrast ("marketplace" fuera de scope, nicho) |
| P2-5 | Perfiles por host/proyecto | ✅ SSH profiles + env + color + remoteDir |
| P2-6 | SQLite viewer | ✅ portado |
| P2-7 | Teclado táctil opcional | ✅ capability `keyboard` por modo |
| P2-8 | Plugins seguros | ✅ loader declarativo JSON-only (`plugins.js`): whitelist de métricas/campos, sin código arbitrario (threat model en `docs/design/`) |
| P2-9 | Identidad visual por host | ✅ banner alias+target+env + acento por entorno |

## P3 — Experimentales

| # | Item | Estado |
|---|---|---|
| P3-1 | Asistencia IA | ✅ opt-in local-first (`ai-assistant.js` + `edex:ai:chat`): validación endpoint, redacción de secretos, cap 32KiB |
| P3-2 | Vista topológica | ✅ `nettopo` canvas: conexiones agrupadas por host remoto |
| P3-3 | Paneles K8s/Docker | ✅ `dockinfo` (si.docker*) + contexto kubectl vía probe whitelisted `edex:probe` |
| P3-4 | Sesiones remotas avanzadas | ✅ argv-ssh + perfiles + identidad + `tmuxSession` attach-or-create (multiuser realtime: fuera de scope) |
| P3-5 | Bloques estilo Warp | ✅ OSC-133 markers → `commandMarkers` + navegación entre bloques |
| P3-6 | Shaders personalizables | ✅ `postfx` configurable: scanlines/glow/flicker 0-100 + reduced-motion |

## Anti-backlog (NO se construye)

- Motor de terminal propio / splits propios / protocolos de imagen → xterm5+addons.
- Monitor de precisión estilo btop → somos HUD, no herramienta de diagnóstico.
- Telemetría sin consentimiento → solo opt-in, documentada, eliminable.

## Verificación post-3.0.1

- ✅ Windows v3.0.1 instalado + lanzado: GeoIP cache en userData, terminal OK.
- ✅ Linux AppImage (xvfb): backend+frontend conectados, degradación WebGL.
- ⚠ macOS DMG: build verde en CI; ejecución instalada sin verificar (sin hardware/VM macOS en el entorno de desarrollo).
- ✅ Suite: 57 unit/module tests + 10 E2E (coverage ~86% líneas en módulos puros).
