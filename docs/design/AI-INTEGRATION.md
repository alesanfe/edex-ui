# AI — Assistant integration design note

Status: **design only**. No AI features in 3.x.

## Principles

1. **Local-first or explicit consent.** Terminal scrollback and command
   history are sensitive. Nothing leaves the machine without an opt-in toggle
   (`settings.ai.provider = "off" | "local" | "api"` default `off`).
2. **No scrollback exfiltration.** If an assistant is enabled, the minimum
   context window is the *visible* selection or the last N lines the user
   explicitly marks — never the whole buffer or monitor history.
3. **Command suggestions are typed, not executed.** Suggested commands render
   into the input line for review; never injected straight into the PTY.
4. **Secret redaction before any external call.** Env vars, tokens, and
   SSH host material are scrubbed client-side; the redaction list lives in
   one auditable module.
5. **Provider is an IPC-mediated adapter** in the main process (same trust
   boundary as everything else); the renderer never holds API keys.

## Fit with the product

The HUD identity means an assistant should feel like another instrument —
suggested UX: a collapsible "OPS" pane in productive mode that can explain
monitor anomalies (CPU/VRAM alerts) and draft commands, not a chat sidebar.
