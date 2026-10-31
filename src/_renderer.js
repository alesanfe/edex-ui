// Disable eval()
window.eval = function () {
    throw new Error("eval() is disabled for security reasons.");
};
// Security helper :)
window._escapeHtml = text => {
    let map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => { return map[m]; });
};
window._encodePathURI = uri => {
    return encodeURI(uri).replace(/#/g, "%23");
};
window._purifyCSS = str => {
    if (typeof str === "undefined") return "";
    if (typeof str !== "string") {
        str = str.toString();
    }
    return str.replace(/[<]/g, "");
};
window._delay = ms => {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, ms);
    });
};

// Initiate basic error handling
window.onerror = (msg, path, line, col, error) => {
    document.getElementById("boot_screen").innerHTML += `${error} :  ${msg}<br/>==> at ${path}  ${line}:${col}`;
};

// fs, path, electron, remote, os, process, __dirname, edex and ipc are lexical
// globals injected by the preload bridge (src/preload.js) - no node
// integration in this context. Do not redeclare them at top level.

const settingsDir = remote.app.getPath("userData");
const themesDir = path.join(settingsDir, "themes");
const keyboardsDir = path.join(settingsDir, "keyboards");
const fontsDir = path.join(settingsDir, "fonts");
const settingsFile = path.join(settingsDir, "settings.json");
const shortcutsFile = path.join(settingsDir, "shortcuts.json");
const lastWindowStateFile = path.join(settingsDir, "lastWindowState.json");
const workspacesFile = path.join(settingsDir, "workspaces.json");

// Load config
window.settings = fs.readJsonSync(settingsFile);
window.shortcuts = fs.readJsonSync(shortcutsFile);
window.lastWindowState = fs.readJsonSync(lastWindowStateFile);
// Workspaces store (EPIC-04): corrupt entries are dropped, never fatal
window.workspaceStore = fs.existsSync(workspacesFile)
    ? window.Workspaces.parseStore(fs.readJsonSync(workspacesFile))
    : {version: window.Workspaces.SCHEMA_VERSION, workspaces: []};

window.writeWorkspacesFile = () => {
    fs.writeFileSync(workspacesFile, JSON.stringify(window.workspaceStore, "", 4));
};

// SSH profiles store (EPIC-05): metadata only - never secrets
const sshProfilesFile = path.join(settingsDir, "ssh-profiles.json");
window.sshStore = fs.existsSync(sshProfilesFile)
    ? window.SshProfiles.parseStore(fs.readJsonSync(sshProfilesFile))
    : {version: window.SshProfiles.SCHEMA_VERSION, profiles: []};
window.writeSshProfilesFile = () => {
    fs.writeFileSync(sshProfilesFile, JSON.stringify(window.sshStore, "", 4));
};

// Monitor history (EPIC-06 / MON-004): bounded local ring, opt-out via settings
window.MonitorHistory.init(path.join(settingsDir, "monitor-history.json"));

// Load CLI parameters
const args = ipc.invoke("get-cli-args").then(args => {
    if (args.includes("--nointro")) {
        window.settings.nointroOverride = true;
    } else {
        window.settings.nointroOverride = false;
    }
    if (args.includes("--nocursor")) {
        window.settings.nocursorOverride = true;
    } else {
        window.settings.nocursorOverride = false;
    }
});

// Retrieve theme override (hotswitch)
ipc.once("getThemeOverride", (e, theme) => {
    if (theme !== null) {
        window.settings.theme = theme;
        window.settings.nointroOverride = true;
        _loadTheme(fs.readJsonSync(path.join(themesDir, window.settings.theme + ".json")));
    } else {
        _loadTheme(fs.readJsonSync(path.join(themesDir, window.settings.theme + ".json")));
    }
});
ipc.send("getThemeOverride");
// Same for keyboard override/hotswitch
ipc.once("getKbOverride", (e, layout) => {
    if (layout !== null) {
        window.settings.keyboard = layout;
        window.settings.nointroOverride = true;
    }
});
ipc.send("getKbOverride");

// Load UI theme
window._loadTheme = theme => {

    if (document.querySelector("style.theming")) {
        document.querySelector("style.theming").remove();
    }

    // Load fonts
    let mainFont = new FontFace(theme.cssvars.font_main, `url("${path.join(fontsDir, theme.cssvars.font_main.toLowerCase().replace(/ /g, '_') + '.woff2').replace(/\\/g, '/')}")`);
    let lightFont = new FontFace(theme.cssvars.font_main_light, `url("${path.join(fontsDir, theme.cssvars.font_main_light.toLowerCase().replace(/ /g, '_') + '.woff2').replace(/\\/g, '/')}")`);
    let termFont = new FontFace(theme.terminal.fontFamily, `url("${path.join(fontsDir, theme.terminal.fontFamily.toLowerCase().replace(/ /g, '_') + '.woff2').replace(/\\/g, '/')}")`);

    document.fonts.add(mainFont);
    document.fonts.load("12px " + theme.cssvars.font_main);
    document.fonts.add(lightFont);
    document.fonts.load("12px " + theme.cssvars.font_main_light);
    document.fonts.add(termFont);
    document.fonts.load("12px " + theme.terminal.fontFamily);

    document.querySelector("head").innerHTML += `<style class="theming">
    :root {
        --font_main: "${window._purifyCSS(theme.cssvars.font_main)}";
        --font_main_light: "${window._purifyCSS(theme.cssvars.font_main_light)}";
        --font_mono: "${window._purifyCSS(theme.terminal.fontFamily)}";
        --color_r: ${window._purifyCSS(theme.colors.r)};
        --color_g: ${window._purifyCSS(theme.colors.g)};
        --color_b: ${window._purifyCSS(theme.colors.b)};
        --color_black: ${window._purifyCSS(theme.colors.black)};
        --color_light_black: ${window._purifyCSS(theme.colors.light_black)};
        --color_grey: ${window._purifyCSS(theme.colors.grey)};

        /* Used for error and warning modals */
        --color_red: ${window._purifyCSS(theme.colors.red) || "red"};
        --color_yellow: ${window._purifyCSS(theme.colors.yellow) || "yellow"};
    }

    body {
        font-family: var(--font_main), sans-serif;
        cursor: ${(window.settings.nocursorOverride || window.settings.nocursor) ? "none" : "default"} !important;
    }

    * {
   	   ${(window.settings.nocursorOverride || window.settings.nocursor) ? "cursor: none !important;" : ""}
	}

    ${window._purifyCSS(theme.injectCSS || "")}
    </style>`;

    window.theme = theme;
    window.theme.r = theme.colors.r;
    window.theme.g = theme.colors.g;
    window.theme.b = theme.colors.b;
};

function initGraphicalErrorHandling() {
    window.edexErrorsModals = [];
    window.onerror = (msg, path, line, col, error) => {
        let errorModal = new Modal({
            type: "error",
            title: error,
            message: `${msg}<br/>        at ${path}  ${line}:${col}`
        });
        window.edexErrorsModals.push(errorModal);

        ipc.send("log", "error", `${error}: ${msg}`);
        ipc.send("log", "debug", `at ${path} ${line}:${col}`);
    };
}

function waitForFonts() {
    return new Promise(resolve => {
        if (document.readyState !== "complete" || document.fonts.status !== "loaded") {
            document.addEventListener("readystatechange", () => {
                if (document.readyState === "complete") {
                    if (document.fonts.status === "loaded") {
                        resolve();
                    } else {
                        document.fonts.onloadingdone = () => {
                            if (document.fonts.status === "loaded") resolve();
                        };
                    }
                }
            });
        } else {
            resolve();
        }
    });
}

// A proxy function used to add multithreading to systeminformation calls - see backend process manager @ _multithread.js
function initSystemInformationProxy() {
    const nanoid = nanoidNonSecure;

    window.si = new Proxy({}, {
        apply: () => { throw new Error("Cannot use sysinfo proxy directly as a function") },
        set: () => { throw new Error("Cannot set a property on the sysinfo proxy") },
        get: (target, prop, receiver) => {
            return function (...args) {
                let callback = (typeof args[args.length - 1] === "function") ? true : false;

                return new Promise((resolve, reject) => {
                    let id = nanoid();
                    ipc.once("systeminformation-reply-" + id, (e, res) => {
                        if (callback) {
                            args[args.length - 1](res);
                        }
                        resolve(res);
                    });
                    ipc.send("systeminformation-call", prop, id, ...args);
                });
            };
        }
    });
}

// Init audio
window.audioManager = new AudioManager();

// See #223
remote.app.focus();

