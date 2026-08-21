import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  worldRepeat,
} from './textures.js';
import { setObjective, showNote } from './hud.js';
import { playButtonPress, playWardDoor } from './audio.js';
import { DOOR_ORANGE } from './config.js';

/**
 * The orange room, and the swing set in it.
 *
 * The room past the console's door. Everything up to here has been one of you
 * at a time — you throw the switch, the bucket stands on the plate, you take
 * turns down the two lanes of the hall — and this is the first thing in the
 * building that asks for both of you *at the same instant*. Two swings, a
 * button at the top of each arc, and they only count if they are hit together.
 *
 * Which is a puzzle about the one mechanic this game has that nothing else
 * does. A pendulum keeps going after you let go of it: you put the bucket on
 * one swing, drive it up to the button, step back into your own body across the
 * room, and its swing is still going while you get yours going. What is left is
 * the phase, and the phase is the whole puzzle — pump with the swing to speed
 * it up, pump against it to drag it back, until the two arcs come together.
 *
 * Orange because the door into it is, and because every room behind you is red
 * or concrete. You are somewhere else now.
 */

const DEPTH = 11;
const HALF_WIDTH = 6;
/**
 * Low. Lower than any room in the building, and low on purpose: the buttons are
 * on the ceiling, and a ceiling you can kick is a ceiling that is already too
 * close to your head. The swing set stands under it with a hand's width to
 * spare, which is not how a swing set is meant to look.
 */
const HEIGHT = 3.0;

const WALL_TINT = '#7b4a24';
const FLOOR_TINT = '#6a4526';
const TRIM = '#3c3a37';

/**
 * The swing, as a pendulum.
 *
 * Nearly two metres of rope under a beam at 2.85 leaves the seats at 0.9, down
 * where a swing seat actually hangs — you step over one rather than climb onto
 * it, and the drop from the beam is long enough that the whole set reads as a
 * swing rather than as two planks slung under a girder. The buttons are on the
 * ceiling, so the longer the rope the further the arc has to carry a rider to
 * reach one, which is the trade: low seats are a harder swing.
 *
 * A period of about three seconds falls out of that length, which is what makes
 * the puzzle possible at all — long enough to get out of one body and into the
 * other between one pass of the button and the next. A short swing would make
 * this a reflex test, and the thing being tested is whether you can think in
 * two bodies at once.
 */
const ROPE = 1.95;
const GRAVITY = 9.8;
/**
 * Very light, and it has to be. The swing you are not on has to still be
 * clearing its button when you get back to it, and there is only the margin
 * between MAX_ANGLE and HIT_ANGLE to lose before it stops counting — with the
 * buttons up under the ceiling that margin is a quarter of a radian, not a
 * whole arc. At this rate a swing left at the top of its arc goes on hitting
 * for about half a minute, which is a dismount, a walk across the room, a
 * mount and half a dozen kicks with a little to spare.
 *
 * It was four times this once, when the buttons were low enough that a swing
 * barely driven still reached them. Playing it through with the buttons raised,
 * the bucket's swing died at ten seconds and mine reached its button at fifty:
 * two swings that were never once over their buttons at the same moment, and
 * no amount of timing on the player's part could have fixed it.
 *
 * Halved again since, to take the clock out of it altogether. Half a minute was
 * enough to cross the room and get the second swing up, which meant a player
 * who did all of it right first time made it and a player who fumbled a mount
 * or misjudged a couple of kicks lost the first swing and started over — and
 * starting over is the least interesting thing this puzzle can ask for. A
 * minute is long enough that the swing you left is simply still there.
 */
const DAMPING = 0.007;
/**
 * What one press of E is worth, in radians a second, at the bottom of the arc.
 *
 * Scaled by the cosine of where the swing is when you press it, so a press at
 * the bottom is worth all of this and a press at the top is worth almost
 * nothing. That is the whole skill of a swing and it is worth having: pressing
 * in rhythm gets you up in five or six, mashing it gets you nowhere.
 *
 * Worth more per kick than it was, because the button it is aimed at is higher:
 * at the old value the climb took nine kicks, and nine kicks three seconds
 * apart is half a minute of holding a rhythm before anything happens. Three
 * kicks now — the climb is the part everyone gets right, and every second of
 * it is a second of the other swing's arc that has gone by.
 */
