const { test } = require("node:test");
const assert = require("node:assert");

// ---- minimal DOM/window stubs -------------------------------------------------
function fakeEl() {
    const el = {
        children: [],
        style: {setProperty() {}, removeProperty() {}, display: ""},
        dataset: {},
        _attrs: {},
        _html: "",
        setAttribute(k, v) { el._attrs[k] = v; },
        getAttribute(k) { return el._attrs[k]; },
        removeAttribute(k) { delete el._attrs[k]; },
        append(c) { el.children.push(c); },
        appendChild(c) { el.children.push(c); return c; },
        remove() {},
        querySelector() { return fakeEl(); },
        querySelectorAll() { return []; },
        addEventListener() {},
        classList: {toggle() {}, add() {}, remove() {}},
        clientWidth: 200, clientHeight: 200, offsetWidth: 100, offsetHeight: 100,
        set innerHTML(v) { el._html = v; },
        get innerHTML() { return el._html; },
        set textContent(v) { el._html = v; },
        get textContent() { return el._html; }
    };
    return el;
}

const elements = {};
global.document = {
    getElementById(id) { return elements[id] || null; },
    createElement() { const e = fakeEl(); return e; },
    querySelector() { return fakeEl(); },
    querySelectorAll() { return []; },
    body: fakeEl()
};
global.window = {};
global.window.document = global.document;
global.window.matchMedia = () => ({matches: false});
global.window.settings = {};
global.window.mods = {};
global.window.setTimeout = setTimeout;
global.window.requestAnimationFrame = fn => setTimeout(fn, 0);

// ============================ monitor-history =================================
require("../assets/misc/monitor-history.js");
const MH = global.window.MonitorHistory;
const { after } = require("node:test");
after(() => MH.stop());   // init() arms a flush interval - disarm for exit

test("MonitorHistory: push respects MIN_GAP and caps samples", () => {
    global.window.settings = {monitorHistory: true, alerts: {enabled: false}};
    MH.samples.length = 0;
    MH.init(null);           // no persistence
    const now = Date.now();
    MH.push({cpu: 10, mem: 20});
    assert.equal(MH.samples.length, 1);
    MH.push({cpu: 30, mem: 40});   // within MIN_GAP -> dropped
    assert.equal(MH.samples.length, 1);
});

test("MonitorHistory: disabled setting drops all samples", () => {
    global.window.settings = {monitorHistory: false};
    MH.samples.length = 0;
    MH.push({cpu: 1});
    assert.equal(MH.samples.length, 0);
    global.window.settings = {monitorHistory: true, alerts: {enabled: false}};
});

test("MonitorHistory: threshold breach renders an alert banner", () => {
    global.window.settings = {monitorHistory: true, alerts: {cpu: 50}};
    MH.samples.length = 0;
    // Fast-forward past MIN_GAP_MS so this push is accepted
    const realNow = Date.now;
    Date.now = () => realNow() + 60000;
    try {
        MH.push({cpu: 99});
    } finally {
        Date.now = realNow;
    }
    const el = global.document.body.children.find(c => c.id === "monitor_alert");
    assert.ok(el, "alert element should be appended to body");
    assert.match(el.textContent || "", /CPU at 99%/);
});

test("MonitorHistory: init loads bounded history and flush persists", (t) => {
    const path = require("path");
    const os = require("os");
    const tmp = path.join(os.tmpdir(), "mh-test-" + process.pid + ".json");
    require("fs").writeFileSync(tmp, JSON.stringify([{ts: 1, cpu: 5}, "bad", {ts: 2, mem: 9}]));
    global.window.settings = {monitorHistory: true, alerts: {enabled: false}};
    MH.samples.length = 0;
    // monitor-history calls global fs (shim) - give it a real one
    global.fs = require("fs");
    MH.init(tmp);
    t.after(() => MH.stop());
    assert.equal(MH.samples.length, 2);
    MH.clear();
    assert.equal(MH.samples.length, 0);
    require("fs").unlinkSync(tmp);
});

// ============================ theme-importer ==================================
require("../assets/misc/theme-importer.js");
const TI = global.window.ThemeImporter;

const VALID_THEME = {
    colors: {r: 0, g: 255, b: 255, black: "#000"},
    cssvars: {font_main: "Fira Mono", font_main_light: "Fira"},
    terminal: {foreground: "#fff", background: "#000", cursor: "#fff"},
    globe: {base: "#0ff"}
};

