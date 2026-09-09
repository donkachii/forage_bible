import fs from "node:fs";
const md = fs.readFileSync(".design-sync/conventions.md", "utf8");
const css = fs.readFileSync("ds-bundle/_ds_bundle.css", "utf8");
const bundle = fs.readFileSync("ds-bundle/_ds_bundle.js", "utf8");
const comps = fs.readdirSync("ds-bundle/components/general");

const haveClass = new Set();
for (const m of css.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) haveClass.add(m[1].replace(/\\(.)/g, "$1"));
const haveTok = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// Classes deliberately named as NOT existing, in the closed-set warning.
const ABSENT_ON_PURPOSE = new Set(["p-10", "gap-6", "max-w-2xl", "size-8"]);
const bad = [];

// 1. Tokens: full names only (--foo), plus `-suffix` shorthands in the token list.
for (const m of md.matchAll(/`(--[\w-]+)`/g)) if (!haveTok.has(m[1])) bad.push(`TOKEN ${m[1]}`);
for (const m of md.matchAll(/`(-(?!-)[a-z][a-z-]*)`/g))
  if (!haveTok.has("--color" + m[1]) && !haveTok.has("--" + m[1].slice(1))) bad.push(`TOKEN(short) ${m[1]}`);

// 2. Classes: only from the vocabulary table rows and from real className="" usage.
const classes = new Set();
for (const row of md.split("\n").filter((l) => l.startsWith("| ") && l.includes("`")))
  for (const m of row.matchAll(/`([^`]+)`/g)) classes.add(m[1].replace(/\s*\(.*\)$/, ""));
for (const m of md.matchAll(/className="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) classes.add(c);
for (const c of classes) if (!haveClass.has(c) && !ABSENT_ON_PURPOSE.has(c)) bad.push(`CLASS ${c}`);

// 3. The absent-on-purpose set really must be absent, or the warning is a lie.
for (const c of ABSENT_ON_PURPOSE) if (haveClass.has(c)) bad.push(`CLAIMED-ABSENT BUT PRESENT: ${c}`);

// 4. Components: bolded names and JSX tags, minus the <Name> path placeholder.
const named = new Set();
for (const m of md.matchAll(/\*\*`([A-Z][A-Za-z]+)`\*\*/g)) named.add(m[1]);
for (const m of md.matchAll(/<([A-Z][A-Za-z]+)[\s/>]/g)) named.add(m[1]);
named.delete("Name");
for (const n of named) if (!comps.includes(n) && !new RegExp(`\\b${n}\\b`).test(bundle)) bad.push(`COMPONENT ${n}`);
if (!/BODY_TYPE/.test(bundle)) bad.push("EXPORT BODY_TYPE");

// 5. The class-rule count the doc claims must match reality.
const claimed = md.match(/only the (\d+) class rules/);
if (claimed && Number(claimed[1]) !== haveClass.size) bad.push(`COUNT claims ${claimed[1]}, actual ${haveClass.size}`);

console.log(`class rules: ${haveClass.size} · tokens: ${haveTok.size} · components: ${comps.join(", ")}`);
console.log(`checked: ${classes.size} classes, ${named.size} components`);
if (bad.length) { console.log("\nUNVERIFIED:"); for (const b of [...new Set(bad)]) console.log("  " + b); process.exit(1); }
console.log("\n✓ every class, token, component, export, and count in conventions.md verifies");
