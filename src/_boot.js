const signale = require("signale");
const {app, BrowserWindow, dialog, shell} = require("electron");
const { enable } = require('@electron/remote/main');

process.on("uncaughtException", e => {
    signale.fatal(e);
    dialog.showErrorBox("xDEX-UI crashed", e.message || "Cannot retrieve error message.");
    if (tty) {
        tty.close();
    }
    if (extraTtys) {
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] !== null) {
                extraTtys[key].close();
            }
        });
    }
    process.exit(1);
});

signale.start(`Starting xDEX-UI v${app.getVersion()}`);
signale.info(`With Node ${process.versions.node} and Electron ${process.versions.electron}`);
signale.info(`Renderer is Chrome ${process.versions.chrome}`);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    signale.fatal("Error: Another instance of xDEX-UI is already running. Cannot proceed.");
    app.exit(1);
}

signale.time("Startup");

const electron = require("electron");
const remoteMain = require('@electron/remote/main')
remoteMain.initialize();
remoteMain.enable(electron.webContents);
const ipc = electron.ipcMain;
ipc.handle("get-cli-args", () => process.argv);
const path = require("path");
const url = require("url");
const fs = require("fs");
const which = require("which");
const Terminal = require("./classes/terminal.class.js").Terminal;

ipc.on("log", (e, type, content) => {
    signale[type](content);
});

// ---------------------------------------------------------------------------
// Privileged IPC surface for the context-isolated renderer (src/preload.js).
// Keep channels narrow and validate inputs; the page cannot reach node or
// arbitrary ipcRenderer channels - only these handlers.
// ---------------------------------------------------------------------------
const os = require("os");
const { clipboard, screen, globalShortcut } = require("electron");

ipc.on("edex:get-consts", e => {
    e.returnValue = {
        platform: process.platform,
        arch: process.arch,
        osType: os.type(),
        osRelease: os.release(),
        home: os.homedir(),
        hostname: os.hostname(),
        username: (() => { try { return os.userInfo().username; } catch (_) { return "user"; } })(),
        appDir: __dirname,
        appName: app.getName(),
        appVersion: app.getVersion(),
        versions: {
            app: app.getVersion(),
            electron: process.versions.electron,
            node: process.versions.node,
            chrome: process.versions.chrome
        },
        paths: {
            userData: app.getPath("userData"),
            home: app.getPath("home"),
            appData: app.getPath("appData"),
            documents: app.getPath("documents"),
            downloads: app.getPath("downloads"),
            temp: app.getPath("temp"),
            desktop: app.getPath("desktop")
        }
    };
});

// --- filesystem -------------------------------------------------------------
function fsSync(handler) {
    return (e, ...args) => {
        try { e.returnValue = handler(...args); }
        catch (err) { e.returnValue = { __err: String(err && err.message || err) }; }
    };
}
ipc.on("edex:fs:readFileSync", fsSync((p, enc) => fs.readFileSync(p, enc)));
ipc.on("edex:fs:existsSync", fsSync((p) => fs.existsSync(p)));
ipc.on("edex:fs:writeFileSync", fsSync((p, data, enc) => { fs.writeFileSync(p, data, enc); return null; }));
ipc.on("edex:fs:mkdirSync", fsSync((p, opts) => { fs.mkdirSync(p, opts || { recursive: true }); return null; }));
ipc.on("edex:fs:statSync", fsSync((p) => {
    const s = fs.statSync(p);
    return { _f: s.isFile(), _d: s.isDirectory(), _l: s.isSymbolicLink(),
             size: s.size, atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs };
}));
ipc.on("edex:fs:readdirSync", fsSync((p) => fs.readdirSync(p, { withFileTypes: true })
    .map(d => ({ n: d.name, d: d.isDirectory(), f: d.isFile(), l: d.isSymbolicLink() }))));

