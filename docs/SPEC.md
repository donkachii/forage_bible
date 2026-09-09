# Foredge — Technical Specification

How the thing is built. `RULES.md` is what not to break; `PRD.md` is why any of
it exists.

Stack: Next.js 16 (App Router) · React 19 · three.js · Tailwind v4 · TypeScript
strict. No test framework.

---

## 1. Module map

| File | Responsibility |
|---|---|
| `app/layout.tsx` | Fonts (Bodoni Moda display, EB Garamond text), metadata |
| `app/page.tsx` | Renders `BibleTable`, nothing else |
| `app/api/passage/route.ts` | The one route: `GET /api/passage?book&chapter` |
| `lib/canon.ts` | The sixty-six books, divisions, chapter counts, canon arithmetic |
| `lib/passage.ts` | Upstream fetch, error types, the bundled Genesis 1 |
| `components/BibleTable.tsx` | State machine, layout, chrome, gestures |
| `components/BookScene.tsx` | The book as a lit WebGL object |
| `components/Contents.tsx` | The book list, both testaments |
| `components/Page.tsx` | One leaf: running head, verse flow, folio |
| `components/usePagination.ts` | The measuring pass |
| `components/useReducedMotion.ts` | `prefers-reduced-motion`, for the JS timelines |
| `components/coverArt.ts` | Cover and gilding painted to canvas at runtime |
| `components/pageArt.ts` | A page painted to canvas, for the leaf in motion |
| `app/globals.css` | Design tokens, material utilities, the room |

`BibleTable` owns all state. `BookScene` owns no application state — it is
driven through an imperative handle.

## 2. State machine

```
type Phase = "shelf" | "pulling" | "opening" | "reading" | "closing"
```

```
        click / Enter          FULL_OPEN_MS (1150ms)
 shelf ──────────────────> opening ───────────────────> reading
   │                                                       │
   │  pointer drag (>6px)                          Esc / Close
   │                                                       │
   └──> pulling ──release──> reading | shelf          closing
              (no timer; the promise decides)              │
                                                  FULL_CLOSE_MS (800ms)
                                                           ↓
                                                         shelf
```

- `closing` is re-enterable: a drag on a closing book catches it and pulls it
  back open.
- `pulling` is deliberately **not** "open" — the scene's target stays shut so no
  effect stomps on the hand — but the room reacts to it as though it were
  (`lifting = open || phase === "pulling"`).
- Under reduced motion `OPEN_MS` and `CLOSE_MS` are 0, and `pulling` is
  unreachable.

**Timers.** `after(ms, fn)` clears every pending timer before setting one.
Whichever transition started last owns the timeline. All timers are cleared on
unmount.

**Focus.** `opening|pulling → reading` moves focus to Close; `closing → shelf`
moves it back to the cover button. Both use `setTimeout(0)` plus an 80ms retry
if focus landed on `document.body`. Never `requestAnimationFrame` (Rule 8).

## 3. Layout

```
single    = window.innerWidth < 900
perSpread = single ? 1 : 2
PAGE_RATIO = 1.38

pw = min(single ? vw * 0.84 : (vw * 0.88) / 2, 440)
ph = pw * PAGE_RATIO
maxH = vh * (single ? 0.66 : 0.74)
if (ph > maxH) { ph = maxH; pw = ph / PAGE_RATIO }
```

Both are rounded to whole pixels and published to CSS as `--pw` / `--ph`. The
camera distance in `BookScene` derives from `ph`, which is what makes the
WebGL book and the DOM spread the same size at hand-over.

`SHUT_FRAMING = 0.62` — how much smaller the scene frames the shut book than
the open spread. The cover drag divides by it so the board keeps up with the
edge the hand thinks it is holding.

**One page to a spread** centres the right-hand slot and pushes the left one
off-frame. The page being read is the right slot in either layout. This is a
deliberate departure from paper, where a leaf carries two pages and the one you
read alternates sides of the spine.

## 4. Text

### Route

