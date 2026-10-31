class OpenPortList {
    constructor(parentId) {
        if (!parentId) throw "Missing parameters";

        // Create DOM
        this.parent = document.getElementById(parentId);
        this._element = document.createElement("div");
        this._element.setAttribute("id", "mod_openportlist");
        this._element.innerHTML = `<h1>OPEN PORTS<i>PID | NAME | PORT</i></h1><br>
        <table id="mod_openportlist_table"></table>`;

        this.parent.append(this._element);

        this.updateList();
        this.listUpdater = setInterval(() => {
            this.updateList();
        }, 2000);
    }

    updateList() {
        window.si.networkConnections().then(data => {
            let table = document.getElementById("mod_openportlist_table");
            if (table === null || !Array.isArray(data)) return;
            table.innerHTML = "";

            data.filter(value => {
                return value.state === "LISTEN";
            }).filter((v, i, a) => {
                return a.findIndex(t => (t.localport === v.localport)) === i;
            }).forEach(proc => {
                let el = document.createElement("tr");
                el.innerHTML = `<td>${window._escapeHtml(String(proc.pid || ""))}</td>
                            <td>${window._escapeHtml(String(proc.process || ""))}</td>
                            <td>${window._escapeHtml(String(proc.localport || ""))}</td>`;
                table.append(el);
            });
        }).catch(e => {
            console.warn("Failed to retrieve open ports list:", e);
        });
    }
}

if (typeof module !== "undefined") module.exports = {
    OpenPortList
};
