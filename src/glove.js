import * as THREE from 'three';
import { makeGloveSurface, cloneSurface } from './textures.js';

/**
 * The green work glove, shared by everything in the game that has hands: the
 * arm that reaches for you at the end of the first room, and the pair mounted
 * in the medical room wall. One definition, so they are unmistakably the same
 * pair of hands.
 */

/** One finger: three tapering segments, each hinged off the last. */
export function buildFinger(length, thickness, material, seamMaterial) {
  const root = new THREE.Group();
  const joints = [];
  let parent = root;

  for (let i = 0; i < 3; i++) {
    const segmentLength = length * (i === 0 ? 0.42 : i === 1 ? 0.34 : 0.24);
    const width = thickness * (1 - i * 0.16);

    // Segments run outward from the knuckle, +Y. Built the other way they
    // extend back down through the palm and the hand reads as a plain slab.
    const joint = new THREE.Group();
    joint.position.y = i === 0 ? 0 : length * (i === 1 ? 0.42 : 0.34);
    parent.add(joint);

    const bone = new THREE.Mesh(
      // Generous segment counts: this ends up filling the screen, and a
      // low-poly capsule reads as a faceted tube at that size.
      new THREE.CapsuleGeometry(width / 2, segmentLength * 0.7, 8, 18),
      material
    );
    bone.position.y = segmentLength / 2;
    bone.castShadow = true;
    joint.add(bone);

    // Collected as they're built. Walking the tree afterwards does not work:
    // each joint's first child is its own bone, not the next joint down.
    // A crease ring where the glove gathers at the knuckle. This is most of
    // what separates a gloved finger from a smooth tube.
    if (i > 0) {
      const crease = new THREE.Mesh(
        new THREE.TorusGeometry(width / 2 + 0.008, 0.018, 8, 20),
        seamMaterial
      );
      crease.rotation.x = Math.PI / 2;
      joint.add(crease);
    }

    joints.push(joint);
    parent = joint;
  }

  return { root, joints };
}

// A rubber work glove. Two greens: the glove itself and a darker cuff, which is
// what actually says "glove" rather than "green hand".
const GLOVE = '#4e9257';
const CUFF = '#2c5f36';
const SEAM = '#24512d';
// The sleeve sits between the two: dark enough to read as a separate garment
// from the glove, light enough not to vanish against an unlit floor.
const SLEEVE = '#3d7547';

// One weave, shared. It's greyscale, so each material multiplies its own colour
// through it and the glove and its cuff come from the same cloth.
let weave = null;

function gloveMaterial(color, repeat = 5) {
  weave ??= makeGloveSurface(1, 1);
  const maps = cloneSurface(weave, repeat, repeat);
  return new THREE.MeshStandardMaterial({
    ...maps,
    color,
    metalness: 0.02,
    // Carries its own light. It arrives in a room lit by a single spotlight
    // several metres away, and lit purely by the room it is a black slab.
    emissive: new THREE.Color(color).multiplyScalar(0.2),
  });
}

export function buildHand({ withArm = true } = {}) {
  const group = new THREE.Group();
  const material = gloveMaterial(GLOVE, 7);
  const cuffMaterial = gloveMaterial(CUFF, 5);
  // Seams, creases and grip are the darker rubber a work glove is finished with.
  const seamMaterial = new THREE.MeshStandardMaterial({
    color: SEAM,
    roughness: 0.42,
    metalness: 0.04,
    emissive: new THREE.Color(SEAM).multiplyScalar(0.16),
  });

  // Palm as a squashed sphere rather than a box. A glove has no hard edges
  // anywhere, and at this size a box palm is the one thing that gives it away.
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material);
  palm.scale.set(0.56, 0.68, 0.2);
  palm.castShadow = true;
  group.add(palm);

  // Heel of the hand, filling out the base so the sphere doesn't taper away.
  const heel = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
  heel.scale.set(0.48, 0.3, 0.19);
  heel.position.y = -0.42;
  group.add(heel);

  // Knuckle roll across the top, as a capsule laid on its side.
  const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.78, 8, 18), material);
  knuckles.rotation.z = Math.PI / 2;
  knuckles.position.y = 0.52;
  knuckles.castShadow = true;
  group.add(knuckles);

  const fingers = [];
  const spacing = [-0.37, -0.12, 0.13, 0.38];
  const lengths = [0.92, 1.05, 0.98, 0.78];
  spacing.forEach((x, i) => {
    const finger = buildFinger(lengths[i], 0.23, material, seamMaterial);
    finger.root.position.set(x, 0.5, 0.02);
    group.add(finger.root);
    fingers.push(finger);
  });

  const thumb = buildFinger(0.8, 0.27, material, seamMaterial);
  thumb.root.position.set(-0.46, -0.12, 0.12);
  thumb.root.rotation.z = 1.1;
  group.add(thumb.root);
  fingers.push(thumb);

  // Grip dots across the palm, the dipped-rubber kind. The palm is what faces
  // you as it closes, so this is the detail doing the most work.
  const dot = new THREE.SphereGeometry(0.045, 10, 8);
  for (let gx = -3; gx <= 3; gx++) {
    for (let gy = -4; gy <= 3; gy++) {
      const x = gx * 0.15;
      const y = gy * 0.15 + 0.05;
      // Keep them on the palm and follow its curve outward.
      const u = x / 0.56;
      const v = y / 0.68;
      if (u * u + v * v > 0.78) continue;
      const z = 0.2 * Math.sqrt(1 - u * u - v * v);

      const pip = new THREE.Mesh(dot, seamMaterial);
      pip.position.set(x, y, z - 0.01);
      pip.scale.set(1, 1, 0.55);
      group.add(pip);
    }
  }

  // Flared cuff, then the sleeve running back into the dark. The flare is the
  // detail that reads as a glove pulled over a sleeve.
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.36, 0.38, 24), cuffMaterial);
  cuff.position.y = -0.86;
  cuff.castShadow = true;
  group.add(cuff);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 10, 24), cuffMaterial);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -1.04;
  group.add(rim);

  // Ribbing round the cuff, the elasticated part.
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.44 - i * 0.03, 0.022, 8, 22), seamMaterial);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = -0.78 - i * 0.09;
    group.add(rib);
  }

  // A forearm that runs back into the room rather than a stub ending in mid
  // air. Optional: the pair set into the medical room's wall come out of a
  // conduit instead and must not bring a sleeve with them.
  if (!withArm) return { group, fingers };

  const arm = new THREE.Group();
  arm.position.y = -0.95;
  // Swept down and out across the frame rather than straight down or straight
  // back. Straight down leaves the bottom edge within centimetres of the wrist;
  // straight back hides behind the palm. Across the corner is the only angle
  // that stays on screen long enough to read as an arm.
  arm.rotation.set(0.2, 0, 0.8);
  group.add(arm);

  const forearm = new THREE.Mesh(
    // Widening toward the far end: an arm thickens toward the elbow, and the
    // taper also sells the perspective as it goes away from you.
    // Starts at the cuff's own width, so the limb is continuous at the wrist.
    new THREE.CylinderGeometry(0.44, 0.72, 8, 22, 1, true),
    gloveMaterial(SLEEVE, 4)
  );
  forearm.position.y = -4;
  forearm.castShadow = true;
  arm.add(forearm);

  return { group, fingers };
}

