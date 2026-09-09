import fs from "node:fs";
const css = fs.readFileSync(".design-sync/.cache/ds-styles.css", "utf8");
const have = new Set();
// class selectors: .foo, .foo\:bar, .h-\[420px\] — unescape CSS escapes
for (const m of css.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) {
  have.add(m[1].replace(/\\(.)/g, "$1"));
}
const used = new Map();
for (const f of fs.readdirSync(".design-sync/previews")) {
  const s = fs.readFileSync(".design-sync/previews/" + f, "utf8");
  for (const m of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    for (const c of (m[1] ?? m[2]).split(/\s+/)) {
      if (!c || c.includes("$") || c.includes("{")) continue;
      if (!used.has(c)) used.set(c, new Set());
      used.get(c).add(f);
    }
  }
  // bare class strings in arrays, e.g. ["text-ink", "ink"]
  for (const m of s.matchAll(/"((?:[a-z0-9-]+:)?[a-z][a-z0-9/\[\].-]*)"/g)) {
    const c = m[1];
    if (/^(left|right)$/.test(c)) continue;
    if (!/-|\//.test(c)) continue;
    if (!used.has(c)) used.set(c, new Set());
    used.get(c).add(f);
  }
}
const missing = [...used.keys()].filter((c) => !have.has(c)).sort();
console.log(`available class rules: ${have.size}`);
console.log(`classes used in previews: ${used.size}`);
console.log(`MISSING (${missing.length}):`);
for (const c of missing) console.log(`  ${c}  ← ${[...used.get(c)].join(", ")}`);