function redrawTerminalCanvas(parentId) {
    try {
        const parent = document.getElementById(parentId);
        if (!parent) return;
        const canvases = parent.querySelectorAll('canvas');
        canvases.forEach(c => {
            const prev = c.style.visibility || '';
            c.style.visibility = 'hidden';
            requestAnimationFrame(() => requestAnimationFrame(() => { c.style.visibility = prev; }));
        });
    } catch (e) {
        // ignore
    }
}

let i = 0;
if (window.settings.nointro || window.settings.nointroOverride) {
    initGraphicalErrorHandling();
    initSystemInformationProxy();
    document.getElementById("boot_screen").remove();
    document.body.setAttribute("class", "");
    waitForFonts().then(initUI);
} else {
    displayLine();
}

// Startup boot log
function displayLine() {
    let bootScreen = document.getElementById("boot_screen");
    let log = fs.readFileSync(path.join(__dirname, "assets", "misc", "boot_log.txt")).toString().split('\n');

    function isArchUser() {
        return os.platform() === "linux"
            && fs.existsSync("/etc/os-release")
            && fs.readFileSync("/etc/os-release").toString().includes("arch");
    }

    if (typeof log[i] === "undefined") {
        setTimeout(displayTitleScreen, 300);
        return;
    }

    if (log[i] === "Boot Complete") {
        window.audioManager.granted.play();
    } else {
        window.audioManager.stdout.play();
    }
    bootScreen.innerHTML += log[i] + "<br/>";
    i++;

    switch (true) {
        case i === 2:
            bootScreen.innerHTML += `xDEX-UI Kernel version ${remote.app.getVersion()} boot at ${Date().toString()}; root:xnu-1699.22.73~1/RELEASE_X86_64`;
        case i === 4:
            setTimeout(displayLine, 500);
            break;
        case i > 4 && i < 25:
            setTimeout(displayLine, 30);
            break;
        case i === 25:
            setTimeout(displayLine, 400);
            break;
        case i === 42:
            setTimeout(displayLine, 300);
            break;
        case i > 42 && i < 82:
            setTimeout(displayLine, 25);
            break;
        case i === 83:
            if (isArchUser())
                bootScreen.innerHTML += "btw i use arch<br/>";
            setTimeout(displayLine, 25);
            break;
        case i >= log.length - 2 && i < log.length:
            setTimeout(displayLine, 300);
            break;
        default:
            setTimeout(displayLine, Math.pow(1 - (i / 1000), 3) * 25);
    }
}

// Show "logo" and background grid
async function displayTitleScreen() {
    let bootScreen = document.getElementById("boot_screen");
    if (bootScreen === null) {
        bootScreen = document.createElement("section");
        bootScreen.setAttribute("id", "boot_screen");
        bootScreen.setAttribute("style", "z-index: 9999999");
        document.body.appendChild(bootScreen);
    }
    bootScreen.innerHTML = "";
    window.audioManager.theme.play();

    await _delay(400);

    document.body.setAttribute("class", "");
    bootScreen.setAttribute("class", "center");
    bootScreen.innerHTML = "<h1>xDEX-UI</h1>";
    let title = document.querySelector("section > h1");

    await _delay(200);

    document.body.setAttribute("class", "solidBackground");

    await _delay(100);

    title.setAttribute("style", `background-color: rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});border-bottom: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(300);

    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(100);

    title.setAttribute("style", "");
    title.setAttribute("class", "glitch");

    await _delay(500);

    document.body.setAttribute("class", "");
    title.setAttribute("class", "");
    title.setAttribute("style", `border: 5px solid rgb(${window.theme.r}, ${window.theme.g}, ${window.theme.b});`);

    await _delay(1000);
    if (window.term) {
        bootScreen.remove();
        return true;
    }
    initGraphicalErrorHandling();
    initSystemInformationProxy();
    waitForFonts().then(() => {
        bootScreen.remove();
        initUI();
    });
}

// Returns the user's desired display name
async function getDisplayName() {
    let user = settings.username || null;
    if (user)
        return user;

    try {
        user = edex.username;
    } catch (e) { }

    return user;
}

// Create the UI's html structure and initialize the terminal client and the keyboard
async function initUI() {
    // JSON assets that were previously require()d - loaded via fetch now
    if (!window.fileIcons || !window.gridJson) {
        let [icons, grid] = await Promise.all([
            fetch("assets/icons/file-icons.json").then(r => r.json()),
            fetch("assets/misc/grid.json").then(r => r.json())
        ]);
        window.fileIcons = icons;
        window.gridJson = grid;
    }

    document.body.innerHTML += `<section class="mod_column" id="mod_column_left">
        <h3 class="title"><p>PANEL</p><p>SYSTEM</p></h3>
    </section>
    <section id="main_shell" style="height:0%;width:0%;opacity:0;margin-bottom:30vh;" data-augmented-ui="bl-clip tr-clip border inlay exe">
        <h3 class="title" style="opacity:0;"><p>TERMINAL</p><p>MAIN SHELL</p></h3>
        <h1 id="main_shell_greeting"></h1>
    </section>
    <section class="mod_column" id="mod_column_right">
        <h3 class="title"><p>PANEL</p><p>NETWORK</p></h3>
    </section>`;

    await _delay(10);

    window.audioManager.expand.play();
    document.getElementById("main_shell").setAttribute("style", "height:0%;margin-bottom:30vh;");

    await _delay(500);

    document.getElementById("main_shell").setAttribute("style", "margin-bottom: 30vh;");
    document.querySelector("#main_shell > h3.title").setAttribute("style", "");

    await _delay(700);

    document.getElementById("main_shell").setAttribute("style", "opacity: 0;");
    document.body.innerHTML += `
    <section id="filesystem" style="width: 0px;" class="${window.settings.hideDotfiles ? "hideDotfiles" : ""} ${window.settings.fsListView ? "list-view" : ""}">
    </section>
    <section id="keyboard" style="opacity:0;">
    </section>`;
    window.keyboard = new Keyboard({
        layout: path.join(keyboardsDir, settings.keyboard + ".json"),
        container: "keyboard"
    });

    await _delay(10);

    document.getElementById("main_shell").setAttribute("style", "");

    await _delay(270);

    let greeter = document.getElementById("main_shell_greeting");

    getDisplayName().then(user => {
        if (user) {
            greeter.innerHTML += `Welcome back, <em>${user}</em>`;
        } else {
            greeter.innerHTML += "Welcome back";
        }
    });

    greeter.setAttribute("style", "opacity: 1;");

    document.getElementById("filesystem").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("style", "");
    document.getElementById("keyboard").setAttribute("class", "animation_state_1");
    window.audioManager.keyboard.play();

    await _delay(100);

    document.getElementById("keyboard").setAttribute("class", "animation_state_1 animation_state_2");

    await _delay(1000);

    greeter.setAttribute("style", "opacity: 0;");

    await _delay(100);

    document.getElementById("keyboard").setAttribute("class", "");

    await _delay(400);

    greeter.remove();

    // Initialize modules
    window.mods = {};

    // Left column
    window.mods.clock = new Clock("mod_column_left");
    window.mods.sysinfo = new Sysinfo("mod_column_left");
    window.mods.hardwareInspector = new HardwareInspector("mod_column_left");
    window.mods.cpuinfo = new Cpuinfo("mod_column_left");
    window.mods.gpuinfo = new Gpuinfo("mod_column_left");
    window.mods.ramwatcher = new RAMwatcher("mod_column_left");
    window.mods.toplist = new Toplist("mod_column_left");

    // Right column
    window.mods.netstat = new Netstat("mod_column_right");
    window.mods.globe = new LocationGlobe("mod_column_right");
    window.mods.conninfo = new Conninfo("mod_column_right");
    window.mods.openportlist = new OpenPortList("mod_column_right");

    // UI mode (EPIC-03): apply saved mode, or let the user pick on first run
    if (!window.settings.uiMode) {
        const chooser = new Modal({
            type: "custom",
            title: "Choose your interface mode",
            html: `<div id="uiModeChooser">
                <p>This choice can be changed anytime in settings.</p>
                <table>
                    <tr><th>IMMERSIVE</th><td>Full HUD experience - every monitor, animations, on-screen keyboard. The classic eDEX look. <b>(recommended)</b></td></tr>
                    <tr><th>PRODUCTIVE</th><td>Terminal-focused - compact monitor, no globe or keyboard, reduced animations. Built for daily work.</td></tr>
                    <tr><th>LIGHT</th><td>Terminal only - monitor and animations off, minimal CPU/GPU/RAM footprint.</td></tr>
                </table>
            </div>`,
            buttons: [
                {label: "IMMERSIVE", action: () => { window.applyUIMode("immersive"); chooser.close(); }},
                {label: "PRODUCTIVE", action: () => { window.applyUIMode("productive"); chooser.close(); }},
                {label: "LIGHT", action: () => { window.applyUIMode("light"); chooser.close(); }}
            ]
        });
    }
    window.applyUIMode(window.settings.uiMode || "immersive", false);

    // Fade-in animations
    document.querySelectorAll(".mod_column").forEach(e => {
        e.setAttribute("class", "mod_column activated");
    });
    let i = 0;
    let left = document.querySelectorAll("#mod_column_left > div");
    let right = document.querySelectorAll("#mod_column_right > div");
    let x = setInterval(() => {
        if (!left[i] && !right[i]) {
            clearInterval(x);
        } else {
            window.audioManager.panels.play();
            if (left[i]) {
                left[i].setAttribute("style", "animation-play-state: running;");
            }
            if (right[i]) {
                right[i].setAttribute("style", "animation-play-state: running;");
            }
            i++;
        }
    }, 500);

    await _delay(100);

    // Initialize the terminal
    let shellContainer = document.getElementById("main_shell");
    shellContainer.innerHTML += `
        <ul id="main_shell_tabs">
            <li id="shell_tab0" class="active"><p>MAIN SHELL</p></li>
            <li id="shell_tab1"><p>EMPTY</p></li>
            <li id="shell_tab2"><p>EMPTY</p></li>
            <li id="shell_tab3"><p>EMPTY</p></li>
            <li id="shell_tab4"><p>EMPTY</p></li>
        </ul>
        <div id="main_shell_innercontainer">
            <pre id="terminal0" class="active"></pre>
            <pre id="terminal1"></pre>
            <pre id="terminal2"></pre>
            <pre id="terminal3"></pre>
            <pre id="terminal4"></pre>
        </div>`;
    window.term = {
        0: new Terminal({
            role: "client",
            parentId: "terminal0",
            port: window.settings.port || 3000
        })
    };
    window.currentTerm = 0;
    // Wire tab click handlers - inline handlers are blocked by the strict CSP
    for (let i = 0; i < 5; i++) {
        document.getElementById("shell_tab"+i).onclick = () => window.focusShellTab(i);
    }
    window.term[0].onprocesschange = p => {
        document.getElementById("shell_tab0").innerHTML = `<p>MAIN - ${p}</p>`;
    };
    // Prevent losing hardware keyboard focus on the terminal when using touch keyboard
    window.onmouseup = e => {
        if (window.keyboard.linkedToTerm) window.term[window.currentTerm].term.focus();
    };
    window.term[0].term.writeln("\x1b[1m" + `Welcome to xDEX-UI v${remote.app.getVersion()} - Electron v${process.versions.electron}` +"\x1b[0m");

    await _delay(100);

    redrawTerminalCanvas('terminal0');

    window.fsDisp = new FilesystemDisplay({
        parentId: "filesystem"
    });

    await _delay(200);

    document.getElementById("filesystem").setAttribute("style", "opacity: 1;");

    // Resend terminal CWD to fsDisp if we're hot reloading
    if (window.performance.navigation.type === 1) {
        window.term[window.currentTerm].resendCWD();

        // See #630 - Reconnect to extra terminals that are still running on the back-end
        ipc.once("getExtraTtys-reply", (e, ports) => {
            (ports || []).slice(0, 4).forEach((port, i) => {
                let number = i + 1;
                if (window.term[number]) return;

                window.term[number] = new Terminal({
                    role: "client",
                    parentId: "terminal"+number,
                    port: Number(port)
                });

                window.term[number].onclose = e => {
                    delete window.term[number].onprocesschange;
                    document.getElementById("shell_tab"+number).innerHTML = "<p>EMPTY</p>";
                    document.getElementById("terminal"+number).innerHTML = "";
                    window.term[number].term.dispose();
                    delete window.term[number];
                    window.useAppShortcut("PREVIOUS_TAB");
                };

                window.term[number].onprocesschange = p => {
                    document.getElementById("shell_tab"+number).innerHTML = `<p>#${number+1} - ${p}</p>`;
                };

                document.getElementById("shell_tab"+number).innerHTML = `<p>::${port}</p>`;
            });
        });
        ipc.send("getExtraTtys");
    }

    await _delay(200);

    window.updateCheck = new UpdateChecker();
}

