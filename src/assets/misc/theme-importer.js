// ONB-002: eDEX-UI theme importer - validate, preview, persist or revert.
// Themes are plain JSON (colors/cssvars/terminal/globe); imported files go to
// <userData>/themes/ and are applied through the existing themeChanger path.

(function() {
const hexColor = v => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v);
const chan = v => Number.isInteger(v) && v >= 0 && v <= 255;
const safeName = n => /^[\w. -]{1,64}$/.test(n) && !n.includes("..");

function validateTheme(raw) {
    const errors = [];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return {ok: false, errors: ["theme root must be an object"]};
    }
    const c = raw.colors || {};
    if (!chan(c.r) || !chan(c.g) || !chan(c.b)) errors.push("colors.r/g/b must be integers 0-255");
    ["black", "light_black", "grey"].forEach(k => {
        if (c[k] !== undefined && !hexColor(c[k])) errors.push(`colors.${k} must be a hex color`);
    });
    const v = raw.cssvars || {};
    if (typeof v.font_main !== "string" || v.font_main.length > 128) errors.push("cssvars.font_main must be a font name");
    if (typeof v.font_main_light !== "string" || v.font_main_light.length > 128) errors.push("cssvars.font_main_light must be a font name");
    const t = raw.terminal || {};
    if (!hexColor(t.foreground)) errors.push("terminal.foreground must be a hex color");
    if (!hexColor(t.background)) errors.push("terminal.background must be a hex color");
    ["cursor", "cursorAccent", "selection"].forEach(k => {
        if (t[k] !== undefined && typeof t[k] !== "string") errors.push(`terminal.${k} must be a string`);
    });
    const g = raw.globe || {};
    ["base", "marker", "pin", "satellite"].forEach(k => {
        if (g[k] !== undefined && !hexColor(g[k])) errors.push(`globe.${k} must be a hex color`);
    });
    return {ok: errors.length === 0, errors};
}

function normalizeTheme(raw) {
    // Whitelisted copy - unknown keys are dropped rather than passed to _loadTheme
    const out = {colors: {}, cssvars: {}, terminal: {}, globe: {}};
    for (const k of ["r", "g", "b", "black", "light_black", "grey"]) {
        if (raw.colors && raw.colors[k] !== undefined) out.colors[k] = raw.colors[k];
    }
    for (const k of ["font_main", "font_main_light"]) {
        if (raw.cssvars && raw.cssvars[k] !== undefined) out.cssvars[k] = raw.cssvars[k];
    }
    for (const k in (raw.terminal || {})) {
        if (typeof raw.terminal[k] === "string" || typeof raw.terminal[k] === "number" || typeof raw.terminal[k] === "boolean") {
            out.terminal[k] = raw.terminal[k];
        }
    }
    for (const k of ["base", "marker", "pin", "satellite"]) {
        if (raw.globe && raw.globe[k] !== undefined) out.globe[k] = raw.globe[k];
    }
    return out;
}

window.ThemeImporter = {validateTheme, normalizeTheme, safeName};

// Interactive import: paste JSON -> validate -> preview -> keep or revert
window.importThemeInteractive = () => {
    const modal = new Modal({
        type: "custom",
        title: "Import eDEX-UI theme",
        html: `<div style="padding:1em">
            <p>Paste a theme JSON file (original eDEX-UI format is supported).</p>
            <input id="theme_import_name" type="text" placeholder="theme name" style="width:100%;margin-bottom:0.5em">
            <textarea id="theme_import_json" rows="10" style="width:100%" placeholder="{ &quot;colors&quot;: {...} }"></textarea>
            <p id="theme_import_err" style="color:#e55252;min-height:1.2em"></p>
        </div>`,
        buttons: [
            {label: "Preview", action: () => {
                const name = document.getElementById("theme_import_name").value.trim();
                const err = document.getElementById("theme_import_err");
                let raw;
                try { raw = JSON.parse(document.getElementById("theme_import_json").value); }
                catch (e) { err.textContent = "Invalid JSON: " + e.message; return; }
                if (!safeName(name)) { err.textContent = "Invalid name (letters, digits, space, -_. only)"; return; }
                const v = validateTheme(raw);
                if (!v.ok) { err.textContent = v.errors.join("; "); return; }
                const clean = normalizeTheme(raw);
                const prevTheme = window.settings.theme;
                // Persist then hot-switch for live preview
                fs.writeFileSync(path.join(themesDir, name + ".json"), JSON.stringify(clean, null, 4), {encoding: "utf-8"});
                window.themeChanger(name);
                modal.close();
                new Modal({
                    type: "custom",
                    title: "Theme preview",
                    html: `<p>Applied <b>${name}</b>. Keep it?</p>`,
                    buttons: [
                        {label: "Keep", action: () => {
                            window.settings.theme = name;
                            window.writeSettingsFile();
                        }},
                        {label: "Revert", action: () => window.themeChanger(prevTheme)}
                    ]
                });
            }}
        ]
    });
};
})();