`GET /api/passage?book=<name>&chapter=<n>`

| Case | Status | Body |
|---|---|---|
| OK | 200 | `Passage`, `Cache-Control: public, max-age=31536000, immutable` |
| No `book` | 400 | `{ error }` |
| Non-finite or `< 1` chapter | 400 | `{ error }` |
| `UnknownBookError` | 404 | `{ error }` |
| Upstream failure | 502 | `{ error }`, logged server-side |

```ts
type Verse   = { verse: number; text: string }
type Passage = { book: string; chapter: number; verses: Verse[]; translation: string }
```

### Upstream

`https://bible-api.com/<slug>+<ref>?translation=web`, with
`next: { revalidate: false }`.

`ref` is the chapter number — **except** for the five one-chapter books, where
it is `1:1-<verses>`, because a bare number after them reads as a verse
(Rule 15). Chapter is clamped to `[1, book.chapters]` before the request.

### Client caching

`BibleTable` holds a `Map<"book|chapter", Passage>`. `pull()` returns the held
copy or fetches. `load()` sets `loading`, and **only commits `passage` on
success** — a failure leaves the previous chapter on screen and raises a
recoverable error with a retry.

`OPENING` (Genesis 1, ten verses) is the initial state, so the shelf always has
something to open with no network.

### Canon arithmetic

- `CHAPTERS_BEFORE[i]` — chapters lying before book `i`
- `TOTAL_CHAPTERS` — 1189
- `wayThrough(index, chapter)` → 0 at Genesis 1, 1 at the end of Revelation.
  This is the only thing that tells the scene how much paper belongs on the
  left hand and how much on the right.

## 5. Pagination

Measured, never estimated.

1. A `ResizeObserver` on the **live** page body reports the real column
   `{ w, h }`. It is read off a rendered page, not derived from the page size.
2. Three off-screen twins are laid out at `column.w` — the chapter being read
   and the two it can turn into. All three are `aria-hidden`, `invisible`, and
   parked at `-9999px`.
3. `usePagination` waits for `document.fonts.ready`, then one
   `requestAnimationFrame`, then walks `[data-verse]` marks and reads back where
   each verse's first line lands. Verses are inline, so `offsetTop` is the top
   of the line the verse starts on — enough to find a break without measuring
   every line box.
4. A break falls when a verse's bottom exceeds the page height. **Breaks land on
   verse boundaries**, so a page can end up to one verse short, but text is
   never clipped.
5. `toSpreads` groups pages by `perSpread`.

Neighbouring chapters are only usable once actually measured — the
un-paginated fallback would hand back one impossibly long spread, so
`spreadsBefore` / `spreadsAfter` are `null` until `pages.length` is non-zero.

**Folios** run per chapter and depend on the layout:

```ts
folioOf(leaf, recto, perSpread) = perSpread === 2 ? leaf * 2 + (recto ? 2 : 1) : leaf + 1
```

## 6. Turning

### Planning

`planTurn(step)` returns `{ art, forward, commit }` or `null`. One place, both
drivers (Rule 10).

A `Side` is `{ psg, pages, leaf }`. A turn within a chapter has the same
passage at both ends; one across a boundary does not — which is the only reason
`Side` has to be spelled out.

`TurnArt` is four painted faces:

```ts
{ front, back, under: { left, right } }
```

- **Two pages to a spread:** the leaf is the recto you were reading, backed by
  the verso you are turning to. `under` is the verso you are leaving and the
  recto arriving.
- **One page to a spread:** each page is its own leaf.
- Backward mirrors forward.

Across a boundary, `commit` calls `goTo(index, chapter, atEnd)`. Turning back
sets `leaf = Number.MAX_SAFE_INTEGER` and lets the clamp resolve it to the last
spread once the new chapter is measured (Rule 6).

`planTurn` returns `null` under reduced motion, with no scene, or when the
neighbour has not arrived — and `turn()` falls back to `jump()`, a plain cut.

### Driving

