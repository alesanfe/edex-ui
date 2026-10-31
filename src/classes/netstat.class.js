class Netstat {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create DOM
        this.parent = document.getElementById(parentId);
        this.parent.innerHTML += `<div id="mod_netstat">
            <div id="mod_netstat_inner">
                <h1>NETWORK STATUS<i id="mod_netstat_iname"></i></h1>
                <div id="mod_netstat_innercontainer">
                    <div>
                        <h1>STATE</h1>
                        <h2>UNKNOWN</h2>
                    </div>
                    <div>
                        <h1>IPv4</h1>
                        <h2>--.--.--.--</h2>
                    </div>
                    <div>
                        <h1>PING</h1>
                        <h2>--ms</h2>
                    </div>
                </div>
            </div>
        </div>`;

        this.offline = false;
        this.lastconn = {finished: false}; // Prevent geoip lookup attempt until maxminddb is loaded
        this.iface = null;
        this.failedAttempts = {};
        this.runsBeforeGeoIPUpdate = 0;

        // Init updaters
        this.updateInfo();
        this.infoUpdater = setInterval(() => {
            this.updateInfo();
        }, 2000);

        // Init GeoIP integrated backend - download/open runs in the main process
        this.geoLookup = {
            get: () => null
        };
        edex.geo.init(path.join(remote.app.getPath("userData"), "geoIPcache")).then(() => {
            this.geoLookup = {get: ip => edex.geo.lookup(ip)};
            this.lastconn.finished = true;
        }).catch(e => {
            console.warn("NetStat: GeoIP backend unavailable:", e);
            this.lastconn.finished = true;
        });
    }
    updateInfo() {
        window.si.networkInterfaces().then(async data => {
            let offline = false;

            let net = data[0];
            let netID = 0;

            if (typeof window.settings.iface === "string") {
                while (net.iface !== window.settings.iface) {
                    netID++;
                    if (data[netID]) {
                        net = data[netID];
                    } else {
                        // No detected interface has the custom iface name, fallback to automatic detection on next loop
                        window.settings.iface = false;
                        return false;
                    }
                }
            } else {
                // Find the first external, IPv4 connected networkInterface that has a MAC address set

                while (net.operstate !== "up" || net.internal === true || net.ip4 === "" || net.mac === "") {
                    netID++;
                    if (data[netID]) {
                        net = data[netID];
                    } else {
                        // No external connection!
                        this.iface = null;
                        document.getElementById("mod_netstat_iname").innerText = "Interface: (offline)";

                        this.offline = true;
                        document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "OFFLINE";
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = "--.--.--.--";
                        document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = "--ms";
                        break;
                    }
                }
            }

            if (net.ip4 !== this.internalIPv4) this.runsBeforeGeoIPUpdate = 0;

            this.iface = net.iface;
            this.internalIPv4 = net.ip4;
            document.getElementById("mod_netstat_iname").innerText = "Interface: "+net.iface;

            if (net.ip4 === "127.0.0.1") {
                offline = true;
            } else {
                if (this.runsBeforeGeoIPUpdate === 0 && this.lastconn.finished) {
                    let handleGeoIPData = rawData => {
                        try {
                            let data = JSON.parse(rawData);
                            this.ipinfo = {
                                ip: data.ip,
                                geo: this.geoLookup.get(data.ip).location
                            };

                            let ip = this.ipinfo.ip;
                            document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = window._escapeHtml(ip);

                            this.runsBeforeGeoIPUpdate = 10;
                        } catch(e) {
                            this.failedAttempts[e] = (this.failedAttempts[e] || 0) + 1;
                            if (this.failedAttempts[e] > 2) return false;
                            console.warn(e);
                            console.info(rawData.toString());
                            electron.ipcRenderer.send("log", "note", "NetStat: Error parsing data from myexternalip.com");
                            electron.ipcRenderer.send("log", "debug", `Error: ${e}`);
                        }
                    };

                    if (window.settings.proxy) {
                        // See #1050 - go through Chromium's network stack so the proxy configuration applies
                        let conn = {finished: false};
                        this.lastconn = conn;
                        fetch("https://myexternalip.com/json", {cache: "no-store"}).then(res => {
                            res.text().then(rawData => {
                                conn.finished = true;
                                handleGeoIPData(rawData);
                            }).catch(e => {
                                conn.finished = true;
                            });
                        }).catch(e => {
                            conn.finished = true;
                        });
                    } else {
                        // Raw HTTPS request runs in the main process (bound to the
                        // active interface), result delivered back over IPC
                        let conn = {finished: false};
                        this.lastconn = conn;
                        edex.net.httpsGet({host: "myexternalip.com", port: 443, path: "/json", localAddress: net.ip4}).then(rawData => {
                            conn.finished = true;
                            handleGeoIPData(rawData);
                        }).catch(e => {
                            conn.finished = true;
                        });
                    }
                } else if (this.runsBeforeGeoIPUpdate !== 0) {
                    this.runsBeforeGeoIPUpdate = this.runsBeforeGeoIPUpdate - 1;
                }

                let p = await this.ping(window.settings.pingAddr || "1.1.1.1", 80, net.ip4).catch(() => { offline = true });

                this.offline = offline;
                if (offline) {
                    document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "OFFLINE";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(2) > h2").innerHTML = "--.--.--.--";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = "--ms";
                } else {
                    document.querySelector("#mod_netstat_innercontainer > div:first-child > h2").innerHTML = "ONLINE";
                    document.querySelector("#mod_netstat_innercontainer > div:nth-child(3) > h2").innerHTML = Math.round(p)+"ms";
                }
            }
        });
    }
    ping(target, port, local) {
        // See #1050 - a raw TCP socket can't go through an HTTP proxy; measure latency over HTTP instead
        if (window.settings.proxy) {
            return new Promise((resolve, reject) => {
                let start = performance.now();
                fetch("https://myexternalip.com/json", {cache: "no-store"}).then(() => {
                    resolve(performance.now() - start);
                }).catch(reject);
            });
        }
        // Raw TCP latency probe runs in the main process over IPC
        return edex.net.tcpPing(target, port, local);
    }
}

if (typeof module !== "undefined") module.exports = {
    Netstat
};