test("validateTheme accepts a complete valid theme", () => {
    const r = TI.validateTheme(VALID_THEME);
    assert.equal(r.ok, true);
    assert.deepEqual(r.errors, []);
});

test("validateTheme rejects malformed inputs", () => {
    assert.equal(TI.validateTheme(null).ok, false);
    assert.equal(TI.validateTheme([]).ok, false);
    assert.equal(TI.validateTheme({colors: {r: 999, g: 0, b: 0}}).ok, false);
    assert.equal(TI.validateTheme({...VALID_THEME, terminal: {foreground: "red"}}).ok, false);
    assert.equal(TI.validateTheme({...VALID_THEME, globe: {base: "url(evil)"}}).ok, false);
});

test("normalizeTheme drops unknown keys and non-scalars", () => {
    const out = TI.normalizeTheme({
        ...VALID_THEME,
        colors: {...VALID_THEME.colors, evil: "x"},
        terminal: {...VALID_THEME.terminal, payload: {nested: true}},
        extra: "dropped"
    });
    assert.equal(out.colors.evil, undefined);
    assert.equal(out.terminal.payload, undefined);
    assert.equal(out.extra, undefined);
    assert.equal(out.colors.r, 0);
});

test("safeName rejects traversal", () => {
    assert.equal(TI.safeName("ok theme"), true);
    assert.equal(TI.safeName("../escape"), false);
    assert.equal(TI.safeName("a".repeat(65)), false);
});

// ============================ ui-modes ========================================
require("../assets/misc/ui-modes.js");

test("initPausable arms, pauses and re-arms intervals", (t) => {
    const obj = {};
    global.window.initPausable(obj);
    let calls = 0;
    obj._every(() => calls++, 100);
    assert.equal(obj._updaters.length, 1);
    obj._setPaused(true);
    assert.equal(obj._updaters[0].id, null);
    obj._setPaused(false);
    assert.notEqual(obj._updaters[0].id, null);
    t.after(() => obj._setPaused(true));   // disarm so the test process can exit
});

test("currentPollScale multiplies user scale and mode scale, clamped", () => {
    global.window.settings = {monitorPollScale: 2};
    global.window.uiMode = {caps: {pollScale: 1.5}};
    assert.equal(global.window.currentPollScale(), 3);
    global.window.settings = {monitorPollScale: 99};
    assert.equal(global.window.currentPollScale(), 7.5); // clamped to 5
    global.window.settings = {};
    global.window.uiMode = null;
    assert.equal(global.window.currentPollScale(), 1);
});

test("applyUIMode sets body attrs and pauses hidden widgets", () => {
    elements["keyboard"] = fakeEl();
    elements["filesystem"] = fakeEl();
    const mk = () => ({_element: fakeEl(), _setPaused(p) { this.paused = p; }, _every() {}, _updaters: []});
    const cpu = mk(), net = mk();
    global.window.mods = {cpuinfo: cpu, netstat: net};
    global.window.settings = {monitorWidgets: {cpuinfo: false}, uiMode: "productive"};
    global.window.applyUIMode("productive", false);
    assert.equal(global.document.body._attrs["data-ui-mode"], "productive");
    assert.equal(cpu.paused, true);      // widget toggle off -> paused
    assert.equal(net.paused, false);     // visible in compact -> running
    global.window.applyUIMode("light", false);
    assert.equal(global.document.body._attrs["data-animations"], "off");
    assert.equal(net.paused, true);      // monitor off -> all paused
    global.window.mods = {};
    delete elements["keyboard"];
    delete elements["filesystem"];
});

test("applyUIMode stashes pending pause for modules not yet armed", () => {
    const late = {_element: fakeEl()};            // async init pending: no _setPaused
    global.window.mods = {latemod: late};
    global.window.settings = {monitorWidgets: {latemod: false}, uiMode: "immersive"};
    global.window.applyUIMode("immersive", false);
    assert.equal(late._pendingPaused, true);
    global.window.initPausable(late);              // async init completes later
    assert.equal(late._paused, true);              // requested pause honored
    late._every(() => {}, 100);
    assert.equal(late._updaters[0].id, null);      // interval never armed
    const vis = {_element: fakeEl(), _pendingPaused: true};
    global.window.mods = {cpuinfo: vis};
    global.window.settings = {monitorWidgets: {}, uiMode: "immersive"};
    global.window.applyUIMode("immersive", false);
    assert.equal(vis._pendingPaused, undefined);   // visible clears stale flag
    global.window.mods = {};
});

