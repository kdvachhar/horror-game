import * as THREE from 'three';
import { MEDICAL } from './config.js';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  cloneSurface,
  worldRepeat,
  PALETTE,
} from './textures.js';
import { buildHand } from './glove.js';
import { createSpeechRunner, MOUTH_AT_REST } from './voice.js';

/**
 * The room you wake up in, and the thing waiting on its wall.
 *
 * Built from the concept art: a television for a head, its screen showing a
 * green face — two plug-shaped eyes and a stepped mouth — with loose coloured
 * wiring spilling out of the casing top and bottom. Its arms are not attached
 * to it at all. They come out of two ports in the wall either side, as ribbed
 * conduit, and end in the same green gloves that reached for you in the dark.
 */

// Screen face, from the drawing: sickly green on a dead grey tube. Rendered
// exactly as written — see screenMaterial.
const FACE = '#6f9040';
const WIRE_COLOURS = ['#b23b2e', '#2f4b9c', '#8a9440'];

function clinicalMaterial(color, roughness = 0.55) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

/**
 * The face is drawn, not lit — and not tone mapped either.
 *
 * Unlit alone was not enough. A standard material picked up the ward lamp and
 * washed the face out to white, so it became MeshBasicMaterial; but ACES still
 * had it, and ACES lifts hard through the mids. At an exposure of 1.42 a mid
 * green came out close to mint no matter what was authored — darkening the
 * constant twice barely moved the pixels. Exempting it means the value written
 * here is the value on screen, which is the only way to actually pick a colour.
 */
function screenMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

/**
 * One loose wire: a wavy tube. The drawing has them sprouting untidily from the
 * casing in different colours and lengths, which is most of what makes the
 * thing look torn out of something rather than installed.
 */
function buildWire(origin, direction, length, colour) {
  const points = [];
  const segments = 6;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(
      new THREE.Vector3(
        origin.x + direction.x * length * t + Math.sin(t * 7 + origin.x) * 0.12 * t,
        origin.y + direction.y * length * t + Math.cos(t * 9 + origin.y) * 0.14 * t,
        origin.z + direction.z * length * t + Math.sin(t * 5) * 0.05
      )
    );
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 20, 0.022, 6, false),
    clinicalMaterial(colour, 0.7)
  );
  mesh.castShadow = true;
  return mesh;
}

/** The television, its face, and the wiring hanging off it. */
function buildTelevision() {
  const group = new THREE.Group();

  // Wide. The face inside it does not scale with the casing — it stays the
  // size it was drawn, sitting in the middle of a lot more screen.
  const width = 3.8;
  const height = 1.9;
  const depth = 0.36;

  // Casing: a deep grey box, bezel proud of the screen on all sides.
  const casing = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(1.4, 0.8, '#84847d'),
      metalness: 0.15,
    })
  );
  casing.castShadow = true;
  casing.receiveShadow = true;
  group.add(casing);

  // The tube itself, recessed into the bezel.
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.5, height - 0.44, 0.06),
    new THREE.MeshBasicMaterial({ color: '#0b0a0d', toneMapped: false })
  );
  screen.position.z = depth / 2 + 0.01;
  group.add(screen);

  const face = new THREE.Group();
  face.position.z = depth / 2 + 0.05;
  group.add(face);

  // Eyes. In the drawing each is a narrow vertical bar with a wider cap across
  // the top, like a plug — so that's exactly how they're built.
  const eyes = [];
  const faceParts = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.42, 0.28, 0);

    // The open eye, in its own group so shutting can squash it without also
    // squashing the closed shape sitting alongside it.
    const open = new THREE.Group();
    eye.add(open);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), screenMaterial(FACE));
    cap.position.y = 0.3;
    open.add(cap);

    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.04), screenMaterial(FACE));
    open.add(stem);

    // The closed eye: a filled half-disc, flat edge down and the curve on top.
    // A squashed version of the open eye only ever gives a flat bar, and a bar
    // reads as switched off rather than as a shut eye.
    const closed = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 24, 0, Math.PI),
      screenMaterial(FACE)
    );
    closed.position.y = -0.06;
    closed.visible = false;
    eye.add(closed);

    face.add(eye);
    eyes.push({ group: eye, open, closed });
    faceParts.push(cap, stem, closed);
  }

  // Mouth: a stepped block, widest at the top and narrowing downward.
  const mouth = new THREE.Group();
  mouth.position.y = -0.42;
  // Narrow, not short. The mouth keeps its full height — step height and step
  // spacing are the same number, so the three stay contiguous — and it is the
  // width of each step that comes in.
  const steps = [
    [0.54, 0.14, 0.14],
    [0.36, 0.14, 0],
    [0.18, 0.14, -0.14],
  ];
  for (const [w, h, y] of steps) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), screenMaterial(FACE));
    step.position.y = y;
    mouth.add(step);
    faceParts.push(step);
  }
  face.add(mouth);

  // Wiring out of the top and bottom of the casing, as in the drawing.
  const tops = [-0.72, -0.36, 0.08, 0.44, 0.8].map((f) => f * width * 0.5);
  tops.forEach((x, i) => {
    const wire = buildWire(
      new THREE.Vector3(x, height / 2, 0.1),
      new THREE.Vector3((i - 2) * 0.12, 1, 0.15).normalize(),
      0.55 + (i % 3) * 0.25,
      WIRE_COLOURS[i % WIRE_COLOURS.length]
    );
    group.add(wire);
  });
  [-0.6, -0.16, 0.28, 0.68].map((f) => f * width * 0.5).forEach((x, i) => {
    const wire = buildWire(
      new THREE.Vector3(x, -height / 2, 0.1),
      new THREE.Vector3((i - 1.5) * 0.14, -1, 0.2).normalize(),
      0.45 + (i % 3) * 0.22,
      WIRE_COLOURS[(i + 1) % WIRE_COLOURS.length]
    );
    group.add(wire);
  });

  // Its own glow on the wall around it.
  const glow = new THREE.PointLight(FACE, 2.2, 4.5, 2);
  glow.position.z = 0.7;
  group.add(glow);

  return { group, eyes, mouth, glow, screen, faceParts, width, depth };
}

