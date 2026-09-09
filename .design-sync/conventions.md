# Foredge

A bound Bible you open by hand. The palette is deliberately two-temperature: a
cool, pale room (`haze`) with warm paper (`vellum`) sitting at odds with it.
Type is Bodoni Moda for display and EB Garamond for reading.

## The stylesheet is a closed set — this is the rule that matters

`_ds_bundle.css` is Tailwind **already compiled**, so it contains only the 248
class rules this product actually uses. It is not a Tailwind runtime. A class
that is not on the list below does not exist, will not resolve, and fails
silently — `p-10`, `gap-6`, `max-w-2xl`, `size-8` are all absent.

So: **use the classes below for the design language, and plain inline `style`
for all layout and geometry** (padding, gaps, widths, heights, positioning).
Reach for tokens by name inside those inline styles.

```jsx
<div className="bg-vellum text-ink" style={{ padding: 32, maxWidth: "34em" }}>
```

### Classes that exist

| Family | Names |
|---|---|
| Ground | `bg-haze` `bg-vellum` `bg-transparent` `bg-indigo-deep/25` |
| Ink | `text-ink` `text-ink-soft` `text-ink-faint` `text-indigo` `text-rubric` |
| Type | `font-display` (Bodoni) `font-text` (Garamond) `label` |
| Rules | `border-b` `border-dotted` `border-ink/12` `border-ink/15` `border-ink/20` `border-rubric/25` |
| Hover | `hover:text-indigo` `hover:text-indigo-deep` `hover:border-indigo/50` |
| Material | `grain-paper` `grain-leather` `gilt-edge` `gilt-edge-head` `room-light` |

`label` is the small-caps chrome face: 12px, 0.34em tracking, uppercase. It is
how every control and running head is set — do not hand-roll it.
`room-light` is the room's ground wash; put it on the outermost surface.

### Tokens

Colour: `--color-haze` `-haze-lift` `-haze-deep` · `--color-vellum`
`-vellum-shade` · `--color-ink` `-ink-soft` `-ink-faint` · `--color-indigo`
`-indigo-deep` · `--color-gilt` `-gilt-bright` `-gilt-deep` · `--color-rubric`.
Type: `--font-display` `--font-text`. Motion: `--ease-leather` (opening and
closing) `--ease-settle` (things arriving).

`--color-ink-faint` is the contrast floor — it carries most of the chrome and
already measures 4.5:1 on both grounds. Do not lighten it. `--color-rubric` is
reserved for chapter initials and verse numbers, nothing else.

## Setup

No provider and no wrapper. Load `styles.css` and the components are styled —
it pulls the tokens, the compiled rules, and both webfonts. Two components have
a shape you must respect:

- **`PageFace`** is `h-full`. Give it a parent with a real height or it
  collapses: `<div style={{ height: 440, width: 320 }}><PageFace …/></div>`.
- **`Contents`** is `position: fixed; inset: 0` — a full-screen overlay that
  paints its own dimmed backdrop. Render it as a sibling of your page, not
  inside a positioned card.

`BODY_TYPE` is an exported string, not a component: the shared reading face
(justified Garamond, 1.66 leading, fluid size). Put it on any element that sets
scripture, so a page and its measurer never disagree.

## Where the truth is

Read `_ds/<folder>/styles.css` and its `@import` closure before styling —
that file *is* the complete list of what resolves. Per-component API contracts
are in each `components/general/<Name>/<Name>.d.ts`; usage is in the matching
`.prompt.md`. `guidelines/docs/SPEC.md` §9 documents the token intent.

## Building with it

```jsx
<div className="room-light" style={{ display: "flex", justifyContent: "center", padding: 32 }}>
  <div style={{ height: 440, width: 320 }}>
    <PageFace
      side="verso"
      book="John"
      chapter={1}
      folio={1042}
      verses={[{ verse: 1, text: "In the beginning was the Word…" }]}
    />
  </div>
  <button className="label flex min-h-11 items-center gap-2 rounded-sm border border-ink/20 px-2.5 text-ink-soft transition-colors hover:border-indigo/50 hover:text-indigo">
    <BooksIcon className="size-3.5 shrink-0" />
    <span>All 66 books</span>
  </button>
</div>
```