**Timed** — `turn(step)` sets `turning`, awaits `scene.turn(art, forward)`,
then commits. `turnFor = 620ms`.

**Dragged** — grab strips are 28% of the page width on each outer edge. You
grab a page by its outer edge because that is where you would take hold of one,
and because it leaves the text underneath selectable. On a phone they stay
strips rather than becoming a full-width swipe, which would take long-press
selection with it. `touchAction: none`.

```
progressAt(x, spine, width, forward):
  across = clamp((x - spine) / width, -1, 1)
  raw    = acos(across) / π        // edge right → 0, spine → ½, left → 1
  return forward ? raw : 1 - raw
```

`reach` is `pw` on a spread and `pw / 2` on a single page: with one page on
screen the spine sits at its left edge, so a sweep measured over a whole page
width would need the finger to travel a page *past* the spine, off the side of
the phone.

Release velocity is computed over the last ~90ms of an 8-sample trail and
handed to the scene as **progress per second** (Rule 11). Settle duration is
`max(130, 430 * |Δ|)`. `scene.release` resolves `true` if the turn completed —
the leaf is folded into the spread — and `false` if it fell back.

### Cover drag

Same half-circle mapping, but **anchored to where the hand landed** rather than
read absolutely. Shut, the book is framed small and turned −27°, so its free
edge sits well right of centre; read absolutely, merely touching it would snap
the cover 40% open before the hand had moved.

```
advanced = max(0, (raw - p0) / (1 - p0)) / SHUT_FRAMING
openness = min(1, o0 + (1 - o0) * advanced)
```

A pointer-down does **not** grab the scene. It promotes to a real pull only
once the hand has moved 6px — so a click with a shaky finger is still a click,
and a tap leaves the click handler something to open. `openBook` swallows a
click arriving in `pulling`, because a pull ends in a click as well as a
pointerup and its release decides the landing a frame or more later.

## 7. `SceneControls`

The full imperative surface `BibleTable` holds on `BookScene`:

```ts
turn(art, forward): Promise<void>       // one leaf on a clock; resolves on landing
setSpread(left, right): void            // lay a spread down without staging a turn
grabCover(): number                     // take the board; returns 0 shut … 1 open
dragCover(openness): void
releaseCover(openness, velocity): Promise<boolean>   // true if it settled open
grab(art, forward): void
drag(progress): void                    // 0 lying still … 1 fully over
release(progress, velocity): Promise<boolean>        // true if the turn completed
```

Props: `open`, `active` (false once the reader has taken over, so the loop
stands down), `book`, `pageHeightPx`, `through`, `single`, `reduced`,
`controlsRef`.

`setSpread` is what puts a spread under the cover before it lands. Without it
the reveal is the bare page block and the text arrives afterwards, on the
cross-fade.

## 8. Scene geometry

All in scene units; the page is 1 wide.

| Constant | Value | What it is |
|---|---|---|
| `PAGE_W` / `PAGE_H` | 1 / 1.38 | Matches `PAGE_RATIO` |
| `THICK` | 0.13 | The page block |
| `SQUARE` | 0.014 | Board overhang on the three outer edges |
| `BOARD` | 0.018 | Board thickness |
| `SHADOW_MAP` | 2048 | Plain PCF has no softening radius, so the map carries edge quality |
| `BOW` | 0.028 | Gutter shading — the visible half of the bow |
| `BOW_DIP` | 0.003 | Actual displacement. Must stay under `BOW_CLEAR` (Rule 4) |
| `PAGE_Z` | `THICK/2 + BOARD + 0.012` | Where a page of the open spread lies |
| `BOW_CLEAR` | 0.006 | Air between a page and the block under it |
| `SURFACE` | `PAGE_Z - BOW_CLEAR` | Top of a block of paper |
| `FAN` | 5 | Leaves that come over with the board |

**The curl** (`bendable`) runs in a vertex shader and does four things, because
paper does not bend evenly:

