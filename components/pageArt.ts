import type { Verse } from "@/lib/passage";

/**
 * A page, painted to a canvas so a leaf in the 3D scene can carry its own
 * text while it turns.
 *
 * This deliberately mirrors the CSS in Page.tsx — same margins, same measure,
 * same leading. The two only have to agree for the length of a turn, since the
 * DOM page takes over the moment the leaf lands, but they are a real pair: a
 * change to one belongs in the other.
 */

export type PageSpec = {
  verses: Verse[];
  chapter: number;
  book: string;
  folio: number;
  side: "verso" | "recto";
  /** CSS pixels; the canvas is drawn at twice this and scaled down. */
  width: number;
  height: number;
  bodyFont: string;
  showChrome: boolean;
};

const VELLUM = "#f6f1e4";
const INK = "#16181f";
const INK_SOFT = "#5b6070";
const INK_FAINT = "#5f6675";
const RUBRIC = "#a3372c";

const SCALE = 2;

type Token = { text: string; verse?: number; width: number };

export function drawPage(spec: PageSpec): HTMLCanvasElement {
  const { width: W, height: H } = spec;
  const c = document.createElement("canvas");
  c.width = W * SCALE;
  c.height = H * SCALE;
  const g = c.getContext("2d")!;
  g.scale(SCALE, SCALE);

  g.fillStyle = VELLUM;
  g.fillRect(0, 0, W, H);

  if (!spec.verses.length) return c; // a leaf the chapter never reached

  const padY = H * 0.07;
  const padInner = W * 0.06;
  const padOuter = W * 0.08;
  const left = spec.side === "verso" ? padOuter : padInner;
  const right = spec.side === "verso" ? padInner : padOuter;
  const measure = W - left - right;

  const size = Math.max(11, Math.min(16, W * 0.038));
  const leading = size * 1.66;
  const body = `${size}px ${spec.bodyFont}`;

  let y = padY;

  if (spec.showChrome) {
    y = drawRunningHead(g, spec, left, right, W, y, size);
  }

  /* --- Tokenise, carrying verse numbers as their own atoms -------------- */
  g.font = body;
  const tokens: Token[] = [];
  for (const v of spec.verses) {
    if (v.verse !== 1) {
      tokens.push({ text: String(v.verse), verse: v.verse, width: 0 });
    }
    for (const word of v.text.split(/\s+/).filter(Boolean)) {
      tokens.push({ text: word, width: 0 });
    }
  }
  const supSize = size * 0.68;
  for (const t of tokens) {
    g.font = t.verse ? `${supSize}px ${spec.bodyFont}` : body;
    t.width = g.measureText(t.text).width + (t.verse ? size * 0.28 : 0);
  }

  /* --- The chapter initial, if this page opens the chapter -------------- */
  const opensChapter = spec.verses[0]?.verse === 1;
  const capSize = size * 3.2;
  const capWidth = opensChapter ? capSize * 0.62 : 0;
  const capLines = opensChapter ? 2 : 0;

  if (opensChapter) {
    g.fillStyle = RUBRIC;
    g.font = `${capSize}px ${spec.bodyFont}`;
    g.textBaseline = "alphabetic";
    g.fillText(String(spec.chapter), left, y + capSize * 0.78);
  }

  /* --- Break into lines, then justify all but the last ------------------ */
  const space = g.measureText(" ").width;
  const bottom = H - padY - (spec.showChrome ? leading * 1.4 : 0);
  const lines: Token[][] = [];
  let line: Token[] = [];
  let used = 0;

  const widthFor = (n: number) => (n < capLines ? measure - capWidth : measure);

  for (const t of tokens) {
    const add = (line.length ? space : 0) + t.width;
    if (used + add > widthFor(lines.length) && line.length) {
      lines.push(line);
      line = [];
      used = 0;
      if (padY + (lines.length + 1) * leading > bottom) break;
    }
    line.push(t);
    used += (line.length > 1 ? space : 0) + t.width;
  }
  if (line.length) lines.push(line);

  g.textBaseline = "alphabetic";
  lines.forEach((row, i) => {
    const indent = i < capLines ? capWidth : 0;
    const avail = widthFor(i);
    const ink = row.reduce((sum, t) => sum + t.width, 0);
    const gaps = row.length - 1;
    const last = i === lines.length - 1;
    const gap = last || gaps <= 0 ? space : (avail - ink) / gaps;

    let x = left + indent;
    const baseline = y + (i + 1) * leading - leading * 0.28;

    for (const t of row) {
      if (t.verse) {
        g.font = `${supSize}px ${spec.bodyFont}`;
        g.fillStyle = RUBRIC;
        g.fillText(t.text, x, baseline - size * 0.34);
      } else {
        g.font = body;
        g.fillStyle = INK;
        g.fillText(t.text, x, baseline);
      }
      x += t.width + gap;
    }
  });

  if (spec.showChrome) {
    g.font = `${Math.max(12, size * 0.75)}px ${spec.bodyFont}`;
    g.fillStyle = INK_FAINT;
    g.textAlign = "center";
    g.fillText(String(spec.folio), W / 2, H - padY * 0.5);
    g.textAlign = "left";
  }

  gutter(g, spec.side, W, H);
  return c;
}

function drawRunningHead(
  g: CanvasRenderingContext2D,
  spec: PageSpec,
  left: number,
  right: number,
  W: number,
  y: number,
  size: number,
) {
  const first = spec.verses[0]?.verse;
  const last = spec.verses[spec.verses.length - 1]?.verse;
  const range = first === last ? `${spec.chapter}:${first}` : `${spec.chapter}:${first}–${last}`;
  const outer = spec.side === "verso" ? spec.book : range;
  const inner = spec.side === "verso" ? range : spec.book;

  const capSize = size * 0.62;
  g.font = `500 ${capSize}px ${spec.bodyFont}`;
  g.letterSpacing = `${capSize * 0.34}px`;
  g.textBaseline = "alphabetic";

  g.fillStyle = INK_SOFT;
  g.fillText(outer.toUpperCase(), left, y + capSize);
  g.fillStyle = INK_FAINT;
  g.textAlign = "right";
  g.fillText(inner.toUpperCase(), W - right, y + capSize);
  g.textAlign = "left";
  g.letterSpacing = "0px";

  const rule = y + capSize * 2.2;
  g.strokeStyle = "rgba(22,24,31,0.12)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(left, rule);
  g.lineTo(W - right, rule);
  g.stroke();

  return rule + capSize * 1.4;
}

/** The leaf dips into the gutter, so its inner edge sits in shadow. */
function gutter(g: CanvasRenderingContext2D, side: PageSpec["side"], W: number, H: number) {
  const band = W * 0.15;
  const grad =
    side === "verso"
      ? g.createLinearGradient(W - band, 0, W, 0)
      : g.createLinearGradient(band, 0, 0, 0);
  grad.addColorStop(0, "rgba(90,72,40,0)");
  grad.addColorStop(0.6, "rgba(90,72,40,0.08)");
  grad.addColorStop(1, "rgba(74,58,30,0.26)");
  g.fillStyle = grad;
  g.fillRect(side === "verso" ? W - band : 0, 0, band, H);
}
