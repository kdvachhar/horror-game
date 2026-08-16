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
 * 1024 x 256 for a body 1.6m around and 0.41 tall — near enough square texels,
 * and fine enough to hold a brush stroke at the distance you look at it.
 */
const PAINT_W = 1024;
const PAINT_H = 256;
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
  b.fillStyle = PALETTE.galvanised;
  b.fillRect(0, 0, PAINT_W, PAINT_H);
  // A little vertical streaking, so bare bucket is not a flat swatch and a
  // painted one has something underneath it.
  for (let i = 0; i < 90; i++) {
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
 * The bucket geometry on its own, origin at the base. Exported because the
 * friend is built from the same shape — it is, after all, the bucket you fed
 * the machine.
 */
export function buildBucketMesh() {
  const group = new THREE.Group();

  // Low metalness on purpose. There is no environment map in this scene, so a
  // highly metallic surface has nothing to reflect and renders almost black —
  // which is exactly what a galvanised bucket must not do.
  const dark = new THREE.MeshStandardMaterial({
    color: PALETTE.galvanisedDark,
    roughness: 0.5,
    metalness: 0.3,
  });

  // Tapered body, open at the top so you can see down into it.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.22, 0.41, 22, 1, true),
    new THREE.MeshStandardMaterial({
      // White, with the galvanised colour painted into the map instead. A
      // material colour multiplies the map, so leaving it as the metal would
      // tint every colour you brushed on toward grey-green.
      color: 0xffffff,
      map: bucketPaintSurface().texture,
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

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.022, 8, 22), dark);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.41;
  rim.castShadow = true;
  group.add(rim);

  // Swing handle, arcing over the mouth.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.018, 6, 20, Math.PI), dark);
  handle.position.y = 0.41;
  handle.castShadow = true;
  group.add(handle);

  // Lugs the handle pivots on.
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