ipc.handle("edex:fs:readFile", async (e, p, enc) => fs.promises.readFile(p, enc));
ipc.handle("edex:fs:writeFile", async (e, p, data, enc) => fs.promises.writeFile(p, data, enc));
ipc.handle("edex:fs:readdir", async (e, p) => fs.promises.readdir(p));
ipc.handle("edex:fs:stat", async (e, p) => {
    const s = await fs.promises.stat(p);
    return { _f: s.isFile(), _d: s.isDirectory(), _l: s.isSymbolicLink(),
             size: s.size, atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs };
});
ipc.handle("edex:fs:lstat", async (e, p) => {
    const s = await fs.promises.lstat(p);
    return { _f: s.isFile(), _d: s.isDirectory(), _l: s.isSymbolicLink(),
             size: s.size, atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs };
});

// fs.watch forwarding (filesystem module live-refresh)
const fsWatchers = new Map();
ipc.on("edex:fs:watch", (e, dir) => {
    if (typeof dir !== "string" || fsWatchers.has(dir)) return;
    try {
        const w = fs.watch(dir, (ev, name) => {
            if (win && !win.isDestroyed()) e.sender.send("edex:fs:watch:" + dir, ev, name && name.toString());
        });
        w.on("error", () => {});
        fsWatchers.set(dir, w);
    } catch (_) { /* directory may not exist */ }
});
ipc.on("edex:fs:unwatch", (e, dir) => {
    const w = fsWatchers.get(dir);
    if (w) { try { w.close(); } catch (_) {} fsWatchers.delete(dir); }
});

// --- clipboard / shell / screen / os ----------------------------------------
ipc.on("edex:clipboard:readText", e => { e.returnValue = clipboard.readText(); });
ipc.on("edex:clipboard:writeText", (e, t) => clipboard.writeText(String(t || "")));
ipc.on("edex:shell:openExternal", (e, u) => {
    if (typeof u === "string" && /^https?:\/\//i.test(u)) shell.openExternal(u);
});
ipc.handle("edex:shell:openPath", (e, p) => shell.openPath(String(p)));
ipc.on("edex:screen:getAllDisplays", e => { e.returnValue = screen.getAllDisplays(); });
ipc.on("edex:os:uptime", e => { e.returnValue = os.uptime(); });

// --- app / window controls ---------------------------------------------------
ipc.on("edex:app:focus", () => { if (win && !win.isDestroyed()) win.focus(); });
ipc.on("edex:app:relaunch", () => { app.relaunch(); app.exit(0); });
ipc.on("edex:app:quit", () => app.quit());
ipc.on("edex:win:minimize", () => { if (win) win.minimize(); });
ipc.on("edex:win:close", () => { if (win) win.close(); });
ipc.on("edex:win:focus", () => { if (win) win.focus(); });
ipc.on("edex:win:setFullScreen", (e, b) => { if (win) win.setFullScreen(!!b); });
ipc.on("edex:win:isFullScreen", e => { e.returnValue = win ? win.isFullScreen() : false; });
ipc.on("edex:win:setSize", (e, w, h) => { if (win) win.setSize(Number(w) || 1280, Number(h) || 720); });
ipc.on("edex:win:toggleDevTools", () => { if (win) win.webContents.toggleDevTools(); });

// --- global shortcuts ---------------------------------------------------------
ipc.on("edex:gs:register", (e, accel) => {
    if (typeof accel !== "string") return;
    try {
        globalShortcut.register(accel, () => {
            if (win && !win.isDestroyed()) win.webContents.send("edex:gs:pressed:" + accel);
        });
    } catch (_) { /* invalid accelerator */ }
});
ipc.on("edex:gs:unregisterAll", () => globalShortcut.unregisterAll());

// --- GeoIP (lazy: downloads MaxMind db on first use) ---------------------------
let geoReader = null;
ipc.handle("edex:geo:init", async (e, cacheDir) => {
    if (geoReader) return true;
    const geolite2 = require("geolite2-redist");
    const maxmind = require("maxmind");
    await geolite2.downloadDbs(cacheDir);
    geoReader = await geolite2.open("GeoLite2-City", p => maxmind.open(p));
    return true;
});
ipc.on("edex:geo:lookup", (e, ip) => {
    try { e.returnValue = geoReader ? geoReader.get(ip) : null; }
    catch (_) { e.returnValue = null; }
});

// --- raw network primitives for NetStat ---------------------------------------
// Failures resolve as {__err} - the preload rethrows them page-side, keeping
// invoke rejections (and their main-process logging) out of the happy path.
ipc.handle("edex:net:tcpPing", (e, host, port, local) => new Promise((resolve) => {
    const net = require("net");
    const start = process.hrtime();
    const s = new net.Socket();
    const fail = (err) => { try { s.destroy(); } catch (_) {} resolve({ __err: String(err && err.code || err || "connect failed") }); };
    s.setTimeout(5000, () => fail("timeout"));
    s.once("error", fail);
    s.connect({ port: Number(port), host: String(host), localAddress: String(local), family: 4 }, () => {
        const t = process.hrtime(start);
        try { s.destroy(); } catch (_) {}
        resolve((t[0] * 1e9 + t[1]) / 1e6);
    });
}));
ipc.handle("edex:net:httpsGet", (e, opts) => new Promise((resolve) => {
    const https = require("https");
    if (!opts || typeof opts.host !== "string" || typeof opts.path !== "string") return resolve({ __err: "bad options" });
    const req = https.get({
        host: opts.host, port: Number(opts.port) || 443, path: opts.path,
        localAddress: typeof opts.localAddress === "string" ? opts.localAddress : undefined,
        agent: new https.Agent({ keepAlive: false, maxSockets: 10 })
    }, res => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => resolve(data));
    });
    req.on("error", err => resolve({ __err: String(err && err.code || err) }));
}));

