// UI modes (EPIC-03): capability model for immersive / productive / light
// experiences. Components must consult capabilities through
// window.uiMode.caps, never hardcode mode names.
window.UI_MODES = {
    immersive: {
        monitor: "full",      // every monitor widget visible
        animations: "full",
        keyboard: true,
        fsPanel: true,
        pollScale: 1          // telemetry interval multiplier
    },
    productive: {
        monitor: "compact",   // essential widgets only, denser layout
        animations: "reduced",
        keyboard: false,
        fsPanel: true,
        pollScale: 1.5
    },
    light: {
        monitor: "off",       // no monitor columns, minimal resource use
        animations: "off",
        keyboard: false,
        fsPanel: true,
        pollScale: 1
    }
};

// Widget visibility per monitor capability level. Keys match window.mods.
window.UI_MONITOR_MODULES = {
    full: [
        "clock", "sysinfo", "hardwareInspector", "cpuinfo", "gpuinfo",
        "tempinfo", "diskinfo", "dockinfo",
        "ramwatcher", "toplist", "netstat", "globe", "conninfo", "openportlist",
        "nettopo"
    ],
    compact: ["clock", "sysinfo", "cpuinfo", "ramwatcher", "netstat"],
    off: []
};

// Effective polling scale: per-mode multiplier x user override
// (settings.monitorPollScale, clamped 0.5 - 5). Used when arming timers so a
// mode switch or a settings save re-arms with the new cadence (MON-002).
window.currentPollScale = () => {
    const user = Number(window.settings && window.settings.monitorPollScale) || 1;
    const mode = (window.uiMode && window.uiMode.caps && window.uiMode.caps.pollScale) || 1;
    return Math.max(0.5, Math.min(5, user)) * mode;
};

// Pausable interval registry. A module calls window.initPausable(this) in its
// constructor and registers timers with this._every(fn, ms) instead of raw
// setInterval; applyUIMode can then stop/restart them without leaks. The
// armed interval is base ms x currentPollScale(), recomputed on every arm.
window.initPausable = obj => {
    obj._updaters = [];
    // Honor a pause requested before this module finished arming (MON-001):
    // applyUIMode may run while a module's async init is still pending.
    obj._paused = obj._pendingPaused === true;
    delete obj._pendingPaused;
    const arm = u => {
        const scale = typeof window.currentPollScale === "function"
            ? window.currentPollScale() : 1;
        u.id = setInterval(u.fn, Math.max(250, Math.round(u.ms * scale)));
    };
    obj._every = (fn, ms) => {
        const u = {fn, ms, id: null};
        if (!obj._paused) arm(u);
        obj._updaters.push(u);
        return u;
    };
    obj._setPaused = paused => {
        obj._paused = paused;
        obj._updaters.forEach(u => {
            if (paused && u.id !== null) {
                clearInterval(u.id);
                u.id = null;
            } else if (!paused && u.id === null) {
                arm(u);
            }
        });
    };
};

window.applyUIMode = (name, persist) => {
    const caps = window.UI_MODES[name] || window.UI_MODES.immersive;
    // A11Y-002: the OS reduced-motion preference clamps the mode's animation
    // level - "full" becomes "reduced", anything else stays as configured.
    let animLevel = caps.animations;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches && animLevel === "full") {
        animLevel = "reduced";
    }
    window.uiMode = {name: window.UI_MODES[name] ? name : "immersive", caps};
    document.body.setAttribute("data-ui-mode", window.uiMode.name);
    document.body.setAttribute("data-animations", animLevel);

    // Widget-level on/off on top of mode visibility (MON-001): a widget is
    // shown only when the monitor level includes it AND its toggle is on.
    const toggles = (window.settings && window.settings.monitorWidgets) || {};
    const visible = new Set(window.UI_MONITOR_MODULES[caps.monitor] || []);
    const scaleChanged = window._lastPollScale !== window.currentPollScale();
    Object.entries(window.mods || {}).forEach(([key, mod]) => {
        const on = visible.has(key) && toggles[key] !== false;
        const el = (mod && mod._element) || document.getElementById("mod_" + key);
        if (el) el.style.display = on ? "" : "none";
        if (mod && typeof mod._setPaused === "function") {
            mod._setPaused(!on);
            // Re-arm visible widgets when the cadence changed (MON-002)
            if (on && scaleChanged) {
                mod._setPaused(true);
                mod._setPaused(false);
            }
        } else if (mod && typeof mod.setPaused === "function") {
            mod.setPaused(!on);
        } else if (mod) {
            // Module not armed yet - stash the desired state; initPausable
            // picks it up when the async init completes.
            if (!on) mod._pendingPaused = true;
            else delete mod._pendingPaused;
        }
    });
    window._lastPollScale = window.currentPollScale();
    if (typeof window.applyPostFx === "function") window.applyPostFx();

    document.querySelectorAll(".mod_column").forEach(col => {
        col.style.display = caps.monitor === "off" ? "none" : "";
    });
    const kb = document.getElementById("keyboard");
    if (kb) kb.style.display = caps.keyboard ? "" : "none";
    const fs = document.getElementById("filesystem");
    if (fs) fs.style.display = caps.fsPanel ? "" : "none";

    if (persist !== false && window.settings && window.settings.uiMode !== name) {
        window.settings.uiMode = name;
        if (typeof window.writeSettingsFile === "function") window.writeSettingsFile();
    }
};

window.cycleUIMode = () => {
    const order = ["immersive", "productive", "light"];
    const cur = window.uiMode ? window.uiMode.name : "immersive";
    window.applyUIMode(order[(order.indexOf(cur) + 1) % order.length]);
};
