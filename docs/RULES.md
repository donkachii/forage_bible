# Rules

Binding on every agent working in this repository. Each rule exists because
breaking it produced a bug that was invisible until measured, or destroys the
product idea in `PRD.md`. Where a rule has a number in it, the number is in the
code — change it there, not here, and update this file in the same commit.

Read `SPEC.md` for how the thing is built. This file is what not to break.

---

## 1. The split is not negotiable

**The book is WebGL. The text is DOM.** Never render reading text into the
canvas, and never rebuild the book with CSS 3D transforms.

Text in a canvas is not selectable, not searchable, invisible to a screen
reader, and soft. CSS 3D was tried and cost two silent bugs: a board splayed
past flat had its outer edge intersect the leaf lying on it, and any `filter`
anywhere in the scene flattened the 3D context and broke both
`backface-visibility` and z-sorting. A depth buffer has neither problem.

**The one exception:** `pageArt.ts` paints canvas text for a leaf *in motion*,
because a moving leaf has to carry its own faces. It mirrors `Page.tsx` — same
margins, same measure, same leading. Change one and you change both, or the
cross-fade at the end of a turn lands on a page that does not match.

## 2. The render loop idles, but must wake on resize

The loop stands down when the reader is showing. Resizing clears the drawing
buffer, so idling through a resize leaves a blank canvas — which on screen
looks exactly like the cover having vanished.

If you add a condition that stops the loop, check it also wakes for resize.

## 3. Lighting is load-bearing, not decoration

Two lights: one window-shaped key, and a second raking the fore-edge. Gold is
almost entirely reflection, and the fore-edge faces away from the key. With
only the key light the gilded edge renders as brown paint — and that edge is
the thing the app is named after.

Do not "simplify" the rig to one light.

## 4. `BOW_DIP` must stay under `BOW_CLEAR`

A page bows into the gutter. The shading (`BOW`, 0.028) is an order of
magnitude larger than the actual displacement (`BOW_DIP`, 0.003), and it has to
be: the fold is on the camera axis, so displacement buys almost no silhouette,
while a page that dips past the block beneath it is *occluded* by it and the
gutter text simply vanishes.

`BOW_CLEAR` (0.006) is the air between a page and the block holding it up.
`BOW_DIP` must stay inside it. Tune the shading freely; tune the dip carefully.

## 5. Blank leaves are hidden, never removed

A leaf the chapter ran out before reaching shows no running head and no folio.
Achieve that with `invisible`, never by removing the elements.

The body `div` between them is what the paginator measures. Dropping the header
and footer gives that ruler extra height, so it measures a page the chapter
cannot actually fill — and the set of blank leaves moves. This has been fixed
once already.

## 6. Every read of the leaf position goes through the clamp

`currentLeaf = Math.min(leaf, spreads.length - 1)`.

Re-measuring can leave fewer spreads than the leaf you are sitting on — a
resize mid-chapter, or the webfont landing after the first pass. One clamp
guards every read, so the footer cannot claim to be on page 3 of 2 while the
pages settle.

The same clamp is what resolves `Number.MAX_SAFE_INTEGER` into "the last
spread" when you turn *back* across a chapter boundary. Do not special-case
that separately.

## 7. Smooth per second, not per frame

Every eased value is integrated against elapsed time, not against a frame
count. A browser that throttles `requestAnimationFrame` — a background tab, a
slow device, this repo's own dev preview — would otherwise run the open at
whatever rate it happened to tick at.

## 8. Focus restoration uses `setTimeout`, never `requestAnimationFrame`

A throttled tab can hold a frame callback for a second or more, and where the
keyboard lands must not wait on the animation clock.

The browser also resets focus to `document.body` on its own account after
removing a focused element, and that lands *after* the first attempt. Both
focus helpers therefore try once, then retry at 80ms if focus went to the body.
Keep the retry.

## 9. One transition owns the timeline

Starting a transition drops whatever the previous one still had pending
(`after()` clears prior timers). A close part-way through an open must never be
overruled by the open's own timer landing late.

The drag paths have **no** timer at all — the release promise is the timeline.
Do not add a phase or a duration to make them look like the click path.

## 10. A turn is planned in exactly one place

`planTurn` decides what a turn in a given direction would move, without moving
it. Arrows, keys and drags all run through it; only the way it is *driven*
differs.

It returns `null` when the scene cannot carry the turn — reduced motion, or a
neighbouring chapter that has not arrived — and the caller cuts instead. Do not
add a second turn path.

## 11. The scene never sees pixels

Velocity crosses the boundary as **progress per second**; openness as 0–1. The
caller converts from screen coordinates. `BookScene` has no business knowing
about `clientX`.