// --- SQLite database viewer ----------------------------------------------------
const openDbs = new Map();
let dbCounter = 0;
ipc.handle("edex:db:open", (e, p) => new Promise((resolve, reject) => {
    const sqlite3 = require("sqlite3").verbose();
    const db = new sqlite3.Database(String(p), err => {
        if (err) return reject(new Error(String(err.message || err)));
        const id = "db" + (++dbCounter);
        openDbs.set(id, db);
        resolve(id);
    });
}));
ipc.handle("edex:db:all", (e, id, sql) => new Promise((resolve, reject) => {
    const db = openDbs.get(id);
    if (!db) return reject(new Error("Database handle not found"));
    db.all(String(sql), (err, rows) => err ? reject(new Error(String(err.message || err))) : resolve(rows || []));
}));
ipc.handle("edex:db:close", (e, id) => new Promise((resolve) => {
    const db = openDbs.get(id);
    openDbs.delete(id);
    if (!db) return resolve(false);
    db.close(() => resolve(true));
}));

var win, tty, extraTtys;
const settingsFile = path.join(electron.app.getPath("userData"), "settings.json");
const shortcutsFile = path.join(electron.app.getPath("userData"), "shortcuts.json");
const lastWindowStateFile = path.join(electron.app.getPath("userData"), "lastWindowState.json");
const themesDir = path.join(electron.app.getPath("userData"), "themes");
const innerThemesDir = path.join(__dirname, "assets/themes");
const kblayoutsDir = path.join(electron.app.getPath("userData"), "keyboards");
const innerKblayoutsDir = path.join(__dirname, "assets/kb_layouts");
const fontsDir = path.join(electron.app.getPath("userData"), "fonts");
const innerFontsDir = path.join(__dirname, "assets/fonts");

// Unset proxy env variables to avoid connection problems on the internal websockets
// See #222
// Keep the value around so it can be applied to the Chromium network stack - see #1050
let envProxy = process.env.https_proxy || process.env.http_proxy || null;
if (process.env.http_proxy) delete process.env.http_proxy;
if (process.env.https_proxy) delete process.env.https_proxy;

