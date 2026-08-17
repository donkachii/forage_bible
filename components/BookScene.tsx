"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { drawCover, drawGilt } from "./coverArt";

/**
 * The book as a real object: boards, a sewn block, gilded edges, lit by one
 * window-shaped source. The depth buffer decides what covers what, so none of
 * the CSS-3D constraints apply here — the board can splay past flat and the
 * left page still sorts correctly against it.
 *
 * The camera is framed from a pixel height rather than a fixed distance, so
 * the open book lands at the same size as the DOM spread it hands over to.
 */

const PAGE_W = 1;
const PAGE_H = 1.38;
const THICK = 0.13;
const SQUARE = 0.014; // the boards' overhang on the three outer edges
const BOARD = 0.018;

export type TurnArt = {
  /** The leaf's own two sides: what you were reading, and its reverse. */
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** What is already lying underneath on either side. */
  under: { left: HTMLCanvasElement; right: HTMLCanvasElement };
};

export type SceneControls = {
  /** Runs one leaf across the gutter. Resolves when it has landed. */
  turn: (art: TurnArt, forward: boolean) => Promise<void>;
};

type Props = {
  open: boolean;
  /** False once the reader has taken over, so the loop can stand down. */
  active: boolean;
  book: string;
  /** On-screen height of one page when open, in CSS pixels. */
  pageHeightPx: number;
  reduced: boolean;
  controlsRef: React.RefObject<SceneControls | null>;
  className?: string;
};

/**
 * Curls a leaf about the spine. Paper does not bend evenly: it bows most near
 * the free edge, the lower corner trails the upper one, and the whole leaf
 * shortens across the chord as it rises. Without this a turning page reads as
 * a swinging board.
 */
