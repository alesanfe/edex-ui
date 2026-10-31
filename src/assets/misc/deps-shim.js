// Browser-side shims replacing node modules that cannot run in a
// context-isolated, node-integration-free renderer.
// Loaded as a classic script; exposes globals used throughout the app.

// ---------------------------------------------------------------- path shim
(function () {
    const isWin = (window.edexPlatform === "win32");
    const sep = isWin ? "\\" : "/";
    const otherSep = isWin ? "/" : "\\";

    function normalizeSep(p) {
        // Convert foreign separators so logic stays simple
        return isWin ? p.replace(/\//g, "\\") : p;
    }
    function isAbsolute(p) {
        if (isWin) return /^([a-zA-Z]:[\\/]|\\\\)/.test(p);
        return p.startsWith("/");
    }
    function normalize(p) {
        if (!p) return ".";
        p = normalizeSep(p);
        const abs = isAbsolute(p);
        const root = isWin ? (p.match(/^([a-zA-Z]:|\\\\[^\\/]+[\\/][^\\/]+)/) || [""])[0] : (abs ? "/" : "");
        let parts = p.slice(root.length).split(sep).filter(s => s !== "" && s !== ".");
        let out = [];
        for (const part of parts) {
            if (part === ".." && out.length && out[out.length - 1] !== "..") out.pop();
            else if (part === ".." && !abs) out.push(part);
            else if (part !== "..") out.push(part);
        }
        const rootSep = (root && !root.endsWith(sep)) ? sep : "";
        let res = root + rootSep + out.join(sep);
        if (res === "") res = abs ? root : ".";
        if (isWin && /^[a-zA-Z]:$/.test(res)) res += "\\";
        return res;
    }
    function join(...args) {
        return normalize(args.filter(s => s !== "" && s != null).join(sep));
    }
    function resolve(...args) {
        let parts = [];
        let root = null;
        const all = [window.edexCwd, ...args];
        for (const p0 of all) {
            if (!p0) continue;
            const p = normalizeSep(p0);
            if (isAbsolute(p)) {
                root = isWin ? (p.match(/^([a-zA-Z]:|\\\\[^\\/]+[\\/][^\\/]+)/) || [sep])[0] : "/";
                parts = p.slice(root.length).split(sep).filter(s => s !== "");
            } else {
                parts.push(...p.split(sep).filter(s => s !== ""));
            }
        }
        if (root === null) { root = isWin ? (window.edexCwd.match(/^([a-zA-Z]:)/) || ["C:"])[0] : "/"; }
        const out = [];
        for (const part of parts) {
            if (part === "..") { if (out.length) out.pop(); }
            else if (part !== ".") out.push(part);
        }
        const rootSep2 = (root && !root.endsWith(sep)) ? sep : "";
        let res = root + rootSep2 + out.join(sep);
        if (isWin && /^[a-zA-Z]:$/.test(res)) res += "\\";
        return res;
    }
    function dirname(p) {
        p = normalizeSep(p);
        const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
        if (i === -1) return ".";
        if (i === 0) return p.slice(0, isWin ? 1 : 1);
        return p.slice(0, i);
    }
    function basename(p, ext) {
        p = normalizeSep(p);
        let b = p.split(/[\\/]/).pop() || "";
        if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length);
        return b;
    }
    function extname(p) {
        const b = basename(p);
        const i = b.lastIndexOf(".");
        return (i <= 0) ? "" : b.slice(i);
    }
    function parse(p) {
        const dir = dirname(p), base = basename(p), ext = extname(p);
        return { root: isAbsolute(p) ? p.slice(0, p.length - normalize(p).length + (isWin ? 0 : 0)) : "", dir, base, ext, name: base.slice(0, base.length - ext.length) };
    }
    window.path = { sep, delimiter: isWin ? ";" : ":", normalize, join, resolve, dirname, basename, extname, isAbsolute, parse };
})();

// ------------------------------------------------------------ nanoid shims
window.nanoid = (size = 21) => {
    const a = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
    let id = "";
    const bytes = crypto.getRandomValues(new Uint8Array(size));
    for (let i = 0; i < size; i++) id += a[bytes[i] & 63];
    return id;
};
window.nanoidNonSecure = (size = 21) => {
    const a = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
    let id = "";
    for (let i = 0; i < size; i++) id += a[Math.floor(Math.random() * 64)];
    return id;
};

// ------------------------------------------------------------- pretty-bytes
window.prettyBytes = (number, options) => {
    if (!Number.isFinite(number)) throw new TypeError("Expected a finite number");
    options = Object.assign({ signed: false, bits: false }, options);
    const UNITS = options.bits
        ? ["b", "Kb", "Mb", "Gb", "Tb", "Pb", "Eb", "Zb", "Yb"]
        : ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const isNeg = number < 0;
    const prefix = isNeg ? "-" : (options.signed ? "+" : "");
    if (isNeg) number = -number;
    if (number < 1) return prefix + " " + number + " " + UNITS[0];
    const exp = Math.min(Math.floor(Math.log10(number) / 3), UNITS.length - 1);
    number = Number((number / Math.pow(1000, exp)).toPrecision(3));
    return prefix + " " + number + " " + UNITS[exp];
};

