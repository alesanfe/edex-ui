// Workspaces (EPIC-04): schema-v1 model + validation. Persisted to
// <settingsDir>/workspaces.json as {version, workspaces[]}. A workspace
// captures tab slots, per-tab cwd, and the uiMode — never secrets, never
// commands; restore only spawns shells in the recorded directories.
window.Workspaces = (function () {
    const SCHEMA_VERSION = 1;
    const MAX_WORKSPACES = 50;
    const MAX_NAME = 80;
    const MAX_TABS = 5;
    const VALID_MODES = ["immersive", "productive", "light"];

    function sanitizeTab(raw) {
        if (!raw || typeof raw !== "object") return null;
        const slot = Number(raw.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_TABS) return null;
        const cwd = typeof raw.cwd === "string" ? raw.cwd.slice(0, 500) : "";
        return {slot, cwd};
    }

    // Returns a normalized workspace or null when irreparably invalid.
    function sanitize(raw) {
        if (!raw || typeof raw !== "object") return null;
        const name = typeof raw.name === "string" ? raw.name.trim() : "";
        if (!name || name.length > MAX_NAME) return null;
        const tabs = Array.isArray(raw.tabs)
            ? raw.tabs.map(sanitizeTab).filter(t => t !== null)
            : [];
        const uiMode = VALID_MODES.includes(raw.uiMode) ? raw.uiMode : null;
        return {
            id: typeof raw.id === "string" && raw.id.length <= 64
                ? raw.id : nanoid(),
            name,
            tabs,
            uiMode,
            createdAt: typeof raw.createdAt === "string" ? raw.createdAt
                : new Date().toISOString()
        };
    }

    // Parse the whole store; corrupt entries are dropped, never fatal.
    function parseStore(json) {
        const out = {version: SCHEMA_VERSION, workspaces: []};
        if (!json || typeof json !== "object" || !Array.isArray(json.workspaces)) {
            return out;
        }
        json.workspaces.forEach(w => {
            const s = sanitize(w);
            if (s && out.workspaces.length < MAX_WORKSPACES) out.workspaces.push(s);
        });
        return out;
    }

    // Validate an IMPORTED store (WS-004): strict - reports a human-readable
    // summary instead of silently coercing. Returns {ok, summary, store}.
    function validateImport(raw, maxBytes) {
        if (typeof raw !== "string" || !raw.length) {
            return {ok: false, summary: "empty import payload"};
        }
        if (maxBytes && raw.length > maxBytes) {
            return {ok: false, summary: "payload too large"};
        }
        let json;
        try {
            json = JSON.parse(raw);
        } catch (e) {
            return {ok: false, summary: "not valid JSON"};
        }
        if (!json || json.version !== SCHEMA_VERSION) {
            return {ok: false, summary: "unsupported schema version"};
        }
        if (!Array.isArray(json.workspaces)) {
            return {ok: false, summary: "missing workspaces array"};
        }
        const store = parseStore(json);
        const dropped = json.workspaces.length - store.workspaces.length;
        return {
            ok: store.workspaces.length > 0,
            summary: `${store.workspaces.length} valid workspace(s)` +
                (dropped > 0 ? `, ${dropped} invalid entries skipped` : ""),
            store
        };
    }

    function capture(name) {
        const tabs = [];
        Object.keys(window.term || {}).forEach(k => {
            const t = window.term[k];
            const slot = Number(k);
            if (t && Number.isInteger(slot)) {
                tabs.push({slot, cwd: t.cwd || ""});
            }
        });
        return {
            id: nanoid(),
            name: String(name || "Workspace").slice(0, MAX_NAME),
            tabs,
            uiMode: window.uiMode ? window.uiMode.name : "immersive",
            createdAt: new Date().toISOString()
        };
    }

    return {SCHEMA_VERSION, MAX_WORKSPACES, parseStore, validateImport, capture};
})();