/**
 * One arm: a ribbed conduit out of a ring set into the wall, bent at the elbow,
 * ending in a gloved hand. The drawing shows the arms detached from the
 * television entirely, which is the unsettling part — so they are separate
 * objects here too, not children of it.
 *
 * The hose follows an explicit curve rather than a chain of relative bends. A
 * chain compounds: a small turn per segment became two radians over fourteen of
 * them, and the arms coiled up against the wall instead of reaching out.
 */
function buildWallArm(shape) {
  const group = new THREE.Group();

  const port = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.09, 10, 22),
    clinicalMaterial('#5d5f5e', 0.6)
  );
  port.castShadow = true;
  group.add(port);

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20),
    clinicalMaterial('#1a1c1e', 0.9)
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.z = -0.1;
  group.add(socket);

  // Everything past the wall fitting hangs off this, so the arm can sway
  // without dragging the port ring around in the plaster with it.
  const limb = new THREE.Group();
  group.add(limb);

  // Two shapes for the same arm: how it hangs, and how it folds. The conduit
  // is rebuilt between them rather than swung about the port, because folding
  // these arms is not a rotation — each one hooks down and back up, and no
  // amount of turning a straight-ish tube produces that.
  const restPoints = shape.path.map((p) => new THREE.Vector3(...p));
  const foldPoints = shape.cross.map((p) => new THREE.Vector3(...p));
  const curve = new THREE.CatmullRomCurve3(restPoints.map((p) => p.clone()));

  // Built as a chain of links rather than one baked TubeGeometry, so the shape
  // can change at all. A tube is welded at build time; these are just meshes
  // walked onto wherever the curve happens to be this frame.
  const ribMaterial = clinicalMaterial('#a3a49e', 0.5);
  const coreMaterial = clinicalMaterial('#6e6f6a', 0.75);
  const ribGeometry = new THREE.TorusGeometry(0.15, 0.042, 8, 16);
  // A shade longer than the spacing, so consecutive pieces overlap and read as
  // one continuous hose instead of a stack of separate cans.
  const coreGeometry = new THREE.CylinderGeometry(0.115, 0.115, 0.17, 12);

  const steps = Math.round(curve.getLength() / 0.13);
  const axis = new THREE.Vector3(0, 0, 1);
  const links = [];
  for (let i = 0; i <= steps; i++) {
    const rib = new THREE.Mesh(ribGeometry, ribMaterial);
    rib.castShadow = true;
    limb.add(rib);

    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.x = Math.PI / 2;
    core.castShadow = true;
    const carrier = new THREE.Group();
    carrier.add(core);
    limb.add(carrier);

    links.push({ rib, carrier, t: i / steps });
  }

  // Wrist: a collar where the conduit ends and the glove begins.
  const wrist = new THREE.Group();
  limb.add(wrist);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.185, 0.2, 18),
    clinicalMaterial('#9a9a95', 0.6)
  );
  collar.rotation.x = Math.PI / 2;
  collar.position.z = 0.04;
  wrist.add(collar);

  // The glove is built with its fingers running up +Y, so a quarter turn about
  // X sends them on down the conduit instead of back into the wall.
  //
  // The order matters and is not the default. `roll` is a twist of the wrist
  // about the arm's own axis, which means it has to be applied *after* that
  // quarter turn. Euler XYZ composes the Z rotation innermost, so it was being
  // applied first — swinging the fingers off the arm sideways instead of
  // rotating the palm around it. ZYX puts the X turn first and the roll last.
  const { group: hand, fingers } = buildHand({ withArm: false });
  hand.scale.setScalar(0.44);
  hand.rotation.set(Math.PI / 2, 0, shape.roll, 'ZYX');

  // The glove's origin is the middle of its palm, not its wrist — the cuff rim
  // sits well behind it. Measure how far back, and push the hand forward by
  // that much, so the rim lands on the end of the conduit rather than the palm
  // doing. Measured rather than hardcoded: the glove is shared with the
  // cutscene and can be reshaped there.
  hand.updateMatrixWorld(true);
  const back = new THREE.Box3().setFromObject(hand).min.z;
  hand.position.z = -back - 0.08;

  // `bend` then has to pivot about that rim and not about the palm. Rotating
  // the hand itself swung the cuff off the end of the arm by more than the
  // collar is wide, which is what left the hands floating unattached.
  const joint = new THREE.Group();
  joint.rotation.x = shape.bend;
  joint.add(hand);
  wrist.add(joint);

  // The hands are still. Set once here rather than animated, so the movement
  // in these arms is all in the arm — the glove is carried by the conduit and
  // does nothing of its own. Barely curled, so the fingers stay spread the way
  // they are drawn.
  for (const finger of fingers) {
    for (const knuckle of finger.joints) knuckle.rotation.x = 0.1;
  }

  /**
   * Reshape the arm somewhere between hanging (0) and folded (1).
   *
   * Blends the curve's control points, then walks every link onto the result.
   * Called only when the amount has actually moved, since it costs a couple of
   * hundred curve evaluations and sits at 0 or 1 almost all of the time.
   */
  function poseAt(amount) {
    for (let i = 0; i < curve.points.length; i++) {
      curve.points[i].lerpVectors(restPoints[i], foldPoints[i], amount);
    }
    // The arc-length table is what makes getPointAt evenly spaced, and it is
    // cached — without this the ribs bunch up wherever the curve just tightened.
    curve.updateArcLengths();

    for (const link of links) {
      const at = curve.getPointAt(link.t);
      const along = curve.getTangentAt(link.t);
      link.rib.position.copy(at);
      link.rib.quaternion.setFromUnitVectors(axis, along);
      link.carrier.position.copy(at);
      link.carrier.quaternion.copy(link.rib.quaternion);
    }

    wrist.position.copy(curve.getPointAt(1));
    wrist.quaternion.setFromUnitVectors(axis, curve.getTangentAt(1));
  }
  poseAt(0);

  return { group, limb, joint, fingers, curve, poseAt };
}