window.themeChanger = theme => {
    ipc.send("setThemeOverride", theme);
    setTimeout(() => {
        window.location.reload(true);
    }, 100);
};

window.remakeKeyboard = layout => {
    document.getElementById("keyboard").innerHTML = "";
    window.keyboard = new Keyboard({
        layout: path.join(keyboardsDir, layout + ".json" || settings.keyboard + ".json"),
        container: "keyboard"
    });
    ipc.send("setKbOverride", layout);
};

window.focusShellTab = number => {
    window.audioManager.folder.play();

    if (number !== window.currentTerm && window.term[number]) {
        window.currentTerm = number;

        document.querySelectorAll(`ul#main_shell_tabs > li:not(:nth-child(${number + 1}))`).forEach(e => {
            e.setAttribute("class", "");
        });
        document.getElementById("shell_tab" + number).setAttribute("class", "active");

        document.querySelectorAll(`div#main_shell_innercontainer > pre:not(:nth-child(${number + 1}))`).forEach(e => {
            e.setAttribute("class", "");
        });
        document.getElementById("terminal" + number).setAttribute("class", "active");

        window.term[number].fit();
        window.term[number].term.focus();
        window.term[number].resendCWD();

        window.applyHostIdentity(window.term[number].sshProfile || null);

        window.fsDisp.followTab();
    } else if (number > 0 && number <= 4 && window.term[number] !== null && typeof window.term[number] !== "object") {
        window.term[number] = null;

        document.getElementById("shell_tab" + number).innerHTML = "<p>LOADING...</p>";
        // Workspace restore may pass a per-tab cwd via _pendingSpawnCwd
        const spawnArg = window._pendingSpawnCwd ? {cwd: window._pendingSpawnCwd} : "true";
        window._pendingSpawnCwd = null;
        ipc.send("ttyspawn", spawnArg);
        ipc.once("ttyspawn-reply", (e, r) => {
            if (r.startsWith("ERROR")) {
                document.getElementById("shell_tab" + number).innerHTML = "<p>ERROR</p>";
            } else if (r.startsWith("SUCCESS")) {
                let port = Number(r.substr(9));

                window.term[number] = new Terminal({
                    role: "client",
                    parentId: "terminal" + number,
                    port
                });

                window.term[number].onclose = e => {
                    delete window.term[number].onprocesschange;
                    document.getElementById("shell_tab" + number).innerHTML = "<p>EMPTY</p>";
                    document.getElementById("terminal" + number).innerHTML = "";
                    window.term[number].term.dispose();
                    delete window.term[number];
                    window.useAppShortcut("PREVIOUS_TAB");
                };

                window.term[number].onprocesschange = p => {
                    document.getElementById("shell_tab" + number).innerHTML = `<p>#${number + 1} - ${p}</p>`;
                };

                document.getElementById("shell_tab" + number).innerHTML = `<p>::${port}</p>`;
                setTimeout(() => {
                    window.focusShellTab(number);
                }, 500);
            }
        });
    }
};

