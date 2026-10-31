# Changelog

All notable changes to xDEX-UI are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [3.0.0] - First public release of the continuation

This release represents a major security and maintenance overhaul on top of the
`andreas-hartmann/xdex-ui` fork, plus ported fixes and features from the
original `GitSquared/edex-ui` issue and pull-request backlog.

### Security

- **Renderer fully isolated**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. The page has no `require`/`fs`/`process`/`ipcRenderer`/
  `@electron/remote` access; every privileged operation runs in the main process
  behind a whitelisted set of `edex:*` IPC handlers driven by `src/preload.js`.
- **CVE-2023-30856 mitigated + regression tests**: the PTY WebSocket only accepts
  loopback clients with `null`/`file://` origins, one client at a time.
- Strict CSP (`script-src file:`, no inline handlers), navigation lockdown,
  drag-and-drop navigation disabled, all web permission requests denied,
  `shell.openExternal` restricted to `https?://`.
- Dependency tree sanitized: **0 critical / 0 high** advisories on both
  `npm audit` trees (Electron 43.8.6, sqlite3@6, node-gyp/tar overrides).

### Added

- Windows process-tree discovery (terminal tab titles show the foreground
  process, matching Linux/macOS behavior).
- SQLite database browser (ported from edex-ui PR #967).
- Open Ports monitor module (ported from edex-ui PR #853).
- HTTP proxy support for update check and GeoIP/netstat (#1050).
- Directory icons with extension-aware matching (#1167).
- Terminal tab/PTY restoration after renderer reload (#630).
- Ultrawide 21:9 / 32:9 support (#832).
- macOS arm64 (Apple Silicon) build target (#1054).
- Update checker gracefully handles repositories with no published releases.

### Changed

- Electron 12 → **43.8.6**; Chromium 150-class renderer.
- WebGL terminal renderer with canvas fallback.
- `shell-env`, `color`, `pretty-bytes` interop fixed for current package exports.
- `systeminformation` bumped to a non-vulnerable release; `geolite2-redist` to 4.x.

### Fixed

- RAM watcher no longer throws on transient inconsistent `si.mem()` samples.
- Subprocess lookup errors throttled instead of logged every second.
- Windows "Unsupported OS" noise silenced (CWD tracking uses the documented
  fallback path).

### Known limitations

- CWD tracking on Windows is not possible with portable APIs: the filesystem
  module falls back to the last known directory ("detached" mode).
- Terminal ligatures are unavailable (the font-finder backend has no browser
  build); the feature degrades gracefully instead of failing.
- Release binaries are unsigned unless `CSC_*`/`APPLE_*` secrets are configured
  in CI; see `SECURITY.md` for the verification workflow (SHA-256 checksums and
  SBOM are always published).

[3.0.0]: https://github.com/alesanfe/edex-ui/releases/tag/v3.0.0
