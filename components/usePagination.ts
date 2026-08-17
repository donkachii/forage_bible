"use client";

import { useEffect, useRef, useState } from "react";
import type { Verse } from "@/lib/passage";

/**
 * Lays the chapter out off-screen at the real page width, then reads back
 * where each verse's first line lands. Verses are inline, so a verse's
 * offsetTop is the top of the line it starts on — enough to find the break
 * without measuring every line box.
 *
 * Returns pages of verse indices, two of which make a spread.
 */
export function usePagination(verses: Verse[], pageWidth: number, pageHeight: number) {
  const measurer = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([]);

  useEffect(() => {
    const node = measurer.current;
    if (!node || !verses.length || pageHeight <= 0 || pageWidth <= 0) return;

    let frame = 0;

    const measure = () => {
      const marks = Array.from(node.querySelectorAll<HTMLElement>("[data-verse]"));
      if (marks.length !== verses.length) return;

      const built: number[][] = [];
      let current: number[] = [];
      let pageTop = 0;

      marks.forEach((mark, i) => {
        const bottom = mark.offsetTop + mark.offsetHeight;
        const overflows = mark.offsetTop - pageTop > 0 && bottom - pageTop > pageHeight;

        if (overflows && current.length) {
          built.push(current);
          current = [];
          pageTop = mark.offsetTop;
        }
        current.push(i);
      });

      if (current.length) built.push(current);
      setPages(built);
    };

    // Wait for the webfont so measurements match what finally renders.
    const start = () => {
      frame = requestAnimationFrame(measure);
    };
    if (document.fonts?.status === "loaded") start();
    else document.fonts?.ready.then(start).catch(start);

    return () => cancelAnimationFrame(frame);
  }, [verses, pageWidth, pageHeight]);

  return { measurer, pages };
}
