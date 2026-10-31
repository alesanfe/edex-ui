// ESM loader: @xterm/addon-ligatures ships only as a module bundle and uses
// CSS font-feature-settings ("calt") instead of the node-only font-finder
// package, so it works inside the sandboxed renderer.
import { LigaturesAddon } from "../../node_modules/@xterm/addon-ligatures/lib/addon-ligatures.mjs";
window.LigaturesAddon = LigaturesAddon;
