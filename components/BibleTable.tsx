"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CANON, DIVISION_NOTE } from "@/lib/canon";
import { OPENING, type Passage } from "@/lib/passage";
import { usePagination } from "./usePagination";
import { BODY_TYPE, PageFace, VerseFlow } from "./Page";
import { useReducedMotion } from "./useReducedMotion";
import { CoverInside, CoverOutside } from "./Cover";
import { Chevron } from "./Chevron";

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
    (bookIdx: number, ch: number) => {
      const target = CANON[bookIdx];
      const bounded = Math.min(Math.max(ch, 1), target.chapters);
      setIndex(bookIdx);
      setChapter(bounded);
      setLeaf(0);
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

  const spread = spreads[Math.min(leaf, spreads.length - 1)] ?? [[]];
  const versesOn = (page?: number[]) => (page ?? []).map((i) => passage.verses[i]).filter(Boolean);
  const pageAt = (n: number) => (pages[n] ? versesOn(pages[n]) : []);

  const atStart = leaf === 0;
  const atEnd = leaf >= spreads.length - 1;
  const firstBook = index === 0 && chapter === 1;
  const lastBook = index === CANON.length - 1 && chapter === book.chapters;

  const turn = useCallback(
    (step: number) => {
      if (phase !== "reading") return;
      const next = leaf + step;
      if (next >= 0 && next < spreads.length) {
        setLeaf(next);
        return;
      }
      if (step > 0) {
        if (chapter < book.chapters) goTo(index, chapter + 1);
        else if (index < CANON.length - 1) goTo(index + 1, 1);
        return;
      }
      if (chapter > 1) goTo(index, chapter - 1);
      else if (index > 0) goTo(index - 1, CANON[index - 1].chapters);
    },
    [phase, leaf, spreads.length, chapter, book.chapters, index, goTo],
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
        book={book.name}
        chapter={chapter}
        passage={passage}
        spread={spread}
        pages={pages}
        leaf={leaf}
        perSpread={perSpread}
        versesOn={versesOn}
        pageAt={pageAt}
        onOpen={openBook}
        label={label}
        bodyRef={bodyRef}
        openMs={OPEN_MS}
        openRef={openRef}
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
          position={`${label} · ${leaf + 1} of ${spreads.length}`}
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
        <span className="label text-ink-soft">Holy Bible</span>
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
              className="label cursor-pointer rounded-sm border border-ink/15 bg-transparent py-1 pr-1 pl-2 text-ink hover:border-indigo/50"
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
          className="label text-ink-soft transition-colors hover:text-indigo disabled:pointer-events-none disabled:opacity-0"
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
          className="label pointer-events-auto mt-4 text-ink-faint transition-colors hover:text-indigo"
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
  book: string;
  chapter: number;
  passage: Passage;
  spread: number[][];
  pages: number[][];
  leaf: number;
  perSpread: number;
  versesOn: (page?: number[]) => Passage["verses"];
  pageAt: (n: number) => Passage["verses"];
  onOpen: () => void;
  label: string;
  bodyRef: React.Ref<HTMLDivElement>;
  openMs: number;
  openRef: React.Ref<HTMLButtonElement>;
};

function Scene({
  style,
  open,
  book,
  passage,
  spread,
  leaf,
  perSpread,
  versesOn,
  pageAt,
  onOpen,
  label,
  bodyRef,
  openMs: OPEN_MS,
  openRef,
}: SceneProps) {
  const versoIdx = leaf * perSpread;
  const rectoIdx = versoIdx + 1;
  const single = perSpread === 1;

  const versoVerses = versesOn(spread[0]);
  const rectoVerses = single ? [] : versesOn(spread[1]);

  return (
    <div
      className="relative z-10 grid flex-1 place-items-center"
      style={{ ...style, perspective: "2600px", perspectiveOrigin: "50% 44%" }}
    >
      <div className="relative" style={{ width: "var(--pw)", height: "var(--ph)" }}>
        {/* The book's shadow on the table, cast by the same high-left light. */}
        <div
          aria-hidden
          className="absolute top-[86%] left-1/2 -z-10 rounded-[50%] blur-2xl"
          style={{
            width: open ? "calc(var(--pw) * 2.05)" : "calc(var(--pw) * 0.95)",
            height: "calc(var(--ph) * 0.17)",
            transform: `translateX(${open ? "-50%" : "-46%"}) translateY(${open ? "6%" : "0"})`,
            background: "radial-gradient(closest-side, rgba(48,58,96,0.42), rgba(48,58,96,0))",
            transition: `all ${OPEN_MS}ms var(--ease-leather)`,
          }}
        />

        <div
          className="absolute top-0 left-1/2 h-full w-0"
          style={{
            transformStyle: "preserve-3d",
            transform:
              "translateX(calc(var(--pw) * var(--scale) / -2 * var(--offset, 0))) scale(var(--scale)) rotateX(var(--tilt-x)) rotateY(var(--tilt-y))",
            transformOrigin: "center center",
            transition: `transform ${OPEN_MS}ms var(--ease-leather)`,
            // The spine is the origin. Centre the spread on it once both
            // halves are showing; otherwise centre the single leaf instead.
            ["--offset" as string]: open && !single ? 0 : 1,
          }}
        >
          {/* ---- Left half: revealed only once the board swings clear ---- */}
          <Leaf
            visible={open && !single}
            delay={OPEN_MS * 0.42}
            style={{ transform: "translateX(calc(var(--pw) * -1)) translateZ(calc(var(--tk) / 2 + 9px))" }}
          >
            <PageFace
              side="verso"
              book={book}
              chapter={passage.chapter}
              verses={versoVerses}
              showThrough={pageAt(versoIdx - 1)}
              folio={versoIdx + 1}
            />
          </Leaf>

          {/* Gilding on the outer edge of the left half. */}
          <div
            aria-hidden
            className="gilt-edge absolute top-0 left-0"
            style={{
              width: "var(--tk)",
              height: "var(--ph)",
              transformOrigin: "left center",
              transform:
                "translateX(calc(var(--pw) * -1)) translateZ(calc(var(--tk) / 2 + 8px)) rotateY(90deg) scaleX(-1)",
              opacity: open && !single ? 1 : 0,
              transition: `opacity 400ms ease ${open ? OPEN_MS * 0.5 : 0}ms`,
            }}
          />

          {/* ---- Right half: the top leaf of the block ---- */}
          <div
            className="absolute top-0 left-0 overflow-hidden rounded-[2px_4px_4px_2px] bg-vellum"
            style={{
              width: "var(--pw)",
              height: "var(--ph)",
              transform: "translateZ(calc(var(--tk) / 2 - 1px))",
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
            }}
          >
            <div
              aria-hidden={!open}
              className="h-full transition-opacity duration-500"
              style={{ opacity: open ? 1 : 0, transitionDelay: open ? `${OPEN_MS * 0.5}ms` : "0ms" }}
            >
              <PageFace
                side={single ? "verso" : "recto"}
                book={book}
                chapter={passage.chapter}
                verses={single ? versoVerses : rectoVerses}
                showThrough={pageAt(rectoIdx + 1)}
                folio={(single ? versoIdx : rectoIdx) + 1}
                bodyRef={bodyRef}
              />
            </div>
          </div>

          {/* Gilding on the fore-edge. */}
          <div
            aria-hidden
            className="gilt-edge absolute top-0 left-0"
            style={{
              width: "var(--tk)",
              height: "var(--ph)",
              transformOrigin: "left center",
              transform: "translateX(var(--pw)) translateZ(calc(var(--tk) / 2)) rotateY(90deg)",
            }}
          />
          {/* Gilding on the head. */}
          <div
            aria-hidden
            className="gilt-edge-head absolute top-0 left-0"
            style={{
              width: "var(--pw)",
              height: "var(--tk)",
              transformOrigin: "center top",
              transform: "translateZ(calc(var(--tk) / 2)) rotateX(-90deg)",
              filter: "brightness(1.14)",
            }}
          />

          {/* ---- Spine ---- */}
          <div
            aria-hidden
            className="absolute top-0 left-0 overflow-hidden"
            style={{
              width: "var(--tk)",
              height: "var(--ph)",
              transformOrigin: "left center",
              transform: "translateZ(calc(var(--tk) / -2)) rotateY(-90deg)",
              background: "linear-gradient(90deg, #0a0d22, #232a63 40%, #11142f)",
              boxShadow: "inset 0 0 0 1px rgba(201,162,39,0.18)",
            }}
          >
            <div className="grain-leather absolute inset-0 opacity-30 mix-blend-overlay" />
          </div>

          {/* ---- Front board ---- */}
          <button
            ref={openRef}
            onClick={onOpen}
            disabled={open}
            aria-label={open ? undefined : `Open the Bible at ${label}`}
            className="group absolute top-0 left-0 cursor-pointer disabled:cursor-default"
            style={{
              width: "calc(var(--pw) + var(--sq))",
              height: "calc(var(--ph) + var(--sq) * 2)",
              marginTop: "calc(var(--sq) * -1)",
              transformStyle: "preserve-3d",
              transformOrigin: "left center",
              transform: "translateZ(calc(var(--tk) / 2 + 1px)) rotateY(var(--cover))",
              // With one leaf showing there is no facing page for the board to
              // land on, so it goes once it has swung past the spine.
              opacity: open && single ? 0 : 1,
              transition: `transform ${OPEN_MS}ms var(--ease-leather), opacity 300ms linear ${
                open ? OPEN_MS * 0.55 : 0
              }ms`,
            }}
          >
            <div
              className="absolute inset-0 transition-transform duration-500 ease-out group-enabled:group-hover:translate-y-[-6px]"
              style={{ transformStyle: "preserve-3d" }}
            >
              <div className="absolute inset-0 [backface-visibility:hidden]">
                <CoverOutside book={book} />
              </div>
              <div
                className="absolute inset-0 [backface-visibility:hidden]"
                style={{ transform: "rotateY(180deg)" }}
              >
                <CoverInside />
              </div>
            </div>
          </button>

          {/* ---- Back board ---- */}
          <div
            aria-hidden
            className="absolute top-0 left-0 rounded-[3px_7px_7px_3px]"
            style={{
              width: "calc(var(--pw) + var(--sq))",
              height: "calc(var(--ph) + var(--sq) * 2)",
              marginTop: "calc(var(--sq) * -1)",
              transform: "translateZ(calc(var(--tk) / -2 - 1px))",
              background: "linear-gradient(118deg, #0d1029, #1b2050 60%, #0b0e24)",
            }}
          >
            <div className="grain-leather absolute inset-0 opacity-30 mix-blend-overlay" />
          </div>

        </div>

      </div>
    </div>
  );
}

function Leaf({
  visible,
  delay,
  style,
  children,
}: {
  visible: boolean;
  delay: number;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute top-0 left-0 overflow-hidden rounded-[4px_2px_2px_4px] bg-vellum"
      style={{
        width: "var(--pw)",
        height: "var(--ph)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        opacity: visible ? 1 : 0,
        transition: `opacity 420ms ease ${visible ? delay : 0}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
