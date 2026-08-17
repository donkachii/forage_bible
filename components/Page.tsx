"use client";

import type { Verse } from "@/lib/passage";

export const BODY_TYPE = "font-text text-[clamp(0.88rem,1.02vw,1rem)] leading-[1.66] [text-align:justify]";

export function VerseFlow({ verses, chapter }: { verses: Verse[]; chapter: number }) {
  return (
    <>
      {verses.map((v) =>
        v.verse === 1 ? (
          <span key={v.verse} data-verse={v.verse} className="block">
            <span
              className="float-left mt-[0.1em] mr-[0.12em] font-display text-rubric leading-[0.76]"
              style={{ fontSize: "3.2em" }}
              aria-label={`Chapter ${chapter}`}
            >
              {chapter}
            </span>
            {v.text}{" "}
          </span>
        ) : (
          <span key={v.verse} data-verse={v.verse}>
            {/* Verse numbers are navigation, not ornament: people scan for
                them. At 0.56em/70% they measured 7.9px and 3.3:1. */}
            <sup className="mr-[0.16em] ml-[0.12em] font-display text-[0.68em] text-rubric tabular-nums">
              {v.verse}
            </sup>
            {v.text}{" "}
          </span>
        ),
      )}
    </>
  );
}

type PageProps = {
  side: "verso" | "recto";
  book: string;
  chapter: number;
  verses: Verse[];
  folio: number;
  bodyRef?: React.Ref<HTMLDivElement>;
};

export function PageFace({ side, book, chapter, verses, folio, bodyRef }: PageProps) {
  const first = verses[0]?.verse;
  const last = verses[verses.length - 1]?.verse;
  const range = first ? (first === last ? `${chapter}:${first}` : `${chapter}:${first}–${last}`) : "";

  return (
    <div
      className={[
        "relative flex h-full flex-col overflow-hidden bg-vellum py-[7%] text-ink",
        side === "verso" ? "pr-[6%] pl-[8%]" : "pr-[8%] pl-[6%]",
      ].join(" ")}
    >
      {/* Fibres in the stock. */}
      <div
        aria-hidden
        className="grain-paper pointer-events-none absolute inset-0 opacity-[0.13] mix-blend-multiply"
      />
      {/* The leaf dips into the gutter, so its inner edge sits in shadow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-[15%]"
        style={{
          [side === "verso" ? "right" : "left"]: 0,
          background: `linear-gradient(to ${side === "verso" ? "right" : "left"}, rgba(90,72,40,0) 0%, rgba(90,72,40,0.08) 60%, rgba(74,58,30,0.26) 100%)`,
        }}
      />

      {/* A leaf the chapter ran out before reaching is simply blank paper —
          no running head, no folio, the way a binder leaves it. */}
      {verses.length > 0 && (
        <header className="relative mb-[4%] flex shrink-0 items-baseline justify-between border-b border-ink/12 pb-[2.5%]">
          <span className="label text-ink-soft">{side === "verso" ? book : range}</span>
          <span className="label text-ink-faint">{side === "verso" ? range : book}</span>
        </header>
      )}

      <div ref={bodyRef} className={`relative min-h-0 flex-1 ${BODY_TYPE}`}>
        <VerseFlow verses={verses} chapter={chapter} />
      </div>

      {verses.length > 0 && (
        <footer className="relative mt-[3%] shrink-0 text-center">
          <span className="font-display text-[0.75rem] text-ink-faint tabular-nums">{folio}</span>
        </footer>
      )}
    </div>
  );
}
