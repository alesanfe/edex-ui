// Unit tests for the file-icon matcher, which the filesystem module uses to
// decide both icons and media-viewer routing (e.g. "sqlite" -> DB viewer).
const { test } = require("node:test");
const assert = require("node:assert");
const matchIcon = require("../assets/misc/file-icons-match.js");

test("sqlite databases map to the sqlite icon/viewer type", () => {
    for (const name of ["data.db", "x.sqlite", "x.sqlite3", "x.db3", "BIG.DB"]) {
        assert.strictEqual(matchIcon(name), "sqlite", name);
    }
});

test("common source files keep their icons", () => {
    assert.strictEqual(matchIcon("app.js"), "js");
    assert.strictEqual(matchIcon("styles.css"), "css3");
});

test("dotfiles and directories do not crash the matcher", () => {
    assert.strictEqual(matchIcon(".git"), "git");
    assert.doesNotThrow(() => matchIcon("folder"));
    assert.doesNotThrow(() => matchIcon(""));
});
