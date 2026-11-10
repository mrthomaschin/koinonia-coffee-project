#!/usr/bin/env node
/* eslint-disable */
// Predeploy guard: fails if package-lock.json references a package it has no entry for.
// Cloud Build runs `npm ci` on Linux and rejects such a lockfile ("Missing: ... from lock file").
// npm 11.5.x on macOS drops optional platform packages (e.g. @parcel/watcher-*) when it rewrites the lock.
const path = require("path");

const lockPath = path.join(__dirname, "..", "package-lock.json");
const packages = require(lockPath).packages || {};
const known = new Set(Object.keys(packages));

// Resolve a dependency the way Node does: nearest node_modules, walking up toward the root.
function isResolvable(fromKey, dep) {
  let base = fromKey;
  for (;;) {
    if (known.has((base ? base + "/" : "") + "node_modules/" + dep)) return true;
    if (base === "") return false;
    const i = base.lastIndexOf("/node_modules/");
    base = i < 0 ? "" : base.slice(0, i);
  }
}

const missing = [];
for (const [key, meta] of Object.entries(packages)) {
  const deps = { ...meta.dependencies, ...meta.optionalDependencies };
  for (const dep of Object.keys(deps)) {
    if (!isResolvable(key, dep)) missing.push(dep);
  }
}

if (missing.length > 0) {
  const unique = [...new Set(missing)];
  console.error(`\n✖ package-lock.json is missing ${unique.length} package(s); Cloud Build's npm ci will fail:`);
  for (const dep of unique.slice(0, 10)) console.error(`    ${dep}`);
  if (unique.length > 10) console.error(`    ...and ${unique.length - 10} more`);
  console.error("\n  Fix: cd functions && npx npm@latest install\n");
  process.exit(1);
}
console.log("✔ package-lock.json is complete");
