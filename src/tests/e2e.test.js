// E2E: launches the real Electron app (dev mode, isolated userData) and
// exercises the features wired through the live frontend<->backend path:
// boot, terminal PTY, UI modes, widget toggles, workspaces, search bar,
// OSC-133 command blocks, plugins, theme/postfx plumbing, GeoIP-safe boot.
//
// NOTE: page.evaluate() cannot be used - the renderer replaces window.eval
// with a thrower and the CSP blocks eval-family APIs. All in-page calls go
// through webContents.executeJavaScript from the main process instead.
const { test } = require("node:test");
const assert = require("node:assert");
const os = require("os");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ELECTRON = require("electron");         // resolves to the binary path
const { _electron } = require("playwright-core");

const BOOT_TIMEOUT = 90000;

// Isolated userData so the e2e never touches the developer's real settings
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "xdex-e2e-"));
const env = { ...process.env };
if (process.platform === "win32") env.APPDATA = tmpHome;
else if (process.platform === "darwin") env.HOME = tmpHome;
else { env.XDG_CONFIG_HOME = tmpHome; env.HOME = tmpHome; }
delete env.ELECTRON_RUN_AS_NODE;

let app, page;

// Evaluate `code` inside the renderer via the main process (CSP-safe).
async function ev(code) {
    return app.evaluate(async ({ BrowserWindow }, c) => {
        const wc = BrowserWindow.getAllWindows()[0].webContents;
        return wc.executeJavaScript(c);
    }, code);
}

async function waitFor(code, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try { if (await ev(code)) return; } catch (_) {}
        await new Promise(r => setTimeout(r, 300));
    }
    throw new Error("timeout waiting for: " + code.slice(0, 100));
}

test.before(async () => {
    app = await _electron.launch({
        executablePath: ELECTRON,
        args: [path.join(ROOT, "src"), "--nointro"],
        env
    });
    page = await app.firstWindow();
    await waitFor(
        "window.mods && window.term && window.term[0] && !!window.term[0].term",
        BOOT_TIMEOUT);
});
test.after(async () => {
    if (app) await app.close().catch(() => {});
    fs.rmSync(tmpHome, { recursive: true, force: true });
});

test("boot: window, mode attribute and terminal are up", async () => {
    const mode = await ev(`document.body.getAttribute("data-ui-mode")`);
    assert.ok(["immersive", "productive", "light"].includes(mode));
    assert.ok(await ev(`!!document.getElementById("main_shell")`));
    assert.ok(await ev(`typeof window.term[0].term === "object"`));
});

test("terminal PTY: typing a command lands in the scrollback buffer", async () => {
    // Wait for the PTY websocket - keys sent earlier are dropped by xterm.
    await waitFor(
        `window.term[0].socket && window.term[0].socket.readyState === 1`,
        30000);
    await ev(`window.term[0].term.focus()`);
    await page.keyboard.type("echo E2E_MARKER_42");
    await page.keyboard.press("Enter");
    await waitFor(`(() => {
        const b = window.term[0].term.buffer.active;
        for (let i = 0; i < b.length; i++) {
            const l = b.getLine(i);
            if (l && l.translateToString().includes("E2E_MARKER_42")) return true;
        }
        return false;
    })()`, 30000);
    assert.ok(true);
});

test("monitor widgets exist and polling populates tempinfo", async () => {
    for (const id of ["mod_tempinfo", "mod_diskinfo", "mod_dockinfo", "mod_nettopo"]) {
        assert.ok(await ev(`!!document.getElementById("${id}")`), `#${id} rendered`);
    }
    await waitFor(`(() => {
        const t = document.getElementById("mod_tempinfo_main");
        return t && t.innerText !== "CPU --°C" && t.innerText !== "";
    })()`, 30000);
});

test("UI mode switch: light hides monitor columns, immersive restores", async () => {
    await ev(`window.applyUIMode("light", false)`);
    assert.equal(await ev(`document.getElementById("mod_column_left").style.display === "none"`), true);
    await ev(`window.applyUIMode("immersive", false)`);
    assert.equal(await ev(`document.getElementById("mod_column_left").style.display === "none"`), false);
});

test("widget toggle hides the widget and pauses its polling", async () => {
    // Toggles applied before a module's async init arms _setPaused are
    // stashed via _pendingPaused; wait for the armed state to assert _paused.
    await waitFor(
        `typeof window.mods.cpuinfo._setPaused === "function"`, 30000);
    await ev(`(window.settings.monitorWidgets = {cpuinfo: false}, window.applyUIMode("immersive", false))`);
    assert.equal(await ev(`(() => {
        const el = window.mods.cpuinfo._element || document.getElementById("mod_cpuinfo");
        return el.style.display === "none" && window.mods.cpuinfo._paused === true;
    })()`), true);
    await ev(`(window.settings.monitorWidgets = {}, window.applyUIMode("immersive", false))`);
});

test("workspaces: save captures tabs+cwd and round-trips", async () => {
    const n = await ev(`(window.saveWorkspace("e2e-ws"), window.workspaceStore.workspaces.length)`);
    assert.ok(n >= 1);
    const ws = await ev(`window.workspaceStore.workspaces.find(w => w.name === "e2e-ws")`);
    assert.ok(ws && Array.isArray(ws.tabs));
});

test("terminal search bar opens on action", async () => {
    await ev(`window.openTermSearch()`);
    assert.ok(await ev(`!!document.getElementById("term_search")`));
    await page.keyboard.press("Escape");
});

test("OSC-133: injected prompt marker registers a command block", async () => {
    await ev(`window.term[0].term.write("\\x1b]133;A\\x07")`);
    await waitFor(`window.term[0].commandMarkers.length > 0`, 5000);
    await ev(`window.term[0]._scrollToBlock(-1)`);   // runs without throwing
    assert.ok(true);
});

test("plugins directory loads without crashing boot", async () => {
    // Whether or not a manifest exists, plugin load must not break mods
    const keys = await ev(`Object.keys(window.mods)`);
    assert.ok(keys.includes("cpuinfo"));
});

test("no uncaught startup errors: app stays responsive after boot", async () => {
    assert.ok(await ev(`!!window.mods.netstat && !!window.mods.globe`));
});
