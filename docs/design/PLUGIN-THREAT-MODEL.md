# PLUG — Plugin/extension threat model (design doc)

Status: **design only**. There is no plugin API. This model exists so a future
plugin surface does not regress the 3.0 security posture.

## Trust boundaries

```
[untrusted] theme JSON / keyboard JSON / plugin manifest
       |  validated, whitelisted, sandboxed
[renderer] contextIsolation + strict CSP, no Node APIs
       |  edex:* IPC, validated in main
[main] shell spawn, fs, network, node-pty
```

Current posture (must not regress):
- Renderer: `contextIsolation: true`, `nodeIntegration: false`, sandbox on.
- IPC: every `edex:*` handler validates args and paths (see `chkPath` in `_boot.js`).
- Themes: JSON only, whitelisted keys (`theme-importer.js` normalize step).
- PTY WebSocket: loopback-only, single client (CVE-2023-30856).

## If plugins ship, non-negotiables

1. **No Node in plugin code.** Plugins run in the renderer or a dedicated
   sandboxed `<webview>`/`utilityProcess` — never with `nodeIntegration`.
2. **Capability manifest.** Declared permissions (`fs.read`, `terminal.write`,
   `monitor.read`, `net.outbound`) reviewed at install; default = none.
3. **No dynamic remote code.** `eval`, `new Function`, remote `<script>` and
   inline handlers stay blocked by CSP for plugin content too.
4. **Signed or checksum-pinned plugin packages** before we ever allow
   marketplace installs; unsigned = sideload with explicit user consent.
5. **Data custody.** Plugins must not read `settings.json`,
   `ssh-profiles.json`, workspaces, or monitor history directly — mediate
   through an IPC API with per-capability gating.
6. **Kill switch.** `settings.plugins.enabled` master toggle; disabling
   unloads all plugins without a restart.

## Abuse cases to test before launch

- Malicious theme JSON carrying prototype pollution keys (`__proto__`)
- Plugin spawning processes via a mis-scoped IPC channel
- Plugin exfiltrating scrollback (PTY buffer) over the PTY WebSocket
- Theme/importer path traversal via crafted `name` (mitigated: `safeName`)
