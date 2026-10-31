// Monitor history + threshold alerts (EPIC-06 / MON-004, MON-005).
// A bounded ring of {ts, cpu, mem} samples collected from the cpuinfo and
// ramwatcher widgets, optionally flushed to <settingsDir>/monitor-history.json
// (capped on disk too). Retention never grows; nothing leaves the machine.
window.MonitorHistory = (function () {
    const MAX_SAMPLES = 1728;        // 24h at one sample/50s worst case
    const MIN_GAP_MS = 5000;         // at most one sample per 5s
    const FLUSH_MS = 60000;
    const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

    const samples = [];
    let lastPush = 0;
    let flushTimer = null;
    let filePath = null;
    const lastAlertAt = {};

    function init(dir) {
        filePath = dir;
        if (!filePath) return;
        // Load existing history (bounded, corrupt-safe)
        try {
            if (fs.existsSync(filePath)) {
                const raw = JSON.parse(fs.readFileSync(filePath).toString() || "[]");
                if (Array.isArray(raw)) {
                    raw.slice(-MAX_SAMPLES).forEach(s => {
                        if (s && typeof s.ts === "number") samples.push(s);
                    });
                }
            }
        } catch (e) { /* start empty */ }
        flushTimer = setInterval(flush, FLUSH_MS);
    }

    function enabled() {
        return !(window.settings && window.settings.monitorHistory === false);
    }

    function push(sample) {
        if (!enabled()) return;
        const now = Date.now();
        if (now - lastPush < MIN_GAP_MS) return;
        lastPush = now;
        samples.push({ts: now, ...sample});
        if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
        checkAlerts(sample);
    }

    // MON-005: simple threshold alerts with per-metric cooldown, no external
    // reporting - a transient banner + audio cue only.
    function checkAlerts(sample) {
        const cfg = (window.settings && window.settings.alerts) || {};
        if (cfg.enabled === false) return;
        const checks = [
            ["cpu", sample.cpu, cfg.cpu || 90],
            ["mem", sample.mem, cfg.mem || 90]
        ];
        checks.forEach(([metric, value, threshold]) => {
            if (typeof value !== "number" || value < threshold) return;
            const now = Date.now();
            if (now - (lastAlertAt[metric] || 0) < ALERT_COOLDOWN_MS) return;
            lastAlertAt[metric] = now;
            showAlert(metric, value, threshold);
        });
    }

    function showAlert(metric, value, threshold) {
        let el = document.getElementById("monitor_alert");
        if (!el) {
            el = document.createElement("div");
            el.id = "monitor_alert";
            document.body.appendChild(el);
        }
        el.textContent = `ALERT: ${metric.toUpperCase()} at ${Math.round(value)}% (threshold ${threshold}%)`;
        el.style.display = "";
        if (window.audioManager && window.audioManager.denied) window.audioManager.denied.play();
        setTimeout(() => { el.style.display = "none"; }, 8000);
    }

    function flush() {
        if (!enabled() || !filePath || !samples.length) return;
        try {
            fs.writeFile(filePath, JSON.stringify(samples.slice(-MAX_SAMPLES)), () => {});
        } catch (e) { /* disk full / permission - history is best-effort */ }
    }

    function clear() {
        samples.length = 0;
        if (filePath) {
            try { fs.writeFile(filePath, "[]", () => {}); } catch (e) {}
        }
    }

    function stop() {
        if (flushTimer) { clearInterval(flushTimer); flushTimer = null; }
    }

    return {init, push, clear, flush, stop, samples};
})();
