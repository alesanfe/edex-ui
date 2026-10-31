# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.0.x   | :white_check_mark: |

Only the latest release line receives security fixes. This project is a
continuation of the archived `GitSquared/edex-ui`; vulnerabilities present in
the original codebase are fixed as they are identified.

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report them via GitHub's private vulnerability reporting ("Security" tab →
"Report a vulnerability") on the repository, or by contacting the maintainers
listed on the repository page.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce / proof of concept
- Affected versions and platforms

You can expect an acknowledgement within 7 days. We will coordinate disclosure
with you and credit reporters in release notes unless you prefer anonymity.

## Security Architecture Notes

- **Terminal WebSocket (CVE-2023-30856):** the PTY backend only accepts
  connections from `file://`/`null` origins *and* loopback addresses, and
  allows a single client. Regression tests live in
  `src/tests/cve-2023-30856.test.js` (`npm run test:cve` in `src/`).
- **Renderer hardening:** a strict `script-src file:` CSP forbids inline
  script handlers and injected scripts (all UI handlers are assigned via
  JavaScript, not HTML attributes), `eval()` is disabled at boot, navigation
  away from the UI is blocked (`will-navigate`), new windows are redirected
  to the system browser, drag-and-drop navigation is disabled, and all web
  permission requests (geolocation, media, notifications, ...) are denied.
- **Renderer isolation:** the window runs with `contextIsolation: true` and
  `nodeIntegration: false`. The page has no `require`, `process`, `fs`,
  `ipcRenderer`, or `@electron/remote` access. A preload bridge
  (`src/preload.js`) exposes narrow shims under the same global names the
  renderer used before (`fs`, `path`, `os`, `electron`, `remote`,
  `electronWin`, `ipc`, `edex`); every privileged operation — filesystem,
  window control, clipboard, global shortcuts, display enumeration, GeoIP,
  SQLite, raw TCP/HTTPS probes — executes in the main process behind the
  `edex:*` IPC handlers registered in `src/_boot.js`. `openExternal` only
  accepts `https?://` URLs, and `globalShortcut` registration is forwarded
  to the main process. There is no generic code-exec channel: IPC surface =
  the whitelisted handler list.
- **UI dependencies:** npm libraries used by the renderer load as UMD
  `<script>` bundles (xterm, smoothie, howler, encom-globe) or as local
  shims (`assets/misc/deps-shim.js`: `path`, `nanoid`, `pretty-bytes`,
  `mime-types`, `color`) — no `node_modules` resolution inside the page.
- **Defense in depth on top of isolation:** strict `script-src file:` CSP
  forbids inline handlers and injected scripts (all UI handlers assigned
  via JavaScript), `eval()` is disabled at boot, `will-navigate` blocks
  leaving the UI, new windows go to the system browser, drag-and-drop
  navigation is disabled, `navigateOnDragDrop: false`, and all web
  permission requests are denied. Never load remote content in the main
  window.
- **Accepted residual advisories:** `npm audit` reports moderate findings
  (`minimatch`/`glob`/`rimraf` chains) inside install/packaging-time tooling:
  `geolite2-redist`'s GeoIP downloader (invoked with globbing disabled) and
  `electron-builder`/`@electron/asar`/`electron-winstaller` (which only run
  in CI and never ship inside the app). They are accepted rather than
  patched via overrides that could break the downloader or the packager.
  The exploitable-dependency surface (`tar`, `undici`, `electron`, `ejs`,
  `app-builder-lib`, `node-gyp`) is kept patched via `overrides` and
  current releases.
