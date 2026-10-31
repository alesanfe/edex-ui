const { test } = require("node:test");
const assert = require("node:assert");

// plugins.js touches window.* at module scope only inside functions guarded
// by `typeof module` - provide the globals it reads at load time.
global.window = {};
require("../assets/misc/plugins.js");
const Plugins = global.window.Plugins;

test("validateManifest accepts a well-formed manifest", () => {
    const m = Plugins.validateManifest({
        name: "battery-watch",
        version: "1.2.3",
        description: "battery info",
        widget: {
            title: "BATTERY",
            metric: "battery",
            interval: 5000,
            fields: [
                { label: "LEVEL", path: "percent", suffix: "%" },
                { label: "CHARGE", path: "isCharging" }
            ]
        }
    }, "battery-watch");
    assert.strictEqual(typeof m, "object");
    assert.strictEqual(m.name, "battery-watch");
    assert.strictEqual(m.widget.metric, "battery");
    assert.strictEqual(m.widget.fields.length, 2);
});

test("validateManifest rejects non-whitelisted metrics", () => {
    const bad = Plugins.validateManifest({
        name: "evil",
        widget: { metric: "processes", fields: [{ path: "a" }] }
    }, "evil");
    assert.strictEqual(bad, 'metric "processes" not allowed');
});

test("validateManifest rejects manifests without valid fields", () => {
    assert.strictEqual(
        Plugins.validateManifest({ name: "x", widget: { metric: "mem", fields: [] } }, "x"),
        "no fields");
    const r = Plugins.validateManifest({
        name: "x",
        widget: { metric: "mem", fields: [{ path: "../escape" }, { path: "a b" }, { path: "a;b" }] }
    }, "x");
    assert.strictEqual(r, "no valid fields");
});

test("proto-lookalike paths are syntactically allowed but resolve to undefined", () => {
    // Defense in depth: PATH_RE is a charset check; getPath blocks
    // __proto__/constructor/prototype traversal at resolution time.
    const m = Plugins.validateManifest({
        name: "x",
        widget: { metric: "mem", fields: [{ path: "__proto__.x" }] }
    }, "x");
    assert.strictEqual(typeof m, "object");
    assert.strictEqual(Plugins.getPath({ a: 1 }, "__proto__.x"), undefined);
});

test("validateManifest clamps interval and caps fields", () => {
    const m = Plugins.validateManifest({
        name: "x",
        widget: {
            metric: "mem",
            interval: 1,
            fields: Array.from({ length: 15 }, (_, i) => ({ path: "f" + i }))
        }
    }, "x");
    assert.strictEqual(m.widget.interval, 2000);
    assert.strictEqual(m.widget.fields.length, 10);
});

test("validateManifest rejects bad names and versions", () => {
    assert.strictEqual(
        Plugins.validateManifest({ name: "Bad Name!", widget: {} }, null),
        "invalid name");
    assert.strictEqual(
        Plugins.validateManifest({
            name: "ok", version: "latest",
            widget: { metric: "mem", fields: [{ path: "a" }] }
        }, "ok"),
        "invalid version");
});

test("getPath resolves nested paths and blocks prototype pollution", () => {
    const obj = { a: { b: { c: 42 } }, arr: [1, 2] };
    assert.strictEqual(Plugins.getPath(obj, "a.b.c"), 42);
    assert.strictEqual(Plugins.getPath(obj, "a.b.d"), undefined);
    assert.strictEqual(Plugins.getPath(obj, "__proto__.polluted"), undefined);
    assert.strictEqual(Plugins.getPath(obj, "constructor.name"), undefined);
    assert.strictEqual(Plugins.getPath(obj, "a.__proto__.x"), undefined);
});
