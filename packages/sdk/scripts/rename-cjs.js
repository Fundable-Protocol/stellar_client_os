#!/usr/bin/env node
// Renames dist/cjs/**/*.js -> .cjs and dist/cjs/**/*.d.ts -> .d.cts
// and rewrites internal require() paths accordingly.
import { readdirSync, renameSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, relative } from "path";

const cjsDir = new URL("../dist/cjs", import.meta.url).pathname;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (entry.endsWith(".js")) {
      // Rewrite internal require paths: './foo.js' -> './foo.cjs'
      let src = readFileSync(full, "utf8");
      src = src.replace(/require\(["'](\.[^"']+)\.js["']\)/g, "require('$1.cjs')");
      writeFileSync(full, src);
      renameSync(full, full.slice(0, -3) + ".cjs");
    } else if (entry.endsWith(".d.ts")) {
      renameSync(full, full.slice(0, -5) + ".d.cts");
    }
  }
}

walk(cjsDir);
console.log("CJS files renamed to .cjs / .d.cts");
