import * as THREE from 'three';
import { MEDICAL, BACK_ROOM, BACK_DOOR, DOOR, LAYER } from './config.js';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeWoodSurface,
  cloneSurface,
  worldRepeat,
  UNITS_PER_TILE,
  PALETTE,
} from './textures.js';
import { buildHand } from './glove.js';
import { createSpeechRunner, MOUTH_AT_REST } from './voice.js';
import { playButtonPress, playWardDoor } from './audio.js';

/**
 * The room you wake up in, and the thing waiting on its wall.
 *
 * Built from the concept art: a television for a head, its screen showing a
 * green face — two plug-shaped eyes and a stepped mouth — with loose coloured
 * wiring spilling out of the casing top and bottom. Its arms are not attached
 * to it at all. They come out of two ports in the wall either side, as ribbed
 * conduit, and end in the same green gloves that reached for you in the dark.
 */

/**
 * The broken window beside the door, and the store room it opens onto.
 *
 * The whole point of it: the opening is 1.6m tall and you are 1.8m. There is
 * no arrangement of jumping that gets you through, because the gate is on your
 * height and not on where your feet are. The bucket is 0.82m and clears the
 * sill in one hop, so the store room is somewhere you can only reach by being
 * something else — which is what possession is for.
 *
 * Sized to match the possession-puzzle window in ../3d-plat: 3m across by 1.6m
 * tall, the same opening that mechanic was designed around.
 *
 * Its *sill* is deliberately not copied. That one sits at 1.0, and that project
 * records the consequence in its own notes — a hop lifts its cube to about
 * 0.56, so nothing can get in and the room is not solvable by play.
 *
 * Ours sits at 1.35, which is past what the bucket can reach off the floor —
 * its jump peaks at 1.15 (7.1^2 / 2g). So it does not go from the floor. There
 * is a bed pushed up under the window and a desk on the other side, and it goes
 * from those: 0.86 + 1.15 leaves half a metre of clearance over the sill, and
 * near half a second above it, which is well over a metre of travel against a
 * 0.3m opening.
 *
 * That crate is the piece ../3d-plat is missing. Its own notes put the problem
 * exactly: "whatever replaces the ramp has to get a 0.9m cube over a 1.0m sill
 * without also letting the 1.8m player through". A step does, because the gate
 * is on height and not on reach — the player can stand on the crate too, and
 * is no closer to fitting for it.
 *
 * Height is the only figure the puzzle itself depends on, and 1.6 against a
 * 1.8m player holds it shut wherever the sill sits.
 */
const WINDOW = {
  x: 2.6,
  halfWidth: 1.5,
  sill: 1.35,
  head: 2.95,
  /** Wall thickness at the opening, so the reveal has depth to it. */
  reveal: 0.3,
};

/**
 * The steps up to it, one either side.
 *
 * On the ward side a bed shoved lengthways under the window; on the store side
 * a desk. Both are furniture that belongs where it is, and both happen to be
 * the right height — 0.86 and 0.75 against a 1.1 sill and a 0.90 jump.
 */
const WARD_STEP = { x: WINDOW.x, halfX: 1.08, depth: 1.02, top: 0.86 };
const STORE_STEP = { x: WINDOW.x, width: 1.7, depth: 0.85, top: 0.75 };

/**
 * Behind the ward's back wall, an L.
 *
 * A corridor runs along the wall, taking the window and the door — that is the
 * bit you walk once the door opens. It turns right at its far end into the
 * store room, which is where the shelves and the button are.
 *
 * The two are one continuous space: they share a ceiling height and the wall
 * between them exists only past the corner. HALLWAY has no near wall of its
 * own — the ward's back wall is it, which is what the window and the door are
 * cut through.
 */
const HALLWAY = { minX: 0.5, maxX: 6.5, near: 5.5, far: 8.0 };

/** The way out. Hoisted so the wall can be cut to fit it. */
const WARD_DOOR = { x: 5.4, width: 1.1, height: 2.15 };

const STORE = {
  minX: 6.5,
  maxX: 12.4,
  near: 5.5,
  far: 9.6,
  height: 3.4,
};

/**
 * The room across the corridor from the green door — which is the dark room.
 *
 * Not a copy of it any more. This block used to stand seventy metres away with
 * its own sixteen-by-eighteen replica bolted to the end, and the replica was
 * the problem: it could match the dark room's dimensions, materials, doorway
 * and lamp and still only ever be a room that resembled it. Now MEDICAL.center
 * puts this block where the corridor's far wall *is* the dark room's, and
 * walking through that door puts you in the room itself.
 *
 * So these are not the bounds of anything built here. room.js builds that room;
 * this is where it lies in local coordinates, for the wire that crosses it and
 * for the checks below. It falls out of the arithmetic rather than being
 * chosen, which is the point — get MEDICAL.center wrong and it stops agreeing.
 */
const LIT_ROOM = {
  minX: STORE.minX - BACK_ROOM.width,
  maxX: STORE.minX,
  near: HALLWAY.far,
  far: HALLWAY.far + BACK_ROOM.depth,
  height: BACK_ROOM.height,
};

/**
 * The doorway into it: the hole room.js cuts in that wall, in local terms.
 *
 * Taken from BACK_DOOR rather than written again, because two files now have
 * to agree about one opening — room.js cuts it, this file hangs the door in it
 * — and the way that goes wrong is silent. You get a door standing in front of
 * a wall, or a hole with nothing in it.
 */
const LIT_DOOR = {
  x: BACK_DOOR.x - MEDICAL.center[0],
  width: BACK_DOOR.width,
  height: BACK_DOOR.height,
};

/**
 * The two files' shared assumptions, checked out loud at import.
 *
 * All of this is arithmetic that must come out exactly, and every way it can
 * be wrong is invisible: a wall half a metre out reads as a wall, a doorway in
 * the wrong wall reads as a doorway. Failing at startup with the numbers in
 * hand beats finding it by walking into it.
 */
if (import.meta.env?.DEV) {
  const [cx, , cz] = MEDICAL.center;
  const complain = (what, got, want) => {
    if (Math.abs(got - want) > 1e-6) {
      console.error(`medical room misaligned: ${what} is ${got}, should be ${want}`);
    }
  };
  complain('the lit room’s left edge', cx + LIT_ROOM.minX, -BACK_ROOM.width / 2);
  complain('the lit room’s right edge', cx + LIT_ROOM.maxX, BACK_ROOM.width / 2);
  complain('the corridor’s far wall', cz + LIT_ROOM.near, DOOR.z - BACK_ROOM.depth);
  complain('the lit room’s far wall', cz + LIT_ROOM.far, DOOR.z);
  complain('the corridor doorway', cx + LIT_DOOR.x, BACK_DOOR.x);
}

