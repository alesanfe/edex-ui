# REM — Remote sessions beyond SSH argv (design spike)

Status: **spike / not implemented**. SSH profiles shipped in 3.0 launch the
system `ssh` client inside a regular PTY tab. This document scopes what a
deeper remote-session layer would require.

## Options evaluated

| Option | Pros | Cons |
|---|---|---|
| A. Spawn `ssh` in PTY (shipped) | Zero new attack surface, uses user's agent/keys/config, known-hosts handled by OpenSSH | No session metadata back to the UI (no mosh, no auto-reconnect, no jump hosts without `~/.ssh/config`) |
| B. SSH2 in main process (`ssh2` npm) | UI owns the channel: keepalive, reconnect, banners, SFTP side-panel | Re-implements auth+known-hosts UX; secrets could touch our process memory; larger audit surface |
| C. Agent forward to dedicated session daemon | Clean separation | New daemon = new IPC surface, packaging burden |

Decision: stay on **A** for 3.x; evaluate **B** only if session-management
features (reconnect, jump chains, SFTP pane) get prioritized.

## What A already gives us

- argv-array spawning (no shell injection vector) — `ttyspawn-ssh` in `_boot.js`
- Host identity: banner + env accent on the tab (env ≠ color-only)
- `remoteDir`, per-profile env vars, port, user — validated in both renderer and main

## If we revisit (checklist)

- [ ] `ssh2` or `node-libssh` PoC in a worker; measure reconnect UX vs OpenSSH
- [ ] Known-hosts prompt UX parity with OpenSSH (`strictHostKeyChecking`)
- [ ] Secret custody: never pass key material through the renderer; main-only buffers
- [ ] Jump host (`ProxyJump`) support — trivial via argv (`-J`), moderate via ssh2
- [ ] Session recording/scrollback sharing between remote tabs (workspaces)
