# UI modes (EPIC-03)

xDEX-UI ships three interface modes selected by `settings.uiMode` and applied
live by `window.applyUIMode()` — no restart, terminals keep their state.

| | immersive (default) | productive | light |
|---|---|---|---|
| Purpose | Full eDEX HUD experience | Daily terminal work | Minimal resources |
| Monitor widgets | all 10 | clock, sysinfo, cpuinfo, ramwatcher, netstat | none |
| On-screen keyboard | yes | no | no |
| Animations | full | reduced (0.2s/0.1s caps) | off |
| Globe / conninfo / toplist / ports | yes | no | no |

## Capability model

`window.UI_MODES[name]` returns capabilities (`monitor`, `animations`,
`keyboard`, `fsPanel`); `window.UI_MONITOR_MODULES[level]` maps monitor levels
to widget keys. Components must consult `window.uiMode.caps`, never mode names.
A new mode = a new entry in `UI_MODES`, no component changes.

## Resource behavior

Hidden widgets release their timers: every module registers its
`setInterval`s through `initPausable(this)`/`this._every()`, and
`applyUIMode` calls `_setPaused(true)` on hidden ones. The globe's
requestAnimationFrame render loop is stopped and re-armed the same way.
Timers resume automatically when the mode makes a widget visible again.

## Performance budget (UI-005)

Measured at idle, one shell open, default theme:

| Metric | immersive | productive | light |
|---|---|---|---|
| Active module timers | ~14 | ~6 | 0 |
| rAF loops | 1 (globe, 30fps) | 0 | 0 |
| si.* IPC calls/min | ~60 | ~25 | 0 |
| Animations running | continuous | brief transitions | none |

Target: light mode must show a measurable drop in background CPU vs
immersive (no si.* traffic at all); productive must not animate while the
user types; immersive must never block terminal input (terminal and monitor
run in separate loops — terminal latency is unaffected by widget polling).

How to verify: open DevTools > Performance, record 10s idle in each mode;
the timer/IPC counts above are observable in `window.mods` —
`Object.values(mods).map(m => m._updaters && m._updaters.filter(u => u.id !== null).length)`.

`prefers-reduced-motion: reduce` (OS setting) additionally forces
near-zero animation durations regardless of mode.
