// Declarative widget plugins (P2-8). SECURITY MODEL per
// docs/design/PLUGIN-THREAT-MODEL.md: a plugin is a JSON MANIFEST ONLY -
// no executable code ever enters the renderer. Each manifest declares a
// monitor widget that polls a whitelisted systeminformation metric and
// renders whitelisted fields. There is no eval, no require, no network,
// no fs access beyond the manifest directory listing itself.
//
// Manifest: <userData>/plugins/<name>.json
// {
//   "name": "battery-watch",            // ^[a-z0-9-]{1,40}$
//   "version": "1.0.0",                  // ^\d+\.\d+\.\d+$
//   "description": "...",                // <=200 chars
//   "widget": {
//     "title": "BATTERY",                // <=30 chars
//     "metric": "battery",               // must be in ALLOWED_METRICS
//     "interval": 5000,                  // clamped 2000..60000
//     "fields": [                        // <=10 entries
//       {"label": "LEVEL", "path": "percent", "suffix": "%"},
//       {"label": "CHARGING", "path": "isCharging"}
//     ]
//   }
// }
window.Plugins = (function () {
    const NAME_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
    const VERSION_RE = /^\d+\.\d+\.\d+$/;
    const PATH_RE = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+){0,5}$/;
    const SAFE_LABEL = /^[a-zA-Z0-9 _%°/-]{1,30}$/;
    // Explicit metric whitelist - no process/exec/network-capable si calls.
    const ALLOWED_METRICS = new Set([
        "battery", "cpuTemperature", "mem", "fsSize", "networkStats",
        "osInfo", "time", "currentLoad", "wifiNetworks", "cpu",
        "graphics", "versions", "dockerInfo"
    ]);
    const MAX_MANIFEST_BYTES = 64 * 1024;

    // Prototype-pollution-safe deep getter
    function getPath(obj, path) {
        return path.split(".").reduce((acc, key) => {
            if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
            return (acc !== null && typeof acc === "object" && Object.prototype.hasOwnProperty.call(acc, key))
                ? acc[key] : undefined;
        }, obj);
    }

    // Returns a normalized manifest or an error string.
    function validateManifest(raw, sourceName) {
        if (!raw || typeof raw !== "object") return "not an object";
        const name = typeof raw.name === "string" && NAME_RE.test(raw.name) ? raw.name
            : (sourceName && NAME_RE.test(sourceName) ? sourceName : null);
        if (!name) return "invalid name";
        if (raw.version !== undefined && !VERSION_RE.test(String(raw.version))) return "invalid version";
        const w = raw.widget;
        if (!w || typeof w !== "object") return "missing widget";
        if (!ALLOWED_METRICS.has(w.metric)) return `metric "${w.metric}" not allowed`;
        const title = (typeof w.title === "string" && w.title.length <= 30) ? w.title : name.toUpperCase();
        const fields = Array.isArray(w.fields) ? w.fields.slice(0, 10) : [];
        if (!fields.length) return "no fields";
        const norm = [];
        for (const f of fields) {
            if (!f || typeof f !== "object") continue;
            if (typeof f.path !== "string" || !PATH_RE.test(f.path)) continue;
            norm.push({
                label: (typeof f.label === "string" && SAFE_LABEL.test(f.label)) ? f.label : f.path.split(".").pop().toUpperCase(),
                path: f.path,
                suffix: (typeof f.suffix === "string" && f.suffix.length <= 8) ? f.suffix : ""
            });
        }
        if (!norm.length) return "no valid fields";
        const interval = Math.max(2000, Math.min(60000, Number(w.interval) || 5000));
        return {
            name,
            version: String(raw.version || "0.0.0"),
            description: (typeof raw.description === "string" ? raw.description : "").slice(0, 200),
            widget: {title, metric: w.metric, interval, fields: norm}
        };
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
    }

    // Widget class created per plugin instance
    function PluginWidget(parentId, manifest) {
        const m = manifest;
        this.manifestName = m.name;
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_plugin_" + m.name);
        this._element.innerHTML =
            `<div id="mod_plugin_${m.name}_inner"><h1>${esc(m.widget.title)}<i>plugin</i></h1><div id="mod_plugin_${m.name}_rows"></div></div>`;
        this.parent.append(this._element);
        this.container = this._element;

        const rowsEl = this._element.querySelector(`#mod_plugin_${m.name}_rows`);
        const render = data => {
            rowsEl.innerHTML = m.widget.fields.map(f => {
                const v = getPath(data, f.path);
                const text = (v === undefined || v === null) ? "--"
                    : (typeof v === "boolean" ? (v ? "yes" : "no")
                    : (typeof v === "object" ? JSON.stringify(v).slice(0, 24) : String(v)));
                return `<div class="diskinfo_row"><span>${esc(f.label)}</span><span>${esc(text)}${esc(f.suffix)}</span></div>`;
            }).join("");
        };
        const tick = () => {
            try {
                window.si[m.widget.metric]().then(render).catch(() => {
                    rowsEl.innerHTML = `<div class="diskinfo_row">unavailable</div>`;
                });
            } catch (e) {
                rowsEl.innerHTML = `<div class="diskinfo_row">error</div>`;
            }
        };
        tick();
        window.initPausable(this);
        this._every(tick, m.widget.interval);
    }

    // Scan <userData>/plugins, instantiate valid manifests into parentId and
    // register them under window.mods so UI modes/widget toggles apply.
    function load(parentId, pluginsDir) {
        const loaded = [];
        let files = [];
        try {
            if (!window.fs.existsSync(pluginsDir)) window.fs.mkdirSync(pluginsDir);
            files = window.fs.readdirSync(pluginsDir)
                .filter(f => f.f !== false || typeof f === "string")
                .map(f => (typeof f === "string" ? f : f.n))
                .filter(n => n.endsWith(".json"));
        } catch (e) {
            console.warn("Plugin dir unreadable:", e);
            return loaded;
        }
        files.forEach(file => {
            try {
                const rawText = window.fs.readFileSync(pluginsDir + "/" + file, "utf8");
                if (rawText.length > MAX_MANIFEST_BYTES) throw "manifest too large";
                const manifest = validateManifest(JSON.parse(rawText), file.replace(/\.json$/, ""));
                if (typeof manifest === "string") throw manifest;
                const key = "plugin:" + manifest.name;
                window.mods[key] = new PluginWidget(parentId, manifest);
                if (!window.UI_MONITOR_MODULES.full.includes(key)) {
                    window.UI_MONITOR_MODULES.full.push(key);
                }
                loaded.push(key);
            } catch (e) {
                console.warn(`Plugin ${file} rejected:`, e);
            }
        });
        return loaded;
    }

    return {load, validateManifest, getPath, ALLOWED_METRICS};
})();

if (typeof module !== "undefined") {
    module.exports = window.Plugins;
}