const PUMP = 0.85;
/**
 * Past this it would go over the top, which is not a swing any more.
 *
 * The gap between this and HIT_ANGLE is the whole margin an unattended swing
 * has to lose before it stops counting, so it is set as much by that as by what
 * a swing looks like — and a rider's head at this angle is still a hand's width
 * under the ceiling.
 */
const MAX_ANGLE = 1.4;

/**
 * How far along the arc the button is — near the top of it, so hitting one at
 * all means a swing driven nearly all the way up.
 *
 * Sixty-four degrees, and it is this steep because of where the buttons are:
 * they sit under the ceiling now and the seats hang low, so the arc has to
 * carry a rider most of the way to horizontal before their boots are anywhere
 * near one. Six or seven kicks in rhythm, against about four for the shallower
 * arc it used to be.
 */
const HIT_ANGLE = 1.12;
/**
 * How close together the two hits have to be.
 *
 * Wide, and deliberately wider than it needs to be. The thing being asked for
 * is that you get two pendulums swinging together, and you can see and hear
 * whether you have: the pad flashes and the button sounds on every pass. Once
 * a player has understood that much, making them land it inside half a second
 * is not a second idea, it is the same idea with a stopwatch on it. At better
 * than a second either way you can be visibly nearly right and have it count,
 * which is most of what separates a puzzle from a knack.
 */
const WINDOW = 1.1;
/** Missed, but close enough to be worth saying so. Once. See the hit test. */
const NEARLY = 2.4;

const BEAM_Y = 2.85;
/** How far a rider's feet reach past the seat, along the arc. */
const LEGS = 0.75;

/**
 * Which way a rider faces on the seat: toward the buttons, which is +z, which
 * is zero in both bodies' own reckoning — the bucket's eyes are on its +z face,
 * and your own body has no face, only legs, which go out the same way.
 */
const RIDE_YAW = 0;
/** Eye line above the seat, along the rope. A sitting height, not a standing one. */
const SEAT_EYE = 0.78;
/**
 * How much of the swing's lean the view takes.
 *
 * Not all of it. Riding to the top of this arc lies you back eighty degrees,
 * and a view that went with that would be pointing at the ceiling however you
 * held the mouse. A third of it reads as rocking with the swing while leaving
 * the aim where you put it. The same share is used from inside the bucket —
 * see possession.applyCamera.
 */
const VIEW_LEAN = 0.35;

