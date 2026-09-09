# design-sync notes — Foredge

## This repo is an app, not a design system

There is no `dist/`, no library build, and `package.json` is `private` with only
`next dev/build/start/lint`. The sync is therefore built on two hand-written
inputs, both committed:

- **`.design-sync/ds-entry.ts`** — the entry passed as `--entry`. It names the
  five reusable exports and deliberately omits `BibleTable` (takes no props; it
  *is* the screen) and `BookScene` (a WebGL canvas — cannot render in a static
  card, and would pull three.js into the bundle). `PKG_DIR` resolves to the repo
  root because the walk up from `.design-sync/` finds the named `package.json`,
  so every config path is repo-relative.
- **`.design-sync/build-css.mjs`** — **run this before the converter, every
  time.** The converter cannot compile Tailwind v4; `cfg.cssEntry` points at the
  gitignored output of this script.

## Build order

```sh
node .design-sync/build-css.mjs                      # REQUIRED first
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./.design-sync/ds-entry.ts --out ./ds-bundle
DS_CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  node .ds-sync/package-validate.mjs ./ds-bundle
```

## Gotchas that cost time

- **Playwright**: installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and pointed
  at the system Google Chrome via `DS_CHROMIUM_PATH`. No 200MB chromium was
  downloaded. Every validate/capture/driver run needs that env var, or it fails
  `[RENDER_SKIPPED]`.
- **`cfg.tokensGlob` is inert without `cfg.tokensPkg`** — `copyTokens()` returns
  early, and it only ever globs inside `node_modules/<tokensPkg>`. That is why
  there is no `tokens/` dir: `build-css.mjs` folds the full token block into the
  stylesheet instead, which is what actually reaches designs (the `styles.css`
  `@import` closure).
- **Tailwind v4 tree-shakes `@theme` vars** it sees no utility for, silently
  dropping real tokens (`--color-gilt-bright`, `-gilt-deep`, `-vellum-shade`,
  `-haze-lift`). `build-css.mjs` re-emits the whole `@theme` block verbatim
  ahead of the compiled output, outside any `@layer`, so it wins.
- **The shipped CSS is a closed set (248 rules).** Only classes the app itself
  uses are compiled. Previews that invent classes (`max-w-[34em]`, `h-[420px]`,
  `size-10`) render silently wrong — text clipped, elements unsized. This cost a
  full authoring pass. Previews now take geometry from inline `style` and use
  classes only for the design language. **`node .design-sync/check-preview-classes.mjs`**
  lists any preview class missing from the compiled CSS; `flex-end` and
  `ink-faint` are known false positives (string literals, not classes).
- **`.d.ts` props cannot be extracted** — there are no shipped types, so every
  component came out as `[key: string]: unknown`. All five contracts are
  hand-written in `cfg.dtsPropsFor` and are the design agent's only API truth.
- **next/font** supplies `--font-bodoni` / `--font-garamond` in the app. The
  bundle has no next/font, so `build-css.mjs` binds them to Google-hosted Bodoni
  Moda and EB Garamond. `[FONT_REMOTE]` is the expected, correct consequence.

## Known render warns (expected — not new)

- `[FONT_REMOTE]` for "EB Garamond", "Garamond", "Bodoni Moda", "Didot" — the
  webfont `@import` in `build-css.mjs`. Informational.

## Card modes

`Contents` is a `fixed inset-0` overlay → `{"cardMode":"single","viewport":"1200x900"}`.
`Chevron`'s colour row overflowed a grid cell → `{"cardMode":"column"}`.
`Contents`'s preview opens on Genesis (index 0) on purpose: it calls
`scrollIntoView({block:"center"})` on the current book, so a book further down
the canon scrolls the heading out of the card.

## Re-sync risks — what can go stale

- **`build-css.mjs` is not run by the converter.** If `app/globals.css` changes
  and you skip it, the sync ships the previous stylesheet with no warning.
- **A new component in `components/` will not appear** until it is added in
  three places: `ds-entry.ts`, `cfg.componentSrcMap`, and `cfg.dtsPropsFor`.
- **`cfg.dtsPropsFor` is hand-maintained** and drifts silently when a prop
  changes in source. Diff it against the component sources on every re-sync —
  nothing checks this automatically.
- **`conventions.md` hardcodes the class-rule count (248)** and an enumerated
  class table. Run **`node .design-sync/check-conventions.mjs`** after any
  rebuild; it fails if a named class, token, component, or the count no longer
  matches the built artifacts, and also asserts the classes it calls absent
  really are absent.
- **Verified against Chrome, not the pinned chromium** — the render fidelity is
  effectively the same engine, but it is not the toolchain the skill assumes.
- **Guidelines ship `docs/PRD.md`, `RULES.md`, `SPEC.md` verbatim.** Most of
  RULES/SPEC is WebGL and pagination internals, not design guidance; only
  SPEC §9 is really about tokens. Narrow `cfg.guidelinesGlob` if that noise
  starts hurting the design agent.