// Straight from the drawing: one arm low with the hand open and spread, the
// other bent up at the elbow with the hand raised.
const ARMS = [
  {
    port: [-2.9, 1.25],
    path: [[0, 0, 0], [0, -0.05, 0.8], [0.36, -0.24, 1.7], [0.8, -0.3, 2.7]],
    // Folded: out of the wall, dropping into a deep hook and sweeping across
    // to the far side. The whole fold stays under the screen's bottom edge —
    // crossing them over the face buries the mouth exactly when it is talking.
    // This is the lower of the two, so the other can pass above it.
    cross: [[0, 0, 0], [0.2, -0.75, 0.75], [1.55, -0.85, 1.1], [2.9, -0.75, 0.85]],
    // Fingers carry on down the line of the conduit — `bend` is only a small
    // correction now, since each arm's tangent already points into the room.
    bend: -0.1,
    roll: 3.0,
  },
  {
    port: [2.9, 1.55],
    path: [[0, 0, 0], [0, 0.07, 0.85], [-0.38, 0.4, 1.7], [-0.8, 0.82, 2.5]],
    // Folded: down off its higher port, over the top of the other one and on
    // to the far side — the hump in the drawing, kept below the screen.
    cross: [[0, 0, 0], [-0.3, -0.6, 0.8], [-1.6, -0.75, 1.15], [-2.9, -0.7, 0.9]],
    bend: 0.34,
    roll: -2.8,
  },
];

/**
 * The way out, set into the wall behind you.
 *
 * Surface-mounted rather than cut through — the room's walls are single
 * planes, so there is no opening to frame. A shallow frame standing proud of
 * the wall with the leaf recessed into it reads the same from inside, which is
 * the only side of it anyone sees.
 *
 * It does not open. There is nothing on the other side yet.
 */
