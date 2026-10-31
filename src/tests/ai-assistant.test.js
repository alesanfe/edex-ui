const { test } = require("node:test");
const assert = require("node:assert");

global.window = {};
require("../assets/misc/ai-assistant.js");
const Ai = global.window.Ai;

test("redactSecrets strips AWS access keys", () => {
    const out = Ai.redactSecrets("key AKIAIOSFODNN7EXAMPLE here");
    assert.ok(!out.includes("AKIAIOSFODNN7EXAMPLE"));
    assert.ok(out.includes("[REDACTED]"));
});

test("redactSecrets strips password/token assignments", () => {
    assert.ok(!Ai.redactSecrets('password: "hunter2"').includes("hunter2"));
    assert.ok(!Ai.redactSecrets("api_key=abcdef123").includes("abcdef123"));
    assert.ok(!Ai.redactSecrets("Authorization: Bearer abc.def.ghi").includes("abc.def.ghi"));
});

test("redactSecrets strips JWTs and PEM blocks", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dGVzdHNpZ24";
    assert.ok(!Ai.redactSecrets("token " + jwt).includes(jwt));
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIE...xyz\n-----END RSA PRIVATE KEY-----";
    assert.ok(!Ai.redactSecrets(pem).includes("MIIE"));
});

test("redactSecrets strips GitHub and Slack tokens", () => {
    assert.ok(!Ai.redactSecrets("ghp_abcdefghijklmnopqrstuvwxyz123456").includes("ghp_"));
    assert.ok(!Ai.redactSecrets("xoxb-1234-5678-abcd").includes("xoxb-1234"));
});

test("redactSecrets keeps ordinary text intact", () => {
    const text = "ls -la /home/user && git status";
    assert.strictEqual(Ai.redactSecrets(text), text);
});