// ------------------------------------------------------------ mime-types shim
// Covers the types the file viewer cares about; unknown => application/octet-stream
window.mime = (() => {
    const map = {
        txt: "text/plain", md: "text/markdown", markdown: "text/markdown",
        html: "text/html", htm: "text/html", css: "text/css", csv: "text/csv",
        js: "text/javascript", mjs: "text/javascript", json: "application/json",
        xml: "text/xml", yaml: "text/yaml", yml: "text/yaml", ini: "text/plain",
        log: "text/plain", conf: "text/plain", sh: "application/x-sh",
        py: "text/x-python", rb: "text/x-ruby", java: "text/x-java-source",
        c: "text/x-c", h: "text/x-c", cpp: "text/x-c++src", cs: "text/x-csharp",
        ts: "text/typescript", tsx: "text/typescript", jsx: "text/jsx",
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
        webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
        mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
        mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo", mov: "video/quicktime",
        pdf: "application/pdf", zip: "application/zip", gz: "application/gzip",
        tar: "application/x-tar", "7z": "application/x-7z-compressed",
        db: "application/x-sqlite3", sqlite: "application/x-sqlite3", sqlite3: "application/x-sqlite3", db3: "application/x-sqlite3",
        ttf: "font/ttf", otf: "font/otf", woff: "font/woff", woff2: "font/woff2"
    };
    return {
        lookup(extOrPath) {
            const ext = extOrPath.toLowerCase().replace(/^\./, "");
            return map[ext] || false;
        },
        charset(type) {
            if (!type) return false;
            if (type.startsWith("text/") || type === "application/json" || type === "application/javascript") return "UTF-8";
            return false;
        }
    };
})();

// ---------------------------------------------------------------- color shim
// Minimal subset of the "color" package: parse, grayscale, mix, hex + common ops
window.color = (input) => {
    function parse(str) {
        str = String(str).trim();
        let m = str.match(/^#([0-9a-f]{3,8})$/i);
        if (m) {
            let h = m[1];
            if (h.length === 3) h = h.split("").map(c => c + c).join("");
            if (h.length >= 6) return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
        }
        m = str.match(/^rgba?\(([^)]+)\)$/i);
        if (m) {
            const p = m[1].split(",").map(s => parseFloat(s));
            return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0 };
        }
        const named = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff" };
        if (named[str.toLowerCase()]) return parse(named[str.toLowerCase()]);
        return { r: 0, g: 0, b: 0 };
    }
    const { r, g, b } = parse(input);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    const toHex = (rr, gg, bb) => "#" + [rr, gg, bb].map(v => clamp(v).toString(16).padStart(2, "0")).join("");
    function rgbToHsl(rr, gg, bb) {
        rr /= 255; gg /= 255; bb /= 255;
        const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
            h *= 60;
        }
        return { h, s, l };
    }
    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
        const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
        let rr, gg, bb;
        if (h < 60) [rr, gg, bb] = [c, x, 0]; else if (h < 120) [rr, gg, bb] = [x, c, 0];
        else if (h < 180) [rr, gg, bb] = [0, c, x]; else if (h < 240) [rr, gg, bb] = [0, x, c];
        else if (h < 300) [rr, gg, bb] = [x, 0, c]; else [rr, gg, bb] = [c, 0, x];
        return { r: (rr + m) * 255, g: (gg + m) * 255, b: (bb + m) * 255 };
    }
    const api = {
        _r: r, _g: g, _b: b,
        hex() { return toHex(api._r, api._g, api._b); },
        rgb() { return { r: api._r, g: api._g, b: api._b }; },
        array() { return [api._r, api._g, api._b]; },
        string() { return `rgb(${clamp(api._r)}, ${clamp(api._g)}, ${clamp(api._b)})`; },
        grayscale() { const l = 0.299 * api._r + 0.587 * api._g + 0.114 * api._b; return window.color(`rgb(${l},${l},${l})`); },
        mix(other, weight = 0.5) {
            const o = other && other._r !== undefined ? other : window.color(other);
            const w = weight;
            return window.color(`rgb(${api._r * (1 - w) + o._r * w},${api._g * (1 - w) + o._g * w},${api._b * (1 - w) + o._b * w})`);
        },
        lighten(v = 0.5) { const { h, s, l } = rgbToHsl(api._r, api._g, api._b); const c = hslToRgb(h, s, l + (1 - l) * v); return window.color(`rgb(${c.r},${c.g},${c.b})`); },
        darken(v = 0.5) { const { h, s, l } = rgbToHsl(api._r, api._g, api._b); const c = hslToRgb(h, s, l - l * v); return window.color(`rgb(${c.r},${c.g},${c.b})`); },
        lighten_darken: undefined,
        saturate(v = 0.5) { const { h, s, l } = rgbToHsl(api._r, api._g, api._b); const c = hslToRgb(h, s + (1 - s) * v, l); return window.color(`rgb(${c.r},${c.g},${c.b})`); },
        desaturate(v = 0.5) { const { h, s, l } = rgbToHsl(api._r, api._g, api._b); const c = hslToRgb(h, s - s * v, l); return window.color(`rgb(${c.r},${c.g},${c.b})`); },
        rotate(deg = 0) { const { h, s, l } = rgbToHsl(api._r, api._g, api._b); const c = hslToRgb(h + deg, s, l); return window.color(`rgb(${c.r},${c.g},${c.b})`); },
        negate() { return window.color(`rgb(${255 - api._r},${255 - api._g},${255 - api._b})`); },
        fade(v = 0.5) { return api; },
        opaquer(v = 0.5) { return api; },
        luminosity() { return 0.2126 * api._r / 255 + 0.7152 * api._g / 255 + 0.0722 * api._b / 255; }
    };
    return api;
};