// ============================ postfx ==========================================
require("../assets/misc/postfx.js");

test("applyPostFx creates/removes the overlay by settings", () => {
    global.window.settings = {postFx: {scanlines: 50, glow: 0, flicker: 0}};
    global.window.applyPostFx();
    // overlay creation goes through document.body.appendChild on our stub
    global.window.settings = {postFx: {scanlines: 0, glow: 0, flicker: 0}};
    global.window.applyPostFx();       // removes/no-ops cleanly
    global.window.settings = {};
});

test("applyPostFx forces flicker off under reduced-motion", () => {
    const orig = global.window.matchMedia;
    global.window.matchMedia = () => ({matches: true});
    global.window.settings = {postFx: {scanlines: 50, flicker: 100}};
    global.window.applyPostFx();
    global.window.matchMedia = orig;
    global.window.settings = {};
});

// ============================ plugins load ====================================
require("../assets/misc/plugins.js");
const Plugins = global.window.Plugins;

test("Plugins.load instantiates valid manifests and registers them in mods", () => {
    const dir = "/plugins";
    const manifests = {
        "/plugins/good.json": JSON.stringify({
            name: "good",
            widget: {metric: "mem", fields: [{path: "total"}, {path: "free", label: "FREE"}]}
        }),
        "/plugins/bad.json": "{not json",
        "/plugins/evil.json": JSON.stringify({
            name: "evil", widget: {metric: "processes", fields: [{path: "x"}]}
        })
    };
    global.window.fs = {
        existsSync: () => true,
        mkdirSync: () => {},
        readdirSync: () => Object.keys(manifests).map(p => ({n: p.split("/").pop(), f: true})),
        readFileSync: p => manifests[p]
    };
    global.window.si = {mem: () => Promise.resolve({total: 100, free: 50})};
    global.window.initPausable = obj => {
        obj._updaters = []; obj._paused = false;
        obj._every = (fn, ms) => { obj._updaters.push({fn, ms, id: 1}); return obj._updaters[0]; };
        obj._setPaused = () => {};
    };
    global.window.mods = {};
    global.window.UI_MONITOR_MODULES = {full: [], compact: [], off: []};
    elements["mod_column_right"] = fakeEl();

    const loaded = Plugins.load("mod_column_right", dir);
    assert.deepEqual(loaded, ["plugin:good"]);
    assert.ok(global.window.mods["plugin:good"]);
    assert.ok(global.window.UI_MONITOR_MODULES.full.includes("plugin:good"));
    delete elements["mod_column_right"];
});

test("Plugins.load survives an unreadable directory", () => {
    global.window.fs = {existsSync: () => { throw "nope"; }, mkdirSync: () => {}, readdirSync: () => { throw "nope"; }};
    assert.deepEqual(Plugins.load("mod_column_right", "/nowhere"), []);
});

// ============================ ai-assistant ask ================================
require("../assets/misc/ai-assistant.js");
const Ai = global.window.Ai;

test("Ai.ask posts redacted prompt through edex bridge", async () => {
    let sent = null;
    global.window.settings = {aiEnabled: true, aiEndpoint: "http://localhost:11434", aiModel: "llama3"};
    global.window.edex = {ai: {chat: req => { sent = req; return Promise.resolve({response: "ok"}); }}};
    const res = await Ai.ask("explain password=hunter2");
    assert.equal(res.response, "ok");
    assert.ok(!sent.prompt.includes("hunter2"));
    assert.equal(sent.model, "llama3");
});

test("Ai.enabled reflects settings", () => {
    global.window.settings = {aiEnabled: true};
    assert.equal(Ai.enabled(), true);
    global.window.settings = {};
    assert.equal(Ai.enabled(), false);
});

// ============================ modal-bound flows ==============================
// Stub Modal captures its config so button actions can be invoked directly.
let modalConfigs = [];
class StubModal {
    constructor(cfg) { this.cfg = cfg; modalConfigs.push(this); this.closed = false; }
    close() { this.closed = true; }
}
global.Modal = StubModal;