/**
 * The black wire, and the route it takes.
 *
 * It leaves the television, crosses the ward floor, goes under the ward door,
 * over the corridor, under the second door and the length of the dark room, to
 * a port beside the doorway you were carried through. It is the thing you
 * follow: the television tells you to, and from here on the level is wherever
 * this goes.
 *
 * It used to turn the other way at the corridor and end in the store room,
 * which was the wrong room to send you to — that one is a cupboard you reach
 * by throwing a bucket through a window, and it is finished with once the
 * button in it is pressed.
 *
 * Declared below the rooms so the points can be taken from them. Written above
 * and it reads STORE and LIT_ROOM before either exists, which is a temporal
 * dead zone error at import and a blank screen.
 *
 * The points thread between the beds rather than through them — this lies on
 * the floor, and a cable running through a bed frame would give the game away
 * about how little is really here. Consoles are waypoints on it, so adding one
 * later means adding a point, not rerouting.
 */
/**
 * How far a medical surface keeps back from a wall it shares with the dark room.
 *
 * Anything that ends exactly in that plane fights the dark room's own wall for
 * the last row of pixels, and a row of pixels of lit corridor standing in a
 * pitch-black room is about as visible as a thing can be. Held at module scope
 * because three separate places need it and one of them runs before the block
 * that used to declare it, which is a dead-zone error at import.
 */
const SHARED_WALL_GAP = 0.03;

const WIRE_RADIUS = 0.055;
const WIRE_PATH = [
  // Out of the television, down the wall.
  [0.45, 1.05, -5.15],
  [0.55, 0.3, -5.05],
  [0.6, WIRE_RADIUS, -4.85],
  // Across the ward, threading the gap between the two rows of beds.
  [2.2, WIRE_RADIUS, -4.35],
  [3.6, WIRE_RADIUS, -3.3],
  [4.0, WIRE_RADIUS, -1.8],
  [3.9, WIRE_RADIUS, 0.6],
  [4.2, WIRE_RADIUS, 2.4],
  [4.85, WIRE_RADIUS, 4.0],
  // Under the door, which is why the leaf hangs clear of the floor.
  [WARD_DOOR.x, WIRE_RADIUS, 5.2],
  [WARD_DOOR.x, WIRE_RADIUS, 5.9],
  // Over the corridor and under the second door. The two are opposite each
  // other, so left alone this is two and a half metres of dead straight cable;
  // the lateral wander is slack, and the reason it reads as run by hand.
  [5.15, WIRE_RADIUS, 6.6],
  [5.3, WIRE_RADIUS, 7.35],
  [LIT_DOOR.x, WIRE_RADIUS, HALLWAY.far],
  // And the length of the lit room. Kept off the middle of the floor on the
  // way down so it crosses in front of you rather than lying under your feet.
  [5.2, WIRE_RADIUS, 8.7],
  [4.5, WIRE_RADIUS, 10.4],
  [3.4, WIRE_RADIUS, 13.0],
  [2.0, WIRE_RADIUS, 16.0],
  [0.8, WIRE_RADIUS, 19.2],
  [0.1, WIRE_RADIUS, 22.4],
  [0.45, WIRE_RADIUS, 24.6],
  // Up into the wall beside the hall doorway — clear of its reveal, which
  // stands half a metre out either side of the opening. That doorway is the
  // one you were carried through, and the far wall is DOOR's wall, so the port
  // is placed off DOOR rather than off a number that happens to match it.
  [DOOR.width / 2 + 0.5 + 0.9 - MEDICAL.center[0], 0.35, LIT_ROOM.far - 0.15],
  [DOOR.width / 2 + 0.5 + 0.9 - MEDICAL.center[0], 0.95, LIT_ROOM.far - 0.04],
];


/**
 * The ward's walls.
 *
 * Two values, because tinting alone cannot get here. The concrete surface is
 * generated around PALETTE.wall, which is #4d4e47 — nearly black — and the
 * material colour multiplies that, so no tint short of impossible lifts it past
 * mid grey. WALL_BASE regenerates the texture light in the first place and the
 * tint then only has to leave it alone.
 */
const WALL_BASE = '#dcdedb';
const WALL = '#fbfcfa';

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
   * Reshape the arm somewhere between hanging (0) and folded (1), and pull it
   * back into the wall by `retract`.
   *
   * Blends the curve's control points, then walks every link onto the result.
   * Called only when either amount has actually moved, since it costs a couple
   * of hundred curve evaluations and sits still almost all of the time.
   */
  function poseAt(amount, retract = 0) {
    for (let i = 0; i < curve.points.length; i++) {
      curve.points[i].lerpVectors(restPoints[i], foldPoints[i], amount);
      // Drawn back toward the port it came out of. Never all the way — a curve
      // with no length has no tangent, and every rib on it would face nowhere.
      if (retract > 0) curve.points[i].multiplyScalar(1 - Math.min(retract, 0.96));
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
 * The climb up the store room, and what is at the top of it.
 *
 * Three brown boards up the far wall, staggered rather than stacked. Stacking
 * them would not work: a board directly above blocks the thing rising toward
 * it until its feet are clear, so the bucket would be shoved off the one below
 * every time. Offset along the wall, each jump is diagonal and there is nothing
 * overhead to catch on.
 *
 * Rise is 1.0 from the floor to the first board and 0.7 between, against a
 * 1.15m jump. The first is the hard one now there is nothing to start from —
 * 0.15m of headroom, so it wants the hop taken at the board, not early.
 *
 * The first one is set well back from the window wall on purpose. Closer in and
 * there is nowhere to stand: the bucket is 0.6 across, and between the wall and
 * the board there has to be room for it *and* the run-up it needs to reach
 * walking speed, which is another 0.3.
 */
const SHELVES = [
  { y: 1.0, z: 7.05 },
  { y: 1.7, z: 8.05 },
  { y: 2.4, z: 9.05 },
];

const SHELF = { x: STORE.maxX - 0.65, width: 1.25, depth: 0.85 };

/** One brown board on two brackets. */
function buildWoodShelf() {
  const shelf = new THREE.Group();

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(SHELF.width, 0.07, SHELF.depth),
    new THREE.MeshStandardMaterial({
      ...makeWoodSurface(1.2, 1, '#5a3a22'),
      color: '#8a5a34',
      roughness: 0.82,
      metalness: 0,
    })
  );
  board.position.y = -0.035;
  board.castShadow = true;
  board.receiveShadow = true;
  shelf.add(board);

  // Brackets underneath, back against the wall.
  const iron = clinicalMaterial('#3f4441', 0.6);
  for (const z of [-SHELF.depth / 2 + 0.16, SHELF.depth / 2 - 0.16]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(SHELF.width - 0.2, 0.05, 0.05), iron);
    arm.position.set(0, -0.11, z);
    arm.castShadow = true;
    shelf.add(arm);

    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), iron);
    strut.position.set(SHELF.width / 2 - 0.08, -0.18, z);
    shelf.add(strut);
  }

  return shelf;
}