// Settings editor
window.openSettings = async () => {
    if (document.getElementById("settingsEditor")) return;

    // Build lists of available keyboards, themes, monitors
    let keyboards, themes, monitors, ifaces;
    fs.readdirSync(keyboardsDir).forEach(kb => {
        if (!kb.endsWith(".json")) return;
        kb = kb.replace(".json", "");
        if (kb === window.settings.keyboard) return;
        keyboards += `<option>${kb}</option>`;
    });
    fs.readdirSync(themesDir).forEach(th => {
        if (!th.endsWith(".json")) return;
        th = th.replace(".json", "");
        if (th === window.settings.theme) return;
        themes += `<option>${th}</option>`;
    });
    for (let i = 0; i < remote.screen.getAllDisplays().length; i++) {
        if (i !== window.settings.monitor) monitors += `<option>${i}</option>`;
    }
    let nets = await window.si.networkInterfaces();
    nets.forEach(net => {
        if (net.iface !== window.mods.netstat.iface) ifaces += `<option>${net.iface}</option>`;
    });

    // Unlink the tactile keyboard from the terminal emulator to allow filling in the settings fields
    window.keyboard.detach();

    new Modal({
        type: "custom",
        title: `Settings <i>(v${remote.app.getVersion()})</i>`,
        html: `<table id="settingsEditor">
                    <tr>
                        <th>Key</th>
                        <th>Description</th>
                        <th>Value</th>
                    </tr>
                    <tr>
                        <td>uiMode</td>
                        <td>Interface mode: immersive (full HUD), productive (compact monitor) or light (terminal only)</td>
                        <td><select id="settingsEditor-uiMode">
                            <option>${window.settings.uiMode || 'immersive'}</option>
                            <option>immersive</option>
                            <option>productive</option>
                            <option>light</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>shell</td>
                        <td>The program to run as a terminal emulator</td>
                        <td><input type="text" id="settingsEditor-shell" value="${window.settings.shell}"></td>
                    </tr>
                    <tr>
                        <td>shellArgs</td>
                        <td>Arguments to pass to the shell</td>
                        <td><input type="text" id="settingsEditor-shellArgs" value="${window.settings.shellArgs || ''}"></td>
                    </tr>
                    <tr>
                        <td>cwd</td>
                        <td>Working Directory to start in</td>
                        <td><input type="text" id="settingsEditor-cwd" value="${window.settings.cwd}"></td>
                    </tr>
                    <tr>
                        <td>env</td>
                        <td>Custom shell environment override</td>
                        <td><input type="text" id="settingsEditor-env" value="${window.settings.env}"></td>
                    </tr>
                    <tr>
                        <td>username</td>
                        <td>Custom username to display at boot</td>
                        <td><input type="text" id="settingsEditor-username" value="${window.settings.username}"></td>
                    </tr>
                    <tr>
                        <td>keyboard</td>
                        <td>On-screen keyboard layout code</td>
                        <td><select id="settingsEditor-keyboard">
                            <option>${window.settings.keyboard}</option>
                            ${keyboards}
                        </select></td>
                    </tr>
                    <tr>
                        <td>theme</td>
                        <td>Name of the theme to load</td>
                        <td><select id="settingsEditor-theme">
                            <option>${window.settings.theme}</option>
                            ${themes}
                        </select></td>
                    </tr>
                    <tr>
                        <td>termFontSize</td>
                        <td>Size of the terminal text in pixels</td>
                        <td><input type="number" id="settingsEditor-termFontSize" value="${window.settings.termFontSize}"></td>
                    </tr>
                    <tr>
                        <td>termScrollback</td>
                        <td>Terminal scrollback buffer lines (500 - 50000, applies to new terminals)</td>
                        <td><input type="number" id="settingsEditor-termScrollback" value="${window.settings.termScrollback || 5000}"></td>
                    </tr>
                    <tr>
                        <td>audio</td>
                        <td>Activate audio sound effects</td>
                        <td><select id="settingsEditor-audio">
                            <option>${window.settings.audio}</option>
                            <option>${!window.settings.audio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>audioVolume</td>
                        <td>Set default volume for sound effects (0.0 - 1.0)</td>
                        <td><input type="number" id="settingsEditor-audioVolume" value="${window.settings.audioVolume || '1.0'}"></td>
                    </tr>
                    <tr>
                        <td>disableFeedbackAudio</td>
                        <td>Disable recurring feedback sound FX (input/output, mostly)</td>
                        <td><select id="settingsEditor-disableFeedbackAudio">
                            <option>${window.settings.disableFeedbackAudio}</option>
                            <option>${!window.settings.disableFeedbackAudio}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>port</td>
                        <td>Local port to use for UI-shell connection</td>
                        <td><input type="number" id="settingsEditor-port" value="${window.settings.port}"></td>
                    </tr>
                    <tr>
                        <td>pingAddr</td>
                        <td>IPv4 address to test Internet connectivity</td>
                        <td><input type="text" id="settingsEditor-pingAddr" value="${window.settings.pingAddr || "1.1.1.1"}"></td>
                    </tr>
                    <tr>
                        <td>proxy</td>
                        <td>HTTP(S) proxy URL for outbound requests (e.g. http://proxy:8080)</td>
                        <td><input type="text" id="settingsEditor-proxy" value="${window.settings.proxy || ""}"></td>
                    </tr>
                    <tr>
                        <td>proxyBypassList</td>
                        <td>Comma-separated list of hosts that bypass the proxy</td>
                        <td><input type="text" id="settingsEditor-proxyBypassList" value="${window.settings.proxyBypassList || ""}"></td>
                    </tr>
                    <tr>
                        <td>clockHours</td>
                        <td>Clock format (12/24 hours)</td>
                        <td><select id="settingsEditor-clockHours">
                            <option>${(window.settings.clockHours === 12) ? "12" : "24"}</option>
                            <option>${(window.settings.clockHours === 12) ? "24" : "12"}</option>
                        </select></td>
                    <tr>
                        <td>monitor</td>
                        <td>Which monitor to spawn the UI in (defaults to primary display)</td>
                        <td><select id="settingsEditor-monitor">
                            ${(typeof window.settings.monitor !== "undefined") ? "<option>" + window.settings.monitor + "</option>" : ""}
                            ${monitors}
                        </select></td>
                    </tr>
                    <tr>
                        <td>nointro</td>
                        <td>Skip the intro boot log and logo${(window.settings.nointroOverride) ? " (Currently overridden by CLI flag)" : ""}</td>
                        <td><select id="settingsEditor-nointro">
                            <option>${window.settings.nointro}</option>
                            <option>${!window.settings.nointro}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>nocursor</td>
                        <td>Hide the mouse cursor${(window.settings.nocursorOverride) ? " (Currently overridden by CLI flag)" : ""}</td>
                        <td><select id="settingsEditor-nocursor">
                            <option>${window.settings.nocursor}</option>
                            <option>${!window.settings.nocursor}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>iface</td>
                        <td>Override the interface used for network monitoring</td>
                        <td><select id="settingsEditor-iface">
                            <option>${window.mods.netstat.iface}</option>
                            ${ifaces}
                        </select></td>
                    </tr>
                    <tr>
                        <td>allowWindowed</td>
                        <td>Allow using F11 key to set the UI in windowed mode</td>
                        <td><select id="settingsEditor-allowWindowed">
                            <option>${window.settings.allowWindowed}</option>
                            <option>${!window.settings.allowWindowed}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>keepGeometry</td>
                        <td>Try to keep a 16:9 aspect ratio in windowed mode</td>
                        <td><select id="settingsEditor-keepGeometry">
                            <option>${(window.settings.keepGeometry === false) ? 'false' : 'true'}</option>
                            <option>${(window.settings.keepGeometry === false) ? 'true' : 'false'}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>excludeThreadsFromToplist</td>
                        <td>Display threads in the top processes list</td>
                        <td><select id="settingsEditor-excludeThreadsFromToplist">
                            <option>${window.settings.excludeThreadsFromToplist}</option>
                            <option>${!window.settings.excludeThreadsFromToplist}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>hideDotfiles</td>
                        <td>Hide files and directories starting with a dot in file display</td>
                        <td><select id="settingsEditor-hideDotfiles">
                            <option>${window.settings.hideDotfiles}</option>
                            <option>${!window.settings.hideDotfiles}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>fsListView</td>
                        <td>Show files in a more detailed list instead of an icon grid</td>
                        <td><select id="settingsEditor-fsListView">
                            <option>${window.settings.fsListView}</option>
                            <option>${!window.settings.fsListView}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalGlobeFeatures</td>
                        <td>Toggle experimental features for the network globe</td>
                        <td><select id="settingsEditor-experimentalGlobeFeatures">
                            <option>${window.settings.experimentalGlobeFeatures}</option>
                            <option>${!window.settings.experimentalGlobeFeatures}</option>
                        </select></td>
                    </tr>
                    <tr>
                        <td>experimentalFeatures</td>
                        <td>Toggle Chrome's experimental web features (DANGEROUS)</td>
                        <td><select id="settingsEditor-experimentalFeatures">
                            <option>${window.settings.experimentalFeatures}</option>
                            <option>${!window.settings.experimentalFeatures}</option>
                        </select></td>
                    </tr>
                </table>
                <h6 id="settingsEditorStatus">Loaded values from memory</h6>
                <br>`,
        buttons: [
            { label: "Open in External Editor", action: () => { electron.shell.openPath(settingsFile); electronWin.minimize(); } },
            { label: "Save to Disk", action: () => window.writeSettingsFile() },
            { label: "Reload UI", action: () => window.location.reload(true) },
            { label: "Restart xDEX-UI", action: () => { remote.app.relaunch(); remote.app.quit(); } }
        ]
    }, () => {
        // Link the keyboard back to the terminal
        window.keyboard.attach();

        // Focus back on the term
        window.term[window.currentTerm].term.focus();
    });
};

window.writeFile = (path) => {
    fs.writeFile(path, document.getElementById("fileEdit").value, "utf-8", () => {
        document.getElementById("fedit-status").innerHTML = "<i>File saved.</i>";
    });
};

