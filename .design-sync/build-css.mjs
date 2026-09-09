/**
 * Builds the design-sync stylesheet from the app's own sources.
 *
 * Two things the app gets for free at runtime that a static bundle does not:
 *   1. next/font sets --font-bodoni / --font-garamond. Nothing sets them here,
 *      so the families are pulled from Google Fonts and the vars defined.
 *   2. Tailwind v4 tree-shakes @theme vars it sees no utility for, which drops
 *      real tokens (--color-gilt-bright, --color-vellum-shade, …). The @theme
 *      block is therefore emitted verbatim ahead of the compiled output, so
 *      every token in docs/SPEC.md §9 exists in the bundle. It sits outside
 *      any @layer, so it wins over Tailwind's layered subset (same values).
 *
 * Output (gitignored — regenerate with: node .design-sync/build-css.mjs):
 *   .design-sync/.cache/ds-styles.css   → ships as the bundle's _ds_bundle.css
 */
import postcss from "postcss";
import tw from "@tailwindcss/postcss";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cacheDir = path.join(root, ".design-sync/.cache");
fs.mkdirSync(cacheDir, { recursive: true });

const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8");

const theme = globals.match(/@theme\s*\{([\s\S]*?)\n\}/);
if (!theme) throw new Error("no @theme block in app/globals.css");
const decls = [...theme[1].matchAll(/^\s*(--[\w-]+)\s*:\s*([^;]+);/gm)];
if (!decls.length) throw new Error("@theme block parsed to zero tokens");

const compiled = await postcss([tw({ base: root, optimize: true })]).process(globals, {
  from: path.join(root, "app/globals.css"),
  to: path.join(cacheDir, "ds-styles.css"),
});

const FONTS =
  "https://fonts.googleapis.com/css2?" +
  "family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..700&" +
  "family=EB+Garamond:ital,wght@0,400..600;1,400..600&display=swap";

fs.writeFileSync(
  path.join(cacheDir, "ds-styles.css"),
  `@import url("${FONTS}");\n\n` +
    `/* Foredge design tokens — generated from the @theme block in\n` +
    `   app/globals.css, which is the source of truth. See docs/SPEC.md §9.\n` +
    `   --font-bodoni/--font-garamond come from next/font in the app; the\n` +
    `   bundle has no next/font, so they are bound to the webfonts above. */\n` +
    `:root {\n  --font-bodoni: "Bodoni Moda";\n  --font-garamond: "EB Garamond";\n` +
    decls.map(([, k, v]) => `  ${k}: ${v.trim()};`).join("\n") +
    `\n}\n\n` +
    compiled.css
);
console.log(`tokens: ${decls.length + 2}, styles: ${compiled.css.length} bytes`);