/** A big industrial push button, on a plinth. */
function buildButton() {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.07, 20),
    clinicalMaterial('#3c4240', 0.5)
  );
  base.position.y = 0.035;
  base.castShadow = true;
  group.add(base);

  // The cap, which is what moves.
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.11, 0.075, 20),
    new THREE.MeshStandardMaterial({ color: '#a8352c', roughness: 0.45 })
  );
  cap.position.y = 0.105;
  cap.castShadow = true;
  group.add(cap);

  // A ring round the base that lights when it latches.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.135, 0.014, 8, 22),
    new THREE.MeshBasicMaterial({ color: '#2a1512', toneMapped: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.075;
  group.add(ring);

  const glow = new THREE.PointLight(0xff6a4a, 0, 2.4, 2);
  glow.position.y = 0.2;
  group.add(glow);

  return { group, cap, ring, glow };
}

/**
 * The doorway across the corridor, and the door in it. Shut until the green one
 * opens; the two go together, off the same swing.
 */
function buildCorridorDoor() {
  const group = new THREE.Group();
  const { width, height } = LIT_DOOR;
  const frame = clinicalMaterial('#9aa09b', 0.5);
  const jamb = 0.1;

  for (const [w, h, x, y] of [
    [jamb, height + jamb, -(width + jamb) / 2, (height + jamb) / 2],
    [jamb, height + jamb, (width + jamb) / 2, (height + jamb) / 2],
    [width + jamb * 2, jamb, 0, height + jamb / 2],
  ]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), frame);
    piece.position.set(x, y, 0);
    piece.castShadow = true;
    piece.receiveShadow = true;
    group.add(piece);
  }

  // Hinged at the jamb, hanging clear of the floor like the other one — and
  // now for the same reason, since the black wire goes under this one too. The
  // cable's top is at 0.11 and the leaf starts at 0.12, so that centimetre is
  // load-bearing: drop the leaf to the floor and the wire runs through it.
  const hinge = new THREE.Group();
  hinge.position.set(-width / 2, 0.12, 0.09);
  group.add(hinge);

  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(width, height - 0.12, 0.06),
    clinicalMaterial('#4a5560', 0.62)
  );
  leaf.position.set(width / 2, (height - 0.12) / 2, 0);
  leaf.castShadow = true;
  hinge.add(leaf);

  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.035, 0.035),
    clinicalMaterial('#40474a', 0.4)
  );
  lever.position.set(width - 0.25, 1.02, 0.06);
  hinge.add(lever);

  return { group, hinge };
}

/**
 * The wire itself, plus the port it vanishes into.
 *
 * One tube along the whole route rather than a piece per room, so it reads as
 * a single unbroken run — which is the point of it. Catmull-Rom through the
 * waypoints, so the corners are turns rather than kinks.
 */
function buildBlackWire() {
  const group = new THREE.Group();

  const curve = new THREE.CatmullRomCurve3(
    WIRE_PATH.map((p) => new THREE.Vector3(...p))
  );

  /**
   * Built in two halves, cut where it crosses into the dark room.
   *
   * One tube would have to belong to one render pass, and this cable runs
   * through two rooms that are lit by different things. On the medical block's
   * pass the half lying in the dark room was picked out by the hall's ambient
   * light and read as a grey line across a floor you are not supposed to be
   * able to see — in a room whose whole job in act one is that there is nothing
   * in it but the spotlight.
   *
   * Split, its far half is lit by that spotlight and nothing else: it shows
   * where the pool crosses it, which is right, and is black everywhere else,
   * which is also right. lightUpBackRoom moves it into the main pass with the
   * rest of the room when the power comes back.
   *
   * Sampled rather than sliced by control point, so the cut lands exactly at
   * the wall instead of at whichever waypoint happens to be nearest it.
   */
  const samples = curve.getSpacedPoints(600);
  let cut = samples.findIndex((p) => p.z >= HALLWAY.far);
  if (cut < 1) cut = samples.length - 1;

  for (const [points, inDarkRoom] of [
    [samples.slice(0, cut + 1), false],
    [samples.slice(cut), true],
  ]) {
    if (points.length < 2) continue;
    const half = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        points.length,
        WIRE_RADIUS,
        8,
        false
      ),
      new THREE.MeshStandardMaterial({
        color: '#141517',
        roughness: 0.75,
        metalness: 0.05,
        // Fog is distance tinting and takes no notice of light, so on an unlit
        // cable in an unlit room it is the only thing you would see of it.
        fog: !inDarkRoom,
      })
    );
    half.castShadow = true;
    half.receiveShadow = true;
    if (inDarkRoom) half.layers.set(LAYER.DARK);
    group.add(half);
  }

  // Cable clips every so often, so it reads as run rather than dropped. Count
  // scales with the route: eight of them was one every two and a half metres
  // when the wire stopped at the store room and one every four once it ran the
  // length of the lit room, which is far enough apart to stop reading as a run.
  const clip = clinicalMaterial('#3a3d3f', 0.6);
  const clips = Math.round(curve.getLength() / 2.5);
  for (let i = 1; i < clips; i++) {
    const at = curve.getPointAt(i / clips);
    if (at.y > 0.2) continue;
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.06), clip);
    saddle.position.set(at.x, 0.015, at.z);
    saddle.rotation.y = Math.random() * Math.PI;
    // Each clip belongs to whichever room it is screwed down in, same as the
    // cable it holds.
    if (at.z >= HALLWAY.far) saddle.layers.set(LAYER.DARK);
    group.add(saddle);
  }

  // Where it leaves: a socket in the far wall, the same fitting as the arms'.
  // Both in the dark room, at the far end of it.
  const end = curve.getPointAt(1);
  const port = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.045, 10, 20),
    clinicalMaterial('#4a4d4c', 0.6)
  );
  port.position.copy(end);
  port.layers.set(LAYER.DARK);
  group.add(port);

  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.12, 16),
    clinicalMaterial('#101112', 0.9)
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.set(end.x, end.y, end.z + 0.05);
  socket.layers.set(LAYER.DARK);
  group.add(socket);

  return group;
}

