// Schema tests for the workspaces model (EPIC-04 / WS-001, WS-004).
// Corrupt entries must be dropped without breaking the store; imports are
// strict-validated with a summary before apply and never execute anything.
const { test } = require("node:test");
const assert = require("node:assert");

let seq = 0;
global.window = {};
global.nanoid = () => "id-" + (++seq);
require("../assets/misc/workspaces.js");
const W = global.window.Workspaces;

test("parseStore drops invalid entries and keeps valid ones", () => {
    const store = W.parseStore({
        version: 1,
        workspaces: [
            {id: "a", name: "proj", tabs: [{slot: 1, cwd: "C:\\repo"}], uiMode: "light"},
            {name: ""},                                   // no name -> drop
            {name: "x".repeat(500)},                      // name too long -> drop
            {id: "b", name: "ok2", tabs: [{slot: 99, cwd: "/"}]} // bad slot dropped, ws kept
        ]
    });
    assert.equal(store.workspaces.length, 2);
    assert.equal(store.workspaces[0].name, "proj");
    assert.equal(store.workspaces[0].tabs[0].slot, 1);
    assert.equal(store.workspaces[1].tabs.length, 0);
});

test("parseStore survives garbage input", () => {
    assert.equal(W.parseStore(null).workspaces.length, 0);
    assert.equal(W.parseStore({}).workspaces.length, 0);
    assert.equal(W.parseStore({workspaces: "nope"}).workspaces.length, 0);
    assert.equal(W.parseStore({workspaces: [null, 42, "x"]}).workspaces.length, 0);
});

test("unknown uiMode is sanitized to null, valid ones kept", () => {
    const store = W.parseStore({version: 1, workspaces: [
        {name: "a", uiMode: "productive", tabs: []},
        {name: "b", uiMode: "evil-mode", tabs: []}
    ]});
    assert.equal(store.workspaces[0].uiMode, "productive");
    assert.equal(store.workspaces[1].uiMode, null);
});

test("validateImport enforces version, size and shape", () => {
    assert.equal(W.validateImport("", 1000).ok, false);
    assert.equal(W.validateImport("{not json", 1000).ok, false);
    assert.equal(W.validateImport(JSON.stringify({version: 99, workspaces: []}), 1000).ok, false);
    const big = JSON.stringify({version: 1, workspaces: []});
    assert.equal(W.validateImport(big, 10).ok, false);
    const ok = W.validateImport(JSON.stringify({version: 1, workspaces: [
        {name: "p", tabs: [{slot: 2, cwd: "/repo"}]}
    ]}), 1000);
    assert.equal(ok.ok, true);
    assert.match(ok.summary, /1 valid/);
    assert.equal(ok.store.workspaces[0].tabs[0].slot, 2);
});

test("imported entries get ids when missing and no secret fields survive", () => {
    const ok = W.validateImport(JSON.stringify({version: 1, workspaces: [
        {name: "p", tabs: [{slot: 1, cwd: "/r", secret: "hunter2", cmd: "rm -rf /"}],
         password: "x", token: "y"}
    ]}), 1000);
    const w = ok.store.workspaces[0];
    assert.ok(w.id);
    assert.deepEqual(Object.keys(w).sort(),
        ["createdAt", "id", "name", "tabs", "uiMode"].sort());
    assert.deepEqual(Object.keys(w.tabs[0]).sort(), ["cwd", "slot"].sort());
});
