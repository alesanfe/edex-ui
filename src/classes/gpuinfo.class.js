class Gpuinfo {
    constructor(parentId) {
        this.parent = document.getElementById(parentId);
        // append() instead of innerHTML += - rewriting the column's innerHTML
        // would destroy sibling elements other modules already captured
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_gpuinfo");
        this._element.innerHTML = `<div id="mod_gpuinfo_inner">
                <h1>GPU<i id="mod_gpuinfo_name"></i></h1>
                <h2 id="mod_gpuinfo_util">UTIL --%</h2>
                <h2 id="mod_gpuinfo_vram">VRAM --</h2>
            </div>`;
        this.parent.append(this._element);
        this.container = this._element;

        this.currentlyUpdating = false;
        this.updateInfo();
        window.initPausable(this);
        this.infoUpdater = this._every(() => {
            this.updateInfo();
        }, 3000);
    }

    updateInfo() {
        if (this.currentlyUpdating) return;
        this.currentlyUpdating = true;
        window.si.graphics().then(data => {
            this.currentlyUpdating = false;
            const ctl = data && data.controllers && data.controllers[0];
            if (!ctl) {
                document.getElementById("mod_gpuinfo_name").innerText = " (no GPU data)";
                return;
            }
            document.getElementById("mod_gpuinfo_name").innerText =
                " " + (ctl.model || ctl.vendor || "GPU").toString().slice(0, 40);

            // Utilization is platform-dependent - show only when reported
            const util = (typeof ctl.utilizationGpu === "number")
                ? Math.round(ctl.utilizationGpu) : null;
            document.getElementById("mod_gpuinfo_util").innerText =
                util !== null ? `UTIL ${util}%` : "UTIL n/a";

            // VRAM: prefer dynamic used/total (MB), fall back to static vram
            const total = (typeof ctl.memoryTotal === "number" && ctl.memoryTotal > 0)
                ? ctl.memoryTotal : (typeof ctl.vram === "number" ? ctl.vram : null);
            const used = (typeof ctl.memoryUsed === "number") ? ctl.memoryUsed : null;
            document.getElementById("mod_gpuinfo_vram").innerText =
                total !== null
                    ? `VRAM ${used !== null ? used + "/" : ""}${Math.round(total)}MB`
                    : "VRAM n/a";
        }).catch(() => {
            this.currentlyUpdating = false;
            const el = document.getElementById("mod_gpuinfo_name");
            if (el) el.innerText = " (unavailable)";
        });
    }
}

if (typeof module !== "undefined") {
    module.exports = Gpuinfo;
}
