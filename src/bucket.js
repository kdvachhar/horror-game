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
      color: PALETTE.galvanised,
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