function buildWardDoor() {
  const group = new THREE.Group();

  const width = 1.1;
  const height = 2.15;

  const frame = clinicalMaterial('#b3b7b0', 0.5);
  const jamb = 0.09;
  // Two uprights and a head, standing 0.13 off the wall.
  for (const [w, h, x, y] of [
    [jamb, height + jamb, -(width + jamb) / 2, (height + jamb) / 2],
    [jamb, height + jamb, (width + jamb) / 2, (height + jamb) / 2],
    [width + jamb * 2, jamb, 0, height + jamb / 2],
  ]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.13), frame);
    piece.position.set(x, y, 0.065);
    piece.castShadow = true;
    piece.receiveShadow = true;
    group.add(piece);
  }

  // The leaf, sat back inside the frame.
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, 0.06),
    clinicalMaterial('#8c9a93', 0.62)
  );
  leaf.position.set(0, height / 2, 0.03);
  leaf.receiveShadow = true;
  group.add(leaf);

  // Wire-glass vision panel, the tall narrow kind.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.72, 0.02),
    new THREE.MeshBasicMaterial({ color: '#12181a', toneMapped: false })
  );
  glass.position.set(0, height - 0.62, 0.065);
  group.add(glass);

  const wire = clinicalMaterial('#6d7a76', 0.5);
  for (let i = 1; i < 4; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.008, 0.026), wire);
    bar.position.set(0, height - 0.62 - 0.36 + (i * 0.72) / 4, 0.066);
    group.add(bar);
  }
  for (const x of [-0.113, 0.113]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.72, 0.026), wire);
    bar.position.set(x, height - 0.62, 0.066);
    group.add(bar);
  }

  // Kick plate along the bottom, scuffed by every trolley that ever went
  // through, and a lever handle on the opening edge.
  const kick = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.06, 0.3, 0.015),
    clinicalMaterial('#9fa5a2', 0.35)
  );
  kick.position.set(0, 0.2, 0.068);
  group.add(kick);

  const metal = clinicalMaterial('#40474a', 0.4);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), metal);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(width / 2 - 0.16, 1.02, 0.07);
  group.add(rose);

  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.035), metal);
  lever.position.set(width / 2 - 0.25, 1.02, 0.095);
  lever.castShadow = true;
  group.add(lever);

  return group;
}

/**
 * A ward bed. The one you wake up on and the eight rotting around it are the
 * same object — `knocked` only tips it onto its side, which is the state most
 * of this room's are in.
 *
 * Built head-to--Z so a bed set against a side wall is just a quarter turn.
 */
function buildBed(knocked = false) {
  const bed = new THREE.Group();
  // The frame lives one level down so `knocked` can tip it without disturbing
  // the yaw that places it in the room.
  const body = new THREE.Group();
  bed.add(body);

  const mattress = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.16, 2.1),
    clinicalMaterial(knocked ? '#767f88' : '#8f9aa4', 0.85)
  );
  mattress.castShadow = true;
  mattress.receiveShadow = true;
  if (knocked) {
    // The mattress does not go over with the frame — it slides off and ends up
    // dumped on the floor beside it. A tipped bed with the mattress still
    // strapped on just reads as a blank white slab.
    const fall = knocked < 0 ? -1 : 1;
    mattress.position.set(fall * 1.05, 0.08, 0.35);
    mattress.rotation.set(0, fall * 0.42, 0);
    bed.add(mattress);
  } else {
    mattress.position.y = 0.78;
    body.add(mattress);
  }

  // A perimeter with slats across it, not a solid plate. It barely matters
  // upright, but a tipped bed shows the frame broadside — and a solid plate
  // there reads as a blank white board rather than a bed.
  const frameMaterial = clinicalMaterial('#b6b9b4', 0.5);
  for (const [w, h, d, x, z] of [
    [0.08, 0.11, 2.16, -0.47, 0],
    [0.08, 0.11, 2.16, 0.47, 0],
    [1.02, 0.11, 0.08, 0, -1.04],
    [1.02, 0.11, 0.08, 0, 1.04],
  ]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMaterial);
    rail.position.set(x, 0.68, z);
    rail.castShadow = true;
    body.add(rail);
  }
  for (const z of [-0.68, -0.23, 0.23, 0.68]) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.09), frameMaterial);
    slat.position.set(0, 0.7, z);
    slat.castShadow = true;
    body.add(slat);
  }

  // Head and foot boards — the thing that says 'hospital bed' at a glance,
  // and the part still standing proud when one has gone over.
  for (const [tall, z] of [[0.52, -1.08], [0.34, 1.08]]) {
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, tall, 0.05),
      clinicalMaterial('#c4c7c1', 0.45)
    );
    board.position.set(0, 0.73 + tall / 2, z);
    board.castShadow = true;
    body.add(board);
  }

  for (const [lx, lz] of [[-0.42, -0.92], [0.42, -0.92], [-0.42, 0.92], [0.42, 0.92]]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.64, 10),
      clinicalMaterial('#a9aca7', 0.45)
    );
    leg.position.set(lx, 0.32, lz);
    leg.castShadow = true;
    body.add(leg);
  }

  // Rails, the kind that stop you rolling off.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 1.5),
      clinicalMaterial('#c2c5bf', 0.4)
    );
    rail.position.set(side * 0.52, 1.08, 0);
    rail.castShadow = true;
    body.add(rail);
    for (const z of [-0.6, 0.6]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8),
        clinicalMaterial('#c2c5bf', 0.4)
      );
      post.position.set(side * 0.52, 0.94, z);
      body.add(post);
    }
  }

  if (knocked) {
    // Onto its side. The lift and the sideways shift put it back down on the
    // floor and back on its own centre — rotating alone leaves it half sunk
    // and half a metre off to one side.
    const fall = knocked < 0 ? -1 : 1;
    body.rotation.z = (fall * Math.PI) / 2;
    body.rotation.x = fall * 0.05;
    body.position.set(fall * -0.55, 0.56, 0);
  }

  return bed;
}

