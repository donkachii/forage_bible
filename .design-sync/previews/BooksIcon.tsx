import { BooksIcon } from "foredge";

/**
 * The control it was drawn for — the glyph beside the visible label, which is
 * why it is hidden from assistive tech and the button carries the name.
 */
export function AllBooksControl() {
  return (
    <div className="room-light flex items-center justify-center" style={{ padding: 40 }}>
      <button
        aria-label="All 66 books"
        className="label flex min-h-11 items-center gap-2 rounded-sm border border-ink/20 px-2.5 text-ink-soft transition-colors hover:border-indigo/50 hover:text-indigo"
      >
        <BooksIcon className="size-3.5 shrink-0" />
        <span>All 66 books</span>
      </button>
    </div>
  );
}

/** Ruled lines with their leaders — the shape of the list it opens. */
export function Glyph() {
  return (
    <div className="room-light flex justify-center" style={{ alignItems: "flex-end", gap: 48, padding: 40 }}>
      {[14, 28, 48].map((px) => (
        <div key={px} className="flex items-center" style={{ flexDirection: "column", gap: 12 }}>
          <span style={{ display: "block", width: px, height: px }}>
            <BooksIcon className="h-full w-full text-ink-soft" />
          </span>
          <span className="label text-ink-faint">{px === 14 ? "14px — shipped" : `${px}px`}</span>
        </div>
      ))}
    </div>
  );
}