Related: the pointer maps to the leaf's *angle* through `acos`, not to a linear
distance. The leaf pivots at the spine and its free edge sweeps a half circle,
so anything linear makes the page lag the cursor badly near the extremes.

## 12. Do not paint pages you are about to throw away

The staging effect skips `shelf`, `reading` and any frame where a turn is
running. Once the reader owns the screen the canvas is invisible, and two
`drawPage` passes on the frame a cross-fade starts is a dropped frame.

Also: `load()` only commits on success, so mid-fetch `passage` still holds the
*previous* chapter. Staging checks that the passage matches the book and
chapter being opened, and paints clean paper if not. Opening Isaiah onto
Genesis 1 is worse than opening it onto blank vellum.

## 13. Accessibility floors are floors

- **4.5:1** for every text colour, on *both* grounds it can appear on — the
  pale room and the vellum page. `--color-ink-faint` was once `#9aa0b2`, which
  measured 2.1:1 and carried most of the chrome. It is `#5f6675` now. Do not
  lighten it.
- **12px** minimum for real text. The `label` utility is 0.75rem for this
  reason; letterspaced caps at 11px were shape-recognition, not reading.
- **44px** for chrome targets (`min-h-11`). 24px is the hard floor (WCAG 2.2);
  Close was once an 11px-tall target.
- Verse numbers are navigation, not ornament — people scan for them. They stay
  at 0.68em in the display face with `tabular-nums`.
- An icon beside a visible label is `aria-hidden`, and the control carries the
  accessible name. Where a label drops at a narrow breakpoint the accessible
  name stays, so the visible text is always a subset of the accessible one.

## 14. Reduced motion is two code paths

CSS flattens transitions, *and* `useReducedMotion` tells the choreography, because
the open and close are also timed in JavaScript. Both are required.

Under reduced motion: `OPEN_MS`/`CLOSE_MS` become 0, `planTurn` returns `null`
so turns become cuts, and drag-to-open is refused — the click path still works
and cuts instantly. Never make a gesture the only way to do something.

## 15. A one-chapter book needs its verse count

bible-api reads a bare number after a single-chapter book as a *verse*, so
`jude+1` returns one verse rather than the letter. Those five are requested as
an explicit verse range, which is why `lib/canon.ts` carries `verses` for them:
Obadiah 21, Philemon 25, 2 John 13, 3 John 14, Jude 25.

If you touch `CANON`, any entry with `chapters: 1` must have `verses`.

## 16. Chapter text is immutable

`next: { revalidate: false }` on the upstream fetch, `max-age=31536000,
immutable` on the route, and an in-memory `Map` in the client. A chapter never
changes. Do not add revalidation, and do not add a cache-busting query
parameter.

## 17. Controls have edges; labels do not

In the header, the wordmark and the translation credit are set in exactly the
same type as the controls beside them. That is why the buttons are bordered and
carry glyphs. A label that looks like a label does not get clicked — and a
control that looks like a label does not get clicked either.

The book list is called **"All 66 books"** in every place it appears: the
header control, the shelf control, the dialog's `aria-label`, and the dialog's
heading. "Contents" is the right word on a printed page but it never says what
it holds.

## 18. Stable identities for measured arrays

`usePagination` keys its effect on array *identity*. Pass the shared `NO_VERSES`
constant for an absent chapter — a fresh `[]` re-runs the measuring pass every
render.

## 19. WebGL stays off the server

`BookScene` is loaded with `dynamic(..., { ssr: false })` because WebGL touches
`document` on construction. Do not import it directly.

## 20. Commit the Next.js agent block

`next dev` rewrites the managed block in `AGENTS.md` between its markers.
Removing it from a diff only re-creates the uncommitted change. Commit it with
your work and the tree stays clean. Everything outside those markers — including
the pointer to these documents — is preserved by the generator, verified in
`node_modules/next/dist/server/lib/generate-agent-files.js`.

## 21. Verify what is verifiable, and say what is not

There is no test framework in this repository. Verification is:

```bash
npm run lint     # eslint, next core-web-vitals + typescript
npm run build    # type-checks the whole project
```

Both must pass before you report work as done.

Focus, contrast, target sizes, pagination and state transitions can be
measured. **Motion cannot be judged here** — the dev preview throttles
`requestAnimationFrame` to roughly one frame a second. If you changed
`turnFor`, the bend peak, `turnEase` or the `FAN` stagger, say plainly that the
feel is unverified and needs a real browser. Do not report it as confirmed.

## 22. Write commits the way this repository writes them

Read `git log`. A commit here opens with what changed in one line, then
explains **why** — usually the failure the change is answering, in prose,
sometimes at length. "Fix page turn" is not a commit message in this project.
State what was wrong, why it was wrong, and what the fix costs.
