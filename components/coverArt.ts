/**
 * The cover is painted to a canvas rather than shipped as an image, so the
 * book on the shelf can restamp its own foil when you turn to another book.
 *
 * Two canvases come out of one pass: the colour map, and a mask marking which
 * pixels are gold. The mask drives metalness, which is what lets the foil
 * catch the environment while the leather around it stays matte.
 */

const W = 1024;
const H = 1414; // 1 : 1.38, the proportion the page block is cut to

const GILT = "#e8d18f";
const GILT_DIM = "#c9a227";

type Faces = { colour: HTMLCanvasElement; metal: HTMLCanvasElement };

export function drawCover(book: string): Faces {
  const colour = document.createElement("canvas");
  const metal = document.createElement("canvas");
  for (const c of [colour, metal]) {
    c.width = W;
    c.height = H;
  }

  const g = colour.getContext("2d")!;
  const m = metal.getContext("2d")!;

  // Leather, lit from high left the way the room is.
  const base = g.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#161a3d");
  base.addColorStop(0.34, "#1b2050");
  base.addColorStop(0.58, "#0d1029");
  base.addColorStop(0.78, "#191e46");
  base.addColorStop(1, "#0b0e24");
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);

  grain(g);

  m.fillStyle = "#000";
  m.fillRect(0, 0, W, H);

  // Blind-tooled rules, inset from the edge the way a binder sets them.
  frame(g, m, 0.055 * W, 0.04 * H, W - 0.11 * W, H - 0.08 * H, 2.5, 0.42);
  frame(g, m, 0.074 * W, 0.054 * H, W - 0.148 * W, H - 0.108 * H, 1.5, 0.2);

  const mid = W / 2;

  rule(g, m, mid, H * 0.4);
  stamp(g, m, "HOLY", mid, H * 0.47, 92, 0.3);
  stamp(g, m, "BIBLE", mid, H * 0.545, 92, 0.3);
  rule(g, m, mid, H * 0.6);
  stamp(g, m, book.toUpperCase(), mid, H * 0.66, 30, 0.34, 0.85);

  // The imprint, at the foot of the board.
  stamp(g, m, "FOREDGE", mid, H * 0.935, 22, 0.34, 0.5);

  return { colour, metal };
}

/** Fine speckle, so the leather is never a flat wash under raking light. */
function grain(g: CanvasRenderingContext2D) {
  const img = g.getImageData(0, 0, W, H);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    px[i] += n;
    px[i + 1] += n;
    px[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

function frame(
  g: CanvasRenderingContext2D,
  m: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  width: number,
  alpha: number,
) {
  g.strokeStyle = `rgba(201,162,39,${alpha})`;
  g.lineWidth = width;
  g.strokeRect(x, y, w, h);
  m.strokeStyle = `rgba(255,255,255,${alpha})`;
  m.lineWidth = width;
  m.strokeRect(x, y, w, h);
}

/** A hairline broken by a lozenge, the ornament the cover already used. */
function rule(g: CanvasRenderingContext2D, m: CanvasRenderingContext2D, cx: number, y: number) {
  const reach = W * 0.17;
  const gap = 16;
  for (const ctx of [g, m]) {
    const gold = ctx === g;
    const grad = ctx.createLinearGradient(cx - reach, 0, cx + reach, 0);
    const edge = gold ? "rgba(201,162,39,0)" : "rgba(255,255,255,0)";
    const core = gold ? "rgba(201,162,39,0.62)" : "rgba(255,255,255,0.62)";
    grad.addColorStop(0, edge);
    grad.addColorStop(0.5, core);
    grad.addColorStop(1, edge);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - reach, y);
    ctx.lineTo(cx - gap, y);
    ctx.moveTo(cx + gap, y);
    ctx.lineTo(cx + reach, y);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = gold ? GILT_DIM : "#fff";
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
  }
}

function stamp(
  g: CanvasRenderingContext2D,
  m: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  size: number,
  tracking: number,
  alpha = 1,
) {
  for (const ctx of [g, m]) {
    ctx.save();
    ctx.font = `500 ${size}px "Bodoni Moda", Didot, Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = `${size * tracking}px`;
    ctx.fillStyle = ctx === g ? GILT : `rgba(255,255,255,${alpha})`;
    if (ctx === g) {
      ctx.globalAlpha = alpha;
      ctx.shadowColor = "rgba(0,0,0,0.65)";
      ctx.shadowOffsetY = 1.5;
      ctx.shadowBlur = 3;
    }
    // Tracking pushes the run right by one space; pull it back to stay centred.
    ctx.fillText(text, cx - (size * tracking) / 2, y);
    ctx.restore();
  }
}

/** Gold leaf on the three cut edges, striated so each leaf reads separately. */
export function drawGilt(across: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = across ? 512 : 64;
  c.height = across ? 64 : 512;
  const g = c.getContext("2d")!;

  const run = across ? c.width : c.height;
  const grad = across
    ? g.createLinearGradient(0, 0, 0, c.height)
    : g.createLinearGradient(0, 0, c.width, 0);
  grad.addColorStop(0, "#8a6a12");
  grad.addColorStop(0.28, "#f2e0a4");
  grad.addColorStop(0.52, "#c9a227");
  grad.addColorStop(0.74, "#efdb99");
  grad.addColorStop(1, "#7d5f10");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);

  // One line per leaf, running across the stack.
  for (let i = 0; i < run; i += 2) {
    g.fillStyle = i % 4 === 0 ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.16)";
    if (across) g.fillRect(i, 0, 1, c.height);
    else g.fillRect(0, i, c.width, 1);
  }
  return c;
}
