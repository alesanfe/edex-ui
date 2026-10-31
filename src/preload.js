// Preload bridge: runs in the isolated context with node access and exposes
// narrow shims to the page under the same global names the renderer used when
// nodeIntegration was enabled. Privileged work happens in the main process
// over IPC; nothing here executes remote content.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

// Constants resolved synchronously from the main process
const consts = ipcRenderer.sendSync("edex:get-consts") || {};

const ipc = {
    send: (ch, ...args) => ipcRenderer.send(ch, ...args),
    sendSync: (ch, ...args) => ipcRenderer.sendSync(ch, ...args),
    invoke: (ch, ...args) => ipcRenderer.invoke(ch, ...args),
    on: (ch, fn) => ipcRenderer.on(ch, (e, ...a) => fn(e, ...a)),
    once: (ch, fn) => ipcRenderer.once(ch, (e, ...a) => fn(e, ...a)),
    removeListener: (ch, fn) => ipcRenderer.removeListener(ch, fn),
    removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch)
};

// Main returns {__err:"..."} on sync-handler failure - rethrow page-side
const chk = (r) => {
    if (r && typeof r === "object" && r.__err) throw new Error(r.__err);
    return r;
};

// Rebuild a usable fs.Stats-like object from the serialized main-process stat
const hydrateStat = (s) => {
    if (!s) return s;
    return {
        size: s.size,
        atime: new Date(s.atimeMs),
        mtime: new Date(s.mtimeMs),
        birthtime: new Date(s.birthtimeMs),
        atimeMs: s.atimeMs, mtimeMs: s.mtimeMs, birthtimeMs: s.birthtimeMs,
        isFile: () => s._f,
        isDirectory: () => s._d,
        isSymbolicLink: () => s._l,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false
    };
};

const fsShim = {
    // Synchronous calls round-trip to the main process - same semantics
    // the renderer had with node fs (it blocks either way).
    readFileSync: (p, enc) => chk(ipc.sendSync("edex:fs:readFileSync", p, enc || "utf8")),
    existsSync: (p) => chk(ipc.sendSync("edex:fs:existsSync", p)),
    writeFileSync: (p, data, enc) => chk(ipc.sendSync("edex:fs:writeFileSync", p, data, enc || "utf8")),
    mkdirSync: (p, opts) => chk(ipc.sendSync("edex:fs:mkdirSync", p, opts || null)),
    readJsonSync: (p) => JSON.parse(chk(ipc.sendSync("edex:fs:readFileSync", p, "utf8"))),
    statSync: (p) => hydrateStat(chk(ipc.sendSync("edex:fs:statSync", p))),
    lstatSync: (p) => fsShim.statSync(p),
    readdirSync: (p, opts) => {
        const raw = chk(ipc.sendSync("edex:fs:readdirSync", p));
        if (opts && opts.withFileTypes) {
            return raw.map(d => ({
                name: d.n,
                isDirectory: () => d.d,
                isFile: () => d.f,
                isSymbolicLink: () => d.l,
                isBlockDevice: () => false,
                isCharacterDevice: () => false,
                isFIFO: () => false,
                isSocket: () => false
            }));
        }
        return raw.map(d => d.n);
    },
    // Callback-style async forms via invoke
    readFile: (p, enc, cb) => {
        if (typeof enc === "function") { cb = enc; enc = "utf8"; }
        ipc.invoke("edex:fs:readFile", p, enc || "utf8").then(d => cb(null, d)).catch(cb);
    },
    writeFile: (p, data, enc, cb) => {
        if (typeof enc === "function") { cb = enc; enc = "utf8"; }
        ipc.invoke("edex:fs:writeFile", p, data, enc || "utf8").then(() => cb && cb(null)).catch(e => cb && cb(e));
    },
    readdir: (p, cb) => {
        ipc.invoke("edex:fs:readdir", p).then(d => cb(null, d)).catch(e => cb(e));
    },
    stat: (p, cb) => {
        ipc.invoke("edex:fs:stat", p).then(d => cb(null, hydrateStat(d))).catch(e => cb(e));
    },
    lstat: (p, cb) => {
        ipc.invoke("edex:fs:lstat", p).then(d => cb(null, hydrateStat(d))).catch(e => cb(e));
    },
    watch: (dir, cb) => {
        const channel = "edex:fs:watch:" + dir;
        const handler = (e, ev, name) => cb(ev, name);
        ipc.send("edex:fs:watch", dir);
        ipc.on(channel, handler);
        return {
            close: () => {
                ipc.send("edex:fs:unwatch", dir);
                ipc.removeListener(channel, handler);
            }
        };
    }
};

