class UpdateChecker {
    constructor() {
        // "electron" and "remote" globals are provided by the preload bridge
        let current = remote.app.getVersion();

        this._failed = false;
        this._fail = e => {
            this._failed = true;
            electron.ipcRenderer.send("log", "note", "UpdateChecker: Could not fetch latest release from GitHub's API.");
            electron.ipcRenderer.send("log", "debug", `Error: ${e}`);
        };

        // Use fetch (Chromium network stack) so proxy configuration applies - see #1050
        fetch("https://api.github.com/repos/andreas-hartmann/xdex-ui/releases/latest", {
            headers: {
                "User-Agent": "xDEX-UI UpdateChecker"
            }
        }).then(res => {
            if (res.status === 404) {
                // Repository has no published releases yet - nothing to compare against
                electron.ipcRenderer.send("log", "info", "UpdateChecker: No releases published upstream; skipping update check.");
                return;
            }

            res.text().then(d => {
                if (this._failed === true) {
                    // Do nothing, it already failed
                } else if (res.status !== 200) {
                    this._fail(d.toString());
                } else {
                    try {
                        let release = JSON.parse(d.toString());
                        if (release.tag_name.slice(1) === current) {
                            electron.ipcRenderer.send("log", "info", "UpdateChecker: Running latest version.");
                        } else if (Number(release.tag_name.slice(1).replace(/\./g, "")) < Number(current.replace("-pre", "").replace(/\./g, ""))) {
                            electron.ipcRenderer.send("log", "info", "UpdateChecker: Running an unreleased, development version.");
                        } else {
                            new Modal({
                                type: "info",
                                title: "New version available",
                                message: `xDEX-UI <strong>${release.tag_name}</strong> is now available.<br/>Head over to <a href="#" id="updateChecker_dl">github.com</a> to download the latest version.`
                            });
                            document.getElementById("updateChecker_dl").onclick = () => {
                                electron.shell.openExternal(release.html_url);
                                return false;
                            };
                            electron.ipcRenderer.send("log", "info", `UpdateChecker: New version ${release.tag_name} available.`);
                        }
                    } catch(e) {
                        this._fail(e);
                    }
                }
            });
        }).catch(e => {
            this._fail(e);
        });
    }
}

if (typeof module !== "undefined") module.exports = {
    UpdateChecker
};
