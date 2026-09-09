import { Contents } from "foredge";

/**
 * The whole list, open on Genesis (CANON index 0) — the book it opens on takes
 * the rubric and the initial focus, and the list scrolls to centre it, so a
 * book near the top is what keeps the heading in frame. It is a fixed overlay,
 * so the card shows it the way the reader meets it: over a dimmed room.
 */
export function AllBooks() {
  return (
    <div className="room-light min-h-dvh">
      <Contents current={0} onPick={() => {}} onClose={() => {}} />
    </div>
  );
}
