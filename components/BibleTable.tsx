"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CANON, DIVISION_NOTE } from "@/lib/canon";
import { OPENING, type Passage, type Verse } from "@/lib/passage";
import { usePagination } from "./usePagination";
import { BODY_TYPE, PageFace, VerseFlow } from "./Page";
import { useReducedMotion } from "./useReducedMotion";
import { Chevron } from "./Chevron";
import { drawPage } from "./pageArt";
import Contents from "./Contents";
import { BooksIcon } from "./BooksIcon";
import type { SceneControls, TurnArt } from "./BookScene";

// WebGL touches document on construction, so it stays out of the server pass.
const BookScene = dynamic(() => import("./BookScene"), { ssr: false });

type Phase = "shelf" | "opening" | "reading" | "closing";

/** Stable empty list: usePagination keys its effect on the array identity. */
const NO_VERSES: Verse[] = [];

const versesOf = (psg: Passage, page?: number[]) =>
  (page ?? []).map((i) => psg.verses[i]).filter(Boolean);

function toSpreads(pages: number[][], verses: Verse[], perSpread: number) {
  const source = pages.length ? pages : [verses.map((_, i) => i)];
  const out: number[][][] = [];
  for (let i = 0; i < source.length; i += perSpread) out.push(source.slice(i, i + perSpread));
  return out.length ? out : [[[]]];
}

