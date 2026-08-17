# Foredge

A bound Bible sitting on a table. Turn to any of the sixty-six books, click it, and it
opens in 3D into a two-page spread you can read and page through.

```bash
npm run dev
```

## How it works

**Opening moves paper, not just a cover.** A wedge of leaves comes over with
the board, each trailing the one above it, so the book peels open instead of a
plank swinging aside. Opening at the head of a book leaves a thin wedge on the
left and the bulk of the block on the right, the way a real Bible sits.

**The book is WebGL; the text is not.** `BookScene.tsx` builds the closed book
as a real object in three.js — boards, a sewn block, gilded edges — lit by one
window-shaped key with a second light raking the fore-edge, because gold is
almost entirely reflection and the edge faces away from the key. Opening is one
rotation about the spine. Once the spread is flat, the scene fades out and hands
over to DOM pages.

That split is the whole design. Text rendered into WebGL stops being text: not
selectable, not searchable, invisible to a screen reader, and soft unless drawn
at absurd resolution. So the dimensional work happens in the canvas and the
reading happens in the DOM, and the two are framed to the same size — the camera
distance is derived from the page's pixel height rather than fixed, so the
hand-over lands on a book of matching size.

The cover is painted to a canvas rather than shipped as an image, which is what
lets the book restamp its own foil when you turn to another book. One pass
produces two canvases: the colour map, and a mask marking which pixels are gold.
The mask drives metalness, so the foil catches the room while the leather around
it stays matte.

Two things in the scene are load-bearing and easy to break:

- The render loop **idles** when the reader is showing, but wakes on resize.
  Resizing clears the drawing buffer, so idling through one leaves a blank
  canvas on screen — which looks exactly like the cover having vanished.
- Lighting is not decoration here. With only the key light the gilded fore-edge
  renders as brown paint, and that edge is the thing the app is named after.

**Turning a page is a physical event.** Within a chapter, `BookScene` runs a
real leaf across the gutter: a segmented plane pivoted on the spine, curled by a
vertex shader. Paper does not bend evenly — it bows most near the free edge and
the lower corner trails the upper one — and a page is lifted at a steady rate
then let go, so the turn accelerates through its second half and settles rather
than easing symmetrically into place. Both are what stop it reading as a
swinging board. The leaf carries its own
text — `pageArt.ts` paints a page to canvas, mirroring the CSS in `Page.tsx`
(same margins, same measure, same leading, its own justification pass). Four
pages are painted per turn: the leaf's two sides, and what is already lying
underneath on either side.

When the leaf lands it is folded into the spread rather than hidden, so the DOM
reader fades in over a matching image instead of over bare paper. Crossing a
chapter boundary is a jump cut, deliberately — there is no single leaf that
spans two chapters. Turning *back* across one lands on the previous chapter's
last page, which falls out of the same clamp that guards the page counter:
asking for `MAX_SAFE_INTEGER` resolves to the last spread once the new chapter
has been measured.

Animation is smoothed **per second, not per frame**. A browser that throttles
`requestAnimationFrame` — a background tab, a slow device — would otherwise run
the open at whatever rate it happened to tick at.

**Text is paginated by measurement, not estimate.** `usePagination` lays the
chapter out off-screen at the real column width — which a `ResizeObserver` reads
off a live page rather than deriving from the page size — then walks the verses
and reads back where each one's first line lands. Breaks fall at verse
boundaries, so a page can end up to one verse short, but text is never clipped.
Where a chapter runs out mid-spread the facing leaf is left as blank paper, with
no running head and no folio.

Re-measuring can leave fewer spreads than the leaf you are on. Every read of the
position goes through one clamp, so the footer cannot claim to be on page 3 of 2
while the pages settle.

## The text

The [World English Bible](https://worldenglish.bible/), public domain, fetched
from [bible-api.com](https://bible-api.com) through `/api/passage` and cached
indefinitely — a chapter never changes. Genesis 1 ships with the app so the
shelf always has something to open.

The five single-chapter books are a special case: bible-api reads a bare number
after them as a *verse*, so `jude+1` returns one verse rather than the letter.
Those five are requested as an explicit verse range, which means `lib/canon.ts`
carries their verse counts.

## Controls

| | Shelf | Reading |
|---|---|---|
| `←` `→` | previous / next book | turn the page |
| `Esc` | — | close the book |
| click | open the book | — |

Turning past the last page rolls into the next chapter, and past the last
chapter into the next book. Below 900px the spread becomes a single page.

## Layout

- `components/BibleTable.tsx` — state machine, layout, chrome
- `components/BookScene.tsx` — the book as a lit WebGL object
- `components/coverArt.ts` — cover and gilding painted to canvas at runtime
- `components/pageArt.ts` — a page painted to canvas, for the leaf in motion
- `components/Page.tsx` — a single leaf: running head, verse flow, folio
- `components/usePagination.ts` — the measuring pass
- `lib/canon.ts` — the sixty-six books, their divisions and chapter counts
- `lib/passage.ts` — fetching, plus the bundled Genesis 1

## Known gap

Focus hand-off between the cover button and the reading controls (in
`BibleTable.tsx`) lands reliably on the first open after a page load and
intermittently after that — the browser's own focus reset for the
just-disabled outgoing button races it. When it doesn't fire, focus stays on
`<body>`, which is the default behaviour anyway; every control is still
reachable by Tab, and the arrow and Escape keys are handled globally.
