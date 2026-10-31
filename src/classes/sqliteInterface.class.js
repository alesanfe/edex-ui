// The sqlite3 native module lives in the main process; the renderer talks to
// it through the edex.db bridge exposed by the preload script.
class SqliteInterface {
    constructor(path) {
        this.history = [];
        this.db = null;
        this.results = document.getElementById("sqlite_results");
        const tableList = document.getElementById("sqlite_tables");
        const runButton = document.getElementById("sqlite_run");
        const query = document.getElementById("sqlite_query");

        runButton.addEventListener("click", () => {
            const sql = query.value;
            query.value = "";
            this.execute(sql);
        });

        query.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runButton.click();
            }
        });

        edex.db.open(path).then(id => {
            // Keep the sqlite3 "each" semantics on top of the batched "all" bridge
            this.db = {
                each: (sql, cb) => {
                    edex.db.all(id, sql).then(rows => {
                        rows.forEach(r => cb(null, r));
                    }).catch(err => cb(err));
                },
                close: () => edex.db.close(id)
            };
            this.db.each("SELECT name FROM sqlite_master WHERE type = \"table\"", (err, row) => {
                if (err) {
                    console.log(err);
                } else {
                    const el = document.createElement("li");
                    el.textContent = row.name;
                    el.classList.add("clickable");
                    tableList.appendChild(el);
                    el.addEventListener("click", () => {
                        this.execute(`SELECT * FROM ${row.name};`);
                    });
                }
            });
        }).catch(e => {
            window.keyboard.attach();
            new Modal({
                type: "error",
                title: "SQLite unavailable",
                message: "Could not open this database: " + (e && e.message || e)
            });
        });
        query.focus();
    }

    execute(sql) {
        if (!this.db) return;
        this.clearResults();
        this.db.each(sql, this.showResults);
        this.addToHistory(sql);
    }

    refreshHistory() {
        const historyList = document.getElementById("sqlite_history");
        while (historyList.firstChild) {
            historyList.removeChild(historyList.lastChild);
        }

        for (let i = this.history.length - 1; i >= 0; i--) {
            let el = document.createElement("li");
            const sql = this.history[i];
            el.textContent = sql.length > 20 ? `${sql.slice(0, 20)}…` : sql;
            el.classList.add("clickable");
            el.title = sql;
            el.addEventListener("click", () => {
                this.execute(sql);
            });

            historyList.appendChild(el);
        }
    }

    addToHistory(sql) {
        // avoid duplicate items in history.
        if (this.history[this.history.length - 1] !== sql) {
            this.history.push(sql);
            this.refreshHistory();
        }
    }

    clearResults() {
        while (this.results.firstChild) {
            this.results.removeChild(this.results.lastChild);
        }
    }

    showResults(err, row) {
        const results = document.getElementById("sqlite_results");
        if (err) {
            console.log(err);
        } else {
            let header = document.getElementById("sqlite_resultHeader");
            if (!header) {
                header = document.createElement("thead");
                header.id = "sqlite_resultHeader";
                let rowEl = document.createElement("tr");
                for (let header in row) {
                    let el = document.createElement("th");
                    el.textContent = header;
                    rowEl.appendChild(el);
                }
                header.appendChild(rowEl);
                results.appendChild(header);
            }

            let rowEl = document.createElement("tr");
            for (let item in row) {
                let el = document.createElement("td");
                el.textContent = row[item];
                rowEl.appendChild(el);
            }
            results.appendChild(rowEl);
        }
    }
}

if (typeof module !== "undefined") module.exports = {
    SqliteInterface
};