/** The chapter one step away, crossing into the next book where it must. */
function neighbour(index: number, chapter: number, step: number) {
  if (step > 0) {
    if (chapter < CANON[index].chapters) return { index, chapter: chapter + 1 };
    return index < CANON.length - 1 ? { index: index + 1, chapter: 1 } : null;
  }
  if (chapter > 1) return { index, chapter: chapter - 1 };
  return index > 0 ? { index: index - 1, chapter: CANON[index - 1].chapters } : null;
}

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
  const [contentsOpen, setContentsOpen] = useState(false);
  const stageRef = useRef<SceneControls | null>(null);
  const contentsRef = useRef<HTMLButtonElement>(null);

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

  /**
   * Hands focus back to a control after something above it unmounts. The
   * browser resets focus to the body for the removed element on its own
   * account, and that lands after our first attempt — so take it back once
   * it has.
   */
  const restoreFocus = useCallback((to: React.RefObject<HTMLButtonElement | null>) => {
    // Deliberately not requestAnimationFrame: a throttled tab can hold a frame
    // callback for a second or more, and where the keyboard lands should not
    // wait on the animation clock.
    setTimeout(() => {
      to.current?.focus();
      setTimeout(() => {
        if (document.activeElement === document.body) to.current?.focus();
      }, 80);
    }, 0);
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
  // Chapters never change, so once fetched one is kept. The route is already
  // immutable-cached; this saves the round trip as well.
  const cache = useRef(new Map<string, Passage>());
  const [neighbours, setNeighbours] = useState<{ prev: Passage | null; next: Passage | null }>({
    prev: null,
    next: null,
  });

  const pull = useCallback(async (name: string, ch: number): Promise<Passage | null> => {
    const key = `${name}|${ch}`;
    const held = cache.current.get(key);
    if (held) return held;
    try {
      const res = await fetch(`/api/passage?book=${encodeURIComponent(name)}&chapter=${ch}`);
      const body = await res.json();
      if (!res.ok) return null;
      cache.current.set(key, body as Passage);
      return body as Passage;
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(
    async (name: string, ch: number) => {
      setLoading(true);
      setError(null);
      const got = await pull(name, ch);
      if (got) setPassage(got);
      else setError("The text didn’t load. Check your connection, then try again.");
      setLoading(false);
    },
    [pull],
  );

  // Fetch what this chapter can turn into, so a leaf crossing a boundary has
  // the neighbour's text ready to carry rather than stalling the gesture.
  useEffect(() => {
    if (phase !== "reading") return;
    let alive = true;
    const back = neighbour(index, chapter, -1);
    const on = neighbour(index, chapter, 1);
    void Promise.all([
      back ? pull(CANON[back.index].name, back.chapter) : null,
      on ? pull(CANON[on.index].name, on.chapter) : null,
    ]).then(([prev, next]) => {
      if (alive) setNeighbours({ prev, next });
    });
    return () => {
      alive = false;
    };
  }, [phase, index, chapter, pull]);

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

  // Three chapters are measured at once: the one being read, and the two it
  // can turn into. A leaf crossing a chapter boundary carries the neighbour's
  // text on its back, so that text has to be paginated before the turn starts.
  const layoutHere = usePagination(passage.verses, column.w, column.h);
  const layoutBefore = usePagination(neighbours.prev?.verses ?? NO_VERSES, column.w, column.h);
  const layoutAfter = usePagination(neighbours.next?.verses ?? NO_VERSES, column.w, column.h);

  const spreads = useMemo(
    () => toSpreads(layoutHere.pages, passage.verses, perSpread),
    [layoutHere.pages, passage.verses, perSpread],
  );
  // A neighbour is only usable once actually measured; the un-paginated
  // fallback would hand back one impossibly long spread.
  const spreadsBefore = useMemo(
    () => (layoutBefore.pages.length ? toSpreads(layoutBefore.pages, NO_VERSES, perSpread) : null),
    [layoutBefore.pages, perSpread],
  );
  const spreadsAfter = useMemo(
    () => (layoutAfter.pages.length ? toSpreads(layoutAfter.pages, NO_VERSES, perSpread) : null),
    [layoutAfter.pages, perSpread],
  );

  // Re-measuring can leave fewer spreads than the leaf we are sitting on —
  // a resize mid-chapter, or the webfont landing after the first pass. Every
  // read of the position goes through the clamp, so the footer can never
  // claim to be on page 3 of 2 while the pages settle.
  const currentLeaf = Math.min(leaf, spreads.length - 1);
  const spread = spreads[currentLeaf] ?? [[]];
  const versesOn = (page?: number[]) => versesOf(passage, page);

  const atStart = currentLeaf === 0;
  const atEnd = currentLeaf >= spreads.length - 1;
  const firstBook = index === 0 && chapter === 1;
  const lastBook = index === CANON.length - 1 && chapter === book.chapters;

  /** Paints one page of any chapter at the size the scene draws it. */
  const paint = useCallback(
    (psg: Passage, page: number[] | undefined, side: "verso" | "recto", folio: number) =>
      drawPage({
        verses: versesOf(psg, page),
        chapter: psg.chapter,
        book: psg.book,
        folio,
        side,
        width: dims.pw,
        height: dims.ph,
        bodyFont: bodyRef.current
          ? getComputedStyle(bodyRef.current).fontFamily
          : "Garamond, serif",
        showChrome: (page ?? []).length > 0,
      }),
    [dims.pw, dims.ph],
  );

  /**
   * Works out what a turn in this direction would move, without moving it.
   * Both the arrows and a dragged page run through here, so a turn is defined
   * in one place and only the way it is driven differs.
   *
   * Returns null when the scene cannot carry it — reduced motion, or a
   * neighbouring chapter that has not arrived yet — and the caller cuts.
   */
  const planTurn = useCallback(
    (step: number): { art: TurnArt; forward: boolean; commit: () => void } | null => {
      if (!stageRef.current || reduced || dims.single) return null;
      const forward = step > 0;
      const nextLeaf = currentLeaf + step;
      const folio = (l: number, recto: boolean) => l * 2 + (recto ? 2 : 1);

      // Within the chapter: the recto you are on lifts, its reverse is the new
      // verso, and the new recto is already lying underneath. Backward mirrors.
      if (nextLeaf >= 0 && nextLeaf < spreads.length) {
        const from = spreads[currentLeaf] ?? [];
        const to = spreads[nextLeaf] ?? [];
        const art = forward
          ? {
              front: paint(passage, from[1], "recto", folio(currentLeaf, true)),
              back: paint(passage, to[0], "verso", folio(nextLeaf, false)),
              under: {
                left: paint(passage, from[0], "verso", folio(currentLeaf, false)),
                right: paint(passage, to[1], "recto", folio(nextLeaf, true)),
              },
            }
          : {
              front: paint(passage, to[1], "recto", folio(nextLeaf, true)),
              back: paint(passage, from[0], "verso", folio(currentLeaf, false)),
              under: {
                left: paint(passage, to[0], "verso", folio(nextLeaf, false)),
                right: paint(passage, from[1], "recto", folio(currentLeaf, true)),
              },
            };
        return { art, forward, commit: () => setLeaf(nextLeaf) };
      }

      // Across a chapter boundary, the leaf spans two chapters at once.
      const hop = neighbour(index, chapter, step);
      const psg = forward ? neighbours.next : neighbours.prev;
      const side = forward ? spreadsAfter : spreadsBefore;
      if (!hop || !psg || !side?.length) return null;

      const from = spreads[currentLeaf] ?? [];
      const landing = forward ? 0 : side.length - 1;
      const to = side[landing] ?? [];
      const art = forward
        ? {
            front: paint(passage, from[1], "recto", folio(currentLeaf, true)),
            back: paint(psg, to[0], "verso", folio(landing, false)),
            under: {
              left: paint(passage, from[0], "verso", folio(currentLeaf, false)),
              right: paint(psg, to[1], "recto", folio(landing, true)),
            },
          }
        : {
            front: paint(psg, to[1], "recto", folio(landing, true)),
            back: paint(passage, from[0], "verso", folio(currentLeaf, false)),
            under: {
              left: paint(psg, to[0], "verso", folio(landing, false)),
              right: paint(passage, from[1], "recto", folio(currentLeaf, true)),
            },
          };
      // Backward lands on the previous chapter's last page, which the leaf
      // clamp already resolves once the new chapter is measured.
      return { art, forward, commit: () => goTo(hop.index, hop.chapter, !forward) };
    },
    [
      reduced, dims.single, currentLeaf, spreads, passage, paint, index, chapter,
      neighbours.next, neighbours.prev, spreadsAfter, spreadsBefore, goTo,
    ],
  );

  /** The plain cut, for when the scene cannot carry the turn. */
  const jump = useCallback(
    (step: number) => {
      const nextLeaf = currentLeaf + step;
      if (nextLeaf >= 0 && nextLeaf < spreads.length) {
        setLeaf(nextLeaf);
        return;
      }
      const hop = neighbour(index, chapter, step);
      if (hop) goTo(hop.index, hop.chapter, step < 0);
    },
    [currentLeaf, spreads.length, index, chapter, goTo],
  );

  const turn = useCallback(
    (step: number) => {
      if (phase !== "reading" || turning) return;
      const scene = stageRef.current;
      const plan = planTurn(step);
      if (!scene || !plan) {
        jump(step);
        return;
      }
      setTurning(true);
      void scene.turn(plan.art, plan.forward).then(() => {
        plan.commit();
        setTurning(false);
      });
    },
    [phase, turning, planTurn, jump],
  );

  /* --- Dragging a page ---------------------------------------------------- */
  /**
   * The leaf pivots at the spine and its free edge sweeps a half circle, so
   * the pointer maps to the *angle*, not to a linear distance across the page.
   * Anything linear makes the page lag the cursor badly near the extremes.
   */
  const progressAt = (clientX: number, spine: number, width: number, forward: boolean) => {
    const across = Math.min(1, Math.max(-1, (clientX - spine) / width));
    const raw = Math.acos(across) / Math.PI; // edge right → 0, spine → ½, left → 1
    return forward ? raw : 1 - raw;
  };

  const spreadRef = useRef<HTMLDivElement>(null);
  const held = useRef<{
    id: number;
    commit: () => void;
    forward: boolean;
    spine: number;
    width: number;
    trail: { x: number; t: number }[];
    p: number;
  } | null>(null);

  const takePage = useCallback(
    (e: React.PointerEvent, forward: boolean) => {
      if (phase !== "reading" || turning || held.current) return;
      const host = spreadRef.current;
      const scene = stageRef.current;
      if (!host || !scene) return;
      const plan = planTurn(forward ? 1 : -1);
      if (!plan) return; // no scene, reduced motion, or a neighbour still loading

      const box = host.getBoundingClientRect();
      const spine = box.left + box.width / 2;
      const p = progressAt(e.clientX, spine, dims.pw, plan.forward);

      // Capture keeps a drag tracking after it leaves the handle. It can be
      // refused, and the turn should still work if it is.
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* not fatal — the handlers are on the element either way */
      }
      setTurning(true);
      scene.grab(plan.art, plan.forward);
      scene.drag(p);
      held.current = {
        id: e.pointerId,
        commit: plan.commit,
        forward: plan.forward,
        spine,
        width: dims.pw,
        trail: [{ x: e.clientX, t: performance.now() }],
        p,
      };
    },
    [phase, turning, planTurn, dims.pw],
  );

  const movePage = useCallback((e: React.PointerEvent) => {
    const grip = held.current;
    if (!grip || grip.id !== e.pointerId) return;
    grip.p = progressAt(e.clientX, grip.spine, grip.width, grip.forward);
    grip.trail.push({ x: e.clientX, t: performance.now() });
    if (grip.trail.length > 8) grip.trail.shift();
    stageRef.current?.drag(grip.p);
  }, []);

  const dropPage = useCallback((e: React.PointerEvent) => {
    const grip = held.current;
    if (!grip || grip.id !== e.pointerId) return;
    held.current = null;
    const scene = stageRef.current;
    if (!scene) {
      setTurning(false);
      return;
    }

    // Velocity in progress per second, measured over the last stretch of
    // travel — the scene decides in its own units and never sees pixels.
    const now = performance.now();
    const from = grip.trail.find((s) => now - s.t < 90) ?? grip.trail[0];
    const seconds = Math.max(16, now - from.t) / 1000;
    const travelled =
      progressAt(e.clientX, grip.spine, grip.width, grip.forward) -
      progressAt(from.x, grip.spine, grip.width, grip.forward);

    void scene.release(grip.p, travelled / seconds).then((completed) => {
      if (completed) grip.commit();
      setTurning(false);
    });
  }, []);

  /* --- Keyboard ----------------------------------------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "SELECT" || tag === "INPUT") return;
      // The contents list handles its own keys; arrows must not cycle the
      // shelf underneath it.
      if (contentsOpen) return;

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
  }, [phase, shiftBook, turn, closeBook, contentsOpen]);

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
        onContents={() => setContentsOpen(true)}
        contentsRef={contentsRef}
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
        spreadRef={spreadRef}
        onGrab={takePage}
        onDragMove={movePage}
        onDrop={dropPage}
      />

      {/* Off-screen twins: the chapter being read, and the two it can turn
          into. A leaf crossing a boundary needs the neighbour already
          measured, so all three are laid out at the real column width. */}
      {(
        [
          [layoutHere.measurer, passage] as const,
          [layoutBefore.measurer, neighbours.prev] as const,
          [layoutAfter.measurer, neighbours.next] as const,
        ] as const
      ).map(([ref, psg], i) => (
        <div
          key={i}
          ref={ref}
          aria-hidden
          className={`pointer-events-none invisible absolute -top-[9999px] left-0 ${BODY_TYPE}`}
          style={{ width: column.w || 1 }}
        >
          {psg && <VerseFlow verses={psg.verses} chapter={psg.chapter} />}
        </div>
      ))}

      {phase === "shelf" || phase === "closing" ? (
        <Shelf
          book={book}
          onShift={shiftBook}
          onOpen={openBook}
          onContents={() => setContentsOpen(true)}
          dimmed={phase === "closing"}
        />
      ) : (
        <Turner
          onTurn={turn}
          atStart={atStart && firstBook}
          atEnd={atEnd && lastBook}
          position={`${label} · ${currentLeaf + 1} of ${spreads.length}`}
          loading={loading}
        />
      )}

      {contentsOpen && (
        <Contents
          current={index}
          onPick={(next) => {
            setContentsOpen(false);
            // Reading: turn straight to the book. On the shelf: set it down in
            // front of you and let the cover restamp, so opening stays the
            // deliberate act it is everywhere else.
            if (phase === "reading") goTo(next, 1);
            else setIndex(next);
            restoreFocus(contentsRef);
          }}
          onClose={() => {
            setContentsOpen(false);
            restoreFocus(contentsRef);
          }}
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
  onContents,
  contentsRef,
}: {
  phase: Phase;
  book: (typeof CANON)[number];
  chapter: number;
  onClose: () => void;
  onChapter: (ch: number) => void;
  closeRef: React.Ref<HTMLButtonElement>;
  onContents: () => void;
  contentsRef: React.Ref<HTMLButtonElement>;
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
        {/* Bordered and iconed so it cannot be mistaken for the wordmark
            beside it, which is set in exactly the same type. */}
        <button
          ref={contentsRef}
          onClick={onContents}
          aria-label="All 66 books"
          className="label flex min-h-11 items-center gap-2 rounded-sm border border-ink/20 px-2.5 text-ink-soft transition-colors hover:border-indigo/50 hover:text-indigo"
        >
          <BooksIcon className="size-3.5 shrink-0" />
          <span className="hidden md:inline">All 66 books</span>
        </button>
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
  onContents,
  dimmed,
}: {
  book: (typeof CANON)[number];
  onShift: (step: number) => void;
  onOpen: () => void;
  onContents: () => void;
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

        {/* The arrows imply movement but never say how far it goes, and
            "Contents" alone does not tell you it holds the whole canon. */}
        <div>
          <button
            onClick={onContents}
            className="label pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-sm border border-ink/20 px-3.5 text-ink-soft transition-colors hover:border-indigo/50 hover:text-indigo"
          >
            <BooksIcon className="size-3.5 shrink-0" />
            All 66 books
          </button>
        </div>
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
  spreadRef: React.Ref<HTMLDivElement>;
  onGrab: (e: React.PointerEvent, forward: boolean) => void;
  onDragMove: (e: React.PointerEvent) => void;
  onDrop: (e: React.PointerEvent) => void;
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
  spreadRef,
  onGrab,
  onDragMove,
  onDrop,
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
          ref={spreadRef}
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

          {/* You grab a page by its outer edge, not by its middle — which is
              also what keeps the text underneath selectable. Pointer events so
              mouse and touch are one path; capture so a drag that leaves the
              handle still tracks. */}
          {!single &&
            ([
              ["left-0 rounded-l-[3px]", false] as const,
              ["right-0 rounded-r-[3px]", true] as const,
            ] as const).map(([edge, forward]) => (
              <div
                key={edge}
                aria-hidden
                onPointerDown={(e) => onGrab(e, forward)}
                onPointerMove={onDragMove}
                onPointerUp={onDrop}
                onPointerCancel={onDrop}
                className={`absolute inset-y-0 cursor-grab active:cursor-grabbing ${edge}`}
                style={{ width: "calc(var(--pw) * 0.28)", touchAction: "none" }}
              />
            ))}
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