// Bypass GPU acceleration blocklist, trading a bit of stability for a great deal of performance, mostly on Linux
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-video-decode");

// Fix userData folder not setup on Windows
try {
    fs.mkdirSync(electron.app.getPath("userData"));
    signale.info(`Created config dir at ${electron.app.getPath("userData")}`);
} catch(e) {
    signale.info(`Base config dir is ${electron.app.getPath("userData")}`);
}
// Create default settings file
if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
        shell: (process.platform === "win32") ? "powershell.exe" : "bash",
        shellArgs: '',
        cwd: electron.app.getPath("userData"),
        keyboard: "en-US",
        theme: "tron",
        termFontSize: 15,
        termScrollback: 5000,
        audio: true,
        audioVolume: 1.0,
        disableFeedbackAudio: false,
        clockHours: 24,
        pingAddr: "1.1.1.1",
        port: 3000,
        nointro: false,
        nocursor: false,
        forceFullscreen: true,
        windowWidth: 1280,
        windowHeight: 720,
        openDevTools: false,
        allowWindowed: false,
        excludeThreadsFromToplist: true,
        hideDotfiles: false,
        fsListView: false,
        experimentalGlobeFeatures: false,
        experimentalFeatures: false
    }, "", 4));
    signale.info(`Default settings written to ${settingsFile}`);
}
// Support for proxies / regulated networks - see #1050
// The "proxy" setting (or standard *_proxy env vars) is applied to the Chromium
// network stack; internal websockets are not affected since they run over Node.js
try {
    let earlySettings = JSON.parse(fs.readFileSync(settingsFile, {encoding: "utf-8"}));
    let proxyServer = earlySettings.proxy || envProxy;
    if (proxyServer) {
        app.commandLine.appendSwitch("proxy-server", proxyServer);
        signale.info(`Using proxy server ${proxyServer}`);
    }
    if (earlySettings.proxyBypassList) {
        app.commandLine.appendSwitch("proxy-bypass-list", earlySettings.proxyBypassList);
    }
} catch(e) {
    signale.warn("Could not read settings file for proxy configuration");
}
// Create default shortcuts file
if (!fs.existsSync(shortcutsFile)) {
    fs.writeFileSync(shortcutsFile, JSON.stringify([
        { type: "app", trigger: "Ctrl+Shift+C", action: "COPY", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+V", action: "PASTE", enabled: true },
        { type: "app", trigger: "Ctrl+Tab", action: "NEXT_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+Tab", action: "PREVIOUS_TAB", enabled: true },
        { type: "app", trigger: "Ctrl+X", action: "TAB_X", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+S", action: "SETTINGS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+K", action: "SHORTCUTS", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+F", action: "TERMINAL_SEARCH", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+E", action: "FUZZY_SEARCH", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+L", action: "FS_LIST_VIEW", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+H", action: "FS_DOTFILES", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+P", action: "KB_PASSMODE", enabled: true },
        { type: "app", trigger: "Ctrl+Shift+I", action: "DEV_DEBUG", enabled: false },
        { type: "app", trigger: "Ctrl+Shift+F5", action: "DEV_RELOAD", enabled: true },
        { type: "shell", trigger: "Ctrl+Shift+Alt+Space", action: "neofetch", linebreak: true, enabled: false }
    ], "", 4));
    signale.info(`Default keymap written to ${shortcutsFile}`);
} else {
    // Migrate the pre-3.1 default: Ctrl+Shift+F moved from FUZZY_SEARCH to the
    // new terminal scrollback search. Only the old default binding is moved -
    // a user who remapped either key keeps their choice.
    try {
        let cuts = JSON.parse(fs.readFileSync(shortcutsFile));
        const hasTermSearch = cuts.some(c => c.action === "TERMINAL_SEARCH");
        const owner = cuts.find(c => c.trigger === "Ctrl+Shift+F" && c.action !== "FUZZY_SEARCH");
        if (!hasTermSearch && !owner) {
            const fuzzy = cuts.find(c => c.action === "FUZZY_SEARCH" && c.trigger === "Ctrl+Shift+F");
            if (fuzzy) fuzzy.trigger = "Ctrl+Shift+E";
            cuts.push({ type: "app", trigger: "Ctrl+Shift+F", action: "TERMINAL_SEARCH", enabled: true });
            fs.writeFileSync(shortcutsFile, JSON.stringify(cuts, "", 4));
            signale.info("Migrated Ctrl+Shift+F default: TERMINAL_SEARCH (FUZZY_SEARCH -> Ctrl+Shift+E)");
        }
    } catch(e) {
        signale.warn("shortcuts.json migration skipped: " + e);
    }
}
//Create default window state file
if(!fs.existsSync(lastWindowStateFile)) {
    fs.writeFileSync(lastWindowStateFile, JSON.stringify({
        useFullscreen: true
    }, "", 4));
    signale.info(`Default last window state written to ${lastWindowStateFile}`);
}

// Copy default themes & keyboard layouts & fonts
signale.pending("Mirroring internal assets...");
try {
    fs.mkdirSync(themesDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerThemesDir).forEach(e => {
    fs.writeFileSync(path.join(themesDir, e), fs.readFileSync(path.join(innerThemesDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(kblayoutsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerKblayoutsDir).forEach(e => {
    fs.writeFileSync(path.join(kblayoutsDir, e), fs.readFileSync(path.join(innerKblayoutsDir, e), {encoding:"utf-8"}));
});
try {
    fs.mkdirSync(fontsDir);
} catch(e) {
    // Folder already exists
}
fs.readdirSync(innerFontsDir).forEach(e => {
    fs.writeFileSync(path.join(fontsDir, e), fs.readFileSync(path.join(innerFontsDir, e)));
});

// Version history logging
const versionHistoryPath = path.join(electron.app.getPath("userData"), "versions_log.json");
var versionHistory = fs.existsSync(versionHistoryPath) ? require(versionHistoryPath) : {};
var version = app.getVersion();
if (typeof versionHistory[version] === "undefined") {
	versionHistory[version] = {
		firstSeen: Date.now(),
		lastSeen: Date.now()
	};
} else {
	versionHistory[version].lastSeen = Date.now();
}
fs.writeFileSync(versionHistoryPath, JSON.stringify(versionHistory, 0, 2), {encoding:"utf-8"});

function createWindow(settings) {
    signale.info("Creating window...");

    let display;
    if (!isNaN(settings.monitor)) {
        display = electron.screen.getAllDisplays()[settings.monitor] || electron.screen.getPrimaryDisplay();
    } else {
        display = electron.screen.getPrimaryDisplay();
    }
    let {x, y, width: displayWidth, height: displayHeight} = display.bounds;

    let winWidth, winHeight, winX, winY;
    if (settings.forceFullscreen) {
        winWidth = displayWidth + 1;
        winHeight = displayHeight + 1;
        winX = x;
        winY = y;
    } else if (settings.allowWindowed) {
        winWidth = Number(settings.windowWidth) || 1280;
        winHeight = Number(settings.windowHeight) || 720;
        if (winWidth > displayWidth) winWidth = displayWidth;
        if (winHeight > displayHeight) winHeight = displayHeight;
        winX = x + Math.floor((displayWidth - winWidth) / 2);
        winY = y + Math.floor((displayHeight - winHeight) / 2);
    } else {
        winWidth = displayWidth + 1;
        winHeight = displayHeight + 1;
        winX = x;
        winY = y;
    }

    win = new BrowserWindow({
        title: "xDEX-UI",
        x: winX,
        y: winY,
        width: winWidth,
        height: winHeight,
        show: false,
        resizable: true,
        movable: settings.allowWindowed || false,
        fullscreen: settings.forceFullscreen || false,
        autoHideMenuBar: true,
        frame: settings.allowWindowed || false,
        backgroundColor: '#000000',
        webPreferences: {
            devTools: true,
            // Full renderer isolation: the page has no node/electron access.
            // Privileged operations go through src/preload.js -> ipcMain handlers.
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, "preload.js"),
            backgroundThrottling: false,
            webSecurity: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            allowRunningInsecureContent: false,
            navigateOnDragDrop: false,
            experimentalFeatures: settings.experimentalFeatures || false
        }
    });

    // Forward window events the renderer UI listens to
    ["leave-full-screen", "enter-full-screen", "resize", "unmaximize", "maximize"].forEach(ev => {
        win.on(ev, () => {
            if (win && !win.isDestroyed()) win.webContents.send("edex:win:event:" + ev);
        });
    });

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'ui.html'),
        protocol: 'file:',
        slashes: true
    }));

    signale.complete("Frontend window created!");
    win.show();
    if (settings.openDevTools) {
        try {
            win.webContents.openDevTools({ mode: 'detach' });
            signale.info('Browser devtools opened (detach mode)');
        } catch (e) {
            signale.warn('Could not open devtools:', e.message || e);
        }
    }
    if (!settings.allowWindowed) {
        win.setResizable(false);
    } else if (!require(lastWindowStateFile)["useFullscreen"]) {
        win.setFullScreen(false);
    }

    signale.watch("Waiting for frontend connection...");
}

app.on('ready', async () => {
    signale.pending(`Loading settings file...`);
    let settings = require(settingsFile);
    // CLI overrides: allow starting windowed with `--windowed` or `-w`
    const cliArgs = process.argv.slice(2);
    if (cliArgs.includes('--windowed') || cliArgs.includes('-w')) {
        signale.info('CLI: --windowed detected; launching windowed');
        settings.forceFullscreen = false;
        settings.allowWindowed = true;
    }
    if (cliArgs.includes('--devtools') || cliArgs.includes('-d')) {
        signale.info('CLI: --devtools detected; opening browser devtools');
        settings.openDevTools = true;
    }
    signale.pending(`Resolving shell path...`);
    settings.shell = await which(settings.shell).catch(e => { throw(e) });
    signale.info(`Shell found at ${settings.shell}`);
    signale.success(`Settings loaded!`);

    if (!require("fs").existsSync(settings.cwd)) throw new Error("Configured cwd path does not exist.");

    // See #366
    let cleanEnv = await require("shell-env")(settings.shell).catch(e => { throw e; });

    Object.assign(cleanEnv, {
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        TERM_PROGRAM: "xDEX-UI",
        TERM_PROGRAM_VERSION: app.getVersion()
    }, settings.env);

    signale.pending(`Creating new terminal process on port ${settings.port || '3000'}`);
    tty = new Terminal({
        role: "server",
        shell: settings.shell,
        params: settings.shellArgs || '',
        cwd: settings.cwd,
        env: cleanEnv,
        port: settings.port || 3000
    });
    signale.success(`Terminal back-end initialized!`);
    tty.onclosed = (code, signal) => {
        tty.ondisconnected = () => {};
        signale.complete("Terminal exited", code, signal);
        app.quit();
    };
    tty.onopened = () => {
        signale.success("Connected to frontend!");
        signale.timeEnd("Startup");
    };
    tty.onresized = (cols, rows) => {
        signale.info("Resized TTY to ", cols, rows);
    };
    tty.ondisconnected = () => {
        signale.error("Lost connection to frontend");
        signale.watch("Waiting for frontend connection...");
    };

    // Support for multithreaded systeminformation calls
    signale.pending("Starting multithreaded calls controller...");
    require("./_multithread.js");

    createWindow(settings);

    // Support for more terminals, used for creating tabs (currently limited to 4 extra terms)
    extraTtys = {};
    let basePort = settings.port || 3000;
    basePort = Number(basePort) + 2;

    for (let i = 0; i < 4; i++) {
        extraTtys[basePort+i] = null;
    }

    ipc.on("ttyspawn", (e, arg) => {
        let port = null;
        Object.keys(extraTtys).forEach(key => {
            if (extraTtys[key] === null && port === null) {
                extraTtys[key] = {};
                port = key;
            }
        });

        if (port === null) {
            signale.error("TTY spawn denied (Reason: exceeded max TTYs number)");
            e.sender.send("ttyspawn-reply", "ERROR: max number of ttys reached");
        } else {
            // Optional per-spawn cwd (workspace restore). Only an existing
            // directory is honored; anything else falls back to the main
            // terminal's cwd / settings.cwd - never executes anything.
            let spawnCwd = tty.tty._cwd || settings.cwd;
            if (arg && typeof arg === "object" && typeof arg.cwd === "string") {
                try {
                    if (fs.existsSync(arg.cwd)) spawnCwd = arg.cwd;
                } catch(e) { /* keep fallback */ }
            }
            signale.pending(`Creating new TTY process on port ${port}`);
            let term = new Terminal({
                role: "server",
                shell: settings.shell,
                params: settings.shellArgs || '',
                cwd: spawnCwd,
                env: cleanEnv,
                port: port
            });
            signale.success(`New terminal back-end initialized at ${port}`);
            term.onclosed = (code, signal) => {
                term.ondisconnected = () => {};
                term.wss.close();
                signale.complete(`TTY exited at ${port}`, code, signal);
                extraTtys[term.port] = null;
                term = null;
            };
            term.onopened = pid => {
                signale.success(`TTY ${port} connected to frontend (process PID ${pid})`);
            };
            term.onresized = () => {};
            // See #630 - keep the TTY alive when the frontend disconnects (e.g. hot reload),
            // so that the tab can be restored when the UI comes back up
            term.ondisconnected = () => {
                signale.error(`Lost connection to frontend (tty ${port})`);
                signale.watch("Waiting for frontend connection...");
            };

            extraTtys[port] = term;
            e.sender.send("ttyspawn-reply", "SUCCESS: "+port);
        }
    });

    // See #630 - allow the frontend to re-attach to extra TTYs still alive after a UI reload
    ipc.on("getExtraTtys", e => {
        e.sender.send("getExtraTtys-reply", Object.keys(extraTtys).filter(p => extraTtys[p] !== null && extraTtys[p].wss));
    });

    // Backend support for theme and keyboard hotswitch
    let themeOverride = null;
    let kbOverride = null;
    ipc.on("getThemeOverride", (e, arg) => {
        e.sender.send("getThemeOverride", themeOverride);
    });
    ipc.on("getKbOverride", (e, arg) => {
        e.sender.send("getKbOverride", kbOverride);
    });
    ipc.on("setThemeOverride", (e, arg) => {
        themeOverride = arg;
    });
    ipc.on("setKbOverride", (e, arg) => {
        kbOverride = arg;
    });
});

app.on('web-contents-created', (e, contents) => {
    // Prevent creating more than one window
    contents.on('new-window', (e, url) => {
        e.preventDefault();
        shell.openExternal(url);
    });

    // Prevent loading something else than the UI
    contents.on('will-navigate', (e, url) => {
        if (url !== contents.getURL()) e.preventDefault();
    });

    // The app needs no web permissions (geolocation, media, notifications...)
    contents.session.setPermissionRequestHandler((wc, permission, callback) => {
        callback(false);
    });
    contents.session.setPermissionCheckHandler(() => false);
});

app.on('window-all-closed', () => {
    signale.info("All windows closed");
    app.quit();
});

app.on('before-quit', () => {
    tty.close();
    Object.keys(extraTtys).forEach(key => {
        if (extraTtys[key] !== null) {
            extraTtys[key].close();
        }
    });
    signale.complete("Shutting down...");
});
