"use client";

import { useEffect, useState } from "react";

/**
 * CSS can flatten the transitions on its own, but the open and close are also
 * timed in JavaScript, so the choreography has to know too.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}