window.writeSettingsFile = () => {
    // Merge over existing settings so keys not exposed in the editor
    // (uiMode, workspaces, sshProfiles...) are preserved on save.
    window.settings = Object.assign({}, window.settings, {
        uiMode: document.getElementById("settingsEditor-uiMode").value,
        shell: document.getElementById("settingsEditor-shell").value,
        shellArgs: document.getElementById("settingsEditor-shellArgs").value,
        cwd: document.getElementById("settingsEditor-cwd").value,
        env: document.getElementById("settingsEditor-env").value,
        username: document.getElementById("settingsEditor-username").value,
        keyboard: document.getElementById("settingsEditor-keyboard").value,
        theme: document.getElementById("settingsEditor-theme").value,
        termFontSize: Number(document.getElementById("settingsEditor-termFontSize").value),
        termScrollback: Number(document.getElementById("settingsEditor-termScrollback").value) || 5000,
        audio: (document.getElementById("settingsEditor-audio").value === "true"),
        audioVolume: Number(document.getElementById("settingsEditor-audioVolume").value),
        disableFeedbackAudio: (document.getElementById("settingsEditor-disableFeedbackAudio").value === "true"),
        pingAddr: document.getElementById("settingsEditor-pingAddr").value,
        proxy: document.getElementById("settingsEditor-proxy").value,
        proxyBypassList: document.getElementById("settingsEditor-proxyBypassList").value,
        clockHours: Number(document.getElementById("settingsEditor-clockHours").value),
        port: Number(document.getElementById("settingsEditor-port").value),
        monitor: Number(document.getElementById("settingsEditor-monitor").value),
        nointro: (document.getElementById("settingsEditor-nointro").value === "true"),
        nocursor: (document.getElementById("settingsEditor-nocursor").value === "true"),
        iface: document.getElementById("settingsEditor-iface").value,
        allowWindowed: (document.getElementById("settingsEditor-allowWindowed").value === "true"),
        forceFullscreen: window.settings.forceFullscreen,
        keepGeometry: (document.getElementById("settingsEditor-keepGeometry").value === "true"),
        excludeThreadsFromToplist: (document.getElementById("settingsEditor-excludeThreadsFromToplist").value === "true"),
        hideDotfiles: (document.getElementById("settingsEditor-hideDotfiles").value === "true"),
        fsListView: (document.getElementById("settingsEditor-fsListView").value === "true"),
        experimentalGlobeFeatures: (document.getElementById("settingsEditor-experimentalGlobeFeatures").value === "true"),
        experimentalFeatures: (document.getElementById("settingsEditor-experimentalFeatures").value === "true")
    });

    Object.keys(window.settings).forEach(key => {
        if (window.settings[key] === "undefined") {
            delete window.settings[key];
        }
    });

    window.writeSettingsFile();
    // Apply the new UI mode live (UI-004: hot switch, no restart)
    if (typeof window.applyUIMode === "function") window.applyUIMode(window.settings.uiMode, false);
    document.getElementById("settingsEditorStatus").innerText = "New values written to settings.json file at " + new Date().toTimeString();
};

window.writeSettingsFile = () => {
    fs.writeFileSync(settingsFile, JSON.stringify(window.settings, "", 4));
};

window.toggleFullScreen = () => {
    let useFullscreen = (electronWin.isFullScreen() ? false : true);
    electronWin.setFullScreen(useFullscreen);

    //Update settings
    window.lastWindowState["useFullscreen"] = useFullscreen;

    fs.writeFileSync(lastWindowStateFile, JSON.stringify(window.lastWindowState, "", 4));
};

// Display available keyboard shortcuts and custom shortcuts helper
window.openShortcutsHelp = () => {
    if (document.getElementById("settingsEditor")) return;

    const shortcutsDefinition = {
        "COPY": "Copy selected buffer from the terminal.",
        "PASTE": "Paste system clipboard to the terminal.",
        "NEXT_TAB": "Switch to the next opened terminal tab (left to right order).",
        "PREVIOUS_TAB": "Switch to the previous opened terminal tab (right to left order).",
        "TAB_X": "Switch to terminal tab <strong>X</strong>, or create it if it hasn't been opened yet.",
        "SETTINGS": "Open the settings editor.",
        "SHORTCUTS": "List and edit available keyboard shortcuts.",
        "FUZZY_SEARCH": "Search for entries in the current working directory.",
        "FS_LIST_VIEW": "Toggle between list and grid view in the file browser.",
        "FS_DOTFILES": "Toggle hidden files and directories in the file browser.",
        "KB_PASSMODE": "Toggle the on-screen keyboard's \"Password Mode\", which allows you to safely<br>type sensitive information even if your screen might be recorded (disable visual input feedback).",
        "DEV_DEBUG": "Open Chromium Dev Tools, for debugging purposes.",
        "DEV_RELOAD": "Trigger front-end hot reload."
    };

    let appList = "";
    window.shortcuts.filter(e => e.type === "app").forEach(cut => {
        let action = (cut.action.startsWith("TAB_")) ? "TAB_X" : cut.action;

        appList += `<tr>
                        <td>${(cut.enabled) ? 'YES' : 'NO'}</td>
                        <td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td>
                        <td>${shortcutsDefinition[action]}</td>
                    </tr>`;
    });

    let customList = "";
    window.shortcuts.filter(e => e.type === "shell").forEach(cut => {
        customList += `<tr>
                            <td>${(cut.enabled) ? 'YES' : 'NO'}</td>
                            <td><input disabled type="text" maxlength=25 value="${cut.trigger}"></td>
                            <td>
                                <input disabled type="text" placeholder="Run terminal command..." value="${cut.action}">
                                <input disabled type="checkbox" name="shortcutsHelpNew_Enter" ${(cut.linebreak) ? 'checked' : ''}>
                                <label for="shortcutsHelpNew_Enter">Enter</label>
                            </td>
                        </tr>`;
    });

    window.keyboard.detach();
    new Modal({
        type: "custom",
        title: `Available Keyboard Shortcuts <i>(v${remote.app.getVersion()})</i>`,
        html: `<h5>Using either the on-screen or a physical keyboard, you can use the following shortcuts:</h5>
                <details open id="shortcutsHelpAccordeon1">
                    <summary>Emulator shortcuts</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Enabled</th>
                            <th>Trigger</th>
                            <th>Action</th>
                        </tr>
                        ${appList}
                    </table>
                </details>
                <br>
                <details id="shortcutsHelpAccordeon2">
                    <summary>Custom command shortcuts</summary>
                    <table class="shortcutsHelp">
                        <tr>
                            <th>Enabled</th>
                            <th>Trigger</th>
                            <th>Command</th>
                        <tr>
                       ${customList}
                    </table>
                </details>
                <br>`,
        buttons: [
            { label: "Open Shortcuts File", action: () => { electron.shell.openPath(shortcutsFile); electronWin.minimize(); } },
            { label: "Reload UI", action: () => window.location.reload(true) },
        ]
    }, () => {
        window.keyboard.attach();
        window.term[window.currentTerm].term.focus();
    });

    let wrap1 = document.getElementById('shortcutsHelpAccordeon1');
    let wrap2 = document.getElementById('shortcutsHelpAccordeon2');

    wrap1.addEventListener('toggle', e => {
        wrap2.open = !wrap1.open;
    });

    wrap2.addEventListener('toggle', e => {
        wrap1.open = !wrap2.open;
    });
};

