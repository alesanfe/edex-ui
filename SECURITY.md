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
- **Renderer hardening:** navigation away from the UI is blocked
  (`will-navigate`), new windows are redirected to the system browser,
  drag-and-drop navigation is disabled, and all web permission requests
  (geolocation, media, notifications, ...) are denied.
- **Known debt:** the renderer still runs with `nodeIntegration: true` /
  `contextIsolation: false`, required by the current architecture
  (`@electron/remote`, direct `require()` in renderer classes). Migrating to a
  preload + IPC bridge is planned; until then, never load remote content in
  the main window.
- **Accepted residual advisories:** `npm audit` reports moderate findings in
  `geolite2-redist`'s install-time tooling (`rimraf`/`glob`/`minimatch`).
  These only run while downloading the GeoIP database at install time, are
  invoked with globbing disabled, and never execute in the shipped
  application. They are accepted rather than patched via overrides that could
  break the downloader.
