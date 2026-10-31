// Schema + argv-builder tests for SSH profiles (EPIC-05 / SSH-001, SSH-003).
// The model must reject anything that could turn into shell injection, and
// never carry secret material.
const { test } = require("node:test");
const assert = require("node:assert");

let seq = 0;
global.window = {};
global.nanoid = () => "id-" + (++seq);
require("../assets/misc/ssh-profiles.js");
const S = global.window.SshProfiles;

test("sanitize keeps a fully valid profile", () => {
    const p = S.sanitize({
        alias: "prod-db", hostname: "db.internal", user: "deploy",
        port: 2222, remoteDir: "~/srv", environment: "prod",
        color: "#f85149", uiMode: "productive", reconnect: "auto"
    });
    assert.ok(p);
    assert.equal(p.port, 2222);
    assert.equal(p.environment, "prod");
    assert.equal(p.reconnect, "auto");
});

test("sanitize rejects bad alias/host/user/port/dir", () => {
    assert.equal(S.sanitize({hostname: "h"}), null);                       // no alias
    assert.equal(S.sanitize({alias: "a"}), null);                        // no host
    assert.equal(S.sanitize({alias: "a", hostname: "bad host!"}), null); // space
    assert.equal(S.sanitize({alias: "a", hostname: "h", user: "u;rm -rf"}).user, "");
    assert.equal(S.sanitize({alias: "a", hostname: "h", port: 70000}).port, 22);
    assert.equal(S.sanitize({alias: "a", hostname: "h", remoteDir: "/x; rm -rf"}).remoteDir, "");
    assert.equal(S.sanitize({alias: "a", hostname: "h", remoteDir: "/o'k"}).remoteDir, "");
});

test("env map drops invalid keys and oversized values", () => {
    const p = S.sanitize({alias: "a", hostname: "h", env: {
        "GOOD_VAR": "1", "9BAD": "x", "K;X": "y", "LONG": "z".repeat(500)
    }});
    assert.deepEqual(Object.keys(p.env), ["GOOD_VAR"]);
});

test("buildSshArgs emits argv, never a shell string", () => {
    const p = S.sanitize({alias: "a", hostname: "h.example", user: "u",
        port: 2222, remoteDir: "~/srv"});
    const args = S.buildSshArgs(p);
    assert.deepEqual(args.slice(0, 4), ["-p", "2222", "-l", "u"]);
    assert.equal(args[args.length - 2], "h.example");
    assert.match(args[args.length - 1], /^cd '~\/srv' && exec /);
    // a sanitized profile without remoteDir ends with the bare host
    const p2 = S.sanitize({alias: "a", hostname: "h", port: 22});
    assert.deepEqual(S.buildSshArgs(p2), ["-p", "22", "h"]);
});

test("parseStore drops invalid entries, caps count, keeps order", () => {
    const store = S.parseStore({version: 1, profiles: [
        {alias: "one", hostname: "h1"},
        {hostname: "no-alias"},
        {alias: "two", hostname: "h2", environment: "prod"}
    ]});
    assert.equal(store.profiles.length, 2);
    assert.equal(store.profiles[1].environment, "prod");
});

test("no secret field survives sanitization", () => {
    const p = S.sanitize({alias: "a", hostname: "h", password: "x",
        privateKey: "-----BEGIN", passphrase: "y"});
    ["password", "privateKey", "passphrase"].forEach(k =>
        assert.equal(p[k], undefined));
});

test("tmuxSession: valid name produces attach-or-create remote command", () => {
    const p = S.sanitize({alias: "a", hostname: "h", remoteDir: "~/app", tmuxSession: "work"});
    assert.equal(p.tmuxSession, "work");
    const args = S.buildSshArgs(p);
    assert.match(args[args.length - 1], /cd '~\/app' && exec tmux new -A -s 'work'/);
});

test("tmuxSession: invalid names are dropped by sanitize", () => {
    ["bad name", "a;rm -rf /", "$(x)", "a'b", "x".repeat(41), ""].forEach(name => {
        const p = S.sanitize({alias: "a", hostname: "h", tmuxSession: name});
        assert.equal(p.tmuxSession, "", `should drop: ${name}`);
    });
});

test("tmuxSession without remoteDir still uses -t remote command", () => {
    const p = S.sanitize({alias: "a", hostname: "h", tmuxSession: "s1"});
    const args = S.buildSshArgs(p);
    assert.deepEqual(args.slice(-3), ["-t", "h", "exec tmux new -A -s 's1'"]);
});