window.useAppShortcut = action => {
    switch (action) {
        case "COPY":
            window.term[window.currentTerm].clipboard.copy();
            return true;
        case "PASTE":
            window.term[window.currentTerm].clipboard.paste();
            return true;
        case "NEXT_TAB":
            if (window.term[window.currentTerm + 1]) {
                window.focusShellTab(window.currentTerm + 1);
            } else if (window.term[window.currentTerm + 2]) {
                window.focusShellTab(window.currentTerm + 2);
            } else if (window.term[window.currentTerm + 3]) {
                window.focusShellTab(window.currentTerm + 3);
            } else if (window.term[window.currentTerm + 4]) {
                window.focusShellTab(window.currentTerm + 4);
            } else {
                window.focusShellTab(0);
            }
            return true;
        case "PREVIOUS_TAB":
            let i = window.currentTerm || 4;
            if (window.term[i] && i !== window.currentTerm) {
                window.focusShellTab(i);
            } else if (window.term[i - 1]) {
                window.focusShellTab(i - 1);
            } else if (window.term[i - 2]) {
                window.focusShellTab(i - 2);
            } else if (window.term[i - 3]) {
                window.focusShellTab(i - 3);
            } else if (window.term[i - 4]) {
                window.focusShellTab(i - 4);
            }
            return true;
        case "TAB_1":
            window.focusShellTab(0);
            return true;
        case "TAB_2":
            window.focusShellTab(1);
            return true;
        case "TAB_3":
            window.focusShellTab(2);
            return true;
        case "TAB_4":
            window.focusShellTab(3);
            return true;
        case "TAB_5":
            window.focusShellTab(4);
            return true;
        case "SETTINGS":
            window.openSettings();
            return true;
        case "SHORTCUTS":
            window.openShortcutsHelp();
            return true;
        case "FUZZY_SEARCH":
            window.activeFuzzyFinder = new FuzzyFinder();
            return true;
        case "TERMINAL_SEARCH":
            window.openTermSearch();
            return true;
        case "UI_MODE_NEXT":
            window.cycleUIMode();
            return true;
        case "WORKSPACES":
            window.openWorkspaces();
            return true;
        case "SSH_PROFILES":
            window.openSshProfiles();
            return true;
        case "MONITOR_WIDGETS":
            window.openMonitorWidgets();
            return true;
        case "FS_LIST_VIEW":
            window.fsDisp.toggleListview();
            return true;
        case "FS_DOTFILES":
            window.fsDisp.toggleHidedotfiles();
            return true;
        case "KB_PASSMODE":
            window.keyboard.togglePasswordMode();
            return true;
        case "DEV_DEBUG":
            remote.getCurrentWindow().webContents.toggleDevTools();
            return true;
        case "DEV_RELOAD":
            window.location.reload(true);
            return true;
        default:
            console.warn(`Unknown "${action}" app shortcut action`);
            return false;
    }
};

// Global keyboard shortcuts
const globalShortcut = remote.globalShortcut;
globalShortcut.unregisterAll();

window.registerKeyboardShortcuts = () => {
    window.shortcuts.forEach(cut => {
        if (!cut.enabled) return;

        if (cut.type === "app") {
            if (cut.action === "TAB_X") {
                for (let i = 1; i <= 5; i++) {
                    let trigger = cut.trigger.replace("X", i);
                    let dfn = () => { window.useAppShortcut(`TAB_${i}`) };
                    globalShortcut.register(trigger, dfn);
                }
            } else {
                globalShortcut.register(cut.trigger, () => {
                    window.useAppShortcut(cut.action);
                });
            }
        } else if (cut.type === "shell") {
            globalShortcut.register(cut.trigger, () => {
                let fn = (cut.linebreak) ? "writelr" : "write";
                window.term[window.currentTerm][fn](cut.action);
            });
        } else {
            console.warn(`${cut.trigger} has unknown type`);
        }
    });
};
window.registerKeyboardShortcuts();

// See #361
window.addEventListener("focus", () => {
    window.registerKeyboardShortcuts();
});

window.addEventListener("blur", () => {
    globalShortcut.unregisterAll();
});

// Prevent showing menu, exiting fullscreen or app with keyboard shortcuts
document.addEventListener("keydown", e => {
    if (e.key === "Alt") {
        e.preventDefault();
    }
    if (e.code.startsWith("Alt") && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
    }
    if (e.key === "F11" && !settings.allowWindowed) {
        e.preventDefault();
    }
    if (e.code === "KeyD" && e.ctrlKey) {
        e.preventDefault();
    }
    if (e.code === "KeyA" && e.ctrlKey) {
        e.preventDefault();
    }
    if (e.code === "KeyF" && e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        window.openTermSearch();
    }
});

// Terminal scrollback search (TERM-003): floating bar driven by xterm SearchAddon
window.openTermSearch = () => {
    const term = window.term && window.term[window.currentTerm];
    if (!term || !term.searchAddon) return;
    const existing = document.getElementById("term_search");
    if (existing) {
        document.getElementById("term_search_input").focus();
        return;
    }
    const bar = document.createElement("div");
    bar.id = "term_search";
    const input = document.createElement("input");
    input.id = "term_search_input";
    input.type = "text";
    input.placeholder = "Search terminal scrollback...";
    const btnPrev = document.createElement("button");
    btnPrev.textContent = "Prev";
    const btnNext = document.createElement("button");
    btnNext.textContent = "Next";
    const btnClose = document.createElement("button");
    btnClose.textContent = "Close";
    bar.appendChild(input);
    bar.appendChild(btnPrev);
    bar.appendChild(btnNext);
    bar.appendChild(btnClose);
    document.body.appendChild(bar);

    const closeSearch = () => {
        if (typeof term.searchAddon.clearDecorations === "function") {
            term.searchAddon.clearDecorations();
        }
        bar.remove();
        window.keyboard.attach();
        term.term.focus();
    };
    window.keyboard.detach();
    input.addEventListener("input", () => {
        if (input.value) term.searchAddon.findNext(input.value, {incremental: true});
    });
    input.addEventListener("keydown", e => {
        if (e.key === "Enter" && e.shiftKey) {
            term.searchAddon.findPrevious(input.value);
        } else if (e.key === "Enter") {
            term.searchAddon.findNext(input.value);
        } else if (e.key === "Escape") {
            closeSearch();
        }
        e.stopPropagation();
    });
    btnPrev.addEventListener("click", () => term.searchAddon.findPrevious(input.value));
    btnNext.addEventListener("click", () => term.searchAddon.findNext(input.value));
    btnClose.addEventListener("click", closeSearch);
    input.focus();
};

// ================= Workspaces (EPIC-04) =================
// A workspace captures tab slots + per-tab cwd + uiMode. Restore never runs
// commands - it spawns shells in the recorded directories only.

// Escape a string for safe interpolation into modal HTML (CSP-safe XSS guard)
const wsEsc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

window.saveWorkspace = name => {
    const ws = window.Workspaces.capture(name);
    const existing = (window.workspaceStore.workspaces || [])
        .find(w => w.name === ws.name);
    if (existing) {
        existing.tabs = ws.tabs;
        existing.uiMode = ws.uiMode;
    } else {
        if (window.workspaceStore.workspaces.length >= window.Workspaces.MAX_WORKSPACES) return;
        window.workspaceStore.workspaces.push(ws);
    }
    window.writeWorkspacesFile();
};

window.deleteWorkspace = id => {
    const ws = (window.workspaceStore.workspaces || []).find(w => w.id === id);
    if (!ws) return;
    const m = new Modal({
        type: "custom",
        title: "Delete workspace",
        html: `<h5>Delete workspace "${wsEsc(ws.name)}"? Saved tab/directories are lost.</h5>`,
        buttons: [{label: "DELETE", action: () => {
            window.workspaceStore.workspaces = window.workspaceStore.workspaces
                .filter(w => w.id !== id);
            window.writeWorkspacesFile();
            m.close();
            window.openWorkspaces();
        }}]
    });
};

window.renameWorkspace = id => {
    const ws = (window.workspaceStore.workspaces || []).find(w => w.id === id);
    if (!ws) return;
    const m = new Modal({
        type: "custom",
        title: "Rename workspace",
        html: `<input type="text" id="ws_rename_input" value="${wsEsc(ws.name)}" />`,
        buttons: [{label: "RENAME", action: () => {
            const v = document.getElementById("ws_rename_input").value.trim();
            if (v) { ws.name = v.slice(0, 80); window.writeWorkspacesFile(); }
            m.close();
            window.openWorkspaces();
        }}]
    });
};

window.duplicateWorkspace = id => {
    const ws = (window.workspaceStore.workspaces || []).find(w => w.id === id);
    if (!ws || window.workspaceStore.workspaces.length >= window.Workspaces.MAX_WORKSPACES) return;
    window.workspaceStore.workspaces.push({
        ...JSON.parse(JSON.stringify(ws)),
        id: nanoid(),
        name: (ws.name + " (copy)").slice(0, 80),
        createdAt: new Date().toISOString()
    });
    window.writeWorkspacesFile();
    window.openWorkspaces();
};

window.applyWorkspace = id => {
    const ws = (window.workspaceStore.workspaces || []).find(w => w.id === id);
    if (!ws) return;
    if (ws.uiMode && typeof window.applyUIMode === "function") {
        window.applyUIMode(ws.uiMode);
    }
    (ws.tabs || []).forEach(t => {
        const slot = Number(t.slot);
        // Slot 0 is the always-on main shell; occupied slots are untouched
        if (slot <= 0 || slot > 4) return;
        if (window.term && window.term[slot]) return;
        if (t.cwd) window._pendingSpawnCwd = t.cwd;
        window.focusShellTab(slot);
    });
};