const electronShim = {
    ipcRenderer: ipc,
    shell: {
        openExternal: (u) => ipc.send("edex:shell:openExternal", u),
        openPath: (p) => ipc.invoke("edex:shell:openPath", p)
    },
    clipboard: {
        readText: () => ipc.sendSync("edex:clipboard:readText"),
        writeText: (t) => ipc.send("edex:clipboard:writeText", t)
    },
    webFrame: {
        setVisualZoomLevelLimits: (min, max) => webFrame.setVisualZoomLevelLimits(min, max)
    }
};

const electronWinShim = {
    minimize: () => ipc.send("edex:win:minimize"),
    close: () => ipc.send("edex:win:close"),
    focus: () => ipc.send("edex:win:focus"),
    setFullScreen: (b) => ipc.send("edex:win:setFullScreen", b),
    isFullScreen: () => ipc.sendSync("edex:win:isFullScreen"),
    setSize: (w, h) => ipc.send("edex:win:setSize", w, h),
    on: (ev, fn) => ipc.on("edex:win:event:" + ev, fn),
    webContents: {
        toggleDevTools: () => ipc.send("edex:win:toggleDevTools")
    }
};

const remoteShim = {
    app: {
        getVersion: () => consts.appVersion,
        getName: () => consts.appName,
        getPath: (n) => (consts.paths || {})[n],
        focus: () => ipc.send("edex:app:focus"),
        relaunch: () => ipc.send("edex:app:relaunch"),
        quit: () => ipc.send("edex:app:quit")
    },
    screen: {
        getAllDisplays: () => ipc.sendSync("edex:screen:getAllDisplays")
    },
    getCurrentWindow: () => electronWinShim,
    clipboard: electronShim.clipboard,
    globalShortcut: {
        unregisterAll: () => ipc.send("edex:gs:unregisterAll"),
        register: (accel, cb) => {
            ipc.send("edex:gs:register", accel);
            ipc.on("edex:gs:pressed:" + accel, cb);
        },
        isRegistered: () => false
    },
    process: {
        platform: consts.platform,
        versions: consts.versions,
        env: {}
    }
};

const osShim = {
    platform: () => consts.platform,
    type: () => consts.osType,
    arch: () => consts.arch,
    release: () => consts.osRelease,
    homedir: () => consts.home,
    hostname: () => consts.hostname,
    uptime: () => ipc.sendSync("edex:os:uptime"),
    userInfo: () => ({ username: consts.username }),
    EOL: "\n"
};

const processShim = {
    platform: consts.platform,
    arch: consts.arch,
    versions: consts.versions,
    env: {},
    cwd: () => consts.appDir,
    hrtime: (start) => {
        const now = performance.now();
        const s = Math.floor(now / 1000), ns = Math.floor((now % 1000) * 1e6);
        return start ? [s - start[0], ns - start[1]] : [s, ns];
    }
};

contextBridge.exposeInMainWorld("ipc", ipc);
contextBridge.exposeInMainWorld("fs", fsShim);
contextBridge.exposeInMainWorld("os", osShim);
contextBridge.exposeInMainWorld("process", processShim);
contextBridge.exposeInMainWorld("electron", electronShim);
contextBridge.exposeInMainWorld("remote", remoteShim);
contextBridge.exposeInMainWorld("electronWin", electronWinShim);
contextBridge.exposeInMainWorld("__dirname", consts.appDir);
// Non-module constants + privileged service bridges
contextBridge.exposeInMainWorld("edex", {
    platform: consts.platform,
    appDir: consts.appDir,
    cwd: consts.appDir,
    username: consts.username,
    home: consts.home,
    invoke: ipc.invoke,
    sendSync: ipc.sendSync,
    db: {
        open: (p) => ipc.invoke("edex:db:open", p),
        all: (id, sql) => ipc.invoke("edex:db:all", id, sql),
        close: (id) => ipc.invoke("edex:db:close", id)
    },
    geo: {
        init: (cacheDir) => ipc.invoke("edex:geo:init", cacheDir),
        lookup: (ip) => ipc.sendSync("edex:geo:lookup", ip)
    },
    net: {
        tcpPing: (host, port, local) => ipc.invoke("edex:net:tcpPing", host, port, local).then(chk),
        httpsGet: (opts) => ipc.invoke("edex:net:httpsGet", opts).then(chk)
    }
});
// Flags consumed by assets/misc/deps-shim.js
contextBridge.exposeInMainWorld("edexPlatform", consts.platform);
contextBridge.exposeInMainWorld("edexCwd", consts.appDir);
