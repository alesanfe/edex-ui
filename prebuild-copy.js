// Portable src -> prebuild-src copy (replaces rsync/xcopy so the same
// script works on linux, darwin and Windows runners - rsync is gone from
// recent macOS images).
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "src");
const DST = path.join(__dirname, "prebuild-src");

fs.rmSync(DST, {recursive: true, force: true});
fs.cpSync(SRC, DST, {
    recursive: true,
    filter: src => !src.split(/[\\/]/).includes("node_modules")
});
console.log(`Copied ${SRC} -> ${DST}`);