window.exportWorkspace = id => {
    const ws = (window.workspaceStore.workspaces || []).find(w => w.id === id);
    if (!ws) return;
    const exportDir = path.join(settingsDir, "workspace-exports");
    try {
        fs.mkdirSync(exportDir, {recursive: true});
        const file = path.join(exportDir, `workspace-${ws.id}.json`);
        fs.writeFileSync(file, JSON.stringify(
            {version: window.Workspaces.SCHEMA_VERSION, workspaces: [ws]}, "", 4));
        new Modal({type: "warning", title: "Workspace exported",
            message: `Exported "${ws.name}" to ${file}`});
    } catch (e) {
        new Modal({type: "warning", title: "Export failed", message: String(e)});
    }
};

window.importWorkspaces = () => {
    const exportDir = path.join(settingsDir, "workspace-exports");
    let candidates = [];
    try {
        candidates = (fs.readdirSync(exportDir) || [])
            .filter(f => /^workspace-.*\.json$/i.test(f));
    } catch (e) { /* no exports dir */ }
    if (!candidates.length) {
        new Modal({type: "warning", title: "Import workspaces",
            message: `No workspace-*.json files found in ${exportDir}. Export one first or copy a file there.`});
        return;
    }
    const rows = candidates.map((f, i) =>
        `<tr><td>${wsEsc(f)}</td><td><button data-ws-import="${i}">IMPORT</button></td></tr>`).join("");
    const m = new Modal({
        type: "custom",
        title: "Import workspaces",
        html: `<table><tr><th>File</th><th></th></tr>${rows}</table>`,
        buttons: []
    });
    document.getElementById("modal_" + m.id)
        .querySelectorAll("button[data-ws-import]").forEach(btn => {
            btn.addEventListener("click", () => {
                const file = path.join(exportDir, candidates[Number(btn.getAttribute("data-ws-import"))]);
                let raw;
                try { raw = fs.readFileSync(file).toString(); }
                catch (e) { new Modal({type: "warning", title: "Import failed", message: String(e)}); return; }
                const result = window.Workspaces.validateImport(raw, 256 * 1024);
                if (!result.ok) {
                    new Modal({type: "warning", title: "Import rejected", message: result.summary});
                    return;
                }
                // Summary before apply (WS-004): confirm merge, never auto-execute
                const confirm = new Modal({
                    type: "custom",
                    title: "Confirm import",
                    html: `<h5>${wsEsc(result.summary)} from ${wsEsc(path.basename(file))}. No secrets or commands are imported - only names, tab slots, directories and UI mode.</h5>`,
                    buttons: [{label: "APPLY", action: () => {
                        result.store.workspaces.forEach(w => {
                            if (!window.workspaceStore.workspaces.find(x => x.id === w.id)) {
                                window.workspaceStore.workspaces.push(w);
                            }
                        });
                        window.writeWorkspacesFile();
                        confirm.close();
                        m.close();
                        window.openWorkspaces();
                    }}]
                });
            });
        });
};

window.openWorkspaces = () => {
    const list = window.workspaceStore.workspaces || [];
    const rows = list.map(w => {
        const tabs = (w.tabs || []).map(t => `#${t.slot + 1}:${wsEsc(t.cwd || "~")}`).join(" ");
        return `<tr>
            <td>${wsEsc(w.name)}</td><td>${tabs || "(no tabs)"}</td><td>${wsEsc(w.uiMode || "-")}</td>
            <td><button data-ws-act="apply" data-ws-id="${w.id}">APPLY</button>
                <button data-ws-act="rename" data-ws-id="${w.id}">REN</button>
                <button data-ws-act="dup" data-ws-id="${w.id}">DUP</button>
                <button data-ws-act="export" data-ws-id="${w.id}">EXP</button>
                <button data-ws-act="del" data-ws-id="${w.id}">DEL</button></td>
        </tr>`;
    }).join("");
    const m = new Modal({
        type: "custom",
        title: `Workspaces (${list.length})`,
        html: `<div id="workspaces_panel">
                <input type="text" id="ws_new_name" placeholder="New workspace name" />
                <button id="ws_save_btn">SAVE CURRENT</button>
                <button id="ws_import_btn">IMPORT</button>
                <table><tr><th>Name</th><th>Tabs (slot:cwd)</th><th>Mode</th><th></th></tr>
                ${rows || "<tr><td colspan=4>No workspaces saved</td></tr>"}</table>
            </div>`,
        buttons: []
    });
    const root = document.getElementById("modal_" + m.id);
    root.querySelector("#ws_save_btn").addEventListener("click", () => {
        window.saveWorkspace(document.getElementById("ws_new_name").value || "Workspace");
        m.close();
        window.openWorkspaces();
    });
    root.querySelector("#ws_import_btn").addEventListener("click", () => {
        m.close();
        window.importWorkspaces();
    });
    root.querySelectorAll("button[data-ws-act]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-ws-id");
            switch (btn.getAttribute("data-ws-act")) {
                case "apply": window.applyWorkspace(id); m.close(); break;
                case "rename": window.renameWorkspace(id); m.close(); break;
                case "dup": window.duplicateWorkspace(id); m.close(); break;
                case "export": window.exportWorkspace(id); break;
                case "del": window.deleteWorkspace(id); m.close(); break;
            }
        });
    });
};

// ================= Monitor widgets (EPIC-06 / MON-001/002) =================
window.openMonitorWidgets = () => {
    const keys = ["clock", "sysinfo", "hardwareInspector", "cpuinfo", "gpuinfo",
        "ramwatcher", "toplist", "netstat", "globe", "conninfo", "openportlist"];
    const toggles = (window.settings.monitorWidgets) || {};
    const rows = keys.map(k => {
        const on = toggles[k] !== false;
        return `<tr><td>${k}</td><td>
            <select data-mw-key="${k}"><option ${on ? "selected" : ""}>on</option><option ${!on ? "selected" : ""}>off</option></select>
        </td></tr>`;
    }).join("");
    const m = new Modal({
        type: "custom",
        title: "Monitor widgets",
        html: `<div id="monitor_widgets_panel">
            <table><tr><th>Widget</th><th>State</th></tr>${rows}</table>
            <h5>Polling scale (0.5 - 5, applies on mode/widget change):</h5>
            <input type="number" step="0.5" min="0.5" max="5" id="mw_poll_scale"
                value="${window.settings.monitorPollScale || 1}" />
        </div>`,
        buttons: [{label: "APPLY", action: () => {
            const next = {};
            document.querySelectorAll("#monitor_widgets_panel select[data-mw-key]").forEach(sel => {
                if (sel.value === "off") next[sel.getAttribute("data-mw-key")] = false;
            });
            window.settings.monitorWidgets = next;
            const scale = Number(document.getElementById("mw_poll_scale").value);
            window.settings.monitorPollScale = Math.max(0.5, Math.min(5, scale || 1));
            window.writeSettingsFile();
            window.applyUIMode(window.settings.uiMode || "immersive", false);
            m.close();
        }}]
    });
};

// ================= SSH profiles (EPIC-05) =================
// Connecting spawns the system `ssh` client in a dedicated tab. Auth, host-key
// verification and agents run inside the PTY - nothing secret crosses IPC.

// Per-host HUD identity (SSH-002): banner + env accent on the frame. The
// environment is conveyed by label text AND color (not color alone).
window.applyHostIdentity = profile => {
    let banner = document.getElementById("host_banner");
    if (profile) {
        document.body.setAttribute("data-host-env", profile.environment);
        if (!banner) {
            banner = document.createElement("div");
            banner.id = "host_banner";
            document.body.appendChild(banner);
        }
        banner.textContent = `SSH ${profile.alias} — ` +
            `${profile.user ? profile.user + "@" : ""}${profile.hostname} · ` +
            `${profile.environment.toUpperCase()}`;
        banner.style.borderBottomColor = profile.color || "";
        banner.style.display = "";
    } else {
        document.body.removeAttribute("data-host-env");
        if (banner) banner.style.display = "none";
    }
};

