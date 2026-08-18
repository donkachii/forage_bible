/**
 * A contents glyph: ruled lines with their leaders, the shape of the list it
 * opens. Decorative wherever it sits beside the visible label, so it is
 * hidden from assistive tech and the control carries the name.
 */
export function BooksIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={className} fill="none" stroke="currentColor">
      <g strokeWidth="1.3" strokeLinecap="round">
        <path d="M2 3.5h6M2 8h6M2 12.5h6" />
        <path d="M11.5 3.5h2.5M11.5 8h2.5M11.5 12.5h2.5" opacity="0.55" />
      </g>
    </svg>
  );
}
