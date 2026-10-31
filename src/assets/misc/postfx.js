// Post-effects (P3-6): configurable CRT-style overlay - scanlines, flicker,
// terminal glow. Values are 0-100 and live in settings.postFx; honored by
// reduced-motion (flicker is forced to 0).
window.applyPostFx = fx => {
    fx = fx || (window.settings && window.settings.postFx) || {};
    const n = v => Math.max(0, Math.min(100, Number(v) || 0));
    let scan = n(fx.scanlines);
    let glow = n(fx.glow);
    let flicker = n(fx.flicker);
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        flicker = 0;
    }

    let el = document.getElementById("postfx_overlay");
    if (scan === 0 && glow === 0 && flicker === 0) {
        if (el) el.remove();
        document.getElementById("main_shell_innercontainer")?.style.removeProperty("filter");
        return;
    }
    if (!el) {
        el = document.createElement("div");
        el.id = "postfx_overlay";
        document.body.appendChild(el);
    }
    el.style.setProperty("--pfx-scan", scan / 100);
    el.style.setProperty("--pfx-flicker", flicker / 100);
    el.classList.toggle("pfx-flicker", flicker > 0);
    const sh = document.getElementById("main_shell_innercontainer");
    if (sh) {
        sh.style.filter = glow > 0
            ? `brightness(${1 + glow / 300}) saturate(${1 + glow / 250})`
            : "";
    }
};

if (typeof module !== "undefined") {
    module.exports = {};
}
