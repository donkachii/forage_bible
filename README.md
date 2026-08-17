# Holy Bible

A Bible sitting on a table. Turn to any of the sixty-six books, click it, and it
opens in 3D into a two-page spread you can read and page through.

```bash
npm run dev
```

## How it works

**The book is one 3D object, not two screens.** The covers, spine, gilded edges
and page block are six planes in a single `preserve-3d` scene, positioned in
pixels around a shared origin at the spine. Opening rotates the front board
180° about that origin and slides the scene so the spread centres on the spine
instead of on the closed cover. Nothing is swapped out — it is the same object
throughout, which is why the transition reads as a book rather than a crossfade.

Two constraints came out of building it, both recorded in comments where they
bite:

- The board flips to **exactly** 180°. Any splay leaves its outer edge proud of
  the leaf lying on it, and the compositor then sorts the two halves against
  each other, tearing the left page in half.
- Nothing in the 3D scene may carry a `filter`. A filter flattens the element's
  3D context, which silently breaks both `backface-visibility` (you see the
  cover's artwork mirrored instead of the endpaper) and z-sorting. Shadows in
  the scene are `box-shadow`, never `drop-shadow`.

**Text is paginated by measurement, not estimate.** `usePagination` lays the
chapter out off-screen at the real column width — which a `ResizeObserver`
reads off a live page rather than deriving from the page size — then walks the
verses and reads back where each one's first line lands. Breaks fall at verse
boundaries, so a page can end up to one verse short, but text is never clipped.
Where a chapter runs out mid-spread the facing leaf is left as blank paper, with
no running head and no folio.

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

- `components/BibleTable.tsx` — state machine, 3D scene, chrome
- `components/Page.tsx` — a single leaf: running head, verse flow, show-through
- `components/Cover.tsx` — the boards, in CSS
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
