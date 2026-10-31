// Network topology view (P3-2): 2D canvas - local host at center, remote
// endpoints on a ring, edges colored by connection state.
class Nettopo {
    constructor(parentId) {
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_nettopo");
        this._element.innerHTML = `<div id="mod_nettopo_inner">
                <h1>NET TOPOLOGY<i id="mod_nettopo_count"></i></h1>
                <canvas id="mod_nettopo_canvas"></canvas>
            </div>`;
        this.parent.append(this._element);
        this.container = this._element;

        this.currentlyUpdating = false;
        this.updateInfo();
        window.initPausable(this);
        this.infoUpdater = this._every(() => {
            this.updateInfo();
        }, 5000);
    }

    updateInfo() {
        if (this.currentlyUpdating) return;
        this.currentlyUpdating = true;
        window.si.networkConnections().then(conns => {
            this.currentlyUpdating = false;
            const canvas = document.getElementById("mod_nettopo_canvas");
            if (!canvas) return;
            const inner = document.getElementById("mod_nettopo_inner");
            const w = inner.clientWidth - 10;
            const h = Math.max(120, Math.min(220, inner.clientWidth * 0.7));
            if (canvas.width !== w) canvas.width = w;
            if (canvas.height !== h) canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) return;

            const theme = window.theme || {};
            const main = `rgb(${theme.r || 0},${theme.g || 255},${theme.b || 255})`;
            const dim = "rgba(120,120,120,0.6)";

            const peers = {};
            (Array.isArray(conns) ? conns : []).forEach(c => {
                const ip = String(c.peeraddress || "");
                if (!ip || ip === "0.0.0.0" || ip === "127.0.0.1" || ip === "::" || ip === "*") return;
                peers[ip] = c.state || "?";
            });
            const list = Object.keys(peers).slice(0, 12);
            document.getElementById("mod_nettopo_count").innerText = ` ${list.length}`;

            ctx.clearRect(0, 0, w, h);
            ctx.font = `${Math.max(9, Math.round(h * 0.07))}px monospace`;

            const cx = w / 2, cy = h / 2;
            const radius = Math.min(w, h) / 2 - 24;
            list.forEach((ip, i) => {
                const a = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
                const x = cx + radius * Math.cos(a);
                const y = cy + radius * Math.sin(a);
                const established = peers[ip] === "ESTABLISHED";
                ctx.strokeStyle = established ? main : dim;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(x, y);
                ctx.stroke();
                ctx.fillStyle = established ? main : dim;
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillText(ip.split(":").pop(), x + 7, y + 3);
            });

            // Local node
            ctx.fillStyle = main;
            ctx.beginPath();
            ctx.arc(cx, cy, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = main;
            ctx.stroke();
            const local = (window.mods.netstat && window.mods.netstat.ipinfo && window.mods.netstat.ipinfo.ip) || "local";
            ctx.fillText(String(local), cx + 10, cy + 4);
        }).catch(() => {
            this.currentlyUpdating = false;
        });
    }
}

if (typeof module !== "undefined") {
    module.exports = Nettopo;
}
