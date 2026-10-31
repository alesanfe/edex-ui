// UI modes (EPIC-03): capability model for immersive / productive / light
// experiences. Components must consult capabilities through
// window.uiMode.caps, never hardcode mode names.
window.UI_MODES = {
    immersive: {
        monitor: "full",      // every monitor widget visible
        animations: "full",
        keyboard: true,
        fsPanel: true
    },
    productive: {
        monitor: "compact",   // essential widgets only, denser layout
        animations: "reduced",
        keyboard: false,
        fsPanel: true
    },
    light: {
        monitor: "off",       // no monitor columns, minimal resource use
        animations: "off",
        keyboard: false,
        fsPanel: true
    }
};

// Widget visibility per monitor capability level. Keys match window.mods.
window.UI_MONITOR_MODULES = {
    full: [
        "clock", "sysinfo", "hardwareInspector", "cpuinfo", "ramwatcher",
        "toplist", "netstat", "globe", "conninfo", "openportlist"
    ],
    compact: ["clock", "sysinfo", "cpuinfo", "ramwatcher", "netstat"],
    off: []
};

// Pausable interval registry. A module calls window.initPausable(this) in its
// constructor and registers timers with this._every(fn, ms) instead of raw
// setInterval; applyUIMode can then stop/restart them without leaks.
window.initPausable = obj => {
    obj._updaters = [];
    obj._paused = false;
    obj._every = (fn, ms) => {
        const u = {fn, ms, id: null};
        if (!obj._paused) u.id = setInterval(fn, ms);
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
                u.id = setInterval(u.fn, u.ms);
            }
        });
    };
};

window.applyUIMode = (name, persist) => {
    const caps = window.UI_MODES[name] || window.UI_MODES.immersive;
    window.uiMode = {name: window.UI_MODES[name] ? name : "immersive", caps};
    document.body.setAttribute("data-ui-mode", window.uiMode.name);
    document.body.setAttribute("data-animations", caps.animations);

    const visible = new Set(window.UI_MONITOR_MODULES[caps.monitor] || []);
    Object.entries(window.mods || {}).forEach(([key, mod]) => {
        const on = visible.has(key);
        const el = (mod && mod._element) || document.getElementById("mod_" + key);
        if (el) el.style.display = on ? "" : "none";
        if (mod && typeof mod._setPaused === "function") mod._setPaused(!on);
        else if (mod && typeof mod.setPaused === "function") mod.setPaused(!on);
    });

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
