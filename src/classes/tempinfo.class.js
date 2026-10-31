class Tempinfo {
    constructor(parentId) {
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_tempinfo");
        this._element.innerHTML = `<div id="mod_tempinfo_inner">
                <h1>TEMPERATURE<i id="mod_tempinfo_chip"></i></h1>
                <h2 id="mod_tempinfo_main">CPU --°C</h2>
                <h2 id="mod_tempinfo_extra"></h2>
            </div>`;
        this.parent.append(this._element);
        this.container = this._element;

        this.currentlyUpdating = false;
        this.updateInfo();
        window.initPausable(this);
        this.infoUpdater = this._every(() => {
            this.updateInfo();
        }, 4000);
    }

    updateInfo() {
        if (this.currentlyUpdating) return;
        this.currentlyUpdating = true;
        window.si.cpuTemperature().then(data => {
            this.currentlyUpdating = false;
            const main = document.getElementById("mod_tempinfo_main");
            const extra = document.getElementById("mod_tempinfo_extra");
            if (!main || !extra) return;
            const t = (data && typeof data.main === "number") ? data.main : null;
            main.innerText = t !== null ? `CPU ${Math.round(t)}°C` : "CPU n/a";
            if (t !== null && t >= 80) {
                main.style.color = "rgb(255,80,80)";
            } else if (t !== null && t >= 65) {
                main.style.color = "rgb(255,180,60)";
            } else {
                main.style.color = "";
            }
            const cores = (data && Array.isArray(data.cores))
                ? data.cores.filter(c => typeof c === "number") : [];
            const max = (data && typeof data.max === "number") ? data.max
                : (cores.length ? Math.max.apply(null, cores) : null);
            const soc = (data && Array.isArray(data.chipset) && data.chipset.length)
                ? data.chipset[0] : null;
            const parts = [];
            if (max !== null) parts.push(`MAX ${Math.round(max)}°C`);
            if (cores.length) parts.push(`CORES ${cores.length}`);
            if (typeof soc === "number") parts.push(`SOC ${Math.round(soc)}°C`);
            extra.innerText = parts.join("  ");
        }).catch(() => {
            this.currentlyUpdating = false;
            const el = document.getElementById("mod_tempinfo_main");
            if (el) el.innerText = "unavailable";
        });
    }
}

if (typeof module !== "undefined") {
    module.exports = Tempinfo;
}
