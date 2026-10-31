class Diskinfo {
    constructor(parentId) {
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_diskinfo");
        this._element.innerHTML = `<div id="mod_diskinfo_inner">
                <h1>DISKS<i id="mod_diskinfo_count"></i></h1>
                <div id="mod_diskinfo_rows"></div>
            </div>`;
        this.parent.append(this._element);
        this.container = this._element;

        this.currentlyUpdating = false;
        this.updateInfo();
        window.initPausable(this);
        this.infoUpdater = this._every(() => {
            this.updateInfo();
        }, 15000);
    }

    static _fmt(bytes) {
        if (typeof bytes !== "number" || bytes <= 0) return "--";
        const units = ["B", "KB", "MB", "GB", "TB", "PB"];
        let i = 0, v = bytes;
        while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
        return `${v >= 100 ? Math.round(v) : v.toFixed(1)}${units[i]}`;
    }

    updateInfo() {
        if (this.currentlyUpdating) return;
        this.currentlyUpdating = true;
        window.si.fsSize().then(fss => {
            this.currentlyUpdating = false;
            const rows = document.getElementById("mod_diskinfo_rows");
            const count = document.getElementById("mod_diskinfo_count");
            if (!rows || !count) return;
            const list = (Array.isArray(fss) ? fss : [])
                .filter(fs => fs.size > 0 && !String(fs.fs).startsWith("/dev/loop") && !String(fs.mount).startsWith("/snap"))
                .slice(0, 6);
            count.innerText = ` ${list.length}`;
            rows.innerHTML = list.map(fs => {
                const pct = Math.round(fs.use || 0);
                const color = pct >= 90 ? "rgb(255,80,80)" : pct >= 75 ? "rgb(255,180,60)" : "";
                const label = (fs.mount || fs.fs || "?").toString().slice(0, 18);
                return `<div class="diskinfo_row">
                    <span class="diskinfo_fs">${label}</span>
                    <span class="diskinfo_bar"><span class="diskinfo_fill" style="width:${pct}%;${color ? "background:" + color + ";" : ""}"></span></span>
                    <span class="diskinfo_pct" style="${color ? "color:" + color + ";" : ""}">${pct}%</span>
                    <span class="diskinfo_size">${Diskinfo._fmt(fs.used)}/${Diskinfo._fmt(fs.size)}</span>
                </div>`;
            }).join("") || `<div class="diskinfo_row">no filesystems</div>`;
        }).catch(() => {
            this.currentlyUpdating = false;
            const rows = document.getElementById("mod_diskinfo_rows");
            if (rows) rows.innerHTML = `<div class="diskinfo_row">unavailable</div>`;
        });
    }
}

if (typeof module !== "undefined") {
    module.exports = Diskinfo;
}
