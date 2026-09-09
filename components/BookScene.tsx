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
// Plain PCF has no softening radius, so the map itself has to carry the edge
// quality. The loop idles, and this is one small object.
const SHADOW_MAP = 2048;
/**
 * How hard the gutter shades — the visible half of the bow, and the one worth
 * tuning by eye. It drives the surface normal, not the shape.
 */
const BOW = 0.028;
/**
 * How far the page actually moves. An order of magnitude less than the
 * shading, and it has to be: the fold is on the camera axis, so displacement
 * buys almost no silhouette, while a page that dips past the block beneath it
 * is *occluded* by it and the gutter text simply vanishes. Must stay inside
 * BOW_CLEAR.
 */
const BOW_DIP = 0.003;
/** Where a page of the open spread lies, clear of the board under it. */
const PAGE_Z = THICK / 2 + BOARD + 0.012;
/** Air between a page and the block holding it up. Has to exceed BOW_DIP. */
const BOW_CLEAR = 0.006;
/** The top of a block of paper, just under the page lying on it. */
const SURFACE = PAGE_Z - BOW_CLEAR;

export type TurnArt = {
  /** The leaf's own two sides: what you were reading, and its reverse. */
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** What is already lying underneath on either side. */
  under: { left: HTMLCanvasElement; right: HTMLCanvasElement };
};

export type SceneControls = {
  /** Runs one leaf across the gutter on a clock. Resolves when it lands. */
  turn: (art: TurnArt, forward: boolean) => Promise<void>;
  /**
   * Lays a spread down without staging a turn, so the book has something to
   * open onto. Without it the reveal is the bare page block and the text
   * arrives afterwards, on the cross-fade.
   */
  setSpread: (left: HTMLCanvasElement, right: HTMLCanvasElement) => void;
  /** Takes hold of the front board. Returns where it is, 0 shut to 1 open. */
  grabCover: () => number;
  /** Where the board is now. Same units as `open`, but continuous. */
  dragCover: (openness: number) => void;
  /**
   * Lets go of the board. Velocity is in openness per second. Resolves true
   * if it settled open, false if it fell shut.
   */
  releaseCover: (openness: number, velocity: number) => Promise<boolean>;
  /** Takes hold of a leaf so a pointer can carry it. */
  grab: (art: TurnArt, forward: boolean) => void;
  /** Where the leaf is, 0 lying still to 1 fully over. */
  drag: (progress: number) => void;
  /**
   * Lets go. Velocity is in progress per second — the caller converts from
   * pixels, so the scene never has to know about screen coordinates.
   * Resolves true if the turn completed, false if the page fell back.
   */
  release: (progress: number, velocity: number) => Promise<boolean>;
};