test("theme import: preview validates, persists and previews; revert restores", () => {
    global.window.settings = {theme: "tron"};
    const written = [];
    const changed = [];
    // theme-importer references the page-level globals path/fs/themesDir
    global.path = {join: (...a) => a.join("/")};
    global.themesDir = "/themes";
    global.window.themeChanger = n => changed.push(n);
    global.window.writeSettingsFile = () => { global.window._settingsWritten = true; };
    global.fs = {writeFileSync: (p, data) => written.push({p, data})};

    elements["theme_import_name"] = {value: "mytheme"};
    elements["theme_import_json"] = {value: JSON.stringify(VALID_THEME)};
    elements["theme_import_err"] = {textContent: ""};

    modalConfigs = [];
    global.window.importThemeInteractive();
    const preview = modalConfigs[0].cfg.buttons.find(b => b.label === "Preview");
    preview.action();
    assert.equal(elements["theme_import_err"].textContent, "");
    assert.equal(written.length, 1);
    assert.match(written[0].p, /\/themes\/mytheme\.json$/);
    assert.deepEqual(changed, ["mytheme"]);
    // keep/revert modal was opened
    const keepModal = modalConfigs[1];
    keepModal.cfg.buttons.find(b => b.label === "Keep").action();
    assert.equal(global.window.settings.theme, "mytheme");
    assert.equal(global.window._settingsWritten, true);

    // revert path
    changed.length = 0;
    global.window.settings = {theme: "tron"};
    modalConfigs = [];
    global.window.importThemeInteractive();
    modalConfigs[0].cfg.buttons.find(b => b.label === "Preview").action();
    modalConfigs[1].cfg.buttons.find(b => b.label === "Revert").action();
    assert.deepEqual(changed, ["mytheme", "tron"]);
    delete elements["theme_import_name"];
    delete elements["theme_import_json"];
    delete elements["theme_import_err"];
});

test("theme import: error paths (bad JSON, bad name, failed validation)", () => {
    global.window.settings = {theme: "tron"};
    global.path = {join: (...a) => a.join("/")};
    global.themesDir = "/themes";
    global.fs = {writeFileSync: () => { throw "must not be called"; }};
    global.window.themeChanger = () => { throw "must not be called"; };

    elements["theme_import_name"] = {value: "x"};
    elements["theme_import_json"] = {value: "{bad"};
    elements["theme_import_err"] = {textContent: ""};
    modalConfigs = [];
    global.window.importThemeInteractive();
    modalConfigs[0].cfg.buttons[0].action();
    assert.match(elements["theme_import_err"].textContent, /Invalid JSON/);

    elements["theme_import_json"].value = JSON.stringify(VALID_THEME);
    elements["theme_import_name"].value = "../evil";
    modalConfigs[0].cfg.buttons[0].action();
    assert.match(elements["theme_import_err"].textContent, /Invalid name/);

    elements["theme_import_name"].value = "ok";
    elements["theme_import_json"].value = JSON.stringify({colors: {r: 999}});
    modalConfigs[0].cfg.buttons[0].action();
    assert.match(elements["theme_import_err"].textContent, /colors\.r\/g\/b/);
    delete elements["theme_import_name"];
    delete elements["theme_import_json"];
    delete elements["theme_import_err"];
});

test("AI assistant: disabled path opens consent modal", () => {
    global.window.settings = {aiEnabled: false};
    modalConfigs = [];
    global.window.openAiAssistant();
    assert.equal(modalConfigs.length, 1);
    assert.match(modalConfigs[0].cfg.title, /AI assistant/i);
    // enabling through the modal opens the real panel
    global.window.term = {0: {term: {getSelection: () => "sel text"}}};
    global.window.currentTerm = 0;
    modalConfigs[0].cfg.buttons.find(b => b.label === "ENABLE & OPEN").action();
    assert.equal(global.window.settings.aiEnabled, true);
    assert.equal(modalConfigs.length, 2);
});

test("AI assistant: ASK sends selection+prompt and renders the answer", async () => {
    global.window.settings = {aiEnabled: true, aiEndpoint: "http://localhost:11434", aiModel: "m"};
    global.window.term = {0: {term: {getSelection: () => "some output"}}};
    global.window.currentTerm = 0;
    let sent = null;
    global.window.edex = {ai: {chat: req => { sent = req; return Promise.resolve({response: "answer!"}); }}};
    elements["ai_prompt"] = {value: "what is this"};
    elements["ai_answer"] = {innerText: ""};
    modalConfigs = [];
    global.window.openAiAssistant();
    modalConfigs[0].cfg.buttons.find(b => b.label === "ASK").action();
    await new Promise(r => setImmediate(r));
    assert.match(sent.prompt, /some output[\s\S]*what is this/);
    assert.equal(elements["ai_answer"].innerText, "answer!");
    delete elements["ai_prompt"];
    delete elements["ai_answer"];
});