/** A desk: a top on two end panels, with a stack of drawers under one side. */
function buildDesk() {
  const desk = new THREE.Group();
  const { width, depth, top } = STORE_STEP;

  const wood = new THREE.MeshStandardMaterial({
    ...makeWoodSurface(1.4, 1, '#4d3320'),
    color: '#7a5334',
    roughness: 0.78,
    metalness: 0,
  });

  const slab = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, depth), wood);
  slab.position.y = top - 0.025;
  slab.castShadow = true;
  slab.receiveShadow = true;
  desk.add(slab);

  for (const x of [-width / 2 + 0.03, width / 2 - 0.03]) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.05, top - 0.05, depth - 0.06), wood);
    end.position.set(x, (top - 0.05) / 2, 0);
    end.castShadow = true;
    desk.add(end);
  }

  const modesty = new THREE.Mesh(new THREE.BoxGeometry(width - 0.12, 0.3, 0.03), wood);
  modesty.position.set(0, top - 0.22, -depth / 2 + 0.05);
  desk.add(modesty);

  // Drawers down one end, fronts proud of the carcass with a handle each.
  const carcass = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, top - 0.09, depth - 0.1),
    wood
  );
  carcass.position.set(width / 2 - 0.3, (top - 0.09) / 2, 0);
  carcass.castShadow = true;
  desk.add(carcass);

  const handle = clinicalMaterial('#5c5f5b', 0.4);
  for (let i = 0; i < 3; i++) {
    const y = 0.16 + i * 0.2;
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.17, 0.02), wood);
    front.position.set(width / 2 - 0.3, y, depth / 2 - 0.04);
    desk.add(front);

    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.025), handle);
    pull.position.set(width / 2 - 0.3, y, depth / 2 - 0.02);
    desk.add(pull);
  }

  return desk;
}

/** A shelving unit: uprights, shelves, and whatever was left on them. */
function buildShelves(units) {
  const group = new THREE.Group();
  const steel = clinicalMaterial('#8d9490', 0.5);
  const wide = units * 0.9;
  const tall = 1.85;
  const deep = 0.42;

  for (const x of [-wide / 2, wide / 2]) {
    for (const z of [-deep / 2, deep / 2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, tall, 0.05), steel);
      post.position.set(x, tall / 2, z);
      post.castShadow = true;
      group.add(post);
    }
  }

  const clutter = ['#7d8a76', '#9a8f72', '#6f7a82', '#8a7d70'];
  for (let i = 0; i < 4; i++) {
    const y = 0.35 + i * 0.46;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.035, deep), steel);
    shelf.position.set(0, y, 0);
    shelf.castShadow = true;
    shelf.receiveShadow = true;
    group.add(shelf);

    // Boxes and tins, thinning out toward the top.
    const count = Math.max(0, 4 - i) + 1;
    for (let n = 0; n < count; n++) {
      const w = 0.16 + Math.random() * 0.2;
      const h = 0.12 + Math.random() * 0.18;
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, 0.14 + Math.random() * 0.14),
        clinicalMaterial(clutter[(i + n) % clutter.length], 0.8)
      );
      item.position.set(
        -wide / 2 + 0.2 + Math.random() * (wide - 0.4),
        y + 0.017 + h / 2,
        (Math.random() - 0.5) * (deep - 0.2)
      );
      item.rotation.y = (Math.random() - 0.5) * 0.5;
      item.castShadow = true;
      group.add(item);
    }
  }

  return group;
}

/**
 * The store room through the window. Small, bare and lit by one failing tube —
 * the reward for getting in here is that it is somewhere you were not meant to
 * be, not that it is pleasant.
 */
