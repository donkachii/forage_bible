import { Chevron } from "foredge";

/**
 * The stylesheet is a closed set — only the utilities the app itself uses are
 * compiled. Preview scaffolding therefore takes its geometry from inline
 * styles, and classes only where the design system really defines them.
 */
function Slot({ size, children }: { size: number; children: React.ReactNode }) {
  return <span style={{ display: "block", width: size, height: size * 2 }}>{children}</span>;
}

/** Both directions, at the size the shelf uses. */
export function Directions() {
  return (
    <div className="room-light flex items-center justify-center" style={{ gap: 64, padding: 32 }}>
      {(["left", "right"] as const).map((dir) => (
        <div key={dir} className="flex items-center" style={{ flexDirection: "column", gap: 12 }}>
          <Slot size={16}>
            <Chevron dir={dir} className="h-full w-full text-ink-faint" />
          </Slot>
          <span className="label text-ink-faint">{dir}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * How it ships on the shelf: a hit target either side of the book, drawn in
 * the faint ink so it never competes with the object it flanks.
 */
export function BookShiftControls() {
  return (
    <div className="room-light relative flex items-center justify-center" style={{ minHeight: 190, padding: 16 }}>
      <button
        aria-label="Previous book"
        className="absolute top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-indigo"
        style={{ left: 12, padding: 16 }}
      >
        <Slot size={16}>
          <Chevron dir="left" className="h-full w-full" />
        </Slot>
      </button>
      <p className="font-display text-2xl text-ink">Ecclesiastes</p>
      <button
        aria-label="Next book"
        className="absolute top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-indigo"
        style={{ right: 12, padding: 16 }}
      >
        <Slot size={16}>
          <Chevron className="h-full w-full" />
        </Slot>
      </button>
    </div>
  );
}

/** It strokes with `currentColor`, so it takes the tone of the control holding it. */
export function InheritsColour() {
  return (
    <div className="room-light flex items-center justify-center" style={{ gap: 48, padding: 32 }}>
      {[
        ["text-ink", "ink"],
        ["text-ink-faint", "ink-faint"],
        ["text-indigo", "indigo"],
        ["text-rubric", "rubric"],
      ].map(([cls, name]) => (
        <div key={name} className="flex items-center" style={{ flexDirection: "column", gap: 12 }}>
          <Slot size={16}>
            <Chevron className={`h-full w-full ${cls}`} />
          </Slot>
          <span className="label text-ink-faint">{name}</span>
        </div>
      ))}
    </div>
  );
}
