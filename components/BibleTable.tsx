"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CANON, DIVISION_NOTE } from "@/lib/canon";
import { OPENING, type Passage } from "@/lib/passage";
import { usePagination } from "./usePagination";
import { BODY_TYPE, PageFace, VerseFlow } from "./Page";
import { useReducedMotion } from "./useReducedMotion";
import { Chevron } from "./Chevron";
import { drawPage } from "./pageArt";
import type { SceneControls } from "./BookScene";

// WebGL touches document on construction, so it stays out of the server pass.
const BookScene = dynamic(() => import("./BookScene"), { ssr: false });

type Phase = "shelf" | "opening" | "reading" | "closing";

const FULL_OPEN_MS = 1150;
const FULL_CLOSE_MS = 800;
const PAGE_RATIO = 1.38;

export default function BibleTable() {
  const [phase, setPhase] = useState<Phase>("shelf");
  const [index, setIndex] = useState(0);
  const [chapter, setChapter] = useState(1);
  const [passage, setPassage] = useState<Passage>(OPENING);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaf, setLeaf] = useState(0);
  const [dims, setDims] = useState({ pw: 420, ph: 580, single: false });
  // While a leaf is crossing the gutter the scene shows the spread, not the
  // reader — the moving page has to carry its own text.
  const [turning, setTurning] = useState(false);
  const stageRef = useRef<SceneControls | null>(null);

  const book = CANON[index];
  const open = phase === "opening" || phase === "reading";
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reduced = useReducedMotion();
  const OPEN_MS = reduced ? 0 : FULL_OPEN_MS;
  const CLOSE_MS = reduced ? 0 : FULL_CLOSE_MS;

  // Opening and closing swap the whole control set, so focus follows the book
  // rather than being left on a control that is about to be disabled.
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cameFrom = useRef<Phase>(phase);

  useEffect(() => {
    const previous = cameFrom.current;
    cameFrom.current = phase;
    // Only on a completed transition, so this never steals focus on load.
    const target =
      previous === "opening" && phase === "reading"
        ? closeRef.current
        : previous === "closing" && phase === "shelf"
          ? openRef.current
          : null;
    if (!target) return;

    target.focus();
    // The outgoing control is disabled in this same commit, and the browser
    // resets focus to the body on its own account afterwards. Take it back
    // once that has settled.
    const retry = setTimeout(() => {
      if (document.activeElement === document.body) target.focus();
    }, 80);
    return () => clearTimeout(retry);
  }, [phase]);

  /**
   * Each transition owns the timeline. Starting one drops whatever the
   * previous one still had pending, so a close part-way through an open can
   * never be overruled by the open's own timer landing late.
   */
  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.forEach(clearTimeout);
    timers.current = [setTimeout(fn, ms)];
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  /* --- Sizing: the book is measured in pixels so the 3D box stays square. --- */
  useEffect(() => {
    const compute = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const single = vw < 900;
      let pw = Math.min(single ? vw * 0.84 : (vw * 0.88) / 2, 440);
      let ph = pw * PAGE_RATIO;
      const maxH = vh * (single ? 0.66 : 0.74);
      if (ph > maxH) {
        ph = maxH;
        pw = ph / PAGE_RATIO;
      }
      setDims({ pw: Math.round(pw), ph: Math.round(ph), single });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  /* --- Text --------------------------------------------------------------- */
  const load = useCallback(async (name: string, ch: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/passage?book=${encodeURIComponent(name)}&chapter=${ch}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setPassage(body as Passage);
    } catch {
      setError("The text didn’t load. Check your connection, then try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const goTo = useCallback(
    (bookIdx: number, ch: number, atEnd = false) => {
      const target = CANON[bookIdx];
      const bounded = Math.min(Math.max(ch, 1), target.chapters);
      setIndex(bookIdx);
      setChapter(bounded);
      // Backing out of a chapter should land on its last page, the way closing
      // a book on your thumb does. The spread count is not known until the new
      // chapter has been measured, so ask for the end and let the clamp
      // resolve it once the pages settle.
      setLeaf(atEnd ? Number.MAX_SAFE_INTEGER : 0);
      void load(target.name, bounded);
    },
    [load],
  );

  /* --- Opening and closing ------------------------------------------------ */
  // Either transition can be caught mid-flight and reversed, so an impatient
  // click during the animation is answered instead of dropped.
  const openBook = useCallback(() => {
    if (phase === "opening" || phase === "reading") return;
    setPhase("opening");
    setLeaf(0);
    void load(book.name, 1);
    setChapter(1);
    after(OPEN_MS, () => setPhase("reading"));
  }, [phase, book.name, load, after, OPEN_MS]);

  const closeBook = useCallback(() => {
    if (phase === "closing" || phase === "shelf") return;
    setPhase("closing");
    after(CLOSE_MS, () => setPhase("shelf"));
  }, [phase, after, CLOSE_MS]);

  const shiftBook = useCallback(
    (step: number) => {
      if (phase !== "shelf") return;
      setIndex((i) => (i + step + CANON.length) % CANON.length);
    },
    [phase],
  );

  /* --- Pagination --------------------------------------------------------- */
  const perSpread = dims.single ? 1 : 2;
  // The text column is measured off a real page rather than estimated, so a
  // break lands exactly where the paper runs out.
  const [column, setColumn] = useState({ w: 0, h: 0 });
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { inlineSize, blockSize } = entry.contentBoxSize[0];
      setColumn({ w: Math.round(inlineSize), h: Math.round(blockSize) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { measurer, pages } = usePagination(passage.verses, column.w, column.h);

  const spreads = useMemo(() => {
    const source = pages.length ? pages : [passage.verses.map((_, i) => i)];
    const out: number[][][] = [];
    for (let i = 0; i < source.length; i += perSpread) {
      out.push(source.slice(i, i + perSpread));
    }
    return out.length ? out : [[[]]];
  }, [pages, perSpread, passage.verses]);

  // Re-measuring can leave fewer spreads than the leaf we are sitting on —
  // a resize mid-chapter, or the webfont landing after the first pass. Every
  // read of the position goes through the clamp, so the footer can never
  // claim to be on page 3 of 2 while the pages settle.
  const currentLeaf = Math.min(leaf, spreads.length - 1);
  const spread = spreads[currentLeaf] ?? [[]];
  const versesOn = (page?: number[]) => (page ?? []).map((i) => passage.verses[i]).filter(Boolean);

  const atStart = currentLeaf === 0;
  const atEnd = currentLeaf >= spreads.length - 1;
  const firstBook = index === 0 && chapter === 1;
  const lastBook = index === CANON.length - 1 && chapter === book.chapters;

  /** Paints one page of the chapter at the size the scene draws it. */
  const paint = useCallback(
    (page: number[] | undefined, side: "verso" | "recto", folio: number) =>
      drawPage({
        verses: versesOn(page),
        chapter: passage.chapter,
        book: book.name,
        folio,
        side,
        width: dims.pw,
        height: dims.ph,
        bodyFont: bodyRef.current
          ? getComputedStyle(bodyRef.current).fontFamily
          : "Garamond, serif",
        showChrome: (page ?? []).length > 0,
      }),
    // versesOn closes over the current passage, which the deps already track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [passage, book.name, dims.pw, dims.ph],
  );

  const turn = useCallback(
    (step: number) => {
      if (phase !== "reading" || turning) return;
      const next = currentLeaf + step;
      if (next >= 0 && next < spreads.length) {
        const scene = stageRef.current;
        // Within a chapter the leaf is a real object, so run it across before
        // the text changes underneath. Everything else is a jump cut anyway.
        if (!scene || reduced || dims.single) {
          setLeaf(next);
          return;
        }
        const forward = step > 0;
        const from = spreads[currentLeaf] ?? [];
        const to = spreads[next] ?? [];
        // Forward: the recto you were on lifts, its reverse is the new verso,
        // and the new recto is already lying underneath. Backward mirrors it.
        const art = forward
          ? {
              front: paint(from[1], "recto", currentLeaf * 2 + 2),
              back: paint(to[0], "verso", next * 2 + 1),
              under: { left: paint(from[0], "verso", currentLeaf * 2 + 1), right: paint(to[1], "recto", next * 2 + 2) },
            }
          : {
              front: paint(to[1], "recto", next * 2 + 2),
              back: paint(from[0], "verso", currentLeaf * 2 + 1),
              under: { left: paint(to[0], "verso", next * 2 + 1), right: paint(from[1], "recto", currentLeaf * 2 + 2) },
            };
        setTurning(true);
        void scene.turn(art, forward).then(() => {
          setLeaf(next);
          setTurning(false);
        });
        return;
      }
      if (step > 0) {
        if (chapter < book.chapters) goTo(index, chapter + 1);
        else if (index < CANON.length - 1) goTo(index + 1, 1);
        return;
      }
      if (chapter > 1) goTo(index, chapter - 1, true);
      else if (index > 0) goTo(index - 1, CANON[index - 1].chapters, true);
    },
    [phase, currentLeaf, spreads, chapter, book.chapters, index, goTo, turning, reduced, dims.single, paint],
  );

  /* --- Keyboard ----------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "SELECT" || tag === "INPUT") return;

      if (phase === "shelf") {
        if (e.key === "ArrowLeft") shiftBook(-1);
        if (e.key === "ArrowRight") shiftBook(1);
        return;
      }
      if (e.key === "Escape") closeBook();
      if (phase === "reading") {
        if (e.key === "ArrowLeft") turn(-1);
        if (e.key === "ArrowRight") turn(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, shiftBook, turn, closeBook]);

  /* --- Scene variables ---------------------------------------------------- */
  const scene = {
    "--pw": `${dims.pw}px`,
    "--ph": `${dims.ph}px`,
    "--tk": `${Math.max(34, Math.round(dims.pw * 0.13))}px`,
    // The boards overhang the block on the three outer edges, as a bound
    // book does — enough to frame the gilding, not enough to hide it.
    "--sq": "4px",
    "--scale": open ? 1 : dims.single ? 0.64 : 0.6,
    // Exactly flat: any splay makes the board's outer edge intersect the
    // leaf lying on it, and the compositor sorts the halves against each other.
    "--cover": open ? "-180deg" : "0deg",
    "--tilt-x": open ? "5deg" : "8deg",
    "--tilt-y": open ? "0deg" : "-27deg",
  } as React.CSSProperties;

  const label = `${book.name} ${chapter}`;

  return (
    <main
      className="room-light relative flex min-h-dvh flex-col overflow-hidden bg-haze"
      style={{ containerType: "size" }}
    >
      <Chrome
        phase={phase}
        book={book}
        chapter={chapter}
        onClose={closeBook}
        onChapter={(ch) => goTo(index, ch)}
        closeRef={closeRef}
      />

      {/* The book's name, out of focus behind the object — the way a title
          reads when your eye is on the thing in front of it. */}
      <h1
        aria-label={`${book.name}, ${book.testament} Testament`}
        className="pointer-events-none absolute inset-x-0 top-[19%] z-0 text-center font-display font-bold text-indigo select-none"
        style={{
          fontSize: "clamp(3.4rem, 15vw, 13rem)",
          lineHeight: 0.86,
          letterSpacing: "-0.03em",
          // Blur in em so the softness tracks the type size across breakpoints.
          filter: open ? "blur(0.2em)" : "blur(0.055em)",
          opacity: open ? 0 : 0.86,
          transform: open ? "scale(1.08)" : "scale(1)",
          transition: `filter ${OPEN_MS}ms var(--ease-leather), opacity 620ms ease, transform ${OPEN_MS}ms var(--ease-leather)`,
        }}
      >
        {book.name}
      </h1>

      <Scene
        style={scene}
        open={open}
        reading={phase === "reading"}
        book={book.name}
        passage={passage}
        spread={spread}
        leaf={currentLeaf}
        perSpread={perSpread}
        versesOn={versesOn}
        onOpen={openBook}
        label={label}
        bodyRef={bodyRef}
        openMs={OPEN_MS}
        openRef={openRef}
        pageHeight={dims.ph}
        reduced={reduced}
        turning={turning}
        controlsRef={stageRef}
      />

      {/* Off-screen twin of the chapter, set at the real column width. */}
      <div
        ref={measurer}
        aria-hidden
        className={`pointer-events-none invisible absolute -top-[9999px] left-0 ${BODY_TYPE}`}
        style={{ width: column.w || 1 }}
      >
        <VerseFlow verses={passage.verses} chapter={passage.chapter} />
      </div>

      {phase === "shelf" || phase === "closing" ? (
        <Shelf book={book} onShift={shiftBook} onOpen={openBook} dimmed={phase === "closing"} />
      ) : (
        <Turner
          onTurn={turn}
          atStart={atStart && firstBook}
          atEnd={atEnd && lastBook}
          position={`${label} · ${currentLeaf + 1} of ${spreads.length}`}
          loading={loading}
        />
      )}

      {error && phase !== "shelf" && (
        <div
          role="alert"
          className="absolute inset-x-0 bottom-24 z-40 mx-auto w-fit rounded-sm border border-rubric/25 bg-vellum px-5 py-3 text-center shadow-lg"
        >
          <p className="font-text text-sm text-ink">{error}</p>
          <button
            onClick={() => load(book.name, chapter)}
            className="label mt-2 text-indigo underline underline-offset-4 hover:text-indigo-deep"
          >
            Try again
          </button>
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------------- */

function Chrome({
  phase,
  book,
  chapter,
  onClose,
  onChapter,
  closeRef,
}: {
  phase: Phase;
  book: (typeof CANON)[number];
  chapter: number;
  onClose: () => void;
  onChapter: (ch: number) => void;
  closeRef: React.Ref<HTMLButtonElement>;
}) {
  const reading = phase === "reading";
  const active = reading || phase === "opening";
  return (
    <header className="relative z-30 flex shrink-0 items-center justify-between gap-4 px-5 py-6 md:px-10">
      <div className="flex items-baseline gap-4 whitespace-nowrap">
        <span className="label text-ink-soft">Foredge</span>
        <span className="label hidden text-ink-faint md:inline">World English Bible</span>
      </div>

      <div className="flex items-center gap-4 whitespace-nowrap md:gap-5">
        {reading && (
          <label className="flex items-center gap-2">
            <span className="label hidden text-ink-faint sm:inline">Chapter</span>
            <select
              value={chapter}
              onChange={(e) => onChapter(Number(e.target.value))}
              aria-label={`Chapter of ${book.name}`}
              className="label min-h-9 cursor-pointer rounded-sm border border-ink/15 bg-transparent py-1 pr-1 pl-2 text-ink hover:border-indigo/50"
            >
              {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          ref={closeRef}
          onClick={onClose}
          disabled={!active}
          className="label flex min-h-11 items-center gap-[0.34em] px-1 text-ink-soft transition-colors hover:text-indigo disabled:pointer-events-none disabled:opacity-0"
        >
          Close<span className="hidden sm:inline"> the book</span>
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------------- */

function Shelf({
  book,
  onShift,
  onOpen,
  dimmed,
}: {
  book: (typeof CANON)[number];
  onShift: (step: number) => void;
  onOpen: () => void;
  dimmed: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-500"
      style={{ opacity: dimmed ? 0 : 1 }}
    >
      <p
        key={book.testament}
        className="label absolute inset-x-0 top-[13%] text-center text-ink-faint"
        style={{ animation: "rise 700ms var(--ease-settle) both" }}
      >
        {book.testament} Testament
      </p>

      <button
        onClick={() => onShift(-1)}
        aria-label="Previous book"
        className="pointer-events-auto absolute top-1/2 left-3 -translate-y-1/2 p-4 text-ink-faint transition-colors hover:text-indigo md:left-10"
      >
        <Chevron dir="left" className="h-6 w-3 md:h-8 md:w-4" />
      </button>
      <button
        onClick={() => onShift(1)}
        aria-label="Next book"
        className="pointer-events-auto absolute top-1/2 right-3 -translate-y-1/2 p-4 text-ink-faint transition-colors hover:text-indigo md:right-10"
      >
        <Chevron className="h-6 w-3 md:h-8 md:w-4" />
      </button>

      <div className="absolute inset-x-0 bottom-9 text-center md:bottom-12">
        <p
          key={book.name}
          className="font-text text-sm text-ink-soft italic"
          style={{ animation: "rise 620ms var(--ease-settle) both" }}
        >
          {DIVISION_NOTE[book.division]} · {book.chapters}{" "}
          {book.chapters === 1 ? "chapter" : "chapters"}
        </p>
        <button
          onClick={onOpen}
          className="label pointer-events-auto mt-2 inline-flex min-h-11 items-center px-3 text-ink-faint transition-colors hover:text-indigo"
        >
          Click the book to open it
        </button>
      </div>
    </div>
  );
}

function Turner({
  onTurn,
  atStart,
  atEnd,
  position,
  loading,
}: {
  onTurn: (step: number) => void;
  atStart: boolean;
  atEnd: boolean;
  position: string;
  loading: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <button
        onClick={() => onTurn(-1)}
        disabled={atStart}
        aria-label="Previous page"
        className="pointer-events-auto absolute top-1/2 left-2 -translate-y-1/2 p-4 text-ink-faint transition-colors hover:text-indigo disabled:opacity-20 md:left-6"
      >
        <Chevron dir="left" className="h-6 w-3 md:h-8 md:w-4" />
      </button>
      <button
        onClick={() => onTurn(1)}
        disabled={atEnd}
        aria-label="Next page"
        className="pointer-events-auto absolute top-1/2 right-2 -translate-y-1/2 p-4 text-ink-faint transition-colors hover:text-indigo disabled:opacity-20 md:right-6"
      >
        <Chevron className="h-6 w-3 md:h-8 md:w-4" />
      </button>
      <p
        aria-live="polite"
        className="label absolute inset-x-0 bottom-8 text-center text-ink-faint"
      >
        {loading ? "Fetching the text…" : position}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

type SceneProps = {
  style: React.CSSProperties;
  open: boolean;
  reading: boolean;
  book: string;
  passage: Passage;
  spread: number[][];
  perSpread: number;
  versesOn: (page?: number[]) => Passage["verses"];
  onOpen: () => void;
  label: string;
  bodyRef: React.Ref<HTMLDivElement>;
  openMs: number;
  openRef: React.Ref<HTMLButtonElement>;
  pageHeight: number;
  leaf: number;
  reduced: boolean;
  turning: boolean;
  controlsRef: React.RefObject<SceneControls | null>;
};

function Scene({
  style,
  open,
  reading,
  book,
  passage,
  spread,
  perSpread,
  versesOn,
  onOpen,
  label,
  bodyRef,
  openMs: OPEN_MS,
  openRef,
  pageHeight,
  leaf,
  reduced,
  turning,
  controlsRef,
}: SceneProps) {
  // The moving leaf lives in the scene, so the reader stands aside for it.
  const showText = reading && !turning;
  const single = perSpread === 1;
  const versoIdx = leaf * perSpread;
  const versoVerses = versesOn(spread[0]);
  const rectoVerses = single ? [] : versesOn(spread[1]);

  return (
    <div className="relative z-10 grid flex-1 place-items-center" style={style}>
      <div className="relative" style={{ width: "var(--pw)", height: "var(--ph)" }}>
        {/* Contact shadow on the table, widening as the book opens out. */}
        <div
          aria-hidden
          className="absolute top-[88%] left-1/2 -z-10 rounded-[50%] blur-2xl"
          style={{
            width: open ? "calc(var(--pw) * 2.05)" : "calc(var(--pw) * 0.9)",
            height: "calc(var(--ph) * 0.16)",
            transform: `translateX(-50%) translateY(${open ? "4%" : "0"})`,
            background: "radial-gradient(closest-side, rgba(48,58,96,0.4), rgba(48,58,96,0))",
            transition: `all ${OPEN_MS}ms var(--ease-leather)`,
          }}
        />

        {/* The object itself. It holds the shelf, the opening and the closing;
            once the spread is flat it hands over to real text and steps back. */}
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: "calc(var(--pw) * 3)",
            height: "calc(var(--ph) * 1.6)",
            opacity: showText ? 0 : 1,
            transition: turning ? "none" : `opacity 340ms ease ${showText ? 120 : 0}ms`,
          }}
        >
          <BookScene
            open={open}
            active={!showText}
            book={book}
            pageHeightPx={pageHeight}
            reduced={reduced}
            controlsRef={controlsRef}
            className="h-full w-full"
          />
        </div>

        {/* Reading is a flat activity. Every dimensional trick lives in the
            scene above; here the text just needs to sit still and be read. */}
        <div
          aria-hidden={!showText}
          className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 rounded-[3px] p-[6px]"
          style={{
            opacity: showText ? 1 : 0,
            transition: turning ? "none" : `opacity 340ms ease ${showText ? 120 : 0}ms`,
            background: "linear-gradient(118deg, #10132f, #1b2050 58%, #0b0e24)",
            boxShadow: "0 18px 40px rgba(28,36,74,0.3)",
          }}
        >
          {!single && (
            <div
              className="overflow-hidden rounded-[3px_1px_1px_3px] bg-vellum"
              style={{ width: "var(--pw)", height: "var(--ph)" }}
            >
              <PageFace
                side="verso"
                book={book}
                chapter={passage.chapter}
                verses={versoVerses}
                folio={versoIdx + 1}
              />
            </div>
          )}
          <div
            className="overflow-hidden rounded-[1px_3px_3px_1px] bg-vellum"
            style={{ width: "var(--pw)", height: "var(--ph)" }}
          >
            <PageFace
              side={single ? "verso" : "recto"}
              book={book}
              chapter={passage.chapter}
              verses={single ? versoVerses : rectoVerses}
              folio={(single ? versoIdx : versoIdx + 1) + 1}
              bodyRef={bodyRef}
            />
          </div>
        </div>

        {/* The book is a canvas, so the affordance is a real button laid over
            it — keyboard reachable, and labelled with where it will open. */}
        <button
          ref={openRef}
          onClick={onOpen}
          disabled={open}
          aria-label={open ? undefined : `Open the Bible at ${label}`}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-sm disabled:pointer-events-none"
          style={{
            width: "calc(var(--pw) * 1.05)",
            height: "calc(var(--ph) * 1.05)",
            opacity: showText ? 0 : 1,
          }}
        />
      </div>
    </div>
  );
}