type Props = {
  open: boolean;
  /** False once the reader has taken over, so the loop can stand down. */
  active: boolean;
  book: string;
  /** On-screen height of one page when open, in CSS pixels. */
  pageHeightPx: number;
  /** How far through the whole Bible this chapter sits, 0 to 1. */
  through: number;
  /** One page to a leaf, for a screen too narrow to hold a spread. */
  single: boolean;
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
      shader.vertexShader
        // The normal has to be bent too, or a curled leaf shades like a flat
        // board and the curve reads only in its silhouette. This chunk runs
        // *before* <begin_vertex>, so it works from position, not transformed.
        // In the depth shader the same chunk sits inside an
        // #ifdef USE_DISPLACEMENTMAP that is never defined — dead code there,
        // which is why the displacement below is what casts the shadow.
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
         float nu = (position.x / ${PAGE_W.toFixed(1)}) + 0.5;
         float nv = (position.y / ${PAGE_H.toFixed(2)}) + 0.5;
         // Slope of the curl below, differentiated: d/du of sin(u*PI)*lag.
         objectNormal = normalize(vec3(
           -3.14159265 * cos(nu * 3.14159265) * uBend * mix(1.25, 0.7, nv), 0.0, 1.0));`,
        )
        .replace(
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
 * Rolls a page lying in the spread down into the gutter. Only the inner
 * quarter moves, so the page's outline barely changes — which is what keeps
 * the hand-over to the flat DOM spread from popping.
 *
 * Shading and shape are deliberately decoupled: the normal tilts as if the
 * page dipped by `bow`, while it actually dips by the much smaller BOW_DIP.
 * The fold lies on the camera axis, so the shape was never what you saw, and
 * dipping for real far enough to matter buries the page in the block below it.
 *
 * `side` says which edge is the spine: 1 for the left page, whose gutter is
 * its right edge, -1 for the right page.
 */
function bowed(material: THREE.Material, bow: { value: number }, side: 1 | -1) {
  // How far in from the gutter, 0 at the fold and 1 by the quarter mark. The
  // chunks below declare their own locals, so the name is a parameter.
  const rampFrom = (u: string) => {
    const inward = side > 0 ? u : `(1.0 - ${u})`;
    return `clamp((${inward} - 0.72) / 0.28, 0.0, 1.0)`;
  };
  const across = (u: string) => `float ${u} = (position.x / ${PAGE_W.toFixed(1)}) + 0.5;`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBow = bow;
    shader.vertexShader =
      "uniform float uBow;\n" +
      shader.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          `#include <beginnormal_vertex>
         ${across("bu")}
         float bt = ${rampFrom("bu")};
         // Slope of the smoothstep below, differentiated.
         objectNormal = normalize(vec3(
           ${side.toFixed(1)} * uBow * 6.0 * bt * (1.0 - bt) / 0.28, 0.0, 1.0));`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
         ${across("cu")}
         float ct = ${rampFrom("cu")};
         transformed.z -= ${BOW_DIP.toFixed(4)} * ct * ct * (3.0 - 2.0 * ct);`,
        );
  };
  // Both pages compile from the same closure, so the default cache key —
  // onBeforeCompile.toString() — is identical for them and three.js would hand
  // the second page the first one's program, bowing it the wrong way.
  material.customProgramCacheKey = () => `bowed${side}`;
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
  through: throughProp,
  single: singleProp,
  reduced,
  controlsRef,
  className,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setOpen: (v: boolean, immediate: boolean) => void;
    setBook: (name: string) => void;
    setFrame: (px: number) => void;
    setThrough: (v: number) => void;
    setSingle: (v: boolean) => void;
    setActive: (v: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const mount = host.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    // Set before anything compiles: both are part of the program cache key, so
    // flipping them later forces every material to be rebuilt. PCF rather than
    // VSM, which blurs its map every frame — wrong for a loop that idles. (Not
    // PCFSoftShadowMap: three deprecated it and silently substitutes this.)
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
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

    // Only the key casts. A second caster would double the cost and throw a
    // contradicting shadow, and the rake exists for the gilding, not the form.
    // The frustum is drawn tight around the book so 1024 texels land roughly
    // one to a pixel at the size the spread is actually read.
    key.castShadow = true;
    key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    key.shadow.camera.left = -1.35;
    key.shadow.camera.right = 1.35;
    key.shadow.camera.top = 1.05;
    key.shadow.camera.bottom = -1.05;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 9;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.012;
    // Where the light comes from, for the backlit-paper term in the turn.
    const KEY = key.position.clone().normalize();

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
    // Until the spread is up it is the block that takes the cover's shadow,
    // which is most of what makes the open read as an object being lifted.
    block.receiveShadow = true;
    bookGroup.add(block);

    // What has already been read, stacked on the left. Cut at the full depth of
    // the block and scaled down per frame, so it can hold anything from the
    // three leaves of Genesis 1 to nearly the whole Bible at Revelation.
    // Scaling does compress the gilt striations on its fore-edge; at the size
    // that edge is ever seen, that is cheaper than a second geometry.
    const leftBlock = new THREE.Mesh(
      new THREE.BoxGeometry(PAGE_W, PAGE_H, THICK),
      [paper, foreEdge, headEdge, headEdge, paper, paper],
    );
    leftBlock.position.set(-PAGE_W / 2, 0, 0);
    leftBlock.visible = false;
    leftBlock.receiveShadow = true;
    bookGroup.add(leftBlock);

    const boardGeo = new THREE.BoxGeometry(PAGE_W + SQUARE, PAGE_H + SQUARE * 2, BOARD);

    // Pivot sits on the spine; the board is offset so it swings about its edge.
    const frontPivot = new THREE.Group();
    frontPivot.position.set(0, 0, THICK / 2 + BOARD / 2);
    const frontBoard = new THREE.Mesh(boardGeo, [
      leatherPlain, leatherPlain, leatherPlain, leatherPlain, leather, endpaper,
    ]);
    frontBoard.position.x = (PAGE_W + SQUARE) / 2;
    // Casts onto the block as it comes over; receives the peeling fan's shadow
    // on its endpaper once it is lying flat.
    frontBoard.castShadow = true;
    frontBoard.receiveShadow = true;
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
    // Darkens the fold where the boards meet, which no gradient can fake.
    spine.castShadow = true;
    bookGroup.add(spine);

    /* --- The spread, and the one leaf that moves across it ---------------- */
    const leafGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 40, 14);

    // A page in the spread rolls into the gutter. 0.028 is as deep as it can
    // go: the pages sit at THICK/2 + BOARD + 0.012 = 0.095 and the block's top
    // face is at 0.065, so this lands the fold at 0.067 — just clear of it.
    const bow = { value: BOW };

    const makePage = (x: number, side: 1 | -1) => {
      const tex = new THREE.CanvasTexture(document.createElement("canvas"));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 });
      bowed(mat, bow, side);
      const mesh = new THREE.Mesh(leafGeo, mat);
      // Clear of the opened board, which lies at THICK/2 + BOARD on this side.
      mesh.position.set(x, 0, PAGE_Z);
      mesh.visible = false;
      // The page a turning leaf drops its shadow onto — the whole point.
      mesh.receiveShadow = true;
      bookGroup.add(mesh);
      return { mesh, tex, mat };
    };
    // The left page's gutter is its right edge, and the right page's its left.
    const underLeft = makePage(-PAGE_W / 2, 1);
    const underRight = makePage(PAGE_W / 2, -1);

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
      // Paper held up to a light glows, and the ink on it does not. Binding the
      // page's own art as its emissive map gets both for free — the same
      // texture object, so no second upload — and the tone mapping keeps the
      // bright end from clipping. Driven per frame from the leaf's angle.
      mat.emissiveMap = tex;
      mat.emissive = new THREE.Color(0xffeccd);
      mat.emissiveIntensity = 0;
      // three.js renders the depth pass with the *opposite* side to the
      // material's, so a FrontSide plane casts nothing at all: its back is the
      // same two triangles, and they get culled.
      mat.shadowSide = THREE.DoubleSide;
      bendable(mat, bend);
      const mesh = new THREE.Mesh(leafGeo, mat);
      mesh.position.x = PAGE_W / 2;
      // A leaf has two sides and a thickness between them. A hair is enough to
      // read as an edge and it keeps the faces off each other in the depth
      // buffer, which matters much more now that they cast.
      mesh.position.z = flip ? -0.0016 : 0.0016;
      if (flip) mesh.rotation.y = Math.PI;
      mesh.castShadow = true;
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
    // Already DoubleSide, so its depth pass needs no shadowSide override.
    fanPaper.emissive = new THREE.Color(0xffeccd);
    fanPaper.emissiveIntensity = 0;
    bendable(fanPaper, fanBend);
    const fan = Array.from({ length: FAN }, (_, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, THICK / 2 - i * 0.004);
      const mesh = new THREE.Mesh(leafGeo, fanPaper);
      mesh.position.x = PAGE_W / 2;
      mesh.castShadow = true;
      pivot.add(mesh);
      pivot.visible = false;
      bookGroup.add(pivot);
      return pivot;
    });

    /**
     * A curled leaf casts the shadow of a flat one unless the depth pass bends
     * with it: onBeforeCompile on the surface material never reaches the depth
     * material three.js substitutes when filling the shadow map. The depth
     * shader includes the same <begin_vertex> chunk, so the displacement drops
     * straight in. One per bend uniform is enough — side and map are re-derived
     * from the source material at every use.
     */
    const depthFor = (uniform: { value: number }) => {
      const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
      bendable(m, uniform);
      return m;
    };
    const leafDepth = depthFor(bend);
    const fanDepth = depthFor(fanBend);
    leafFront.mesh.customDepthMaterial = leafDepth;
    leafBack.mesh.customDepthMaterial = leafDepth;
    fan.forEach((pivot) => {
      (pivot.children[0] as THREE.Mesh).customDepthMaterial = fanDepth;
    });

    /* --- Motion ----------------------------------------------------------- */
    // One number drives the whole thing: 0 shut, 1 open.
    let openness = 0;
    let target = 0;
    let instant = false;
    let framePx = pageHeightPx;
    let frameTarget = pageHeightPx;
    let through = throughProp;
    let throughTarget = throughProp;
    // While a hand is on the cover it owns `openness` outright; the chase
    // below would otherwise drag the board back to its target under the
    // pointer. Resolved by the same settle test that ends a timed open.
    let coverMode: "idle" | "dragging" = "idle";
    let onCoverLanded: ((opened: boolean) => void) | null = null;
    let single = singleProp;
    let live = true;
    let idle = 0;
    let raf = 0;
    let lastFrame = performance.now();

    // A turn runs either on its own clock or under a finger. Dragging ignores
    // the clock entirely: progress is whatever the pointer last said.
    type TurnMode = "idle" | "timed" | "dragging" | "settling";
    let turnMode: TurnMode = "idle";
    let turnAt = 0;
    let turnFor = 0;
    let turnFwd = true;
    let turnP = 0;
    let settleFrom = 0;
    let settleTo = 0;
    let spreadPainted = false;
    let onLanded: ((completed: boolean) => void) | null = null;

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

      if (coverMode !== "dragging") openness += (target - openness) * pull(0.19);
      framePx += (frameTarget - framePx) * pull(0.085);
      // Slower than the rest: jumping from Genesis to Revelation should look
      // like paper being moved across, not like the block snapping.
      through += (throughTarget - through) * pull(0.35);
      if (coverMode !== "dragging" && Math.abs(target - openness) < 0.0005) {
        openness = target;
        const landed = onCoverLanded;
        onCoverLanded = null;
        landed?.(target === 1);
      }

      const e = ease(openness);

      // Shut, the book is turned to show its gilded fore-edge; opening brings
      // it square to the reader and lays the spread flat.
      bookGroup.rotation.y = THREE.MathUtils.degToRad(-27 * (1 - e));
      bookGroup.rotation.x = THREE.MathUtils.degToRad(8 - 3 * e);
      // Shut, the block sits right of the spine, so slide it back to centre it.
      // One page at a time keeps the spine at the frame's left instead, so the
      // leaf still swings about a real gutter rather than about nothing — and
      // the page being read stays in the middle of the screen.
      bookGroup.position.x = single ? -PAGE_W / 2 : (-PAGE_W / 2) * (1 - e);
      bookGroup.position.y = Math.sin(now / 2600) * 0.012 * (1 - e);

      // The board is glued to a flexing spine, so it leans as it comes over
      // instead of swinging like a gate.
      // Negative for the same reason the leaf is: the cover has to stand up
      // between you and the book on its way over, not pass behind it.
      frontPivot.rotation.y = -Math.PI * e;
      frontBoard.rotation.z = Math.sin(Math.PI * e) * 0.05;

      // Each leaf trails the one above it, so the wedge peels rather than
      // arriving all at once. The last of them lands after the board does.
      const opening = openness > 0.001 && openness < 0.999;
      fan.forEach((pivot, i) => {
        const delay = 0.08 + i * 0.055;
        const span = 1 - delay;
        const local = Math.min(1, Math.max(0, (e - delay) / span));
        pivot.visible = opening && local > 0 && local < 1;
        pivot.rotation.y = -Math.PI * local;
      });
      fanBend.value = Math.sin(Math.PI * e) * 0.09;
      // Half over is where the light is most behind the wedge. Kept well below
      // the travelling leaf's glow: these leaves carry no texture, so anything
      // stronger flattens them into featureless white cards.
      fanPaper.emissiveIntensity = Math.sin(Math.PI * e) * 0.3;

      // How much paper lies under each hand. Reading deeper moves it from the
      // right to the left, so the fore-edge you are holding thins as the wedge
      // beside it grows. Every term below collapses to the shut book's original
      // constant at spreadOpen = 0, which is what keeps the shelf untouched.
      const spreadOpen = Math.max(0, Math.min(1, (e - 0.62) / 0.38));
      const wedge = THICK * (0.03 + 0.94 * through) * spreadOpen;
      const rest = THICK - wedge;

      // The board drops out of the wedge's way rather than the page rising off
      // it: the reading surface must not move, or the hand-over to the DOM
      // spread would shift under the text.
      leftBlock.visible = spreadOpen > 0.001;
      leftBlock.scale.z = Math.max(0.004, wedge / THICK);
      leftBlock.position.z = SURFACE - wedge / 2;
      frontPivot.position.z = THICK / 2 + BOARD / 2 - wedge;

      // The right block keeps the face the shut book shows and thins downward.
      const topRight = THICK / 2 + (SURFACE - THICK / 2) * spreadOpen;
      block.scale.z = rest / THICK;
      block.position.z = topRight - rest / 2;
      backBoard.position.z = topRight - rest - BOARD / 2;

      // The spread lies in front of the boards, so it may only ever show on a
      // book that is actually open. Derived per frame, not toggled on events:
      // a missed edge here leaves a blank page where the cover should be.
      // Gated on the eased value, not the raw one. `openness` chases its
      // target exponentially, so it is still crawling from 0.86 to 1 long
      // after `e` has laid the book flat — and every frame of that is an open
      // book showing bare paper before the text is allowed to appear.
      const spreadUp = spreadPainted && e > 0.98;
      underLeft.mesh.visible = spreadUp;
      underRight.mesh.visible = spreadUp;
      leafPivot.visible = spreadUp && turnMode !== "idle";

      /* --- A leaf crossing the gutter ------------------------------------ */
      if (turnMode !== "idle") {
        let done = false;
        let completed = true;

        if (turnMode === "timed") {
          const clock = Math.min(1, (now - turnAt) / turnFor);
          turnP = turnEase(clock);
          done = clock >= 1;
        } else if (turnMode === "settling") {
          const clock = Math.min(1, (now - turnAt) / turnFor);
          // Ease only the remaining distance, so a release at 0.95 does not
          // crawl back through the whole curve.
          turnP = settleFrom + (settleTo - settleFrom) * turnEase(clock);
          done = clock >= 1;
          completed = settleTo === 1;
        }
        // "dragging" leaves turnP exactly where the pointer put it.

        const angle = turnFwd ? Math.PI * turnP : Math.PI * (1 - turnP);
        // Negative: a positive Y rotation carries +X towards -Z, which would
        // swing the right-hand leaf away from the reader and bury it behind
        // the block. Both ends of the sweep look the same either way — it is
        // the middle, the part you actually watch, that has to come forward.
        leafPivot.rotation.y = -angle;
        // The leaf is most curled while it is being lifted and relaxes as it
        // falls, so the peak sits before the half-way point rather than on it.
        bend.value = Math.sin(Math.pow(turnP, 0.78) * Math.PI) * 0.17;
        // Past upright, the far side is the one facing the reader.
        leafFront.mesh.visible = angle < Math.PI / 2;
        leafBack.mesh.visible = angle >= Math.PI / 2;

        // Paper is thin enough to light up when the source is behind it. The
        // key is up and to the reader's left, so it is the face turned away
        // that glows, brightest as the leaf stands on edge and shows least.
        // The front face's normal, now that the leaf lifts towards the reader.
        const facing = -Math.sin(angle) * KEY.x + Math.cos(angle) * KEY.z;
        const edgeOn = Math.min(1, Math.sin(angle) * 2.2);
        leafFront.mat.emissiveIntensity = Math.max(0, -facing) * edgeOn * 0.9;
        leafBack.mat.emissiveIntensity = Math.max(0, facing) * edgeOn * 0.9;

        if (done) {
          turnMode = "idle";
          bend.value = 0;
          leafFront.mat.emissiveIntensity = 0;
          leafBack.mat.emissiveIntensity = 0;
          const land = onLanded;
          onLanded = null;
          land?.(completed);
        }
      }

      // Behind the reader and finished moving, there is nothing new to draw.
      // A few frames of grace first: resizing the canvas clears it, so going
      // idle the instant we settle can leave a blank buffer on screen.
      const settled =
        openness === target &&
        Math.abs(frameTarget - framePx) < 0.5 &&
        Math.abs(throughTarget - through) < 0.002 &&
        turnMode === "idle";
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

    /** Lays out the four faces a turn moves between. */
    const stage = (art: TurnArt, forward: boolean) => {
      paint(underLeft, art.under.left);
      paint(underRight, art.under.right);
      paint(leafFront, art.front);
      paint(leafBack, art.back);
      spreadPainted = true;
      turnFwd = forward;
      turnP = 0;
      leafPivot.rotation.y = forward ? 0 : -Math.PI;
      idle = 0;
    };

    /**
     * The leaf comes to rest on top of a page it now duplicates, so fold it
     * into the spread and retire it — the reader then fades in over a matching
     * image rather than over bare paper.
     *
     * Which page it duplicates depends on where it stopped. Completed, it
     * covers the far side; abandoned, it fell back over the side it started
     * on, and that page has to be put back.
     */
    const land = (art: TurnArt, forward: boolean, completed: boolean) => {
      if (single) {
        // One page to a leaf: the centred right-hand slot is the only one that
        // is really read, and stage() already put the destination there. So a
        // completed turn has nothing to do; only an abandoned one has to put
        // back the page it lifted.
        if (!completed) paint(underRight, forward ? art.front : art.back);
        return;
      }
      if (completed) paint(forward ? underLeft : underRight, forward ? art.back : art.front);
      else paint(forward ? underRight : underLeft, forward ? art.front : art.back);
    };

    let heldArt: TurnArt | null = null;
    let heldFwd = true;

    controlsRef.current = {
      turn: (art, forward) =>
        new Promise((resolve) => {
          stage(art, forward);
          turnMode = "timed";
          turnAt = performance.now();
          turnFor = instant ? 1 : 620;
          onLanded = (completed) => {
            land(art, forward, completed);
            resolve();
          };
        }),

      setSpread: (left, right) => {
        // A staged turn owns all four canvases until it lands.
        if (turnMode !== "idle") return;
        paint(underLeft, left);
        paint(underRight, right);
        spreadPainted = true;
        idle = 0;
      },

      grabCover: () => {
        coverMode = "dragging";
        idle = 0;
        return openness;
      },

      dragCover: (v) => {
        if (coverMode !== "dragging") return;
        openness = Math.min(1, Math.max(0, v));
        idle = 0;
      },

      releaseCover: (progress, velocity) =>
        new Promise((resolve) => {
          if (coverMode !== "dragging") {
            resolve(openness > 0.5);
            return;
          }
          coverMode = "idle";
          openness = Math.min(1, Math.max(0, progress));
          // Throwing a cover open is a different gesture from placing one, so
          // a flick carries it whether or not it got past half — the same rule,
          // and the same threshold, a thrown page uses.
          const flicked = Math.abs(velocity) > 1.6;
          target = flicked ? (velocity > 0 ? 1 : 0) : openness > 0.5 ? 1 : 0;
          onCoverLanded = resolve;
          idle = 0;
        }),

      grab: (art, forward) => {
        stage(art, forward);
        heldArt = art;
        heldFwd = forward;
        turnMode = "dragging";
      },

      drag: (progress) => {
        if (turnMode !== "dragging") return;
        turnP = Math.min(1, Math.max(0, progress));
        idle = 0;
      },

      release: (progress, velocity) =>
        new Promise((resolve) => {
          const art = heldArt;
          if (turnMode !== "dragging" || !art) {
            resolve(false);
            return;
          }
          const forward = heldFwd;
          heldArt = null;

          const p = Math.min(1, Math.max(0, progress));
          // A flick carries the page whether or not it got past halfway —
          // throwing a page is a different gesture from placing one.
          const flicked = Math.abs(velocity) > 1.6;
          settleTo = flicked ? (velocity > 0 ? 1 : 0) : p > 0.5 ? 1 : 0;
          settleFrom = p;
          turnP = p;
          turnMode = "settling";
          turnAt = performance.now();
          // Only the distance still to travel, or a release near the end
          // takes as long as one from the middle.
          turnFor = instant ? 1 : Math.max(130, 430 * Math.abs(settleTo - p));
          idle = 0;
          onLanded = (completed) => {
            land(art, forward, completed);
            resolve(completed);
          };
        }),
    };

    api.current = {
      setOpen: (v, immediate) => {
        target = v ? 1 : 0;
        instant = immediate;
        // A shut book has no spread; the per-frame guard does the hiding.
        if (!v) {
          spreadPainted = false;
          turnMode = "idle";
          // Shutting the book abandons any leaf in flight, but the caller is
          // still awaiting it. Drop the promise and `turning` never clears,
          // so every later turn is refused and the reader stays hidden.
          const land = onLanded;
          onLanded = null;
          land?.(false);
        }
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
      setThrough: (v) => {
        throughTarget = Math.max(0, Math.min(1, v));
        idle = 0;
      },
      setSingle: (v) => {
        single = v;
        idle = 0;
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
      [
        leather, leatherPlain, endpaper, foreEdge, headEdge, paper, fanPaper,
        leafDepth, fanDepth,
      ].forEach((m) => m.dispose());
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
  useEffect(() => void api.current?.setThrough(throughProp), [throughProp]);
  useEffect(() => void api.current?.setSingle(singleProp), [singleProp]);
  useEffect(() => void api.current?.setActive(active), [active]);

  return <div ref={host} className={className} aria-hidden />;
}
