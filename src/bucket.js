import * as THREE from 'three';
import { PALETTE } from './textures.js';

// A galvanised bucket, left on the floor. Small enough that it's built from
// plain materials — the machine's panel texture would put rivets the size of
// dinner plates on something this size.

// Far enough forward and small enough that it reads as carried at your side
// rather than held up to your face — at 0.6m it swallows a third of the view.
const HELD_POSITION = new THREE.Vector3(0.44, -0.46, -0.95);
const HELD_ROTATION = new THREE.Euler(0.2, -0.5, 0.12);
const HELD_SCALE = 0.5;

/**
 * The paint on the bucket, as a canvas the painter GUI draws into.
 *
 * One canvas for the whole game, deliberately. Both the bucket you carry in and
 * the friend it comes back as are built from buildBucketMesh, and they are the
 * same object in the fiction — paint it and it stays painted through the
 * machine, which is the only answer that does not need explaining.
 *
 * The body is an open cylinder, so its UVs are already the unwrap you want: u
 * runs once around, v from the base to the rim. That makes the canvas a
 * straightforward flat map of the bucket, and it is why the GUI can present a
 * plain rectangle to draw on and have it land where you expect.
 *
 * 1024 across for a body 1.6m around and 0.41 tall — near enough square texels
 * at 256 high, and fine enough to hold a brush stroke at the distance you look
 * at it.
 */
const PAINT_W = 1024;

/**
 * The canvas, divided into strips — one per paintable part.
 *
 * The rim and the handle are tori, and a torus is already unwrapped the same
 * way the cylinder is: u runs along the ring, v around the tube. So they can
 * share the body's canvas rather than carry maps of their own, each squeezed
 * into a band of it and each still a plain rectangle to draw on.
 *
 * Ordered top to bottom as the bucket is: the handle arcs over the rim, the rim
 * sits on the body. Texture v=0 is the *bottom* row of a canvas, so this list
 * reads the same way down the screen in the GUI as it does down the object.
 *
 * 80 rows for the rim is proportional — 1024px for its 1.9m circumference is
 * 543 to the metre, and its tube is 0.14m around. The handle's is denser than
 * life, which nothing at that scale will ever show.
 *
 * `wraps` is whether the left and right edges are the same seam. The rim is a
 * closed ring so they are; the handle's ends are the two lugs, a hand's width
 * apart across the mouth, so a stroke running off one end must not reappear at
 * the other.
 */
export const PAINT_BANDS = [
  { key: 'handle', label: 'handle', height: 80, wraps: false, tint: PALETTE.galvanisedDark },
  { key: 'rim', label: 'rim', height: 80, wraps: true, tint: PALETTE.galvanisedDark },
  { key: 'body', label: 'body', height: 256, wraps: true, tint: PALETTE.galvanised },
];
const BAND = {};
let stacked = 0;
for (const band of PAINT_BANDS) {
  band.y = stacked;
  stacked += band.height;
  BAND[band.key] = band;
}
const PAINT_H = stacked;

let paintCanvas = null;
let paintTexture = null;
/**
 * The bare bucket, kept as its own image and never drawn on.
 *
 * Two things need it. Stripping the paint is a blit of it over the top, and the
 * eraser is a brush that paints *with* it — which is why it has to be an image
 * rather than a fill colour. The metal is streaked, so an eraser that painted
 * flat grey would leave a patch that reads as more paint, in a duller colour.
 */
let baseCanvas = null;

