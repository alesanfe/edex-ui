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
| P0-5 | CI multi-plataforma | ✅ | win/linux-x64/arm64/darwin x64+arm64 verdes; armv7l restaurado (system 7za) |
| P0-6 | Releases + checksums + SBOM | ✅ | `SHA256SUMS.txt` + CycloneDX SBOM en v3.0.0. Firma: se activa con secrets `CSC_*`/`APPLE_*` (pipeline ya lo soporta) |
| P0-7 | Tests mínimos | ✅ | `node --test`: 20 tests (CVE, SSH, workspaces, icons) |
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
| P1-8 | Wayland nativo | ◐ Electron 43 lo soporta vía ozone — pendiente verificación en Linux real |
| P1-9 | Polling configurable + pausa | ✅ `monitorPollScale` + pausable registry + pausa por modo/widget |
| P1-10 | Panel de puertos | ✅ |
| P1-11 | Temperaturas + discos | ◐ GPU/VRAM shipped (gpuinfo); temp/discos sin widget dedicado |

## P2 — Diferenciación

| # | Item | Estado |
|---|---|---|
| P2-1 | Modos inmersivo/productivo/ligero | ✅ hot-swap + capabilities (`docs/UI-MODES.md`) |
| P2-2 | Workspaces persistentes | ✅ modelo + CRUD + restauración segura |
| P2-3 | Monitor modular | ✅ widgets on/off + GPU + historial + alertas |
| P2-4 | Temas + importador | ◐ importador JSON con preview/revert + tema high-contrast; "marketplace" no aplica (nicho) |
| P2-5 | Perfiles por host/proyecto | ✅ SSH profiles + env + color + remoteDir |
| P2-6 | SQLite viewer | ✅ portado |
| P2-7 | Teclado táctil opcional | ✅ capability `keyboard` por modo |
| P2-8 | Plugins seguros | ◐ threat model escrito (`docs/design/PLUGIN-THREAT-MODEL.md`); API no implementada |
| P2-9 | Identidad visual por host | ✅ banner alias+target+env + acento por entorno |

## P3 — Experimentales

| # | Item | Estado |
|---|---|---|
| P3-1 | Asistencia IA | ◐ diseño (`docs/design/AI-INTEGRATION.md`): opt-in, local-first, sin exfiltración de scrollback |
| P3-2 | Vista topológica | ◻ |
| P3-3 | Paneles K8s/Docker | ◻ |
| P3-4 | Colaboración/sesiones remotas avanzadas | ◐ spike (`docs/design/REMOTE-SESSIONS.md`): argv-ssh shipped, ssh2 evaluado |
| P3-5 | Bloques estilo Warp | ◻ requiere shell integration |
| P3-6 | Shaders personalizables | ◻ |

## Anti-backlog (NO se construye)

- Motor de terminal propio / splits propios / protocolos de imagen → xterm5+addons.
- Monitor de precisión estilo btop → somos HUD, no herramienta de diagnóstico.
- Telemetría sin consentimiento → solo opt-in, documentada, eliminable.

## Deuda conocida post-3.0.0

- ◻ Smoke test de binarios instalados en macOS/Linux (Windows verificado).
- ◻ `P1-11`: widgets de temperatura/discos.
- ◻ `P1-8`: verificación Wayland.
- ◻ `P2-8`: API de plugins (tras threat model).
- ◻ Suites de test más amplias (hoy: 20 unit tests dirigidos).