function buildStoreRoom() {
  const group = new THREE.Group();
  const H = STORE.height;

  const floorMaterial = (w, d) =>
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(w, d)),
      color: '#7f837c',
      metalness: 0.02,
    });
  const ceilingMaterial = (w, d) =>
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(w, d)),
      color: '#8b8f88',
    });

  /** Floor and ceiling over one rectangle of the L. */
  const deck = (minX, maxX, near, far) => {
    const w = maxX - minX;
    const d = far - near;
    const midX = (minX + maxX) / 2;
    const midZ = (near + far) / 2;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMaterial(w, d));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(midX, 0, midZ);
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMaterial(w, d));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(midX, H, midZ);
    group.add(ceiling);
  };

  deck(HALLWAY.minX, HALLWAY.maxX, HALLWAY.near, HALLWAY.far);
  deck(STORE.minX, STORE.maxX, STORE.near, STORE.far);

  const shell = new THREE.MeshStandardMaterial({
    ...makeWallSurface(...worldRepeat(6, H)),
    color: '#9aa096',
    metalness: 0,
    side: THREE.DoubleSide,
  });

  /**
   * The walls, going round the L. The corridor's near side is missing on
   * purpose — the ward's back wall is that side, and the window and door are
   * cut through it. The boundary between corridor and store room only exists
   * past the corner, which is what leaves them open to each other.
   */
  for (const [width, px, pz, rot] of [
    // Corridor: the dead end at its left. Its far side is built below, in
    // pieces, because the way on is cut through it.
    //
    // Stops 3cm short of that far side rather than running into it. Its far
    // edge landed exactly in the dark room's far wall plane, and the two fought
    // over the last pixel of it — which showed up as a bright hairline standing
    // in the pitch-black room, lit corridor leaking through the seam.
    [
      HALLWAY.far - HALLWAY.near - SHARED_WALL_GAP * 8,
      HALLWAY.minX,
      (HALLWAY.near + HALLWAY.far) / 2 - SHARED_WALL_GAP * 4,
      Math.PI / 2,
    ],
    // Store room: near side, far side, right side.
    [STORE.maxX - STORE.minX, (STORE.minX + STORE.maxX) / 2, STORE.near, Math.PI],
    [STORE.maxX - STORE.minX, (STORE.minX + STORE.maxX) / 2, STORE.far, 0],
    [STORE.far - STORE.near, STORE.maxX, (STORE.near + STORE.far) / 2, -Math.PI / 2],
    // And the stub of shared wall past the corner, below the opening. Nudged
    // into the store room for the same reason as the corridor's far wall: past
    // the corner this is up against the dark room's right-hand wall, and two
    // planes at x = 8 z-fight into stripes.
    [STORE.far - HALLWAY.far, STORE.minX + 0.03, (HALLWAY.far + STORE.far) / 2, Math.PI / 2],
  ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, H), shell);
    wall.position.set(px, H / 2, pz);
    wall.rotation.y = rot;
    wall.receiveShadow = true;
    group.add(wall);
  }

  // The corridor's far side, round the opening opposite the green door.
  //
  // This wall has the dark room on the other side of it, and room.js builds
  // that room's face of it — sixteen metres wide, eight tall, round the same
  // opening. So there are two walls here, one per side, and they have to be
  // held apart: sat in the same plane they z-fought, and the far end of the
  // corridor came out as a panel of horizontal stripes that changed with every
  // step. Three centimetres into the corridor is enough to settle it and is not
  // a gap anything can see, let alone get through.
  //
  // Two one-sided walls rather than one shared double-sided one, because they
  // are in different render passes until the second act: this face is lit by
  // the medical block's lights and the other by whatever the dark room has.
  {
    const litLeft = LIT_DOOR.x - LIT_DOOR.width / 2;
    const litRight = LIT_DOOR.x + LIT_DOOR.width / 2;
    for (const [pw, ph, pcx, pcy] of [
      [litLeft - HALLWAY.minX, H, (HALLWAY.minX + litLeft) / 2, H / 2],
      [HALLWAY.maxX - litRight, H, (litRight + HALLWAY.maxX) / 2, H / 2],
      [LIT_DOOR.width, H - LIT_DOOR.height, LIT_DOOR.x, (H + LIT_DOOR.height) / 2],
    ]) {
      if (pw <= 0 || ph <= 0) continue;
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), shell);
      wall.position.set(pcx, pcy, HALLWAY.far - SHARED_WALL_GAP);
      wall.receiveShadow = true;
      group.add(wall);
    }
  }

  // The corridor's near face: the far side of the ward's back wall, which is a
  // plane with no thickness of its own. Panelled round the window the same way,
  // because that hole goes all the way through.
  const backFar = HALLWAY.near + WINDOW.reveal;
  const winLeft = WINDOW.x - WINDOW.halfWidth;
  const winRight = WINDOW.x + WINDOW.halfWidth;
  const doorLeft = WARD_DOOR.x - WARD_DOOR.width / 2;
  const doorRight = WARD_DOOR.x + WARD_DOOR.width / 2;
  for (const [pw, ph, pcx, pcy] of [
    [winLeft - HALLWAY.minX, H, (HALLWAY.minX + winLeft) / 2, H / 2],
    [doorLeft - winRight, H, (winRight + doorLeft) / 2, H / 2],
    [HALLWAY.maxX - doorRight, H, (doorRight + HALLWAY.maxX) / 2, H / 2],
    [WINDOW.halfWidth * 2, WINDOW.sill, WINDOW.x, WINDOW.sill / 2],
    [WINDOW.halfWidth * 2, H - WINDOW.head, WINDOW.x, (H + WINDOW.head) / 2],
    [WARD_DOOR.width, H - WARD_DOOR.height, WARD_DOOR.x, (H + WARD_DOOR.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), shell);
    panel.position.set(pcx, pcy, backFar);
    panel.receiveShadow = true;
    group.add(panel);
  }

  const midX = (STORE.minX + STORE.maxX) / 2;
  const midZ = (STORE.near + STORE.far) / 2;

  // Shelving down the far wall and one unit across the end.
  const back = buildShelves(3);
  back.position.set(midX - 0.85, 0, STORE.far - 0.3);
  group.add(back);

  // The desk under the window on this side.
  const desk = buildDesk();
  desk.position.set(STORE_STEP.x, 0, 5.5 + WINDOW.reveal + STORE_STEP.depth / 2);
  group.add(desk);

  // Brown boards up the far wall, and the button on the top one. The metal
  // unit that used to stand here was in the way of the climb.
  for (const step of SHELVES) {
    const shelf = buildWoodShelf();
    shelf.position.set(SHELF.x, step.y, step.z);
    group.add(shelf);
  }

  const button = buildButton();
  const topShelf = SHELVES[SHELVES.length - 1];
  button.group.position.set(SHELF.x + 0.15, topShelf.y, topShelf.z);
  group.add(button.group);

  // One tube, and it is on its way out.
  const tube = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.06, 0.14),
    new THREE.MeshBasicMaterial({ color: '#cfe0d6', toneMapped: false })
  );
  tube.position.set(midX, STORE.height - 0.08, midZ - 0.4);
  group.add(tube);

  const lamp = new THREE.PointLight(0xdfeee4, 14, 9, 1.4);
  lamp.position.set(midX, STORE.height - 0.3, midZ - 0.4);
  // Doesn't cast. It used to, and a point light's shadow is six renders of the
  // whole scene every frame — a heavy price for a store room you are in for
  // about a minute, and one paid on every frame of the game whether you are in
  // there or not. The ward's own lamp still casts; that is the room this act is
  // about and the one the arms reach into.
  group.add(lamp);

  // And one down the corridor. Dimmer and further gone than the store room's —
  // it is a passage, and it is the first thing you see through the window.
  const hallMidX = (HALLWAY.minX + HALLWAY.maxX) / 2;
  const hallMidZ = (HALLWAY.near + HALLWAY.far) / 2;
  const hallTube = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.06, 0.12),
    new THREE.MeshBasicMaterial({ color: '#b9c8bf', toneMapped: false })
  );
  hallTube.position.set(hallMidX, H - 0.08, hallMidZ);
  group.add(hallTube);

  const hallLamp = new THREE.PointLight(0xd6e6dc, 9, 8, 1.5);
  hallLamp.position.set(hallMidX, H - 0.3, hallMidZ);
  group.add(hallLamp);

  return { group, tube, lamp, button, buttonAt: [SHELF.x + 0.15, topShelf.y, topShelf.z] };
}

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

  const { width, height } = WARD_DOOR;

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

  // Everything that swings hangs off a hinge at the left jamb, so the leaf
  // turns about its edge rather than about its middle.
  // Hung clear of the floor, the way a real one is — and the way the black
  // wire gets under it while it is still shut.
  const hinge = new THREE.Group();
  hinge.position.set(-width / 2, 0.13, 0.03);
  group.add(hinge);

  // The leaf, sat back inside the frame. Institution green, and authored dark
  // — this one is lit and tone mapped, unlike the television's face, so ACES
  // lifts it a fair way toward the colour it actually reads as.
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(width, height - 0.13, 0.06),
    clinicalMaterial('#315c3c', 0.62)
  );
  leaf.position.set(width / 2, (height - 0.13) / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  hinge.add(leaf);

  // Kick plate along the bottom, scuffed by every trolley that ever went
  // through, and a lever handle on the opening edge.
  const kick = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.06, 0.3, 0.015),
    clinicalMaterial('#9fa5a2', 0.35)
  );
  kick.position.set(width / 2, 0.2, 0.038);
  hinge.add(kick);

  const metal = clinicalMaterial('#40474a', 0.4);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), metal);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(width - 0.16, 1.02, 0.04);
  hinge.add(rose);

  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.035), metal);
  lever.position.set(width - 0.25, 1.02, 0.065);
  lever.castShadow = true;
  hinge.add(lever);

  return { group, hinge };
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

  if (knocked) {
    // Onto its side. The lift and the sideways shift put it back down on the
    // floor and back on its own centre — rotating alone leaves it half sunk
    // and half a metre off to one side.
    const fall = knocked < 0 ? -1 : 1;
    body.rotation.z = (fall * Math.PI) / 2;
    body.rotation.x = fall * 0.05;
    body.position.set(fall * -0.55, 0.56, 0);
  }

  return { group: bed, body, mattress };
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
  const wallSurface = makeWallSurface(...worldRepeat(width, height), WALL_BASE);
  const wallMaterial = new THREE.MeshStandardMaterial({
    ...wallSurface,
    color: WALL,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const sideMaterial = new THREE.MeshStandardMaterial({
    ...cloneSurface(wallSurface, ...worldRepeat(depth, height)),
    color: WALL,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  for (const wall of [
    { size: [width, height], pos: [0, height / 2, -depth / 2], rot: 0, mat: wallMaterial },
    { size: [depth, height], pos: [-width / 2, height / 2, 0], rot: Math.PI / 2, mat: sideMaterial },
    { size: [depth, height], pos: [width / 2, height / 2, 0], rot: -Math.PI / 2, mat: sideMaterial },
  ]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...wall.size), wall.mat);
    mesh.position.set(...wall.pos);
    mesh.rotation.y = wall.rot;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // The back wall is four panels around the window rather than one sheet,
  // because the opening has to be a real hole — the room behind it is visible
  // through it, and the bucket goes through it. Each panel keeps its own slice
  // of the texture by offsetting the map, or the seams show as a mismatched
  // strip the way the first room's doorway did.
  const winLeft = WINDOW.x - WINDOW.halfWidth;
  const winRight = WINDOW.x + WINDOW.halfWidth;
  const doorLeft = WARD_DOOR.x - WARD_DOOR.width / 2;
  const doorRight = WARD_DOOR.x + WARD_DOOR.width / 2;
  for (const [w, h, cxPanel, cyPanel] of [
    // Left of the window, between the two openings, and right of the door.
    [winLeft + width / 2, height, (winLeft - width / 2) / 2, height / 2],
    [doorLeft - winRight, height, (winRight + doorLeft) / 2, height / 2],
    [width / 2 - doorRight, height, (doorRight + width / 2) / 2, height / 2],
    // Under and over the window.
    [WINDOW.halfWidth * 2, WINDOW.sill, WINDOW.x, WINDOW.sill / 2],
    [WINDOW.halfWidth * 2, height - WINDOW.head, WINDOW.x, (height + WINDOW.head) / 2],
    // And over the door.
    [WARD_DOOR.width, height - WARD_DOOR.height, WARD_DOOR.x, (height + WARD_DOOR.height) / 2],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const panelMaterial = new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    panelMaterial.map.offset.set(
      (cxPanel - w / 2 + width / 2) / UNITS_PER_TILE,
      (cyPanel - h / 2) / UNITS_PER_TILE
    );
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMaterial);
    mesh.position.set(cxPanel, cyPanel, depth / 2);
    mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    // Casts, unlike the room's other walls. Point lights ignore geometry, so
    // without this the store room's tube glows through onto the ward side of
    // the wall and the ward's lamps light the store room.
    mesh.castShadow = true;
    group.add(mesh);
  }

  // The reveal — the thickness of the wall, seen through the opening.
  const revealMaterial = clinicalMaterial('#d7d9d4', 0.7);
  for (const [w, h, d, x, y] of [
    [WINDOW.halfWidth * 2, 0.04, WINDOW.reveal, WINDOW.x, WINDOW.sill],
    [WINDOW.halfWidth * 2, 0.04, WINDOW.reveal, WINDOW.x, WINDOW.head],
    [0.04, WINDOW.head - WINDOW.sill, WINDOW.reveal, winLeft, (WINDOW.sill + WINDOW.head) / 2],
    [0.04, WINDOW.head - WINDOW.sill, WINDOW.reveal, winRight, (WINDOW.sill + WINDOW.head) / 2],
  ]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), revealMaterial);
    piece.position.set(x, y, depth / 2 + WINDOW.reveal / 2);
    piece.receiveShadow = true;
    group.add(piece);
  }

  for (const [w, h, d, x, y] of [
    [WARD_DOOR.width, 0.04, WINDOW.reveal, WARD_DOOR.x, WARD_DOOR.height],
    [0.04, WARD_DOOR.height, WINDOW.reveal, doorLeft, WARD_DOOR.height / 2],
    [0.04, WARD_DOOR.height, WINDOW.reveal, doorRight, WARD_DOOR.height / 2],
  ]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), revealMaterial);
    piece.position.set(x, y, depth / 2 + WINDOW.reveal / 2);
    piece.receiveShadow = true;
    group.add(piece);
  }

  // What is left of the glass: a rim of shards round the frame, angled every
  // which way. Nothing spans the middle — that is the way through.
  const shardMaterial = new THREE.MeshStandardMaterial({
    color: '#8fb0ae',
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const shardCount = 40;
  for (let i = 0; i < shardCount; i++) {
    const t = i / shardCount;
    // Walk the perimeter, biting inward by a random amount at each stop.
    const along = t * 4;
    const edge = Math.floor(along);
    const f = along - edge;
    const w2 = WINDOW.halfWidth;
    const h2 = (WINDOW.head - WINDOW.sill) / 2;
    const midY = (WINDOW.sill + WINDOW.head) / 2;
    let x;
    let y;
    let inward;
    if (edge === 0) { x = -w2 + f * w2 * 2; y = midY + h2; inward = -1; }
    else if (edge === 1) { x = w2; y = midY + h2 - f * h2 * 2; inward = -1; }
    else if (edge === 2) { x = w2 - f * w2 * 2; y = midY - h2; inward = 1; }
    else { x = -w2; y = midY - h2 + f * h2 * 2; inward = 1; }

    const bite = 0.06 + Math.random() * 0.17;
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.05, bite, 3), shardMaterial);
    shard.position.set(
      WINDOW.x + x + (edge % 2 === 1 ? (edge === 1 ? -bite / 2 : bite / 2) : 0),
      y + (edge % 2 === 0 ? inward * (bite / 2) : 0),
      depth / 2 + 0.02
    );
    // Point each one into the opening, with a bit of scatter.
    shard.rotation.z =
      (edge === 0 ? Math.PI : edge === 2 ? 0 : edge === 1 ? -Math.PI / 2 : Math.PI / 2) +
      (Math.random() - 0.5) * 0.5;
    shard.rotation.y = (Math.random() - 0.5) * 0.6;
    group.add(shard);
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

  // ── the steps up to the window ────────────────────────────────────────────
  // A bed shoved lengthways under the opening on this side, a desk on the
  // other. Scenery, and the puzzle: the sill is above what the bucket can
  // reach off the floor, so these are how it gets up — and the desk is how it
  // gets back out again.
  const wardStepZ = depth / 2 - WARD_STEP.depth / 2;
  const storeStepZ = depth / 2 + WINDOW.reveal + STORE_STEP.depth / 2;

  const stepBed = buildBed();
  // Turned side on, so its length runs along the wall under the window rather
  // than sticking out into the room.
  stepBed.group.rotation.y = Math.PI / 2;
  stepBed.group.position.set(WARD_STEP.x, 0, wardStepZ);
  group.add(stepBed.group);

  // ── through the window ────────────────────────────────────────────────────
  const store = buildStoreRoom();
  group.add(store.group);

  // ── the way out ───────────────────────────────────────────────────────────
  // In the corner of the wall behind you: sitting up on the bed you face
  // straight down it, so this is ahead and to your right, and the television
  // is the other way.
  //
  // Nothing is built past this door. The other side of it is the dark room,
  // which room.js has been building since the first scene, and which this block
  // is positioned to meet — see LIT_ROOM. There used to be a replica here.
  const litDoorway = buildCorridorDoor();
  litDoorway.group.position.set(LIT_DOOR.x, 0, HALLWAY.far);
  group.add(litDoorway.group);

  group.add(buildBlackWire());

  const wardDoor = buildWardDoor();
  wardDoor.group.position.set(WARD_DOOR.x, 0, depth / 2 - 0.02);
  wardDoor.group.rotation.y = Math.PI;
  group.add(wardDoor.group);

  // ── the ward ──────────────────────────────────────────────────────────────
  const beds = [];
  for (const slot of WARD) {
    const bed = buildBed(slot.knocked);
    bed.group.position.set(slot.x, 0, slot.z);
    bed.group.rotation.y = slot.yaw;
    group.add(bed.group);
    beds.push({ ...bed, slot });
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
    // Stop at the back wall rather than overhanging it. What is past it now is
    // the corridor and the store room, and the overhang stood inside them.
    { minX: cx - width / 2 - t, maxX: cx - width / 2, minZ: cz - depth / 2 - t, maxZ: cz + depth / 2 },
    { minX: cx + width / 2, maxX: cx + width / 2 + t, minZ: cz - depth / 2 - t, maxZ: cz + depth / 2 },
    { minX: cx - width / 2 - t, maxX: cx + width / 2 + t, minZ: cz - depth / 2 - t, maxZ: cz - depth / 2 },
  ];

  // The back wall, in pieces, because there is a hole in it.
  //
  // Left and right of the window are ordinary wall. The span of the window
  // itself is two boxes: the sill, which everything has to climb, and the wall
  // above it, which only lets something 0.95m or shorter through. That pair is
  // the whole puzzle — you can jump onto the sill and get no further, and the
  // bucket clears the sill in one hop and walks straight on.
  const backNear = cz + depth / 2;
  const backFar = backNear + WINDOW.reveal;
  const openLeft = cx + WINDOW.x - WINDOW.halfWidth;
  const openRight = cx + WINDOW.x + WINDOW.halfWidth;

  const doorLeftX = cx + WARD_DOOR.x - WARD_DOOR.width / 2;
  const doorRightX = cx + WARD_DOOR.x + WARD_DOOR.width / 2;

  colliders.push(
    // Three pieces of wall, because there are two holes in it. The doorway's
    // own box is pushed separately and gated on the door being shut.
    { minX: cx - width / 2 - t, maxX: openLeft, minZ: backNear, maxZ: backFar },
    { minX: openRight, maxX: doorLeftX, minZ: backNear, maxZ: backFar },
    { minX: doorRightX, maxX: cx + width / 2 + t, minZ: backNear, maxZ: backFar },
    { minX: openLeft, maxX: openRight, minZ: backNear, maxZ: backFar, top: WINDOW.sill },
    {
      minX: openLeft,
      maxX: openRight,
      minZ: backNear,
      maxZ: backFar,
      passHeight: WINDOW.head - WINDOW.sill,
    }
  );

  // The desk, standable — with the bed under the window on the other side, it
  // is how the bucket crosses the sill. Without it, it gets in and is stranded.
  colliders.push({
    minX: cx + STORE_STEP.x - STORE_STEP.width / 2,
    maxX: cx + STORE_STEP.x + STORE_STEP.width / 2,
    minZ: cz + storeStepZ - STORE_STEP.depth / 2,
    maxZ: cz + storeStepZ + STORE_STEP.depth / 2,
    top: STORE_STEP.top,
  });

  // The doorway, solid while the door is shut. Gated rather than added and
  // removed, so the array everything holds never changes identity.
  colliders.push({
    minX: doorLeftX,
    maxX: doorRightX,
    minZ: cz + depth / 2,
    maxZ: cz + depth / 2 + WINDOW.reveal,
    enabled: () => doorSwing < 0.35,
  });

  // The boards. Planks on brackets, so they are solid where the plank is and
  // open beneath it — `bottom` says where the brackets stop.
  //
  // This used to be passHeight, borrowed from the window to clear the column of
  // air under a board. It did that, but it also made the plank itself something
  // the bucket passed straight up through from below. An underside is the
  // honest shape: you duck under a board, and a jump taken under one stops
  // against it.
  const BOARD_UNDERSIDE = 0.3;
  for (const step of SHELVES) {
    colliders.push({
      minX: cx + SHELF.x - SHELF.width / 2,
      maxX: cx + SHELF.x + SHELF.width / 2,
      minZ: cz + step.z - SHELF.depth / 2,
      maxZ: cz + step.z + SHELF.depth / 2,
      top: step.y,
      bottom: step.y - BOARD_UNDERSIDE,
    });
  }

  // The shell round the L, matching the walls that were built. The corridor's
  // near side is the ward's back wall and is already covered; the boundary
  // between corridor and store room exists only past the corner.
  const s0 = 0.8;
  colliders.push(
    // The corridor's far wall is the dark room's, and room.js owns it — both
    // its solid halves and the hole between them. There were boxes for it here
    // as well when there was a replica on the other side; two sets of walls in
    // one plane is how you get stopped by a wall you have already walked past.
    //
    // Stops at that wall — past it is the dark room, which is open at this end
    // and had 0.8m of corridor wall standing in it.
    { minX: cx + HALLWAY.minX - s0, maxX: cx + HALLWAY.minX, minZ: cz + HALLWAY.near, maxZ: cz + HALLWAY.far },
    // The way on, solid while that door is still shut. This one does belong to
    // this file: the door is built here, so what it blocks is built here too.
    {
      minX: cx + LIT_DOOR.x - LIT_DOOR.width / 2,
      maxX: cx + LIT_DOOR.x + LIT_DOOR.width / 2,
      minZ: cz + HALLWAY.far - 0.25,
      maxZ: cz + HALLWAY.far + 0.25,
      enabled: () => litSwing < 0.35,
    },

    // Store room: near side, far side, right side.
    { minX: cx + STORE.minX, maxX: cx + STORE.maxX + s0, minZ: cz + STORE.near - s0, maxZ: cz + STORE.near },
    // Starts at the store room's own wall, not 0.8 left of it — that overhang
    // reached across the lit room's doorway and stopped you just inside it.
    { minX: cx + STORE.minX, maxX: cx + STORE.maxX + s0, minZ: cz + STORE.far, maxZ: cz + STORE.far + s0 },
    { minX: cx + STORE.maxX, maxX: cx + STORE.maxX + s0, minZ: cz + STORE.near, maxZ: cz + STORE.far + s0 },
    // The stub between them, past the corner. Its thickness straddles the wall
    // plane rather than sitting entirely on the corridor side — a 0.8 overhang
    // there reached across the doorway into the lit room and sealed it.
    { minX: cx + STORE.minX - 0.3, maxX: cx + STORE.minX + 0.3, minZ: cz + HALLWAY.far, maxZ: cz + STORE.far + s0 }
  );

  /**
   * One box per bed — two for a tipped one — measured off the meshes.
   *
   * These used to be derived by hand from the slot's rotation, and were badly
   * wrong for the tipped ones: a single 2.2 by 2.2 box at 1.05 that missed most
   * of the frame on one side and claimed a metre of bare floor on the other.
   * Walking at one hit a wall with nothing in it; jumping at one put you on
   * thin air a metre up.
   *
   * A tipped bed is two separate objects — a frame on its side and a mattress
   * dumped on the floor beside it — so each gets its own box, and the mattress
   * is low enough to walk straight onto.
   */
  group.updateMatrixWorld(true);
  const BED_BOX = new THREE.Box3();
  const bedBox = (part, standOn) => {
    BED_BOX.setFromObject(part);
    const box = {
      minX: BED_BOX.min.x,
      maxX: BED_BOX.max.x,
      minZ: BED_BOX.min.z,
      maxZ: BED_BOX.max.z,
      top: BED_BOX.max.y,
    };
    if (standOn) {
      // The surface you stand on, where that is not simply the top of the
      // object — an upright bed's is its mattress, not its head board.
      BED_BOX.setFromObject(standOn);
      box.top = BED_BOX.max.y;
    }
    colliders.push(box);
  };

  for (const bed of beds) {
    if (bed.slot.knocked) {
      bedBox(bed.body);
      bedBox(bed.mattress);
    } else {
      bedBox(bed.group, bed.mattress);
    }
  }
  // And the one under the window, which is a step as well as a bed.
  bedBox(stepBed.group, stepBed.mattress);

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

  // Going dark, and the arms going home. One way, like everything else here.
  let shutDown = false;
  let dimmed = 0;
  let retracted = 0;

  // The door. Shut until something opens it, then it stays open.
  let doorOpen = false;
  let doorSwing = 0;
  let litSwing = 0;

  // The button latches once, and stays down.
  const buttonWorld = new THREE.Vector3(
    cx + store.buttonAt[0],
    store.buttonAt[1],
    cz + store.buttonAt[2]
  );
  let buttonPressed = false;
  let buttonTravel = 0;

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
  let retractedPosed = 0;

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
    get buttonPressed() {
      return buttonPressed;
    },

    get doorIsOpen() {
      return doorOpen;
    },
    /** Dev handle: both leaves, 0 shut to 1 open. */
    get doorSwings() {
      return { green: +doorSwing.toFixed(2), far: +litSwing.toFixed(2) };
    },
    /** How far through the swing, 0 shut to 1 open. */
    get doorSwing() {
      return doorSwing;
    },
    openDoor() {
      if (doorOpen) return;
      doorOpen = true;
      // The door only ever opens because the button was pressed, so opening it
      // says so. Two facts that can disagree are one fact too many: the debug
      // menu drops you past the button with the door already open, and without
      // this the console would still be live behind you and could run the whole
      // speech again if the bucket found its way back onto the shelf.
      buttonPressed = true;
      playWardDoor();
    },

    /** Screen out, arms back into the wall. It has said its piece. */
    shutDown() {
      shutDown = true;
    },

    /**
     * Back to how the room was when you woke up in it. For the debug menu,
     * which has to be able to leave a scene as well as arrive at one.
     *
     * Only the flags need clearing. Everything you can see off them — the swing
     * of both doors, the screen fading out, the arms drawing back into the wall
     * — is an ease toward the flag's value rather than a state of its own, so
     * unsetting them runs all of it backwards on its own.
     */
    reset() {
      doorOpen = false;
      shutDown = false;
      buttonPressed = false;
      speech.stop();
    },
    get isShutDown() {
      return shutDown;
    },
    /** Dev handle: 0 lit and out, 1 dark and gone. */
    get shutdownProgress() {
      return { dimmed: +dimmed.toFixed(2), retracted: +retracted.toFixed(2) };
    },

    /**
     * Anything standing on the top board, close enough, presses it. Checked
     * against whatever is passed in rather than reaching for the friend, so
     * this does not care what got up there — only that something did.
     */
    tryPressButton(position, grounded) {
      if (buttonPressed || !grounded) return false;
      if (Math.abs(position.y - buttonWorld.y) > 0.25) return false;
      const reach = Math.hypot(position.x - buttonWorld.x, position.z - buttonWorld.z);
      if (reach > 0.55) return false;

      buttonPressed = true;
      playButtonPress();
      return true;
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

      // Going out. Slower than a flicker so it reads as being switched off
      // rather than as another dropped frame.
      dimmed += ((shutDown ? 1 : 0) - dimmed) * (1 - Math.exp(-1.6 * delta));
      const lit = 1 - dimmed;

      for (const part of television.faceParts) {
        part.material.color.setStyle(FACE).multiplyScalar((0.45 + level * 0.55) * lit);
      }
      television.glow.intensity = 2.2 * level * lit;

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
      retracted += ((shutDown ? 1 : 0) - retracted) * (1 - Math.exp(-1.3 * delta));

      // Reshaping is not free, and these sit still nearly all the time.
      if (Math.abs(crossed - posed) > 0.002 || Math.abs(retracted - retractedPosed) > 0.002) {
        for (const arm of arms) {
          arm.poseAt(crossed, retracted);
          // Once it is essentially inside the wall, take it out of the scene —
          // the port ring stays, which is all that should be left.
          arm.limb.visible = retracted < 0.94;
        }
        posed = crossed;
        retractedPosed = retracted;
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

      // The door swinging back into the corridor. Slow, and eased at the end so
      // it settles against its stop rather than arriving at full speed.
      doorSwing += ((doorOpen ? 1 : 0) - doorSwing) * (1 - Math.exp(-2.6 * delta));
      wardDoor.hinge.rotation.y = -doorSwing * 1.95;
      // The one across the corridor goes with it, a beat behind so the pair
      // read as two doors rather than as one object hinged in two places.
      litSwing += (doorSwing - litSwing) * (1 - Math.exp(-2.1 * delta));
      litDoorway.hinge.rotation.y = -litSwing * 1.98;

      // The button going in, and its ring coming up with it.
      buttonTravel += ((buttonPressed ? 1 : 0) - buttonTravel) * (1 - Math.exp(-16 * delta));
      store.button.cap.position.y = 0.105 - buttonTravel * 0.045;
      store.button.ring.material.color.setStyle('#ff6a4a').multiplyScalar(0.1 + buttonTravel * 0.9);
      store.button.glow.intensity = buttonTravel * 3.5;
    },
  };
}
