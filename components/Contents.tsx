"use client";

import { useEffect, useMemo, useRef } from "react";
import { CANON, type Division } from "@/lib/canon";

/**
 * The table of contents, set the way a bound Bible prints one: both testaments
 * side by side, each broken into its divisions, every book with its length.
 *
 * Cycling with the arrows is fine for browsing a shelf, but Revelation is
 * sixty-five presses from Genesis. This is how you actually turn to a book.
 */

type Props = {
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
};

type Group = { division: Division; books: { index: number; name: string; chapters: number }[] };

function groupsFor(testament: "Old" | "New"): Group[] {
  const out: Group[] = [];
  CANON.forEach((book, index) => {
    if (book.testament !== testament) return;
    // Divisions run in canonical order, and History appears in both
    // testaments, so append rather than key by name.
    const tail = out[out.length - 1];
    const bucket =
      tail && tail.division === book.division ? tail : (out.push({ division: book.division, books: [] }), out[out.length - 1]);
    bucket.books.push({ index, name: book.name, chapters: book.chapters });
  });
  return out;
}

export default function Contents({ current, onPick, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  const testaments = useMemo(
    () => [
      { name: "Old Testament", groups: groupsFor("Old") },
      { name: "New Testament", groups: groupsFor("New") },
    ],
    [],
  );

  // Open on the book you are already holding, and put the keyboard there too.
  useEffect(() => {
    const target = currentRef.current ?? panel.current;
    target?.focus();
    currentRef.current?.scrollIntoView({ block: "center" });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // Capture, so the shelf's own arrow and Escape handling stays out of it
    // while the list is up.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain p-4 md:p-8">
      <button
        aria-label="Close the contents"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-indigo-deep/25 backdrop-blur-[2px]"
        tabIndex={-1}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Contents"
        tabIndex={-1}
        style={{ animation: "rise 380ms var(--ease-settle) both" }}
        className="relative my-auto w-full max-w-5xl overflow-hidden rounded-[3px] bg-vellum shadow-[0_30px_70px_rgba(20,26,77,0.3)] outline-none"
      >
        <div aria-hidden className="grain-paper pointer-events-none absolute inset-0 opacity-[0.13] mix-blend-multiply" />

        <div className="relative px-6 py-8 md:px-12 md:py-11">
          <header className="mb-8 flex items-baseline justify-between gap-4 border-b border-ink/12 pb-4">
            <h2 className="font-display text-2xl text-ink md:text-3xl">Contents</h2>
            <button
              onClick={onClose}
              className="label flex min-h-11 items-center px-1 text-ink-soft transition-colors hover:text-indigo"
            >
              Close
            </button>
          </header>

          <div className="grid gap-x-12 gap-y-9 md:grid-cols-2">
            {testaments.map((testament) => (
              <section key={testament.name}>
                <h3 className="label mb-5 text-ink-soft">{testament.name}</h3>

                {testament.groups.map((group) => (
                  <div key={group.division + group.books[0].index} className="mb-6 last:mb-0">
                    <h4 className="label mb-2 text-ink-faint">{group.division}</h4>
                    <ul>
                      {group.books.map((entry) => {
                        const here = entry.index === current;
                        return (
                          <li key={entry.name}>
                            <button
                              ref={here ? currentRef : undefined}
                              onClick={() => onPick(entry.index)}
                              aria-current={here ? "true" : undefined}
                              className={[
                                "flex min-h-9 w-full items-baseline gap-3 rounded-sm px-2 py-1 text-left transition-colors",
                                here ? "text-rubric" : "text-ink hover:text-indigo",
                              ].join(" ")}
                            >
                              <span className="font-text text-base">{entry.name}</span>
                              <span aria-hidden className="min-w-0 flex-1 self-center border-b border-dotted border-ink/20" />
                              <span className="font-text text-sm text-ink-faint tabular-nums">
                                {entry.chapters}
                              </span>
                              <span className="sr-only">
                                {entry.chapters === 1 ? "1 chapter" : `${entry.chapters} chapters`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
