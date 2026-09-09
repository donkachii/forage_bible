# Foredge — Product Requirements

## What it is

A bound Bible sitting on a table. You turn to one of the sixty-six books, open
it, and read the World English Bible in a two-page spread you can page through
by hand.

Foredge is not a Bible study tool and not a reader with a book-shaped skin. It
is an attempt to make a specific physical experience — picking up a bound book
and opening it — survive the translation to a screen, without giving up
anything a screen is better at: selectable text, a screen reader, a keyboard,
a link you can send someone.

The name is the gilded fore-edge, the first thing you meet on the closed book
and the detail the whole cover treatment is built around.

## Who it is for

Someone who wants to *read* scripture rather than search it. The reference
reader here is a person who owns a printed Bible, likes it, and is annoyed that
every digital one feels like a database with a serif font.

Two consequences fall out of that and both are load-bearing:

- **Reading is the activity, not browsing.** Anything that speeds up getting to
  a verse at the cost of the reading itself is the wrong trade.
- **Opening is deliberate.** The book does not fall open on load. Picking a
  book from the shelf sets it down in front of you; opening it is a separate,
  physical act. That beat is the product.

## The premise

**The dimensional work happens in WebGL. The reading happens in the DOM.**

Text rendered into a canvas stops being text — not selectable, not searchable,
invisible to a screen reader, and soft unless drawn at absurd resolution. So
the book as an object lives in three.js, the text lives in real DOM, and the
two are framed to the same size so the hand-over between them is not a jump.

Every product decision below is downstream of that split. An agent that
collapses it — by drawing reading text into the canvas, or by faking the book
with CSS transforms — has built a different product, whatever else it got
right.

## Requirements

### R1 — The shelf

- The app opens on a closed book, framed small and turned so the gilded
  fore-edge faces the camera.
- The current book's name sits out of focus *behind* the object, the way a
  title reads when your eye is on the thing in front of it.
- `←` / `→` cycle through the canon, wrapping at both ends.
- The division note and chapter count sit under the book ("The five books of
  the Law · 50 chapters").
- Opening happens two ways, and both must work: **click** (or `Enter`) opens on
  a fixed timeline; **drag** takes the front board under the pointer and lets
  the gesture decide where it lands.

### R2 — Opening

- Opening moves paper, not just a cover. A wedge of leaves comes over with the
  board, each trailing the one above it.
- Opening at the head of a book leaves a thin wedge on the left and the bulk of
  the block on the right. How thin depends on how far through the canon the
  chapter sits — Genesis and Revelation must not look the same when open.
- The spread the book opens onto is painted *before* the cover lands on it. The
  reveal is never bare paper with the text arriving afterwards.
- A drag has no timeline. It ends when the gesture does: released past the
  tipping point or thrown hard enough, it falls open; otherwise it springs
  shut. A pull caught mid-close is fair game to pull back open.

### R3 — Reading

- Two pages on a desktop, one below 900px.
- Each page carries a running head (book name and verse range, swapping sides
  between verso and recto) and a folio. Chapter one takes a rubricated drop
  initial; verse numbers are superscript, in the display face, and are
  navigation rather than ornament.
- A leaf the chapter ran out before reaching is blank paper — no running head,
  no folio — the way a binder leaves it.
- `Esc` closes the book. Focus follows the book: it lands on Close when the
  book opens and back on the cover when it shuts.

### R4 — Turning a page

- `←` / `→` and the on-screen arrows turn one leaf on a fixed timeline.
- A page can also be **dragged** across the gutter by its outer edge. It
  follows the hand, can be peeled halfway, and falls back if you change your
  mind. A flick carries it whether or not it passed halfway — throwing a page
  is a different gesture from placing one.
- The moving leaf carries its own text on both faces, and what is already
  lying underneath on either side is painted too. Four faces per turn.
- Turning past the last page rolls into the next chapter; past the last chapter,
  into the next book. Turning *back* across a boundary lands on the previous
  chapter's **last** page, not its first.
- Crossing a chapter boundary within the animation is supported; crossing it
  when the neighbouring text has not arrived yet falls back to a cut rather
  than stalling the gesture.

### R5 — Reaching any book

- "All 66 books" opens a printed table of contents: both testaments side by
  side, each broken into its divisions, every book with its chapter count.
- It opens on the book you are already holding, scrolled into view, with the
  keyboard on it.
- Picking one **while reading** turns straight to it. Picking one **from the
  shelf** only sets it down in front of you — opening stays deliberate.
- The control, the dialog's accessible name and its heading all read "All 66
  books". An action does not change what it is called between where you press
  it and where you land.

### R6 — The text

- World English Bible, public domain, fetched from bible-api.com through
  `/api/passage` and cached indefinitely. A chapter never changes.
- Genesis 1 ships with the app, so the shelf always has something to open even
  with no network on first paint.
- A failed fetch shows a recoverable error with a retry, and never replaces the
  chapter already on screen with a wrong one.

## Non-goals

These are not "not yet". They are decisions.

- **No search, no concordance, no cross-references, no notes, no highlighting.**
  This is a reading surface.
- **No accounts, no sync, no analytics, no persistence.** Nothing about a
  reader is stored anywhere.
- **No second translation.** The WEB is public domain, which is why the text
  can be cached forever and shipped in the bundle. A copyrighted translation
  breaks both.
- **No dark mode.** The room is a cool, pale room and the paper is warm vellum
  deliberately at odds with it. That contrast is the design.
- **No page-curl skeuomorphism beyond what paper actually does.** The curl
  shader exists because a page that bends evenly reads as a swinging board, not
  because curls are decorative.
- **No text in the canvas for reading.** See The premise.

## Quality bars

These are measured, not judged:

| Bar | Requirement |
|---|---|
| Contrast | Every text colour clears 4.5:1 on both grounds it appears on — the pale room and the vellum page |
| Type size | 12px floor for any real text, including letterspaced caps |
| Target size | 44px minimum for chrome controls; 24px is the absolute floor (WCAG 2.2) |
| Focus | Visible on every interactive element, and hands off correctly across every state change |
| Pagination | Text is never clipped. A break falls at a verse boundary, so a page may end up to one verse short |
| Position | The page counter can never claim "3 of 2" while a re-measure settles |
| Reduced motion | Every timeline collapses, in CSS *and* in the JavaScript choreography |

## What cannot be judged from inside a dev preview

How the motion *feels*. The development preview throttles
`requestAnimationFrame` to roughly one frame a second, so the open and the page
turn cannot be watched there. Judge those in a real browser. The numbers worth
tuning by eye are `turnFor`, the bend peak, `turnEase`'s lift/fall split, and
the `FAN` count and stagger — all in `components/BookScene.tsx`.

An agent that reports the motion as verified from a dev preview is reporting
something it did not see.

## Success

Someone opens it, and the first thing they do is drag the cover rather than
click the button that tells them to click.