export function bucketPaintSurface() {
  if (paintCanvas) {
    return { canvas: paintCanvas, base: baseCanvas, texture: paintTexture, width: PAINT_W, height: PAINT_H };
  }

  baseCanvas = document.createElement('canvas');
  baseCanvas.width = PAINT_W;
  baseCanvas.height = PAINT_H;
  const b = baseCanvas.getContext('2d');
  // Each part in its own metal. The trim was a shade darker than the body back
  // when it was material colours, and it stays that way now that it is pixels —
  // a bucket whose rim matched its side would read as pressed out of one piece.
  for (const band of PAINT_BANDS) {
    b.fillStyle = band.tint;
    b.fillRect(0, band.y, PAINT_W, band.height);
  }
  // A little vertical streaking, so bare bucket is not a flat swatch and a
  // painted one has something underneath it.
  for (let i = 0; i < 120; i++) {
    b.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '20,24,26'},${0.02 + Math.random() * 0.05})`;
    b.fillRect(Math.random() * PAINT_W, 0, 1 + Math.random() * 5, PAINT_H);
  }

  paintCanvas = document.createElement('canvas');
  paintCanvas.width = PAINT_W;
  paintCanvas.height = PAINT_H;
  clearBucketPaint();

  paintTexture = new THREE.CanvasTexture(paintCanvas);
  paintTexture.colorSpace = THREE.SRGBColorSpace;
  paintTexture.anisotropy = 4;
  return { canvas: paintCanvas, base: baseCanvas, texture: paintTexture, width: PAINT_W, height: PAINT_H };
}

/** Back to bare metal. */
export function clearBucketPaint() {
  if (!paintCanvas) return;
  const c = paintCanvas.getContext('2d');
  c.clearRect(0, 0, PAINT_W, PAINT_H);
  c.drawImage(baseCanvas, 0, 0);
  if (paintTexture) paintTexture.needsUpdate = true;
}

/**
 * Squeezes a geometry's v range into one band of the paint canvas.
 *
 * Done to the vertices rather than with texture offset/repeat because a
 * three.js texture carries its own transform: doing it that way would need one
 * texture per part, and each would be its own upload of the same canvas every
 * time the brush moved. Baked here, all three parts share one map.
 *
 * v=0 is the bottom row of the image, hence the flips.
 */
function mapIntoBand(geometry, band) {
  const uv = geometry.attributes.uv;
  const top = 1 - band.y / PAINT_H;
  const bottom = 1 - (band.y + band.height) / PAINT_H;
  for (let i = 0; i < uv.count; i++) {
    uv.setY(i, bottom + uv.getY(i) * (top - bottom));
  }
  uv.needsUpdate = true;
  return geometry;
}

/**
 * The bucket geometry on its own, origin at the base. Exported because the
 * friend is built from the same shape — it is, after all, the bucket you fed
 * the machine.
 */
export function buildBucketMesh() {
  const group = new THREE.Group();
  const painted = bucketPaintSurface().texture;

  // Low metalness on purpose. There is no environment map in this scene, so a
  // highly metallic surface has nothing to reflect and renders almost black —
  // which is exactly what a galvanised bucket must not do.
  const dark = new THREE.MeshStandardMaterial({
    color: PALETTE.galvanisedDark,
    roughness: 0.5,
    metalness: 0.3,
  });

  // The rim and handle. Same map as the body, so still one texture and one
  // upload; a separate material only because they are solid tubes and do not
  // want the body's double-sided pass.
  const trim = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: painted,
    roughness: 0.5,
    metalness: 0.3,
  });

  // Tapered body, open at the top so you can see down into it.
  const body = new THREE.Mesh(
    mapIntoBand(new THREE.CylinderGeometry(0.3, 0.22, 0.41, 22, 1, true), BAND.body),
    new THREE.MeshStandardMaterial({
      // White, with the galvanised colour painted into the map instead. A
      // material colour multiplies the map, so leaving it as the metal would
      // tint every colour you brushed on toward grey-green.
      color: 0xffffff,
      map: painted,
      roughness: 0.45,
      metalness: 0.25,
      side: THREE.DoubleSide,
    })
  );
  body.position.y = 0.205;
  body.castShadow = true;
  group.add(body);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.035, 22), dark);
  base.position.y = 0.017;
  base.castShadow = true;
  group.add(base);

  // Dried residue in the bottom — it has carried something before.
  const residue = new THREE.Mesh(
    new THREE.CircleGeometry(0.212, 22),
    new THREE.MeshStandardMaterial({ color: 0x2a1836, roughness: 0.7 })
  );
  residue.rotation.x = -Math.PI / 2;
  residue.position.y = 0.04;
  group.add(residue);

  // Rim and handle are painted too, so they get more segments than a bare tube
  // needs — 8 around the rim's tube put a brush stroke on a visible facet.
  const rim = new THREE.Mesh(mapIntoBand(new THREE.TorusGeometry(0.3, 0.022, 14, 44), BAND.rim), trim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.41;
  rim.castShadow = true;
  group.add(rim);

  // Swing handle, arcing over the mouth.
  const handle = new THREE.Mesh(
    mapIntoBand(new THREE.TorusGeometry(0.285, 0.018, 12, 40, Math.PI), BAND.handle),
    trim
  );
  handle.position.y = 0.41;
  handle.castShadow = true;
  group.add(handle);

  // Lugs the handle pivots on. Left bare — they are the pivots, not the bucket,
  // and at 3cm there is nothing to paint on them.
  for (const x of [-0.285, 0.285]) {
    const lug = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), dark);
    lug.position.set(x, 0.4, 0);
    group.add(lug);
  }

  return group;
}

export function createBucket(scene, position) {
  const group = buildBucketMesh();
  group.position.copy(position);
  // Knocked over at a slight angle, as if dropped rather than placed.
  group.rotation.set(0.06, 0.7, 0.09);
  scene.add(group);

  let held = false;

  return {
    group,

    /** Where the interact prompt anchors while it's on the floor. */
    get anchor() {
      return group.position.clone().setY(group.position.y + 0.32);
    },

    get isHeld() {
      return held;
    },

    /** Reparents onto the camera so it rides in view. */
    pickUp(camera) {
      if (held) return;
      held = true;
      camera.add(group);
      group.position.copy(HELD_POSITION);
      group.rotation.copy(HELD_ROTATION);
      group.scale.setScalar(HELD_SCALE);
    },

    /** Drops it into a target parent at a given local spot. */
    placeInto(parent, localPosition) {
      held = false;
      parent.add(group);
      group.position.copy(localPosition);
      group.rotation.set(0, 0.4, 0);
      group.scale.setScalar(1);
    },
  };
}