- bows most near the free edge, `sin(u·π)`
- the lower corner lags the upper one, `mix(1.25, 0.7, v)`
- bowing pulls the free edge back toward the spine
- the leaf is never quite square to the spine while it moves

The **normal** is bent too, from the analytic derivative of the curl. Without
it a curled leaf shades like a flat board and the curve reads only in
silhouette. That chunk runs before `<begin_vertex>`, so it works from
`position`, not `transformed`. In the depth shader it sits inside an
`#ifdef USE_DISPLACEMENTMAP` that is never defined — dead code there, which is
why the displacement, not the normal, is what casts the shadow.

**Easing.** `turnEase` splits lift from fall: a page is lifted at a steady rate
then let go, so the turn accelerates through its second half and settles rather
than easing symmetrically into place.

**Cover art** is painted to canvas at runtime rather than shipped as an image,
which is what lets the book restamp its own foil when you turn to another book.
One pass produces two canvases — the colour map, and a mask marking which
pixels are gold. The mask drives metalness, so the foil catches the room while
the leather around it stays matte.

The imprint sits at the **foot of the front board**, not on the spine. The shut
book is turned −27° to show the fore-edge, which leaves the spine facing away;
open, the spine sits edge-on in the gutter. The board's foot is the one surface
both camera positions can read.

## 9. Design tokens

Defined in `@theme` in `app/globals.css`. Use the tokens; do not introduce raw
hex in components.

| Token | Value | Note |
|---|---|---|
| `--color-haze` / `-lift` / `-deep` | `#e4e7ef` `#eef0f6` `#c3cadd` | The cool, pale room |
| `--color-vellum` / `-shade` | `#f6f1e4` `#e6ddc8` | Warm paper, deliberately at odds with the room |
| `--color-ink` | `#16181f` | |
| `--color-ink-soft` | `#5b6070` | |
| `--color-ink-faint` | `#5f6675` | The contrast floor. Do not lighten (Rule 13) |
| `--color-indigo` / `-deep` | `#2c3aae` `#141a4d` | Focus ring, hover |
| `--color-gilt` / `-bright` / `-deep` | `#c9a227` `#f0dc9a` `#8a6a12` | |
| `--color-rubric` | `#a3372c` | The red scribes reserved for chapter initials |
| `--font-display` | Bodoni Moda | Folios, verse numbers, drop initials, the title |
| `--font-text` | EB Garamond | Body, labels |
| `--ease-leather` | `cubic-bezier(.72,.02,.18,1)` | Opening and closing |
| `--ease-settle` | `cubic-bezier(.16,1,.3,1)` | Things arriving |

Utilities: `label` (12px, 0.34em tracking, caps), `grain-leather`,
`grain-paper`, `gilt-edge`, `gilt-edge-head`, `room-light`. The gilt
striations run *across* the stack — down the head edge, across the fore-edge —
so each leaf reads as its own line.

Body type: `clamp(0.88rem, 1.02vw, 1rem)` at 1.66 leading, justified, shared by
`Page.tsx` and the off-screen measurers as `BODY_TYPE`. `pageArt.ts` mirrors it
with its own justification pass.

## 10. Controls

| | Shelf | Reading |
|---|---|---|
| `←` `→` | previous / next book | turn the page |
| `Esc` | — | close the book |
| click | open the book | — |
| drag | pull the cover open | turn a page by its outer edge |
| All 66 books | turn to any of the sixty-six | turn to any of the sixty-six |

Keyboard handling is a single window listener. It ignores `SELECT` and `INPUT`
targets, and bails entirely while the contents dialog is up — the dialog
registers its own `Escape` handler in the **capture** phase so the shelf's
arrows do not cycle underneath it.

Position is announced through `aria-live="polite"`:
`"Genesis 1 · 2 of 5"`, or `"Fetching the text…"` while loading.

## 11. Verification

```bash
npm run dev      # localhost:3000
npm run lint
npm run build
```

`npm run lint` and `npm run build` both pass before work is reported done.
Motion is not verifiable here (Rule 21).