function bendable(material: THREE.Material, bend: { value: number }) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBend = bend;
    shader.vertexShader =
      "uniform float uBend;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float u = (position.x / ${PAGE_W.toFixed(1)}) + 0.5;
         float v = (position.y / ${PAGE_H.toFixed(2)}) + 0.5;
         // The corner you would actually lift lags behind the head of the leaf.
         float lag = mix(1.25, 0.7, v);
         transformed.z += sin(u * 3.14159265) * uBend * lag;
         // Bowing pulls the free edge back towards the spine.
         transformed.x -= (1.0 - cos(u * 1.5707963)) * uBend * 0.36;
         // ...and the leaf is never quite square to the spine while it moves.
         transformed.y += u * u * uBend * (v - 0.5) * 0.5;`,
      );
  };
}

/**
 * A page is lifted at roughly a steady rate and then let go. The fall is the
 * part that sells it, so the second half accelerates and settles rather than
 * easing symmetrically into place.
 */
function turnEase(p: number) {
  if (p < 0.58) {
    const t = p / 0.58;
    return 0.52 * (1 - Math.pow(1 - t, 1.7));
  }
  const t = (p - 0.58) / 0.42;
  const fall = 0.52 + 0.48 * Math.pow(t, 1.9);
  // A shallow settle as the leaf meets the stack.
  return fall + Math.sin(t * Math.PI) * 0.035 * (1 - t);
}

export default function BookScene({
  open,
  active,
  book,
  pageHeightPx,
  reduced,
  controlsRef,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setOpen: (v: boolean, immediate: boolean) => void;
    setBook: (name: string) => void;
    setFrame: (px: number) => void;
    setActive: (v: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

    /* --- The room, as something the gold can reflect --------------------- */
    // A gradient sky: bright above, cool floor below. Gold is almost entirely
    // reflection, so without this the gilding reads as flat yellow paint.
    const sky = document.createElement("canvas");
    sky.width = 16;
    sky.height = 256;
    const sg = sky.getContext("2d")!;
    const grad = sg.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.42, "#e8ecf6");
    grad.addColorStop(0.62, "#b9c1d6");
    grad.addColorStop(1, "#5c6478");
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 16, 256);
    const skyTex = new THREE.CanvasTexture(sky);
    skyTex.mapping = THREE.EquirectangularReflectionMapping;
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(skyTex).texture;
    pmrem.dispose();
    skyTex.dispose();

    // Key from high left, the direction the room's gradient already implies.
    const key = new THREE.DirectionalLight(0xfff6e8, 2.9);
    key.position.set(-2.6, 3.2, 3.2);
    scene.add(key);

    // Gold is nearly all reflection, and the fore-edge faces right — away from
    // the key. Without this it reads as brown paint, which is the whole reason
    // the closed book is turned to show that edge in the first place.
    const rake = new THREE.DirectionalLight(0xfff1d6, 2.2);
    rake.position.set(3.6, 1.2, 2.4);
    scene.add(rake);

    scene.add(new THREE.AmbientLight(0xdfe6f5, 1.15));

    /* --- Materials -------------------------------------------------------- */
    const covers = drawCover(book);
    const colourMap = new THREE.CanvasTexture(covers.colour);
    colourMap.colorSpace = THREE.SRGBColorSpace;
    colourMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const metalMap = new THREE.CanvasTexture(covers.metal);

    const leather = new THREE.MeshStandardMaterial({
      map: colourMap,
      metalnessMap: metalMap,
      metalness: 1,
      roughness: 0.42,
    });
    const leatherPlain = new THREE.MeshStandardMaterial({ color: 0x141833, roughness: 0.62 });
    const endpaper = new THREE.MeshStandardMaterial({ color: 0x232b5c, roughness: 0.78 });

    const giltAcross = new THREE.CanvasTexture(drawGilt(true));
    giltAcross.colorSpace = THREE.SRGBColorSpace;
    const giltDown = new THREE.CanvasTexture(drawGilt(false));
    giltDown.colorSpace = THREE.SRGBColorSpace;
    const foreEdge = new THREE.MeshStandardMaterial({ map: giltDown, metalness: 0.92, roughness: 0.28 });
    const headEdge = new THREE.MeshStandardMaterial({ map: giltAcross, metalness: 0.92, roughness: 0.28 });
    const paper = new THREE.MeshStandardMaterial({ color: 0xf6f1e4, roughness: 0.94 });

    /* --- The book --------------------------------------------------------- */
    // Everything hangs off the spine at x = 0, so opening is one rotation.
    const bookGroup = new THREE.Group();
    scene.add(bookGroup);

    // Page block: box face order is +X, -X, +Y, -Y, +Z, -Z.
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(PAGE_W, PAGE_H, THICK),
      [foreEdge, paper, headEdge, headEdge, paper, paper],
    );
    block.position.set(PAGE_W / 2, 0, 0);
    bookGroup.add(block);

    // Opening at the head of a book leaves a thin wedge on the left and the
    // bulk of the block on the right, the way a real Bible sits.
    const LEFT_THICK = THICK * 0.16;
    const leftBlock = new THREE.Mesh(
      new THREE.BoxGeometry(PAGE_W, PAGE_H, LEFT_THICK),
      [paper, foreEdge, headEdge, headEdge, paper, paper],
    );
    leftBlock.position.set(-PAGE_W / 2, 0, LEFT_THICK / 2);
    leftBlock.visible = false;
    bookGroup.add(leftBlock);

    const boardGeo = new THREE.BoxGeometry(PAGE_W + SQUARE, PAGE_H + SQUARE * 2, BOARD);

    // Pivot sits on the spine; the board is offset so it swings about its edge.
    const frontPivot = new THREE.Group();
    frontPivot.position.set(0, 0, THICK / 2 + BOARD / 2);
    const frontBoard = new THREE.Mesh(boardGeo, [
      leatherPlain, leatherPlain, leatherPlain, leatherPlain, leather, endpaper,
    ]);
    frontBoard.position.x = (PAGE_W + SQUARE) / 2;
    frontPivot.add(frontBoard);
    bookGroup.add(frontPivot);

    const backBoard = new THREE.Mesh(boardGeo, [
      leatherPlain, leatherPlain, leatherPlain, leatherPlain, endpaper, leatherPlain,
    ]);
    backBoard.position.set((PAGE_W + SQUARE) / 2, 0, -(THICK / 2 + BOARD / 2));
    bookGroup.add(backBoard);

    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD, PAGE_H + SQUARE * 2, THICK + BOARD * 2),
      leatherPlain,
    );
    spine.position.set(-BOARD / 2, 0, 0);
    bookGroup.add(spine);

    /* --- The spread, and the one leaf that moves across it ---------------- */
    const leafGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 40, 14);

    const makePage = (x: number) => {
      const tex = new THREE.CanvasTexture(document.createElement("canvas"));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      const mesh = new THREE.Mesh(leafGeo, mat);
      // Clear of the opened board, which lies at THICK/2 + BOARD on this side.
      mesh.position.set(x, 0, THICK / 2 + BOARD + 0.012);
      mesh.visible = false;
      bookGroup.add(mesh);
      return { mesh, tex, mat };
    };
    const underLeft = makePage(-PAGE_W / 2);
    const underRight = makePage(PAGE_W / 2);

    // The travelling leaf: two faces back to back, bowing together.
    const bend = { value: 0 };
    const leafPivot = new THREE.Group();
    leafPivot.position.set(0, 0, THICK / 2 + BOARD + 0.024);
    leafPivot.visible = false;
    bookGroup.add(leafPivot);

    const faceFor = (flip: boolean) => {
      const tex = new THREE.CanvasTexture(document.createElement("canvas"));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      bendable(mat, bend);
      const mesh = new THREE.Mesh(leafGeo, mat);
      mesh.position.x = PAGE_W / 2;
      if (flip) mesh.rotation.y = Math.PI;
      leafPivot.add(mesh);
      return { mesh, tex, mat };
    };
    const leafFront = faceFor(false);
    const leafBack = faceFor(true);

    // Opening a book does not move only its cover. A wedge of leaves comes
    // over with it, each a little behind the last, and settles onto the left.
    const FAN = 5;
    const fanBend = { value: 0 };
    const fanPaper = new THREE.MeshStandardMaterial({
      color: 0xf1ebdc,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    bendable(fanPaper, fanBend);
    const fan = Array.from({ length: FAN }, (_, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, THICK / 2 - i * 0.004);
      const mesh = new THREE.Mesh(leafGeo, fanPaper);
      mesh.position.x = PAGE_W / 2;
      pivot.add(mesh);
      pivot.visible = false;
      bookGroup.add(pivot);
      return pivot;
    });

    /* --- Motion ----------------------------------------------------------- */
    // One number drives the whole thing: 0 shut, 1 open.
    let openness = 0;
    let target = 0;
    let instant = false;
    let framePx = pageHeightPx;
    let frameTarget = pageHeightPx;
    let live = true;
    let idle = 0;
    let raf = 0;
    let lastFrame = performance.now();

    // A turn runs on its own clock, independent of the open/shut spring.
    let turnAt = 0;
    let turnFor = 0;
    let turnFwd = true;
    let spreadPainted = false;
    let onLanded: (() => void) | null = null;

    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const layout = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;

      // Distance chosen so PAGE_H covers exactly the requested pixel height.
      const shut = framePx * 0.62;
      const wanted = shut + (framePx - shut) * ease(openness);
      const visible = (PAGE_H * h) / wanted;
      camera.position.set(0, 0, visible / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);

      // Smoothing is per second, not per frame. A browser that throttles
      // animation — a background tab, a 120Hz display, a slow device — would
      // otherwise run the open at whatever speed it happened to tick at.
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      const pull = (tau: number) => (instant ? 1 : 1 - Math.exp(-dt / tau));

      openness += (target - openness) * pull(0.19);
      framePx += (frameTarget - framePx) * pull(0.085);
      if (Math.abs(target - openness) < 0.0005) openness = target;

      const e = ease(openness);

      // Shut, the book is turned to show its gilded fore-edge; opening brings
      // it square to the reader and lays the spread flat.
      bookGroup.rotation.y = THREE.MathUtils.degToRad(-27 * (1 - e));
      bookGroup.rotation.x = THREE.MathUtils.degToRad(8 - 3 * e);
      // Shut, the block sits right of the spine, so slide it back to centre it.
      bookGroup.position.x = (-PAGE_W / 2) * (1 - e);
      bookGroup.position.y = Math.sin(now / 2600) * 0.012 * (1 - e);

      // The board is glued to a flexing spine, so it leans as it comes over
      // instead of swinging like a gate.
      frontPivot.rotation.y = Math.PI * e;
      frontBoard.rotation.z = Math.sin(Math.PI * e) * 0.05;

      // Each leaf trails the one above it, so the wedge peels rather than
      // arriving all at once. The last of them lands after the board does.
      const opening = openness > 0.001 && openness < 0.999;
      fan.forEach((pivot, i) => {
        const delay = 0.08 + i * 0.055;
        const span = 1 - delay;
        const local = Math.min(1, Math.max(0, (e - delay) / span));
        pivot.visible = opening && local > 0 && local < 1;
        pivot.rotation.y = Math.PI * local;
      });
      fanBend.value = Math.sin(Math.PI * e) * 0.09;

      leftBlock.visible = e > 0.62;
      leftBlock.scale.z = Math.max(0.001, (e - 0.62) / 0.38);

      // The spread lies in front of the boards, so it may only ever show on a
      // book that is actually open. Derived per frame, not toggled on events:
      // a missed edge here leaves a blank page where the cover should be.
      const spreadUp = spreadPainted && openness > 0.98;
      underLeft.mesh.visible = spreadUp;
      underRight.mesh.visible = spreadUp;
      leafPivot.visible = spreadUp && turnFor > 0;

      /* --- A leaf crossing the gutter ------------------------------------ */
      if (turnFor > 0) {
        const p = Math.min(1, (now - turnAt) / turnFor);
        const t = turnEase(p);
        const angle = turnFwd ? Math.PI * t : Math.PI * (1 - t);
        leafPivot.rotation.y = angle;
        // The leaf is most curled while it is being lifted and relaxes as it
        // falls, so the peak sits before the half-way point rather than on it.
        bend.value = Math.sin(Math.pow(p, 0.78) * Math.PI) * 0.17;
        // Past upright, the far side is the one facing the reader.
        leafFront.mesh.visible = angle < Math.PI / 2;
        leafBack.mesh.visible = angle >= Math.PI / 2;

        if (p >= 1) {
          turnFor = 0;
          bend.value = 0;
          const done = onLanded;
          onLanded = null;
          done?.();
        }
      }

      // Behind the reader and finished moving, there is nothing new to draw.
      // A few frames of grace first: resizing the canvas clears it, so going
      // idle the instant we settle can leave a blank buffer on screen.
      const settled = openness === target && Math.abs(frameTarget - framePx) < 0.5 && turnFor === 0;
      if (!live && settled) {
        if (idle++ > 2) return;
      } else {
        idle = 0;
      }

      layout();
      renderer.render(scene, camera);
    };

    layout();
    tick();

    // Any resize invalidates the drawing buffer, so wake the loop back up.
    const observer = new ResizeObserver(() => {
      idle = 0;
      layout();
    });
    observer.observe(mount);

    const paint = (slot: { tex: THREE.CanvasTexture }, canvas: HTMLCanvasElement) => {
      slot.tex.image = canvas;
      slot.tex.needsUpdate = true;
    };

    controlsRef.current = {
      turn: (art, forward) =>
        new Promise((resolve) => {
          paint(underLeft, art.under.left);
          paint(underRight, art.under.right);
          paint(leafFront, art.front);
          paint(leafBack, art.back);
          spreadPainted = true;
          leafPivot.rotation.y = forward ? 0 : Math.PI;
          idle = 0;
          turnFwd = forward;
          turnAt = performance.now();
          turnFor = instant ? 1 : 620;
          onLanded = () => {
            // The leaf has landed on top of a page it now duplicates. Fold it
            // into the spread, so the reader fades in over a matching image
            // instead of over bare paper.
            paint(forward ? underLeft : underRight, forward ? art.back : art.front);
            resolve();
          };
        }),
    };

    api.current = {
      setOpen: (v, immediate) => {
        target = v ? 1 : 0;
        instant = immediate;
        // A shut book has no spread; the per-frame guard does the hiding.
        if (!v) spreadPainted = false;
      },
      setBook: (name) => {
        const next = drawCover(name);
        colourMap.image = next.colour;
        colourMap.needsUpdate = true;
        metalMap.image = next.metal;
        metalMap.needsUpdate = true;
      },
      setFrame: (px) => {
        frameTarget = px;
      },
      setActive: (v) => {
        live = v;
        idle = 0;
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      api.current = null;
      controlsRef.current = null;
      renderer.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      [leather, leatherPlain, endpaper, foreEdge, headEdge, paper, fanPaper].forEach((m) =>
        m.dispose(),
      );
      [underLeft, underRight, leafFront, leafBack].forEach((s) => {
        s.mat.dispose();
        s.tex.dispose();
      });
      [colourMap, metalMap, giltAcross, giltDown].forEach((t) => t.dispose());
      mount.removeChild(renderer.domElement);
    };
    // Built once; everything after is pushed through the imperative handle so
    // a prop change never tears down the GL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => void api.current?.setOpen(open, reduced), [open, reduced]);
  useEffect(() => void api.current?.setBook(book), [book]);
  useEffect(() => void api.current?.setFrame(pageHeightPx), [pageHeightPx]);
  useEffect(() => void api.current?.setActive(active), [active]);

  return <div ref={host} className={className} aria-hidden />;
}