export function createOrangeRoom({
  scene,
  passage,
  camera,
  player,
  playerBody,
  friend,
  possession,
}) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const interactions = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // The near wall is the plane the exit room's passage stops on.
  const near = passage.z;
  const far = near + DEPTH;
  const axis = passage.x;
  const midZ = (near + far) / 2;

  let entered = false;
  let solved = false;
  /** Whether the near-miss hint has been given. It is given once. */
  let missedNote = false;
  /** The room's own clock, in seconds, for comparing the two hits. */
  let clock = 0;

  const wallSurface = makeWallSurface(...worldRepeat(HALF_WIDTH * 2, HEIGHT), WALL_TINT);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_WIDTH * 2, DEPTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(HALF_WIDTH * 2, DEPTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(axis, 0, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HALF_WIDTH * 2, DEPTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(HALF_WIDTH * 2, DEPTH)),
      color: '#5c4028',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(axis, HEIGHT, midZ);
  group.add(ceiling);

  // The two long walls.
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(DEPTH, HEIGHT),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    wall.position.set(axis + side * HALF_WIDTH, HEIGHT / 2, midZ);
    wall.rotation.y = side === 1 ? -Math.PI / 2 : Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
    solid(
      Math.min(axis + side * HALF_WIDTH, axis + side * (HALF_WIDTH + 1)),
      Math.max(axis + side * HALF_WIDTH, axis + side * (HALF_WIDTH + 1)),
      near - 1,
      far + 1,
      {}
    );
  }

  // The near wall, round the way in from the passage. Three pieces, the way
  // every wall in this game with a hole in it is built.
  const inLow = axis - passage.width / 2;
  const inHigh = axis + passage.width / 2;
  for (const [pw, ph, px, py] of [
    [inLow - (axis - HALF_WIDTH), HEIGHT, (axis - HALF_WIDTH + inLow) / 2, HEIGHT / 2],
    [axis + HALF_WIDTH - inHigh, HEIGHT, (inHigh + axis + HALF_WIDTH) / 2, HEIGHT / 2],
    [passage.width, HEIGHT - passage.height, axis, (HEIGHT + passage.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    mesh.position.set(px, py, near);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  solid(axis - HALF_WIDTH - 1, inLow, near - 1, near, {});
  solid(inHigh, axis + HALF_WIDTH + 1, near - 1, near, {});

  // ------------------------------------------------------------------ light ---

  // Two, warm and low — the same rule as everywhere else in this project: the
  // lights are built with the room and never added or removed, because the
  // number of them in the scene is compiled into every material that can be lit.
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.3 });
  // Against the side walls and flush to the ceiling rather than down the middle
  // of it: the middle of this ceiling is where the swings' arcs finish, and a
  // shade hanging into that is a shade a rider kicks off on the way past.
  const lamps = [];
  for (const [x, z] of [
    [axis - HALF_WIDTH + 0.5, near + DEPTH * 0.32],
    [axis + HALF_WIDTH - 0.5, near + DEPTH * 0.72],
  ]) {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.2, 12, 1, true), trimMat);
    shade.position.set(x, HEIGHT - 0.1, z);
    group.add(shade);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      new THREE.MeshBasicMaterial({ color: '#ffbb66', toneMapped: false })
    );
    bulb.position.set(x, HEIGHT - 0.18, z);
    group.add(bulb);

    const lamp = new THREE.PointLight(0xffa347, 30, 26, 2);
    lamp.position.set(x, HEIGHT - 0.24, z);
    group.add(lamp);
    lamps.push(lamp);
  }

  // ------------------------------------------------------------- swing set ---

  const frameMat = new THREE.MeshStandardMaterial({
    color: '#4a4640',
    roughness: 0.55,
    metalness: 0.45,
  });
  const ropeMat = new THREE.MeshStandardMaterial({ color: '#2b2924', roughness: 0.8 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#7a3a10', roughness: 0.7 });

  /** Where the beam is, along z. The arcs swing across it. */
  const setZ = near + 4.4;
  const SPAN = 4.6;

  const beam = new THREE.Mesh(new THREE.BoxGeometry(SPAN, 0.18, 0.18), frameMat);
  beam.position.set(axis, BEAM_Y, setZ);
  beam.castShadow = true;
  group.add(beam);

  // A-frames at each end, splayed along z so the thing does not look like it
  // would fall over the first time anything swung on it.
  for (const side of [-1, 1]) {
    for (const lean of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, BEAM_Y + 0.3, 8), frameMat);
      leg.position.set(axis + side * SPAN / 2, (BEAM_Y - 0.1) / 2, setZ + lean * 0.75);
      leg.rotation.x = -lean * 0.21;
      leg.castShadow = true;
      group.add(leg);
      solid(
        axis + side * SPAN / 2 - 0.12,
        axis + side * SPAN / 2 + 0.12,
        setZ + lean * 0.75 - 0.12,
        setZ + lean * 0.75 + 0.12,
        {}
      );
    }
  }

  /**
   * One swing, and the button it is aimed at.
   *
   * `angle` is where it is along its arc, positive toward the button. `rate` is
   * how fast, in radians a second. Everything else about it — the ropes, the
   * seat, the rider — is written from those two numbers every frame.
   */
  function buildSwing(x, label) {
    const pivot = new THREE.Group();
    pivot.position.set(x, BEAM_Y, setZ);
    group.add(pivot);

    for (const side of [-1, 1]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ROPE, 6), ropeMat);
      rope.position.set(side * 0.28, -ROPE / 2, 0);
      pivot.add(rope);
    }

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.34), seatMat);
    seat.position.y = -ROPE;
    seat.castShadow = true;
    pivot.add(seat);

    /**
     * The button, on the ceiling, where a rider's feet come up at the top of
     * the arc.
     *
     * Worked out from the arc rather than placed by eye: the seat at HIT_ANGLE
     * is here, and a rider's legs carry on past it along the tangent, so this
     * is where the boots go. It hangs on a stem so there is something to
     * actually connect with — flush with the plaster it read as a mark on the
     * ceiling rather than as a thing to kick — but the stem is a hand's length
     * now rather than half a metre, because the arc reaches this much higher.
     */
    const seatZ = setZ + Math.sin(HIT_ANGLE) * ROPE;
    const seatY = BEAM_Y - Math.cos(HIT_ANGLE) * ROPE;
    const hitZ = seatZ + Math.cos(HIT_ANGLE) * LEGS;
    const hitY = seatY + Math.sin(HIT_ANGLE) * LEGS;

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, HEIGHT - hitY - 0.06, 8),
      frameMat
    );
    stem.position.set(x, (HEIGHT + hitY + 0.06) / 2, hitZ);
    group.add(stem);

    const padMat = new THREE.MeshStandardMaterial({
      color: '#5e1410',
      roughness: 0.45,
      emissive: '#000000',
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.09, 16), padMat);
    pad.position.set(x, hitY + 0.06, hitZ);
    group.add(pad);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 8, 20), trimMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, hitY + 0.06, hitZ);
    group.add(ring);

    return {
      label,
      x,
      pivot,
      seat,
      padMat,
      angle: 0,
      rate: 0,
      /** The angle as a mesh tilt — the same arc, in the renderer's sign. */
      lean: 0,
      /** Null, 'you' or 'bucket'. */
      rider: null,
      /** Latches so one pass of the button is one press. */
      armed: true,
      /** When it last hit, on the room's clock. Negative means never. */
      lastHit: -99,
      /** Counts down the flash on the pad. */
      lamp: 0,
      /** Where the seat is in the world, kept live for the interaction. */
      seatAt: new THREE.Vector3(x, BEAM_Y - ROPE, setZ),
      /** Where a rider is put down when it gets off. */
      standAt: new THREE.Vector3(x, 0, setZ - 1.5),
    };
  }

  const swings = [buildSwing(axis - 1.15, 'left'), buildSwing(axis + 1.15, 'right')];

  // --------------------------------------------------------------- the door ---

  /** The way on, in the far wall. Shut until the two buttons agree. */
  const WAY = { width: 1.8, height: 2.5, depth: 2.6, slide: 1.86 };
  const wayLow = axis - WAY.width / 2;
  const wayHigh = axis + WAY.width / 2;

  for (const [pw, ph, px, py] of [
    [wayLow - (axis - HALF_WIDTH), HEIGHT, (axis - HALF_WIDTH + wayLow) / 2, HEIGHT / 2],
    [axis + HALF_WIDTH - wayHigh, HEIGHT, (wayHigh + axis + HALF_WIDTH) / 2, HEIGHT / 2],
    [WAY.width, HEIGHT - WAY.height, axis, (HEIGHT + WAY.height) / 2],
  ]) {
    if (pw <= 0 || ph <= 0) continue;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshStandardMaterial({ ...wallSurface, color: WALL_TINT })
    );
    mesh.position.set(px, py, far);
    mesh.rotation.y = Math.PI;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  solid(axis - HALF_WIDTH - 1, wayLow, far, far + 1, {});
  solid(wayHigh, axis + HALF_WIDTH + 1, far, far + 1, {});

  // And the dark behind it, so an opened door is somewhere to go rather than a
  // black plane at arm's length.
  {
    const liner = new THREE.MeshStandardMaterial({ color: '#39332c', roughness: 0.9 });
    const zEnd = far + WAY.depth;
    for (const [x, turn] of [[wayLow, 0], [wayHigh, Math.PI]]) {
      const cheek = new THREE.Mesh(new THREE.PlaneGeometry(WAY.depth, WAY.height), liner);
      cheek.position.set(x, WAY.height / 2, far + WAY.depth / 2);
      cheek.rotation.y = Math.PI / 2 + turn;
      group.add(cheek);
    }
    const lid = new THREE.Mesh(new THREE.PlaneGeometry(WAY.width, WAY.depth), liner);
    lid.rotation.x = Math.PI / 2;
    lid.position.set(axis, WAY.height, far + WAY.depth / 2);
    group.add(lid);
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(WAY.width, WAY.depth), liner);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(axis, 0.003, far + WAY.depth / 2);
    group.add(deck);
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(WAY.width, WAY.height),
      new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: false, fog: false })
    );
    cap.position.set(axis, WAY.height / 2, zEnd);
    cap.rotation.y = Math.PI;
    group.add(cap);
    solid(wayLow, wayHigh, zEnd, zEnd + 1, {});
    solid(axis - HALF_WIDTH - 1, wayLow, far, zEnd + 1, {});
    solid(wayHigh, axis + HALF_WIDTH + 1, far, zEnd + 1, {});
  }

  const wayDoor = new THREE.Group();
  const waySit = (WAY.height - 0.04) / 2;
  {
    const leafMat = new THREE.MeshStandardMaterial({
      color: DOOR_ORANGE.leaf,
      roughness: DOOR_ORANGE.roughness,
      metalness: DOOR_ORANGE.metalness,
    });
    const doorTrim = new THREE.MeshStandardMaterial({
      color: DOOR_ORANGE.trim,
      roughness: 0.5,
      metalness: 0.2,
    });
    const doorHazard = new THREE.MeshStandardMaterial({ color: DOOR_ORANGE.hazard, roughness: 0.7 });

    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(WAY.width - 0.04, WAY.height - 0.04, 0.16),
      leafMat
    );
    leaf.castShadow = true;
    wayDoor.add(leaf);

    const face = -0.08;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(WAY.width - 0.24, 0.1, 0.03), doorTrim);
    rail.position.set(0, 1.35 - waySit, face - 0.015);
    wayDoor.add(rail);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(WAY.width - 0.16, 0.26, 0.012), doorHazard);
    stripe.position.set(0, 0.22 - waySit, face - 0.012);
    wayDoor.add(stripe);
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, WAY.width - 0.42, 10),
      doorTrim
    );
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.05 - waySit, face - 0.05);
    wayDoor.add(bar);
    for (const bx of [-1, 1]) {
      const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.19, 0.05), doorTrim);
      hanger.position.set(bx * 0.6, WAY.height + 0.07 - waySit, -0.02);
      wayDoor.add(hanger);
    }
    const trackNear = wayHigh + 0.12;
    const trackFar = axis - WAY.slide - (WAY.width - 0.04) / 2 - 0.06;
    const track = new THREE.Mesh(new THREE.BoxGeometry(trackNear - trackFar, 0.11, 0.1), doorTrim);
    track.position.set((trackNear + trackFar) / 2, WAY.height + 0.13, far - 0.05);
    group.add(track);
  }
  wayDoor.position.set(axis, waySit, far - 0.08);
  group.add(wayDoor);

  const wayBox = { minX: axis, maxX: axis, minZ: far - 0.2, maxZ: far };
  colliders.push(wayBox);
  const carryWayDoor = () => {
    const half = (WAY.width - 0.04) / 2;
    wayBox.minX = wayDoor.position.x - half;
    wayBox.maxX = wayDoor.position.x + half;
  };
  carryWayDoor();

  // ------------------------------------------------------------ getting on ---

  /**
   * Whoever is being driven right now.
   *
   * The swing does not care which of you it is — you get on with whichever body
   * you are wearing, and the puzzle is that there are two swings and one of
   * you at a time.
   */
  const driver = () => (possession.isPossessing ? 'bucket' : 'you');

  function seatOf(swing) {
    return swing.seatAt;
  }

  function mount(swing) {
    if (swing.rider || solved) return;
    const who = driver();
    // One body per swing, and a body cannot be on two.
    for (const other of swings) if (other.rider === who) other.rider = null;
    swing.rider = who;
    if (who === 'bucket') friend.setFollowing(false);
    playButtonPress(0.5);
    showNote('E to pump. Space to get off.', 3.4);
    if (!entered) return;
    setObjective(
      swings.every((s) => s.rider)
        ? 'Hit both buttons at the same time'
        : 'Now get the other one swinging'
    );
  }

  function dismount(swing) {
    const who = swing.rider;
    swing.rider = null;
    if (who === 'you') {
      // Its own body again: walking, falling, standing upright, and holding
      // the camera. teleport clears the momentum the seat had at the moment
      // you stepped off it.
      player.setCarried(false);
      playerBody.setSeated(null);
      player.teleport({
        position: [swing.standAt.x, 0, swing.standAt.z],
        yaw: player.lookYaw,
        pitch: player.lookPitch,
      });
    } else if (who === 'bucket') {
      // spawn() stands it back up — a bucket put down anywhere is a bucket on
      // its feet.
      friend.spawn(swing.standAt);
    }
  }

  /**
   * E gets you on, and from then until you leave it is the pump — a press
   * rather than a hold, the way you kick a swing instead of leaning on it.
   *
   * Nothing else is on E, which took a redesign to get right. Getting off was
   * on it too at first, offered whenever the swing was stopped, and that is
   * every swing before it has been started: the first press of E on a parked
   * swing took you straight back off it, so it could never be started at all.
   * Space gets you off now — you jump off a swing — and the note on the way in
   * says so, because a control nobody is told about is not a control.
   *
   * The label is a getter, which is why interaction.js fills its defaults in on
   * the target rather than into a copy: a copy freezes accessors at whatever
   * they said when the room was built.
   */
  for (const swing of swings) {
    const stopped = () => Math.abs(swing.angle) < 0.22 && Math.abs(swing.rate) < 0.5;
    interactions.push({
      position: seatOf(swing),
      get label() {
        return swing.rider === driver() ? 'Pump' : 'Get on the swing';
      },
      range: 2.4,
      once: false,
      enabled: () => {
        if (swing.rider === driver()) return true;
        return !solved && !swing.rider && stopped();
      },
      onInteract() {
        if (swing.rider === driver()) pump(swing);
        else mount(swing);
      },
    });
  }

  // Off the swing, whichever of you is on one. Not routed through the
  // interaction system: that is E's, and E is the pump.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat) return;
    if (/^(INPUT|TEXTAREA)$/.test(event.target?.tagName ?? '')) return;
    const who = driver();
    const swing = swings.find((s) => s.rider === who);
    if (swing) dismount(swing);
  });

  /**
   * A kick, worth the most at the bottom of the arc and almost nothing at the
   * top — which is how a swing actually works, and the only reason the timing
   * of the press matters at all.
   *
   * From a standing start it goes toward the button, because a swing that
   * needed a direction before it had one would never start.
   */
  function pump(swing) {
    const way = Math.abs(swing.rate) < 0.05 ? 1 : Math.sign(swing.rate);
    swing.rate += PUMP * Math.cos(swing.angle) * way;
    playButtonPress(0.35);
  }

  /** Inside the room at all. */
  const contains = (x, z) =>
    x > axis - HALF_WIDTH && x < axis + HALF_WIDTH && z > near && z < far;

  return {
    group,
    colliders,
    interactions,
    contains,
    swings,

    get isSolved() {
      return solved;
    },

    /** Dev handle: how far along each arc, and when each last hit. */
    get state() {
      return swings.map((s) => ({
        rider: s.rider,
        angle: +s.angle.toFixed(3),
        rate: +s.rate.toFixed(3),
        lastHit: +s.lastHit.toFixed(2),
      }));
    },

    update(delta) {
      clock += delta;

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        setObjective('Get on a swing');
        showNote('Two seats. One of you at a time.', 3.2);
      }

      for (const swing of swings) {
        // A pendulum, left to itself. Everything a rider does to it arrives as
        // an impulse from `pump` rather than as a force held down here, so the
        // swing is the same object whether anybody is on it or not.
        
        const accel = -(GRAVITY / ROPE) * Math.sin(swing.angle) - DAMPING * swing.rate;
        swing.rate += accel * delta;
        swing.angle += swing.rate * delta;
        if (Math.abs(swing.angle) > MAX_ANGLE) {
          swing.angle = Math.sign(swing.angle) * MAX_ANGLE;
          swing.rate = 0;
        }

        // The seat, twice: once as the thing you can see, once as the point a
        // rider is put on. They have to be the same place, and the sign here is
        // the whole reason they are.
        //
        // A turn about x by a positive angle carries a point hanging below the
        // pivot toward -z, and `seatAt` below sends it toward +z, so the plank
        // used to swing out over the room while whoever was sitting on it flew
        // the other way — measured at 2.8 metres apart at the top of the arc,
        // with the buttons on the rider's side. Negating it is what makes the
        // seat and the seated agree, and everything else in the room is written
        // from the same convention: positive is toward the buttons.
        swing.lean = -swing.angle;
        swing.pivot.rotation.x = swing.lean;
        swing.seatAt.set(
          swing.x,
          BEAM_Y - Math.cos(swing.angle) * ROPE,
          setZ + Math.sin(swing.angle) * ROPE
        );

        // The button. One press per pass, latched, and only on the way out —
        // the arc crosses this line twice and a swing that counted both would
        // let one rider solve it against its own echo.
        if (!solved && swing.angle > HIT_ANGLE && swing.rate > 0 && swing.armed) {
          swing.armed = false;
          swing.lamp = 0.35;
          playButtonPress(0.8);
          swing.lastHit = clock;
          const other = swings.find((s) => s !== swing);
          const gap = clock - other.lastHit;
          if (gap <= WINDOW) {
            solved = true;
            playWardDoor();
            setObjective('Go through');
            showNote('Both at once. Something opens at the far end.', 3.4);
          } else if (!missedNote && gap <= NEARLY) {
            // Once, and only when the two are already in the same neighbourhood.
            // Two buttons that go off a couple of seconds apart look from the
            // seat like two buttons going off, and a player can be most of the
            // way to having this and read it as nothing happening. Saying so the
            // first time it nearly lands is the difference between a puzzle you
            // are working on and one you think is broken.
            missedNote = true;
            showNote('Close. They have to go off together.', 3.2);
          }
        }
        if (swing.angle < HIT_ANGLE - 0.08) swing.armed = true;

        // The pad, lit while it is being hit and green once the pair of them
        // have been hit together.
        swing.lamp = Math.max(0, swing.lamp - delta);
        if (solved) {
          swing.padMat.color.set('#2fd46a');
          swing.padMat.emissive.set('#12561f');
        } else {
          swing.padMat.emissive.setStyle('#a8410c').multiplyScalar(swing.lamp / 0.35);
        }

        // And whoever is on it rides it. Written after both bodies have had
        // their own update, so this is the last word on where they are and how
        // they are sitting — neither of them knows what a swing is, they are
        // simply being carried by one.
        if (swing.rider === 'you') {
          // Every frame rather than once on the way on: coming back into this
          // body with F hands it control again, and it would start walking
          // around underneath you while you sat there.
          player.setCarried(true);
          player.position.set(swing.seatAt.x, swing.seatAt.y, swing.seatAt.z);
          playerBody.setSeated({ lean: swing.lean, yaw: RIDE_YAW });
          if (!possession.isPossessing) {
            // The head goes up the rope, not straight up off the seat: sitting
            // on a swing you lean back with the arc, and at the top of this one
            // a head held vertically would be through a ceiling three metres up.
            // A seated eye line, not a standing one — the rest of the body is
            // folded up on the plank.
            camera.position.set(
              player.position.x,
              player.position.y + Math.cos(swing.angle) * SEAT_EYE,
              player.position.z - Math.sin(swing.angle) * SEAT_EYE
            );
            // And the view leans with it, by a share of the angle. See the same
            // sum in possession.applyCamera, which does this for the other body.
            camera.rotation.set(
              player.lookPitch - swing.lean * VIEW_LEAN,
              player.lookYaw,
              0,
              'YXZ'
            );
          }
        } else if (swing.rider === 'bucket') {
          // Everything about where the bucket is and how it is folded, in one
          // call — including that it stops falling, which it was doing all the
          // way through every ride. See friend.sit().
          friend.sit(swing.seatAt, swing.lean, RIDE_YAW);
          // It is not stuck, it is sitting down. Without this the rescue that
          // teleports a wedged bucket back to you fires within a few seconds
          // of it being left on a swing.
          friend.setRecallAllowed(false);
        }
      }

      if (solved && wayDoor.position.x > axis - WAY.slide + 0.005) {
        wayDoor.position.x += (axis - WAY.slide - wayDoor.position.x) * Math.min(1, delta * 1.6);
        carryWayDoor();
      }
    },
  };
}
