// Environment globals expected by UMD bundles loaded via <script>.
// The ligatures addon browser path looks up window["font-finder"] and
// window.util; both packages are node-only, so provide empty stubs - the
// addon factory tolerates their absence and LigaturesAddon stays guarded
// behind typeof checks in terminal.class.js.
if (typeof window["font-finder"] === "undefined") window["font-finder"] = {};
if (typeof window.util === "undefined") window.util = {};
// Some UMD bundles reference node's "global" object directly
if (typeof window.global === "undefined") window.global = window;