window.connectSsh = id => {
    const profile = (window.sshStore.profiles || []).find(p => p.id === id);
    if (!profile) return;
    let slot = -1;
    for (let i = 1; i <= 4; i++) {
        if (!window.term[i]) { slot = i; break; }
    }
    if (slot === -1) {
        new Modal({type: "warning", title: "No free tab",
            message: "All 4 extra terminal tabs are in use - close one before connecting."});
        return;
    }
    profile.lastUsedAt = new Date().toISOString();
    window.writeSshProfilesFile();

    window.term[slot] = null;
    document.getElementById("shell_tab" + slot).innerHTML = `<p>SSH ${wsEsc(profile.alias)}</p>`;
    const number = slot;
    ipc.send("ttyspawn-ssh", {
        hostname: profile.hostname,
        user: profile.user,
        port: profile.port,
        remoteDir: profile.remoteDir,
        env: profile.env
    });
    ipc.once("ttyspawn-ssh-reply", (e, r) => {
        if (r.startsWith("ERROR")) {
            document.getElementById("shell_tab" + number).innerHTML = "<p>ERROR</p>";
            return;
        }
        if (r.startsWith("SUCCESS")) {
            let port = Number(r.substr(9));
            window.term[number] = new Terminal({
                role: "client",
                parentId: "terminal" + number,
                port
            });
            window.term[number].sshProfile = profile;
            window.term[number].onclose = ev => {
                delete window.term[number].onprocesschange;
                document.getElementById("shell_tab" + number).innerHTML = "<p>EMPTY</p>";
                document.getElementById("terminal" + number).innerHTML = "";
                window.term[number].term.dispose();
                delete window.term[number];
                window.applyHostIdentity(null);
                window.useAppShortcut("PREVIOUS_TAB");
            };
            window.term[number].onprocesschange = p => {
                document.getElementById("shell_tab" + number).innerHTML =
                    `<p>${wsEsc(profile.alias)} - ${wsEsc(p)}</p>`;
            };
            document.getElementById("shell_tab" + number).innerHTML =
                `<p>SSH ${wsEsc(profile.alias)}</p>`;
            setTimeout(() => {
                window.focusShellTab(number);
                window.applyHostIdentity(profile);
            }, 500);
        }
    });
};

window.deleteSshProfile = id => {
    const p = (window.sshStore.profiles || []).find(x => x.id === id);
    if (!p) return;
    const m = new Modal({
        type: "custom",
        title: "Delete SSH profile",
        html: `<h5>Delete profile "${wsEsc(p.alias)}"?</h5>`,
        buttons: [{label: "DELETE", action: () => {
            window.sshStore.profiles = window.sshStore.profiles.filter(x => x.id !== id);
            window.writeSshProfilesFile();
            m.close();
            window.openSshProfiles();
        }}]
    });
};

window.editSshProfile = id => {
    const p = (window.sshStore.profiles || []).find(x => x.id === id) || {
        id: nanoid(), alias: "", hostname: "", user: "", port: 22,
        remoteDir: "", env: {}, environment: "dev", color: "", uiMode: null, reconnect: "off"
    };
    const envOpts = window.SshProfiles.ENVS.map(e =>
        `<option ${e === p.environment ? "selected" : ""}>${e}</option>`).join("");
    const modeOpts = ["", "immersive", "productive", "light"].map(x =>
        `<option ${x === (p.uiMode || "") ? "selected" : ""}>${x}</option>`).join("");
    const m = new Modal({
        type: "custom",
        title: p.alias ? `Edit ${wsEsc(p.alias)}` : "New SSH profile",
        html: `<table id="sshProfileForm">
            <tr><td>Alias</td><td><input id="sshF-alias" value="${wsEsc(p.alias)}"></td></tr>
            <tr><td>Hostname</td><td><input id="sshF-hostname" value="${wsEsc(p.hostname)}"></td></tr>
            <tr><td>User</td><td><input id="sshF-user" value="${wsEsc(p.user)}"></td></tr>
            <tr><td>Port</td><td><input id="sshF-port" type="number" value="${p.port}"></td></tr>
            <tr><td>Remote dir</td><td><input id="sshF-remoteDir" value="${wsEsc(p.remoteDir)}" placeholder="~/project"></td></tr>
            <tr><td>Environment</td><td><select id="sshF-environment">${envOpts}</select></td></tr>
            <tr><td>UI mode</td><td><select id="sshF-uiMode">${modeOpts}</select></td></tr>
            <tr><td>Accent color</td><td><input id="sshF-color" value="${wsEsc(p.color)}" placeholder="#rrggbb"></td></tr>
        </table>
        <h5>Auth: system ssh agent/keys (interactive). Passwords and key paths are never stored.</h5>`,
        buttons: [{label: "SAVE", action: () => {
            const candidate = {
                id: p.id,
                alias: document.getElementById("sshF-alias").value.trim(),
                hostname: document.getElementById("sshF-hostname").value.trim(),
                user: document.getElementById("sshF-user").value.trim(),
                port: Number(document.getElementById("sshF-port").value),
                remoteDir: document.getElementById("sshF-remoteDir").value.trim(),
                env: p.env || {},
                environment: document.getElementById("sshF-environment").value,
                color: document.getElementById("sshF-color").value.trim(),
                uiMode: document.getElementById("sshF-uiMode").value || null,
                reconnect: p.reconnect || "off",
                lastUsedAt: p.lastUsedAt || null
            };
            const clean = window.SshProfiles.sanitize(candidate);
            if (!clean) {
                new Modal({type: "warning", title: "Invalid profile",
                    message: "Alias and hostname are required; host/user may only contain [a-zA-Z0-9._-], port 1-65535, remote dir [~a-zA-Z0-9_-./]."});
                return;
            }
            const idx = window.sshStore.profiles.findIndex(x => x.id === clean.id);
            if (idx >= 0) window.sshStore.profiles[idx] = clean;
            else if (window.sshStore.profiles.length < window.SshProfiles.MAX_PROFILES) {
                window.sshStore.profiles.push(clean);
            }
            window.writeSshProfilesFile();
            m.close();
            window.openSshProfiles();
        }}]
    });
};

// SSH-004: searchable profile palette - filter by alias/host/env, recent first
window.openSshProfiles = () => {
    const profiles = (window.sshStore.profiles || []).slice()
        .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")));
    const rows = profiles.map(p => {
        const prodCls = p.environment === "prod" ? " class=\"ssh_prod\"" : "";
        return `<tr${prodCls}>
            <td>${wsEsc(p.alias)}${p.environment === "prod" ? " ⚠" : ""}</td>
            <td>${wsEsc((p.user ? p.user + "@" : "") + p.hostname + ":" + p.port)}</td>
            <td>${wsEsc(p.environment)}</td>
            <td><button data-ssh-act="connect" data-ssh-id="${p.id}">CONNECT</button>
                <button data-ssh-act="edit" data-ssh-id="${p.id}">EDIT</button>
                <button data-ssh-act="del" data-ssh-id="${p.id}">DEL</button></td>
        </tr>`;
    }).join("");
    const m = new Modal({
        type: "custom",
        title: `SSH profiles (${profiles.length})`,
        html: `<div id="ssh_profiles_panel">
                <input type="text" id="ssh_filter" placeholder="Filter by alias, host, environment..." />
                <button id="ssh_new_btn">NEW PROFILE</button>
                <table id="ssh_profiles_table"><tr><th>Alias</th><th>Target</th><th>Env</th><th></th></tr>
                ${rows || "<tr><td colspan=4>No SSH profiles yet</td></tr>"}</table>
            </div>`,
        buttons: []
    });
    const root = document.getElementById("modal_" + m.id);
    const filter = root.querySelector("#ssh_filter");
    filter.addEventListener("input", () => {
        const q = filter.value.toLowerCase();
        root.querySelectorAll("#ssh_profiles_table tr").forEach((tr, i) => {
            if (i === 0) return;
            tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
        });
    });
    root.querySelector("#ssh_new_btn").addEventListener("click", () => {
        m.close();
        window.editSshProfile(null);
    });
    root.querySelectorAll("button[data-ssh-act]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-ssh-id");
            switch (btn.getAttribute("data-ssh-act")) {
                case "connect": m.close(); window.connectSsh(id); break;
                case "edit": m.close(); window.editSshProfile(id); break;
                case "del": m.close(); window.deleteSshProfile(id); break;
            }
        });
    });
};

// Fix #265
window.addEventListener("keyup", e => {
    if (os.platform() === "win32" && e.key === "F4" && e.altKey === true) {
        remote.app.quit();
    }
});

// Fix double-tap zoom on touchscreens
electron.webFrame.setVisualZoomLevelLimits(1, 1);

// Resize terminal with window
window.onresize = () => {
    if (typeof window.currentTerm !== "undefined") {
        if (typeof window.term[window.currentTerm] !== "undefined") {
            window.term[window.currentTerm].fit();
        }
    }
};

// See #413
window.resizeTimeout = null;
electronWin = remote.getCurrentWindow();
electronWin.on("resize", () => {
    if (settings.keepGeometry === false) return;
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(() => {
        let win = remote.getCurrentWindow();
        if (win.isFullScreen()) return false;
        if (win.isMaximized()) {
            win.unmaximize();
            win.setFullScreen(true);
            return false;
        }

        let size = win.getSize();

        if (size[0] >= size[1]) {
            win.setSize(size[0], parseInt(size[0] * 9 / 16));
        } else {
            win.setSize(size[1], parseInt(size[1] * 9 / 16));
        }
    }, 100);
});

electronWin.on("leave-full-screen", () => {
    remote.getCurrentWindow().setSize(960, 540);
});
