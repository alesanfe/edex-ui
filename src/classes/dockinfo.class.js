// Containers panel (P3-3): Docker via systeminformation; the Kubernetes row
// shows the current kubectl context when available on PATH.
class Dockinfo {
    constructor(parentId) {
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_dockinfo");
        this._element.innerHTML = `<div id="mod_dockinfo_inner">
                <h1>CONTAINERS<i id="mod_dockinfo_count"></i></h1>
                <h2 id="mod_dockinfo_k8s"></h2>
                <div id="mod_dockinfo_rows"></div>
            </div>`;
        this.parent.append(this._element);
        this.container = this._element;

        this.currentlyUpdating = false;
        this._dockerAvailable = true;
        this.updateInfo();
        window.initPausable(this);
        this.infoUpdater = this._every(() => {
            this.updateInfo();
        }, 8000);
        this.k8sUpdater = this._every(() => {
            this.updateK8s();
        }, 15000);
        this.updateK8s();
    }

    updateInfo() {
        if (this.currentlyUpdating || !this._dockerAvailable) return;
        this.currentlyUpdating = true;
        window.si.dockerContainers(true).then(containers => {
            this.currentlyUpdating = false;
            const rows = document.getElementById("mod_dockinfo_rows");
            const count = document.getElementById("mod_dockinfo_count");
            if (!rows || !count) return;
            const list = (Array.isArray(containers) ? containers : []).slice(0, 8);
            const running = list.filter(c => c.state === "running").length;
            count.innerText = ` ${running}/${list.length}`;
            rows.innerHTML = list.map(c => {
                const name = String(c.name || c.id || "?").slice(0, 16);
                const st = String(c.state || "?");
                return `<div class="dockinfo_row">
                    <span class="dockinfo_dot" data-state="${st}"></span>
                    <span class="dockinfo_name">${name}</span>
                    <span class="dockinfo_state">${st}</span>
                </div>`;
            }).join("") || `<div class="dockinfo_row">no containers</div>`;
        }).catch(() => {
            this.currentlyUpdating = false;
            // Docker absent or daemon unreachable - stop polling, mark widget
            this._dockerAvailable = false;
            const rows = document.getElementById("mod_dockinfo_rows");
            const count = document.getElementById("mod_dockinfo_count");
            if (count) count.innerText = " off";
            if (rows) rows.innerHTML = `<div class="dockinfo_row">docker unavailable</div>`;
        });
    }

    updateK8s() {
        const el = document.getElementById("mod_dockinfo_k8s");
        if (!el) return;
        // `kubectl config current-context` - cheap probe; absent binary or no
        // cluster configured both resolve to an empty row.
        if (typeof window.edex !== "object" || typeof window.edex.probe !== "function") {
            el.innerText = "";
            return;
        }
        window.edex.probe("kubectl-context")
            .then(out => {
                const ctx = String(out || "").trim().slice(0, 40);
                el.innerText = ctx ? `K8S ${ctx}` : "";
            })
            .catch(() => { el.innerText = ""; });
    }
}

if (typeof module !== "undefined") {
    module.exports = Dockinfo;
}