/**
 * Where the beds are. Heads to the wall down both sides — yaw turns the bed's
 * -Z end into the wall — and a couple dragged out and dumped in the middle.
 * `knocked` is 1 or -1 for which way it went over; `wake` marks yours.
 */
const WARD = [
  { x: -5.3, z: -4.1, yaw: Math.PI / 2 },
  { x: -5.3, z: -1.6, yaw: Math.PI / 2, wake: true },
  { x: -5.3, z: 2.0, yaw: Math.PI / 2, knocked: 1 },
  { x: 5.3, z: -3.6, yaw: -Math.PI / 2, knocked: -1 },
  { x: 5.3, z: 0.6, yaw: -Math.PI / 2 },
  { x: 0.4, z: 3.4, yaw: 1.9, knocked: -1 },
];

/** The bed you wake up on, out of the table above. */
const WAKE_SLOT = WARD.find((slot) => slot.wake);

export function createMedicalRoom(scene) {
  const group = new THREE.Group();
  group.position.set(...MEDICAL.center);
  scene.add(group);

  const { width, depth, height } = MEDICAL;

  // ── shell ─────────────────────────────────────────────────────────────────
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(width, depth)),
      color: '#b9bcb6',
      metalness: 0.02,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(width, depth)),
      color: '#c8cac3',
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  group.add(ceiling);

  // Pale clinical walls — the same concrete surface tinted almost white, so it
  // reads as a tiled ward rather than the poured shell you came from.
  const wallSurface = makeWallSurface(...worldRepeat(width, height));
  const wallMaterial = new THREE.MeshStandardMaterial({
    ...wallSurface,
    color: '#cfd2cb',
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    ...cloneSurface(wallSurface, ...worldRepeat(depth, height)),
    color: '#cfd2cb',
    metalness: 0,
    side: THREE.DoubleSide,
  });

  for (const wall of [
    { size: [width, height], pos: [0, height / 2, -depth / 2], rot: 0, mat: wallMaterial },
    { size: [width, height], pos: [0, height / 2, depth / 2], rot: Math.PI, mat: wallMaterial },
    { size: [depth, height], pos: [-width / 2, height / 2, 0], rot: Math.PI / 2, mat: sideMaterial },
    { size: [depth, height], pos: [width / 2, height / 2, 0], rot: -Math.PI / 2, mat: sideMaterial },
  ]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...wall.size), wall.mat);
    mesh.position.set(...wall.pos);
    mesh.rotation.y = wall.rot;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ── the thing on the wall ─────────────────────────────────────────────────
  const wallZ = -depth / 2;
  const television = buildTelevision();
  television.group.position.set(0, 2.05, wallZ + 0.3);
  group.add(television.group);

  const arms = [];
  for (const shape of ARMS) {
    const arm = buildWallArm(shape);
    arm.group.position.set(shape.port[0], shape.port[1], wallZ + 0.12);
    group.add(arm.group);
    arms.push(arm);
  }

  // ── the way out ───────────────────────────────────────────────────────────
  // In the corner of the wall behind you: sitting up on the bed you face
  // straight down it, so this is ahead and to your right, and the television
  // is the other way.
  const wardDoor = buildWardDoor();
  wardDoor.position.set(width / 2 - 1.1, 0, depth / 2 - 0.02);
  wardDoor.rotation.y = Math.PI;
  group.add(wardDoor);

  // ── the ward ──────────────────────────────────────────────────────────────
  const beds = [];
  for (const slot of WARD) {
    const bed = buildBed(slot.knocked);
    bed.position.set(slot.x, 0, slot.z);
    bed.rotation.y = slot.yaw;
    group.add(bed);
    beds.push(bed);
  }

  // ── light ─────────────────────────────────────────────────────────────────
  // One hard overhead panel: a ward light, not a horror spotlight. The room
  // being clean and bright is the point — it is worse than the dark one.
  const lamps = [];
  for (const [z, casts] of [[-3.0, true], [2.4, false]]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.08, 0.8),
      new THREE.MeshBasicMaterial({ color: '#f2f6ff' })
    );
    panel.position.set(0, height - 0.08, z);
    group.add(panel);

    const lamp = new THREE.PointLight(0xeef4ff, 58, 20, 1.25);
    lamp.position.set(0, height - 0.35, z);
    if (casts) {
      lamp.castShadow = true;
      lamp.shadow.mapSize.set(1024, 1024);
      lamp.shadow.camera.near = 0.3;
      lamp.shadow.camera.far = 22;
      lamp.shadow.normalBias = 0.05;
      lamp.shadow.bias = -0.0008;
    }
    group.add(lamp);
    lamps.push(lamp);
  }

  // A low fill against the far wall so the arms aren't silhouettes. Ambient
  // light is no use here — it is global, and the main hall would get it too.
  const fill = new THREE.PointLight(0xdfe6ee, 9, 11, 1.4);
  fill.position.set(0, 1.2, -depth / 2 + 2.4);
  group.add(fill);

  // ── collision ─────────────────────────────────────────────────────────────
  const [cx, , cz] = MEDICAL.center;
  const t = 0.8;
  const colliders = [
    { minX: cx - width / 2 - t, maxX: cx - width / 2, minZ: cz - depth / 2 - t, maxZ: cz + depth / 2 + t },
    { minX: cx + width / 2, maxX: cx + width / 2 + t, minZ: cz - depth / 2 - t, maxZ: cz + depth / 2 + t },
    { minX: cx - width / 2 - t, maxX: cx + width / 2 + t, minZ: cz - depth / 2 - t, maxZ: cz - depth / 2 },
    { minX: cx - width / 2 - t, maxX: cx + width / 2 + t, minZ: cz + depth / 2, maxZ: cz + depth / 2 + t },
  ];

  // One box per bed, standable — you can climb over the wreckage rather than
  // being walled in by it. A rotated rectangle's axis-aligned bounds are
  // |cos|·halfX + |sin|·halfZ across, and the mirror of that deep.
  for (const slot of WARD) {
    const halfX = slot.knocked ? 1.1 : 0.53;
    const halfZ = 1.1;
    const c = Math.abs(Math.cos(slot.yaw));
    const sn = Math.abs(Math.sin(slot.yaw));
    colliders.push({
      minX: cx + slot.x - (c * halfX + sn * halfZ),
      maxX: cx + slot.x + (c * halfX + sn * halfZ),
      minZ: cz + slot.z - (sn * halfX + c * halfZ),
      maxZ: cz + slot.z + (sn * halfX + c * halfZ),
      top: slot.knocked ? 1.05 : 0.86,
    });
  }

  // The television itself. It hangs from 1.1m up, which is below head height,
  // so there is no standing under it — the whole column is solid.
  {
    const tv = television.group.position;
    const halfWidth = television.width / 2;
    const halfDepth = television.depth / 2;
    colliders.push({
      minX: cx + tv.x - halfWidth,
      maxX: cx + tv.x + halfWidth,
      minZ: cz + tv.z - halfDepth,
      maxZ: cz + tv.z + halfDepth,
    });
  }

  /**
   * The arms, as a chain of boxes stepped along each conduit's curve.
   *
   * A single box per arm would be a bad fit — they run diagonally out of the
   * wall and one of them climbs. Stepping along the curve follows the shape,
   * and lets each step be dropped when it is overhead: a collider has no
   * underside, so a box under the raised arm's far end would be an invisible
   * wall in open floor where you can plainly see daylight beneath it.
   */
  // Measured off the player's own height: eye line 1.68 plus a little skull.
  // A step is kept when its underside is at or below this, because that is what
  // you would actually walk into.
  const HEAD_CLEARANCE = 1.85;
  const armBoxes = [];
  for (const arm of arms) {
    const steps = Math.max(2, Math.round(arm.curve.getLength() / 0.34));
    for (let i = 0; i <= steps; i++) {
      // The glove on the end is wider than the hose behind it.
      const half = i / steps > 0.86 ? 0.28 : 0.19;
      const box = {
        minX: 0,
        maxX: 0,
        minZ: 0,
        maxZ: 0,
        y: 0,
        // These boxes have no underside, so a step that has swung up over your
        // head has to switch itself off rather than stand as a wall in open
        // floor. It is a gate now rather than a one-time cull, because the arm
        // moves and a step's height is no longer fixed.
        enabled: () => box.y - half <= HEAD_CLEARANCE,
      };
      armBoxes.push({ box, arm, half, t: i / steps });
      colliders.push(box);
    }
  }

  const ARM_POINT = new THREE.Vector3();

  /**
   * Walk the arm colliders onto where the arms actually are this frame.
   *
   * Without this the boxes stay on the resting curve while the arm gestures
   * away from it, and you bump into empty air or reach through the glove. The
   * limb only ever rotates and both groups above it are pure translations, so
   * the world position is the rotated local point plus two offsets — no need
   * to force a matrix update through the whole room every frame to get it.
   */
  function updateArmColliders() {
    for (const { box, arm, half, t } of armBoxes) {
      // Read off the live curve, not a cached point — the conduit changes
      // shape when it folds, so where a step *is* is not fixed either.
      ARM_POINT.copy(arm.curve.getPointAt(t)).applyQuaternion(arm.limb.quaternion);
      const x = cx + arm.group.position.x + ARM_POINT.x;
      const z = cz + arm.group.position.z + ARM_POINT.z;
      box.minX = x - half;
      box.maxX = x + half;
      box.minZ = z - half;
      box.maxZ = z + half;
      box.y = arm.group.position.y + ARM_POINT.y;
    }
  }
  updateArmColliders();

  const speech = createSpeechRunner();
  let time = 0;
  // Eased rather than snapped to. The schedule steps between shapes instantly
  // and a mouth that did the same would flicker; width settles a little slower
  // than the jaw, which is also true of the real thing.
  let mouthOpen = MOUTH_AT_REST.open;
  let mouthWide = MOUTH_AT_REST.wide;
  // 1 is open, 0 is shut. Eased, so it reads as eyes closing rather than the
  // eyes simply being replaced by two dashes between frames.
  let eyesOpen = 1;
  // How much it is gesturing, and how hard the current syllable is landing.
  let talking = 0;
  // 0 is arms out, 1 is folded across in front of it, and `posed` is the
  // amount the conduits were last actually rebuilt at.
  let crossed = 0;
  let posed = 0;

  return {
    group,
    colliders,

    /**
     * The television talks. Subtitled and voiced through the shared voice, and
     * the mouth works while it does — the face is the only thing on screen that
     * can tell you where the sound is coming from.
     */
    speak(lines, onFinished) {
      speech.play(lines, onFinished);
    },
    get isSpeaking() {
      return speech.isSpeaking;
    },
    /** Dev handles: what the face is doing right now. */
    get mouthScale() {
      return television.mouth.scale;
    },
    get eyeScale() {
      return television.eyes[0].open.scale.y;
    },
    get eyeClosed() {
      return television.eyes[0].closed.visible ? +television.eyes[0].closed.scale.x.toFixed(2) : 0;
    },
    get currentLine() {
      return speech.line;
    },
    /** Dev handle: every arm collider step, in world space. */
    armSamples() {
      return armBoxes.map(({ box, half }) => ({
        x: (box.minX + box.maxX) / 2,
        z: (box.minZ + box.maxZ) / 2,
        y: box.y,
        half,
      }));
    },
    get gesture() {
      return {
        talking: +talking.toFixed(2),
        crossed: +crossed.toFixed(2),
        tips: arms.map((arm) => {
          const p = arm.curve.getPointAt(1).applyQuaternion(arm.limb.quaternion);
          return +(MEDICAL.center[0] + arm.group.position.x + p.x).toFixed(2);
        }),
        wristX: +arms[0].joint.rotation.x.toFixed(2),
        wristZ: +arms[0].joint.rotation.z.toFixed(2),
        limbY: +arms[0].limb.rotation.y.toFixed(3),
        curl: +arms[0].fingers[0].joints[0].rotation.x.toFixed(2),
      };
    },
    stopSpeaking() {
      speech.stop();
    },

    /**
     * Where you come round: on the bed against the left wall, head to the wall.
     * You sit up facing straight down the bed — across the ward, at the rest of
     * them — and only then turn onto the television, which is the point of
     * putting the bed against a wall rather than square in front of it.
     */
    wake: (() => {
      const bx = cx + WAKE_SLOT.x;
      const bz = cz + WAKE_SLOT.z;
      // Down the bed, away from the wall its head is against.
      const alongX = -Math.sin(WAKE_SLOT.yaw + Math.PI);
      const alongZ = -Math.cos(WAKE_SLOT.yaw + Math.PI);
      // Sitting up puts your head a little down the bed from the pillow.
      const sitting = [bx + alongX * -0.15, 1.55, bz + alongZ * -0.15];

      // Where it is, and how far round you have to come to be looking at it.
      const tv = [cx, 2.05, cz - MEDICAL.depth / 2 + 0.3];
      const dx = tv[0] - sitting[0];
      const dz = tv[2] - sitting[2];

      return {
        // Head at the head end, which is the end against the wall.
        pillow: [bx + alongX * -0.62, 1.08, bz + alongZ * -0.62],
        sitting,
        // Off the end of the bed, on the floor — you get up, you don't
        // stand on the mattress.
        standing: [bx + alongX * 1.8, 0, bz + alongZ * 1.8],
        // Lying and sitting: straight down the bed.
        yaw: WAKE_SLOT.yaw + Math.PI,
        // Then round onto it.
        facing: Math.atan2(-dx, -dz),
        facingPitch: Math.atan2(tv[1] - sitting[1], Math.hypot(dx, dz)),
      };
    })(),

    update(delta) {
      time += delta;
      speech.update(delta);

      // The screen is alive: a slow breath with the occasional dropped frame.
      const flicker = Math.sin(time * 31) > 0.96 ? 0.25 : 1;
      const breath = 0.82 + Math.sin(time * 1.9) * 0.14;
      const level = breath * flicker;

      for (const part of television.faceParts) {
        part.material.color.setStyle(FACE).multiplyScalar(0.45 + level * 0.55);
      }
      television.glow.intensity = 2.2 * level;

      // It watches. The eyes track slowly from side to side.
      const look = Math.sin(time * 0.55) * 0.07;

      // Some lines are delivered with them shut, which on this face means the
      // arc rather than the plug — a pair of upturned semicircles, and how a
      // face this simple reads as pleased with itself.
      const lidTarget = speech.line?.eyes === 'closed' ? 0.08 : 1;
      eyesOpen += (lidTarget - eyesOpen) * (1 - Math.exp(-7 * delta));

      television.eyes.forEach((eye, i) => {
        eye.group.position.x = (i === 0 ? -0.42 : 0.42) + look;

        // The open eye squashes shut and the arc grows in behind it, so the
        // two swap over mid-blink rather than one popping in on the other.
        eye.open.scale.y = Math.max(0.001, eyesOpen);
        eye.open.visible = eyesOpen > 0.32;

        const shut = Math.min(1, Math.max(0, (0.5 - eyesOpen) / 0.42));
        eye.closed.visible = shut > 0.01;
        eye.closed.scale.set(shut, shut, 1);
      });

      // The mouth is shaped to the syllable actually being spoken: a rounded
      // "oh" narrows and drops it, a flat "ee" spreads it and barely opens it,
      // and the consonants between close it. Idles with a slow breath.
      const target = speech.isSpeaking ? speech.mouth : MOUTH_AT_REST;
      // `breath` is taken above by the screen's flicker.
      const idle = speech.isSpeaking ? 0 : Math.sin(time * 2.4) * 0.02;
      mouthOpen += (target.open + idle - mouthOpen) * (1 - Math.exp(-24 * delta));
      mouthWide += (target.wide - mouthWide) * (1 - Math.exp(-17 * delta));

      // 0.3 keeps the lips together rather than collapsing the mouth to a line.
      television.mouth.scale.set(mouthWide, 0.3 + mouthOpen * 1.5, 1);

      // The arms move; the hands on the end of them do not. Everything below
      // is a movement of the conduit, and the glove is only carried by it.
      talking += ((speech.isSpeaking ? 1 : 0) - talking) * (1 - Math.exp(-4.5 * delta));

      // Folded across itself on the lines that call for it. Slow — it is a
      // deliberate, self-satisfied movement, not a flinch.
      const crossTarget = speech.line?.arms === 'crossed' ? 1 : 0;
      crossed += (crossTarget - crossed) * (1 - Math.exp(-3 * delta));
      // Reshaping is not free, and this sits at 0 or 1 nearly all the time.
      if (Math.abs(crossed - posed) > 0.002) {
        for (const arm of arms) arm.poseAt(crossed);
        posed = crossed;
      }

      arms.forEach((arm, i) => {
        // Half a cycle apart, or the pair move as one object and it reads as a
        // machine rather than as someone talking with their hands.
        const phase = i * Math.PI;

        // The whole arm swings from the wall port. The colliders are walked
        // onto it below, so this can be a real movement rather than the token
        // wobble it had to be while they were pinned to the resting curve.
        // Folding is not in here — that reshapes the conduit itself, above.
        const sway = (0.03 + talking * 0.17) * (1 - crossed * 0.7);
        arm.limb.rotation.y = Math.sin(time * 1.6 + phase) * sway;
        arm.limb.rotation.x = Math.sin(time * 1.15 + phase * 1.7) * sway * 0.7;

      });

      // Last, once the arms have finished moving for this frame.
      updateArmColliders();
    },
  };
}
