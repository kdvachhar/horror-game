import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  makeWoodSurface,
  cloneSurface,
  metalRepeat,
  worldRepeat,
} from './textures.js';
import { createLiftMotor, playButtonPress, playSpikeGrind } from './audio.js';
import { createControlPanel } from './controlPanel.js';
import { showNote } from './hud.js';

/**
 * The hoist out of the chamber behind the rockfall, the room at the top of it,
 * and the window in that room.
 *
 * The rockfall put the bucket somewhere you cannot follow. This is what is in
 * there, and it is the first thing in this game that the bucket does *instead*
 * of you rather than *for* you: seventy-two metres of shaft, a platform with a
 * lever on it, and a floor at the top that you will never stand on.
 *
 * **The window is the reason the rest of it is worth building.** A lift that
 * goes up to a room is a lift that goes up to a room. What the bucket finds at
 * the top is a wall with a hole in it looking sideways into the tall room —
 * the seventy-six metre shaft full of sockets that you walked the whole hall to
 * reach and then found filled with an animal. You could not get into it. The
 * bucket cannot get into it either. But from up here it is *lit*, and it is
 * enormous, and the thing sitting in the bottom of it is directly below.
 *
 * And one pane of that window is out, with a gangway hung off it running into
 * the middle of the tower — see tallRoom.js, which builds all of that on its
 * own side of the glass. Not for the bucket: the bucket works the treads and
 * stays in the room. That gap is where *you* arrive, at the end of a climb up
 * the wall the bucket's own presses opened, which makes this the first room in
 * the game the two of you reach from opposite directions.
 *
 * That the two rooms meet at all is not a coincidence arranged after the fact:
 * this room's west wall and the tall room's east wall are the same plane, at
 * x = the hall's near wall, and they have been since the tall room was built.
 * The window is a hole cut in one surface that two files own a side of each, so
 * the opening is handed over — see `port` at the bottom, and tallRoom.js, which
 * takes it and cuts its own side to match rather than being told a number.
 *
 * Three rules held the machine together and each threw something away.
 *
 * **The control is on the platform, not on the wall.** A call button at each
 * landing is how a lift works and it is the version that can strand the bucket
 * at the bottom of a shaft with the car at the top of it — which, in a chamber
 * the player cannot walk into, is a soft lock you would have to leave the level
 * to fix. With the lever on the car, the car is always where the only thing
 * that can drive it got off. One interaction instead of three, no failure state.
 *
 * **The shaft is enclosed by the collider vocabulary that already existed.**
 * Nothing new was added. The walls above the chamber carry `bottom`, which is
 * the lintel rule — a thing in the air with open space beneath — so they are
 * open at floor level where the bucket walks on and solid the moment it is off
 * the ground. The one on the landing side carries `top` as well, at exactly the
 * landing floor's height, so it stops being a wall where the floor starts and
 * the two meet with nothing to step over. See player.js and friend.js, which
 * both have to agree about what those mean.
 *
 * **The car carries nothing.** There is no rider, no attachment, no
 * `setCarried` like the orange room's swings. It is a collider whose `top`
 * moves, and both bodies already stand on `top`s and already follow one that
 * rises under them, because that is what a step is. At full speed a frame moves
 * it four centimetres less than a bucket steps up for free, so riding it is
 * never anything but standing on the floor. Everything that could have been a
 * system here is the absence of one.
 */

/**
 * The shaft, square, in the back right corner of the chamber.
 *
 * Right as the bucket comes in, which is the only direction anything enters
 * that room from — through the hole in the rock, travelling +x, so right is +z.
 * Corner rather than middle because two of the four walls are then the
 * chamber's own, and a lift cut into existing structure is a lift that was put
 * in later, which is the correct history for this building.
 */
const SHAFT = 1.7;

/**
 * How far up, when nobody says.
 *
 * Nobody who matters doesn't: the caller hands over the tower this room looks
 * into, and the landing is then the one height that makes the phrase "the room
 * at the top" true — `match.high` less this room's own inside height, so the
 * two share a ceiling. Twenty-four, then forty-eight, were both this number
 * typed by hand against a tower that had changed underneath it, and both were
 * right for exactly as long as the tower stood still.
 *
 * Deriving it means the window ends up hard against the top of the tower's east
 * wall with under a metre of masonry over it, which is the correct place for
 * the only eye in the building: everything in that room is below you, the
 * animal is fifty-eight metres down and small, and there is no longer any part
 * of it you have not seen. That is a different room from the one that had
 * unlit tower above the glass, and it is the one that was asked for.
 */
const TOP_ALONE = 48;

/** The car. `deep` is square, and smaller than the shaft on purpose. */
const CAR = { deep: 1.4, thick: 0.14, post: 0.86 };

/**
 * How it moves. Up faster than down, and both of them slow into the stop.
 *
 * Four and a bit metres a second, which is the least interesting sentence in
 * this file and the one holding the ride together. The rule it is solving for
 * has not changed since the shaft was twenty-four metres: long enough to be a
 * journey, short enough that you are still watching it at the end — and it is
 * the second half that breaks first. Seventy-two metres at the speed this was
 * built with is most of a minute in a box, which is not a journey, it is a
 * loading screen. At four point two it is seventeen seconds, the same ride it
 * has always been, over three times the distance.
 */
const SPEED = { up: 4.2, down: 3.2, ramp: 1.5 };

/**
 * The room at the top, and the way into it off the car.
 *
 * `wide` and `deep` are defaults and are meant to be overridden: the caller
 * hands over the footprint of the room this one looks into, so the two are the
 * same size where they meet. A small room with a window onto an enormous one
 * reads as a cupboard someone cut a hole in; matching them makes the window a
 * junction between two halves of the same building rather than a peephole.
 *
 * `match` carries where that room is as well as how big it is — `minZ` and
 * `maxZ` — because the window is cut to the part of the wall that has it behind
 * it, and same-size is not same-place. See `port`.
 */
const ROOM = { wide: 8.4, deep: 9.0, high: 3.4 };
const DOOR = { wide: SHAFT, high: 2.2 };

/**
 * The window, measured from the room's own floor.
 *
 * The cill is a threshold plate and nothing more. It was three hundred
 * millimetres for a while, chosen so that a bucket — which steps two hundred
 * and fifty for free — would be held at the glass and have to hop out on
 * purpose, on the theory that a seventy-two metre drop deserves a decision.
 *
 * That theory was wrong in the only way that matters: it made the window look
 * like a way through and behave like a wall, which is the exact complaint this
 * whole pass started from. A hole you cannot walk through is a hole you have to
 * be told about. Whatever a drop deserves, it does not deserve being taught by
 * a body refusing to move for reasons it cannot show you.
 *
 * So: a hundred and twenty millimetres, under the bucket's step and far under
 * the player's, and both of them walk over it. It is still a cill — you can see
 * it, it is painted, and it is the piece the frame sits on — it is simply not
 * an argument any more.
 *
 * There is no width here any more either. The window is as long as it can be —
 * see `portLow` and `portHigh`, which measure it out of the wall rather than
 * being given a number — and `jamb` is all that is left of the choice: how much
 * wall is kept at each end so that the opening reads as a window in a wall
 * rather than as a wall that stops halfway.
 */
/**
 * `bay` is the one pane that is not there, and it is the way out.
 *
 * The note above this one argues that a hole you cannot walk through is a hole
 * you have to be told about, and then the glass went back in and made the whole
 * window exactly that. Both of those were right at the time: there was nothing
 * on the other side of the glass but seventy-two metres of air, and a window
 * onto a drop should hold.
 *
 * There is something out there now — see tallRoom.js, which hangs a gangway off
 * this wall and runs catwalks out of its own to meet it. So one bay of the
 * glass is out. Not the whole window: the rest of it is still the view, and the
 * view is what the room is for. One pane, in the middle, with its jambs still
 * standing either side of the gap, which is what a pane somebody removed looks
 * like and is nothing at all like a window nobody glazed.
 *
 * Wide enough for a player and narrow enough to read as a gap in the glazing
 * rather than as the window having stopped. The bucket does not use it — see
 * the collider on it below, which is there for the bucket and nobody else.
 */
const PORT = { jamb: 0.45, cill: 0.12, high: 2.4, bay: 1.7 };

const SHAFT_TINT = '#34382f';
const ROOM_TINT = '#3f4239';

export function createLiftTower({ scene, parent = scene, colliders, chamber, camera, match, bodies }) {
  const group = new THREE.Group();
  parent.add(group);

  const CEIL = chamber.height;
  /**
   * The landing, which is the top of the room next door less this room's own
   * height — so this room's ceiling and that room's ceiling are one plane, and
   * "the room at the top of the tower" is a fact about the building rather than
   * a number somebody kept up to date by hand.
   */
  const TOP = match?.high !== undefined ? +(match.high - ROOM.high).toFixed(2) : TOP_ALONE;
  /** The whole tower's inside height above the chamber floor. */
  const CROWN = TOP + ROOM.high;
  /** As wide and as deep as the room it looks into, when it is told what that is. */
  const WIDE = match?.wide ?? ROOM.wide;
  const DEEP = match?.deep ?? ROOM.deep;

  const shaft = {
    minX: chamber.maxX - SHAFT,
    maxX: chamber.maxX,
    minZ: chamber.maxZ - SHAFT,
    maxZ: chamber.maxZ,
  };
  const sx = (shaft.minX + shaft.maxX) / 2;
  const sz = (shaft.minZ + shaft.maxZ) / 2;

  /**
   * The room, hung off the shaft's landing side.
   *
   * Entirely outside the shaft's footprint rather than wrapped round it, so the
   * landing is a doorway in a wall and not a hole in a floor. A hole in a floor
   * is the better-looking version and the worse one to stand next to: the car
   * arrives flush with the boards and the opening it came up through is then an
   * open pit in the middle of the only room up here, which either wants a gate
   * — a second mechanism — or is a thing you can walk into by turning round.
   *
   * Its size is the tall room's, handed over by the caller — see `match`. The
   * one end that is not free is the landing: this room has to reach the shaft,
   * so it is pinned at `shaft.minZ` and grows away from it. Same size, three
   * metres out of step, which is the whole of what `port` has to work around.
   */
  const room = {
    minX: chamber.minX,
    maxX: chamber.minX + WIDE,
    minZ: shaft.minZ - DEEP,
    maxZ: shaft.minZ,
  };
  const rx = (room.minX + room.maxX) / 2;
  const rz = (room.minZ + room.maxZ) / 2;

  /**
   * Where the window goes, in the wall the two rooms share, and how long it is.
   *
   * It runs the length of the room, and the only thing that shortens it is what
   * is on the other side. These two rooms are the same size and are *not* in the
   * same place: this one is pinned to the shaft at its near end and the tall room
   * is pinned to the hall at its far end, so they are three metres out of step.
   * Three metres of this wall has no tall room behind it — it has the void over
   * the giant hall's ceiling, which is nothing, unlit and unbuilt.
   *
   * So the opening is clipped to the overlap: `match` hands over where the
   * neighbour actually is, not just how big it is, and the window is cut out of
   * that rather than out of this room. Every part of the glass has the tall room
   * behind it and the last three metres stay wall. A window is only worth its
   * length if all of it is looking at something.
   */
  const behindLow = Math.max(room.minZ, match?.minZ ?? room.minZ);
  const behindHigh = Math.min(room.maxZ, match?.maxZ ?? room.maxZ);
  const portLow = behindLow + PORT.jamb;
  const portHigh = behindHigh - PORT.jamb;
  /** How long the glass ended up. Nothing in here is allowed to assume it. */
  const WIN = portHigh - portLow;

  const port = {
    x: room.minX,
    z: (portLow + portHigh) / 2,
    cill: TOP + PORT.cill,
    head: TOP + PORT.cill + PORT.high,
    width: WIN,
  };

  /**
   * The open bay, in the middle of the glass.
   *
   * In the middle rather than at an end, and that is the only decision here.
   * The two rooms are three metres out of step, so an end bay would put the way
   * out three metres off the tall room's centre line and everything hung off it
   * would be hung off a corner. The middle of the window is the middle of what
   * the window can see, which is the piece of that room worth walking into.
   */
  const bayLow = port.z - PORT.bay / 2;
  const bayHigh = port.z + PORT.bay / 2;

  // ------------------------------------------------------------ materials ---

  const wallOf = (surface, tint) => (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(surface, ...worldRepeat(w, h)),
      color: tint,
      metalness: 0.02,
      roughness: 0.95,
    });

  const shaftSurface = makeWallSurface(...worldRepeat(SHAFT, CROWN - CEIL), SHAFT_TINT);
  const shaftWall = wallOf(shaftSurface, SHAFT_TINT);

  const roomSurface = makeWallSurface(...worldRepeat(WIDE, ROOM.high), ROOM_TINT);
  const roomWall = wallOf(roomSurface, ROOM_TINT);

  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(2, 1), '#55584f'),
    metalness: 0.62,
    roughness: 0.54,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#25271f', roughness: 0.9, metalness: 0.3 });
  const litGlass = new THREE.MeshBasicMaterial({ color: '#c8ccbc' });

  /** One plane, given its own extents and turned once. */
  function panel(material, w, h, px, py, pz, rotX = 0, rotY = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(px, py, pz);
    mesh.rotation.set(rotX, rotY, 0);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  // --------------------------------------------------------------- the lid ---

  /**
   * The chamber's ceiling, in two pieces round the shaft.
   *
   * Built here and not in rockfall.js, because the piece with the hole in it
   * should be owned by whatever put the hole there. Two rectangles, not four:
   * the shaft is in a corner, so an L covers the rest.
   */
  {
    const wide = chamber.maxX - chamber.minX;
    const deep = chamber.maxZ - chamber.minZ;
    const lidSurface = makeCeilingSurface(...worldRepeat(wide, deep));
    const lid = (w, d) =>
      new THREE.MeshStandardMaterial({
        ...cloneSurface(lidSurface, ...worldRepeat(w, d)),
        color: '#2a2c27',
        metalness: 0,
      });
    for (const [w, d, px, pz] of [
      [shaft.minX - chamber.minX, deep, (chamber.minX + shaft.minX) / 2, (chamber.minZ + chamber.maxZ) / 2],
      [SHAFT, shaft.minZ - chamber.minZ, sx, (chamber.minZ + shaft.minZ) / 2],
    ]) {
      if (w <= 0.001 || d <= 0.001) continue;
      const piece = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lid(w, d));
      piece.rotation.x = Math.PI / 2;
      piece.position.set(px, CEIL, pz);
      group.add(piece);
    }
  }

  // ------------------------------------------------------------- the shaft ---

  /**
   * Four sides. Three go the whole way up; the fourth stops at the landing,
   * because that is where it becomes a doorway.
   */
  {
    const full = CROWN - CEIL;
    const mid = (CEIL + CROWN) / 2;
    panel(shaftWall(SHAFT, full), SHAFT, full, shaft.minX, mid, sz, 0, Math.PI / 2);
    panel(shaftWall(SHAFT, full), SHAFT, full, shaft.maxX, mid, sz, 0, -Math.PI / 2);
    panel(shaftWall(SHAFT, full), SHAFT, full, sx, mid, shaft.maxZ, 0, Math.PI);
    panel(shaftWall(SHAFT, TOP - CEIL), SHAFT, TOP - CEIL, sx, (CEIL + TOP) / 2, shaft.minZ, 0, 0);

    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(SHAFT, SHAFT),
      new THREE.MeshStandardMaterial({ color: '#22241e', roughness: 1 })
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.set(sx, CROWN, sz);
    group.add(roof);
  }

  /**
   * The ladder, and it is here for one reason: speed.
   *
   * A lift going up a smooth shaft has no speed at all — the walls are the same
   * everywhere, so nothing passes, and the only thing telling you that you are
   * moving is that the light at the bottom is getting further away. Rungs every
   * third of a metre are a beat you can count, and counting them is what makes
   * seventy-two metres feel like seventy-two metres.
   *
   * One InstancedMesh for seventy of them. Seventy meshes for a detail nobody
   * will look at twice is seventy draw calls in a scene that has too many.
   */
  {
    for (const dx of [-0.2, 0.2]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, TOP - CEIL - 0.4, 0.05), steel);
      rail.position.set(sx + dx, (CEIL + TOP) / 2, shaft.maxZ - 0.11);
      group.add(rail);
    }

    const PITCH = 0.33;
    const RUNGS = Math.floor((TOP - CEIL - 1) / PITCH);
    const rungs = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.44, 6),
      steel,
      RUNGS
    );
    const at = new THREE.Object3D();
    for (let i = 0; i < RUNGS; i++) {
      at.position.set(sx, CEIL + 0.5 + i * PITCH, shaft.maxZ - 0.11);
      at.rotation.set(0, 0, Math.PI / 2);
      at.updateMatrix();
      rungs.setMatrixAt(i, at.matrix);
    }
    rungs.instanceMatrix.needsUpdate = true;
    group.add(rungs);

    const guide = new THREE.Mesh(new THREE.BoxGeometry(0.09, CROWN - CEIL, 0.16), steel);
    guide.position.set(shaft.minX + 0.06, (CEIL + CROWN) / 2, sz);
    group.add(guide);
  }

  /**
   * The lamps in the shaft, and they are landmarks rather than light.
   *
   * The ride is meant to be dark. What these do is give it a middle: the mouth
   * of the shaft falls away, one lamp comes up and goes past, then the next,
   * and then the room's own light starts coming down to meet you. Events at a
   * steady rate are what keep it a journey instead of a wait.
   *
   * A fitting every four and a half metres, and a *lamp* in one of every four
   * of them. Spacing them by fractions of the rise was fine at twenty-four and
   * is useless at seventy-two — four lamps over seventy metres is one every
   * eighteen, which is not a beat, it is four events in a long dark. But four
   * lamps is already four lights in a renderer where a light costs every
   * surface in the scene, and sixteen would be indefensible.
   *
   * So most of them are dead: a shade and a lens, unlit, exactly as they are in
   * the top of the tower. In a shaft with nothing else in it an unlit lens is
   * plainly visible and passes at a countable rate, which is the entire job.
   * The lit ones are what actually reach the walls, and they are still four.
   */
  {
    const PITCH = 4.5;
    const count = Math.max(4, Math.floor((TOP - CEIL - 1) / PITCH));
    const litEvery = Math.max(1, Math.round(count / 4));
    for (let i = 0; i < count; i++) {
      const y = +(CEIL + 1.4 + i * ((TOP - CEIL - 2.4) / Math.max(1, count - 1))).toFixed(2);
      if (i % litEvery === 0) {
        const lamp = new THREE.PointLight(0xc4c9b8, 9, 6.5, 1.8);
        lamp.position.set(shaft.minX + 0.35, y, sz);
        group.add(lamp);
      }
      const shade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.4), dark);
      shade.position.set(shaft.minX + 0.16, y, sz);
      group.add(shade);
      const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.34), litGlass);
      lens.position.set(shaft.minX + 0.215, y, sz);
      lens.rotation.y = -Math.PI / 2;
      group.add(lens);
    }
  }

  // --------------------------------------------------------------- the car ---

  /** Everything that moves, in one group, so one number drives all of it. */
  const car = new THREE.Group();
  group.add(car);

  {
    const deck = new THREE.Mesh(new THREE.BoxGeometry(CAR.deep, CAR.thick, CAR.deep), steel);
    deck.position.y = -CAR.thick / 2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    car.add(deck);

    // Hazard stripes round the edge of it: the one piece of colour in the shaft
    // and the thing that reads first, which matters — the bucket comes at this
    // from the side, in the dark, and has to know it is a floor and not a hole.
    const hazard = new THREE.MeshStandardMaterial({
      ...makeHazardSurface(6, 1),
      metalness: 0.2,
      roughness: 0.7,
    });
    for (const [px, pz, ry] of [
      [0, -CAR.deep / 2, 0],
      [0, CAR.deep / 2, Math.PI],
      [-CAR.deep / 2, 0, Math.PI / 2],
      [CAR.deep / 2, 0, -Math.PI / 2],
    ]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(CAR.deep, 0.09, 0.05), hazard);
      edge.position.set(px, 0.045, pz);
      edge.rotation.y = ry;
      car.add(edge);
    }

    // The post, in the corner against the two blank walls, so it is never
    // between the bucket and the way on at either end.
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, CAR.post, 0.1), steel);
    post.position.set(CAR.deep / 2 - 0.1, CAR.post / 2, CAR.deep / 2 - 0.1);
    car.add(post);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.16), dark);
    box.position.set(CAR.deep / 2 - 0.19, 0.62, CAR.deep / 2 - 0.1);
    car.add(box);
  }

  /** The handle, which is the only part of the car that says anything. */
  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.3, 0.045), steel);
  lever.position.set(CAR.deep / 2 - 0.29, 0.7, CAR.deep / 2 - 0.1);
  car.add(lever);
  lever.rotation.x = 0.5;
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 12, 8),
    new THREE.MeshStandardMaterial({ color: '#7a2f22', roughness: 0.7 })
  );
  knob.position.set(0, 0.17, 0);
  lever.add(knob);

  /**
   * The cables, drawn between the wheels and the car every frame.
   *
   * A unit cylinder scaled on y and parked at the midpoint, rather than
   * rebuilt: the geometry never changes, only how much of it there is. Down the
   * two corners on the guide side, not down the middle — a cable through the
   * middle of a platform is a cable through whatever is standing on it.
   */
  const CABLE_X = sx - 0.5;
  const cables = [];
  for (const dz of [-0.6, 0.6]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 5), dark);
    cable.position.set(CABLE_X, 0, sz + dz);
    group.add(cable);
    cables.push(cable);
  }

  /** The wheels it hangs off, in the head of the shaft above the landing. */
  const SHEAVE_Y = CROWN - 0.5;
  {
    // Set half a wheel off the cables rather than centred on them: a cable
    // comes up a shaft vertically and goes over the *rim*, so the rim is where
    // it has to be and the hub is a radius to one side of it.
    const HUB = CABLE_X + 0.34;
    for (const dz of [-0.6, 0.6]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 20), steel);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(HUB, SHEAVE_Y, sz + dz);
      group.add(wheel);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8), steel);
    axle.rotation.x = Math.PI / 2;
    axle.position.set(HUB, SHEAVE_Y, sz);
    group.add(axle);

    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 1.5), steel);
    bracket.position.set(HUB, CROWN - 0.06, sz);
    group.add(bracket);

    const winch = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.5), dark);
    winch.position.set(sx, SHEAVE_Y - 0.1, shaft.minZ + 0.42);
    group.add(winch);
  }

  // -------------------------------------------------------------- the room ---

  {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDE, DEEP),
      new THREE.MeshStandardMaterial({
        ...makeFloorSurface(...worldRepeat(WIDE, DEEP)),
        color: '#3c3e37',
        metalness: 0,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(rx, TOP, rz);
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDE, DEEP),
      new THREE.MeshStandardMaterial({
        ...makeCeilingSurface(...worldRepeat(WIDE, DEEP)),
        color: '#2b2d28',
        metalness: 0,
      })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(rx, CROWN, rz);
    group.add(ceiling);

    // And it stops your head: a `bottom` with no `top` is an underside with
    // open space beneath, which is the whole definition of a lid.
    colliders.push({
      minX: rx - WIDE / 2,
      maxX: rx + WIDE / 2,
      minZ: rz - DEEP / 2,
      maxZ: rz + DEEP / 2,
      bottom: CROWN,
    });

    const mid = TOP + ROOM.high / 2;

    /**
     * The west wall, in four pieces round the window.
     *
     * This is the wall the tall room is on the other side of. Cutting it is the
     * whole reason this room exists at the height it does — see `port`, which
     * is handed to tallRoom.js so it can cut its own side of the same hole.
     */
    for (const [w, h, pz, py] of [
      [portLow - room.minZ, ROOM.high, (room.minZ + portLow) / 2, mid],
      [room.maxZ - portHigh, ROOM.high, (portHigh + room.maxZ) / 2, mid],
      [WIN, PORT.cill, port.z, TOP + PORT.cill / 2],
      [WIN, CROWN - port.head, port.z, (port.head + CROWN) / 2],
    ]) {
      if (w <= 0.001 || h <= 0.001) continue;
      panel(roomWall(w, h), w, h, room.minX, py, pz, 0, Math.PI / 2);
    }

    panel(roomWall(DEEP, ROOM.high), DEEP, ROOM.high, room.maxX, mid, rz, 0, -Math.PI / 2);
    panel(roomWall(WIDE, ROOM.high), WIDE, ROOM.high, rx, mid, room.minZ, 0, 0);

    // And the fourth in three pieces round the way in off the car, the same way
    // every wall with a hole in it is built in this game.
    for (const [w, h, px, py] of [
      [shaft.minX - room.minX, ROOM.high, (room.minX + shaft.minX) / 2, mid],
      [room.maxX - shaft.maxX, ROOM.high, (shaft.maxX + room.maxX) / 2, mid],
      [DOOR.wide, ROOM.high - DOOR.high, sx, TOP + DOOR.high + (ROOM.high - DOOR.high) / 2],
    ]) {
      if (w <= 0.001 || h <= 0.001) continue;
      panel(roomWall(w, h), w, h, px, py, room.maxZ, 0, Math.PI);
    }

    // Hazard paint round the opening, on the floor. It is the edge of a
    // seventy-two metre drop whenever the car is not at this end, and the only
    // warning about it that can be seen from the middle of the room.
    const warn = new THREE.Mesh(
      new THREE.PlaneGeometry(DOOR.wide + 0.5, 0.55),
      new THREE.MeshStandardMaterial({
        ...makeHazardSurface(4, 1),
        metalness: 0.1,
        roughness: 0.8,
      })
    );
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(sx, TOP + 0.006, room.maxZ - 0.3);
    group.add(warn);
  }

  /**
   * The window itself: a lined opening, a cill, and glass in it that holds.
   *
   * The glass came out for a while and it is back, and the difference between
   * those two decisions is worth keeping straight, because it is not the one it
   * looks like. It came out because this room was full of colliders with nothing
   * to see — six of them, walls of neighbouring rooms standing up through the
   * floor — and while that was true, a nearly-invisible pane was one more thing
   * stopping you for no visible reason, so it went with the rest of them.
   *
   * Those are all gone now, and a pane is no longer hiding among them. It is the
   * only thing in this room that stops you, it is the obvious thing to be
   * stopped by seventy-two metres up, and what is on the other side of it is a
   * drop onto the back of an animal. Glass in a window is not an invisible wall.
   * A window with nothing in it, over that, is just a hole nobody would have
   * left.
   */
  {
    const glazing = new THREE.MeshStandardMaterial({
      color: '#10160f',
      transparent: true,
      opacity: 0.12,
      roughness: 0.24,
      metalness: 0.5,
      // Double sided: the tall room is on the other side of it, and this is
      // now a feature of a seventy-six metre wall of that room as well.
      side: THREE.DoubleSide,
    });
    // Two panes, and the gap between them is the way out. Built as a loop over
    // the runs of glass rather than as two named panes, so the day the bay
    // moves or the window is clipped shorter there is nothing here to correct.
    for (const [z0, z1] of [[portLow, bayLow], [bayHigh, portHigh]]) {
      const w = z1 - z0;
      if (w < 0.01) continue;
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, PORT.high), glazing);
      glass.position.set(port.x, (port.cill + port.head) / 2, (z0 + z1) / 2);
      glass.rotation.y = Math.PI / 2;
      group.add(glass);
    }

    const frame = new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(...metalRepeat(WIN, 0.4), '#3f423b'),
      metalness: 0.55,
      roughness: 0.66,
    });
    // The reveal, which is what gives a zero-thickness wall a thickness. The
    // cill is deeper than the rest of it: it is the piece that is stood on.
    for (const [w, h, d, py, pz] of [
      [0.44, PORT.cill, WIN, TOP + PORT.cill / 2, port.z],
      [0.34, 0.16, WIN, port.head, port.z],
      [0.34, PORT.high, 0.16, (port.cill + port.head) / 2, portLow],
      [0.34, PORT.high, 0.16, (port.cill + port.head) / 2, portHigh],
      // And a jamb each side of the missing pane. They are what make the gap
      // read as a bay of the window rather than as a break in it.
      [0.34, PORT.high, 0.16, (port.cill + port.head) / 2, bayLow],
      [0.34, PORT.high, 0.16, (port.cill + port.head) / 2, bayHigh],
    ]) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frame);
      piece.position.set(port.x + w / 2 - 0.02, py, pz);
      piece.receiveShadow = true;
      group.add(piece);
    }

    // No mullions and no transom. They were here to make this read as a window
    // somebody built rather than a rectangle somebody cut, and at four metres
    // that is what they did. At ten they are six bars across the one view in
    // this room that is worth the ride up — and worse, they are bars, in the
    // one opening in this building the bucket is meant to look through rather
    // than climb through. The reveal is enough frame. What the window is for is
    // the tall room, so nothing crosses it.

    // A hazard line along the top of the cill, the same one the landing has,
    // and for the same reason: this is the edge of a drop and the room says so
    // in the one language it has already used for that.
    const warn = new THREE.Mesh(
      new THREE.PlaneGeometry(WIN, 0.42),
      new THREE.MeshStandardMaterial({
        ...makeHazardSurface(Math.max(4, Math.round(WIN)), 1),
        metalness: 0.1,
        roughness: 0.8,
      })
    );
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(port.x + 0.22, port.cill + 0.006, port.z);
    group.add(warn);
  }

  /**
   * What else is up here, and it is deliberately not much.
   *
   * A room the player will never stand in can only be read at a glance, from a
   * body eight inches tall, so anything subtle in it is wasted. Three
   * silhouettes: the panel that drives the hoist, a rack, and a stack of crates
   * somebody carried up one at a time. What they say together is that this was
   * a working floor and the only way onto it is the lift — so everything on it
   * came up the same way the bucket just did. And all of it is arranged clear
   * of the west wall, because the west wall is the window and the window is the
   * only thing in this room worth the trip.
   */
  {
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 1.1), steel);
    cabinet.position.set(room.maxX - 0.16, TOP + 0.75, room.maxZ - 1.9);
    cabinet.castShadow = true;
    group.add(cabinet);
    for (const [i, tint] of ['#2f8a44', '#8a6a22', '#5a1f1a'].entries()) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.035, 10),
        new THREE.MeshBasicMaterial({ color: tint })
      );
      dot.position.set(room.maxX - 0.32, TOP + 1.24, room.maxZ - 2.2 + i * 0.22);
      dot.rotation.y = -Math.PI / 2;
      group.add(dot);
    }

    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.1, 2.4), dark);
    rack.position.set(room.maxX - 0.3, TOP + 1.05, rz + 0.6);
    rack.castShadow = true;
    group.add(rack);

    const crate = new THREE.MeshStandardMaterial({
      ...makeWoodSurface(2, 1),
      roughness: 0.9,
      metalness: 0,
    });
    for (const [w, h, d, px, py, pz, ry] of [
      [1.0, 0.72, 0.9, rx + 0.9, TOP + 0.36, room.minZ + 0.9, 0.12],
      [0.86, 0.6, 0.8, rx + 0.8, TOP + 1.02, room.minZ + 0.86, -0.3],
      [1.1, 0.8, 0.95, rx + 2.1, TOP + 0.4, room.minZ + 1.2, -0.06],
    ]) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crate);
      box.position.set(px, py, pz);
      box.rotation.y = ry;
      box.castShadow = true;
      box.receiveShadow = true;
      group.add(box);
    }

    /**
     * And the three of them as things you cannot walk through.
     *
     * `bottom` on every one, which nothing standing on a floor normally needs —
     * but this floor is seventy-two metres up over a room the bucket walks
     * through to get here, and a box with a top and no bottom is solid all the
     * way down. Without it these would be pillars standing in the chamber.
     */
    for (const [minX, maxX, minZ, maxZ, top] of [
      [room.maxX - 0.31, room.maxX, room.maxZ - 2.45, room.maxZ - 1.35, TOP + 1.5],
      [room.maxX - 0.55, room.maxX, rz - 0.6, rz + 1.8, TOP + 2.1],
      [rx + 0.35, rx + 1.45, room.minZ + 0.42, room.minZ + 1.38, TOP + 1.32],
      [rx + 1.5, rx + 2.7, room.minZ + 0.7, room.minZ + 1.7, TOP + 0.8],
    ]) {
      colliders.push({ minX, maxX, minZ, maxZ, top, bottom: TOP });
    }
  }

  /**
   * And the numbered treads, on the floor in front of the window.
   *
   * At the window because the window is the only thing in this room worth
   * crossing it for, and putting the one mechanism up here anywhere else would
   * have made two errands out of one room. Standing on the stage you are
   * working with your back to a ten metre pane and a fifty-eight metre drop
   * onto the animal, which is the whole reason the room is at this height.
   *
   * Clear of the cill by a hand's width — the cill's own collider projects 0.42
   * into the room and is a thing you can stand on, and two standable surfaces
   * that touch are a step you take by accident.
   *
   * Nothing is wired to it. See controlPanel.js: it is somewhere to stand and
   * an order to stand in, and what reads that order has not been built.
   */
  /**
   * The treads, stood back off the glass rather than against it.
   *
   * They were half a metre from the wall, which was right while the window was
   * a window: the pads were on the edge of the view and pressing one put you
   * against it. One pane of it is a way out now, and half a metre leaves a
   * body on the cill wedged between the wall and the stage — pushed, by the
   * stage's own collider, through the only gap in the glass. Standing somewhere
   * and being ejected from it are different things and the room should not
   * confuse them.
   *
   * So: back far enough for both bodies to stand on the cill, turn round, and
   * hop up onto the deck on purpose. The pads are still in front of the window
   * and you still work with the drop behind you.
   */
  const board = createControlPanel({
    parent: group,
    colliders,
    x: room.minX + 1.6,
    y: TOP,
    z: port.z,
    labels: ['1', '2', '3', '4'],
    bodies,
  });

  /**
   * Two lamps, and one of them is over the landing on purpose.
   *
   * The light coming down the shaft is what the last third of the ride is: it
   * arrives before the room does, so you know you are getting somewhere well
   * before you can see where. A room lit only in its middle would put that
   * light behind a wall until the moment the car stopped.
   *
   * Neither is near the window, and that is deliberate as well. A lamp beside a
   * window at night turns the glass into a mirror, and there is nothing in this
   * room worth seeing a reflection of.
   */
  const fittings = [];
  for (const [px, pz, watt] of [
    [sx, room.maxZ - 1.1, 46],
    [rx + 1.8, rz - 1.4, 42],
  ]) {
    const lamp = new THREE.PointLight(0xd0d4c2, watt, 22, 1.6);
    lamp.position.set(px, CROWN - 0.45, pz);
    group.add(lamp);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.24), dark);
    housing.position.set(px, CROWN - 0.24, pz);
    group.add(housing);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.18), litGlass.clone());
    lens.rotation.x = Math.PI / 2;
    lens.position.set(px, CROWN - 0.31, pz);
    group.add(lens);
    fittings.push({ lamp, lens, watt, level: 1 });
  }

  // -------------------------------------------------------- the colliders ---

  const LOW = CAR.thick;

  /**
   * The shaft, as four boxes that are not there at floor level.
   *
   * `bottom` is the lintel rule and this is the same use of it: a thing in the
   * air with open space under it. Under the chamber's ceiling the bucket walks
   * through these to get onto the car; a hand's width off the ground it cannot,
   * which is exactly when it stops being allowed to.
   *
   * The landing side carries `top` as well, so it is a wall from the chamber's
   * ceiling up to the landing floor and nothing above that. Its `top` is that
   * floor's own height, so the two are continuous and there is no lip where one
   * ends and the other starts.
   */
  for (const [minX, maxX, minZ, maxZ, extra] of [
    [shaft.minX - 0.12, shaft.minX, shaft.minZ, shaft.maxZ, { bottom: CEIL }],
    [shaft.minX, shaft.maxX, shaft.maxZ, shaft.maxZ + 0.12, { bottom: CEIL }],
    [shaft.maxX, shaft.maxX + 0.12, shaft.minZ, shaft.maxZ, { bottom: CEIL }],
    [shaft.minX, shaft.maxX, shaft.minZ - 0.12, shaft.minZ, { bottom: CEIL, top: TOP }],
  ]) {
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });
  }

  /**
   * The room's floor, as a slab in the air rather than a solid to the ground.
   *
   * `top` alone would make it a block: a box with a top and no bottom is solid
   * at every height below it, and this one is over the chamber, so the bucket
   * would come through the rock into a room filled in to seventy-two metres.
   * With both, it is what it looks like — half a metre of floor at seventy-two
   * with nothing above or below it.
   */
  colliders.push({ ...room, top: TOP, bottom: TOP - 0.6 });

  /**
   * The room's walls, which do not exist until you are standing in the room.
   *
   * The west one runs across the window and stops at the open bay, because the
   * window is glazed everywhere else and glass holds. That is a wall you can
   * see through and cannot pass, which is the one arrangement this room is
   * allowed: everything that stops you here has to be visible, and a pane is
   * visible. Where there is no pane there is no collider, which is the same
   * rule read the other way round and is the whole of how the bay works.
   *
   * The cill gets its own box on top of that, out into the room to the same
   * 0.42 the reveal sticks out. Without it you would be stopped at the wall line
   * two centimetres short of a thing you can see — the small version of the bug
   * that took five rounds to find, and not one worth reintroducing.
   */
  for (const [minX, maxX, minZ, maxZ, extra] of [
    [room.minX - 0.3, room.minX, room.minZ, bayLow, {}],
    [room.minX - 0.3, room.minX, bayHigh, room.maxZ, {}],
    /**
     * And the bay itself, which is open to you and shut to the bucket.
     *
     * Nothing is drawn here. The pane is still out, you can still see through
     * the gap, and you still walk out of it onto the gangway — what is added
     * is a box that only the smaller body collides with, so the bucket walks
     * up to the hole and stops.
     *
     * The division that makes this right arrived late and is worth stating.
     * When the gangway was built, the bucket was the only body that could
     * ever be up here and the tower was somewhere it went to look at. The
     * tower is climbed now, from the floor, by you — so the two of them have
     * ended up with one job each: the bucket works the treads on this side of
     * the glass and never leaves the room, and everything on the far side of
     * the glass is yours. The gangway is no longer the way out for the bucket.
     * It is the way *in* for a body that has just climbed seventy metres to
     * get here, which is a much better thing for it to be.
     *
     * An invisible wall, and the usual objection to those holds — everything
     * that stops you here has to be visible. It does not apply to this one,
     * because it does not stop *you*. It stops a body you are not looking
     * through the eyes of, at the edge of a seventy-two metre drop, and the
     * alternative is a bucket that walks off it.
     */
    [room.minX - 0.3, room.minX, bayLow, bayHigh, { stopsFriend: true }],
    [room.minX, room.minX + 0.42, portLow, portHigh, { top: port.cill }],
    [room.maxX, room.maxX + 0.3, room.minZ, room.maxZ, {}],
    [room.minX, room.maxX, room.minZ - 0.3, room.minZ, {}],
    [room.minX, shaft.minX, room.maxZ, room.maxZ + 0.3, {}],
    [shaft.maxX, room.maxX, room.maxZ, room.maxZ + 0.3, {}],
    [shaft.minX, shaft.maxX, room.maxZ, room.maxZ + 0.3, { bottom: TOP + DOOR.high }],
  ]) {
    if (maxX - minX < 0.001) continue;
    colliders.push({ minX, maxX, minZ, maxZ, bottom: TOP, ...extra });
  }

  /**
   * And the car, one box whose top is written every frame.
   *
   * `bottom` follows it up, or a bucket standing in the chamber with the car at
   * the top would be standing inside a solid the size of the shaft.
   */
  const deckBox = {
    minX: sx - CAR.deep / 2,
    maxX: sx + CAR.deep / 2,
    minZ: sz - CAR.deep / 2,
    maxZ: sz + CAR.deep / 2,
    top: LOW,
    bottom: LOW - 0.5,
    /**
     * How far this floor climbed this frame, and the one field on a collider in
     * this game that is not a fact about a shape.
     *
     * It exists because "the car carries nothing" — see the top of this file —
     * is true for a body standing on it and false for a body in the air over
     * it. Both bodies decide what blocks them by comparing their feet to a
     * box's `top`; a top that has just risen past those feet reads as a box
     * they are standing inside, and a box you are standing inside is resolved
     * by pushing you out of its nearest face. On a platform in a shaft the
     * nearest face is sideways, and sideways is through the shaft wall.
     *
     * Jump on the way up and you were thrown out of the world. This is the
     * whole fix: the two bodies extend "cleared it" and "it caught me" by the
     * distance the floor actually moved, so a rising floor collects you out of
     * a jump instead of ejecting you. Zero on every frame the car is still,
     * which is nearly all of them.
     */
    rise: 0,
  };
  colliders.push(deckBox);

  // ---------------------------------------------------------- the driving ---

  const motor = createLiftMotor();
  /** The walking surface of the car, which is the whole of this thing's state. */
  let deckY = LOW;
  let goal = LOW;
  let speed = 0;
  let arrivedUp = false;
  const leverAt = new THREE.Vector3();

  function place() {
    car.position.set(sx, deckY, sz);
    deckBox.top = deckY;
    deckBox.bottom = deckY - 0.5;
    lever.getWorldPosition(leverAt);
    for (const cable of cables) {
      const from = deckY + CAR.post;
      const length = Math.max(0.02, SHEAVE_Y - from);
      cable.scale.y = length;
      cable.position.y = from + length / 2;
    }
  }
  place();

  const interactions = [
    ...board.interactions,
    {
      position: leverAt,
      get label() {
        return goal <= LOW ? 'Send the hoist up' : 'Send the hoist down';
      },
      // Short, because the car is 1.4 across and there is nothing else in the
      // chamber to compete with it. The facing test is loosened instead: a body
      // this short standing this close to a post is looking past the top of it
      // as often as at it.
      range: 1.9,
      facing: 0.1,
      once: false,
      enabled: () => speed === 0 && deckY === goal,
      onInteract() {
        goal = deckY <= LOW ? TOP : LOW;
        lever.rotation.x = goal > LOW ? -0.5 : 0.5;
        playButtonPress(0.7);
        playSpikeGrind(0.35);
        motor.start(1);
      },
    },
  ];

  return {
    group,
    interactions,
    /** The four buttons, for whatever ends up reading them. */
    board,
    /**
     * The window, as a hole in a wall two rooms share.
     *
     * Handed over rather than written down twice. tallRoom.js takes this and
     * cuts its own side of the same opening out of its own wall, in its own
     * frame — which is the only way two files can own one hole and not drift
     * apart the first time either of them moves.
     */
    get port() {
      return {
        x: port.x,
        z: port.z,
        width: WIN,
        cill: port.cill,
        height: PORT.high,
        // The floor this room stands on, which is what the tall room needs in
        // order to stop its own wall below us rather than through us.
        floor: TOP,
        // And the pane that is not there. Whatever is built on the other side
        // has to start exactly here or the way out lands on nothing.
        bay: { z: port.z, width: PORT.bay, low: bayLow, high: bayHigh },
      };
    },
    /**
     * Whether a body is up in the room at the top, which is a question with
     * consequences rather than a convenience.
     *
     * This is the other room in the game — the red hall is the first — that
     * is built entirely out of the bucket not being able to reach you. The
     * pads only work because the one body that can stand on them is the one
     * body that cannot go into the room they drive, and the only way back
     * down from here is a hoist or a seventy-two metre fall. So "is it up
     * there" decides two things nothing else can decide for it: whether
     * giving up and teleporting to you is a rescue or the puzzle undoing
     * itself, and whether a bucket told to follow should set off after
     * somebody who is at the bottom of a shaft.
     *
     * `y` matters as much as the plan: the chamber, the tower and the hall
     * all stand under this footprint, and a bucket in any of them is not up
     * here. Half the room's height is the slack — a body on the stage is
     * 0.68 above the floor and one in the car at the landing is level with
     * it, and both of those are in this room.
     */
    holds(at) {
      return (
        at.x > room.minX - 0.6 && at.x < room.maxX + 0.6 &&
        at.z > room.minZ - 0.6 && at.z < room.maxZ + 0.6 &&
        at.y > TOP - 1.0 && at.y < TOP + ROOM.high
      );
    },

    /** For the harness, and for the record: everything that can be asserted. */
    get state() {
      return { deckY, goal, moving: speed > 0, top: TOP, low: LOW, shaft, room, port };
    },
    /**
     * The far wall of the room at the top, for whatever gets built on it.
     *
     * Handed out whole, like the giant hall's: whatever takes it puts the hole
     * in this wall itself, because the wall is built here.
     */
    get wayOn() {
      return { x: rx, y: TOP, z: room.minZ, width: DOOR.wide, height: DOOR.high };
    },

    /**
     * Put the car at the landing, now, with no ride and no lever.
     *
     * For the debug menu, which is the only caller and the only thing that
     * should be one: the room at the top is otherwise a seventeen second ride
     * behind a rockfall you cannot walk through, and looking at it is the
     * entire reason it was built. `arrivedUp` is set with it, so being placed
     * there does not fire the note about the window that being *carried* there
     * earns.
     */
    parkAtTop() {
      deckY = TOP;
      goal = TOP;
      speed = 0;
      arrivedUp = true;
      lever.rotation.x = -0.5;
      motor.stop();
      place();
    },

    reset() {
      board.reset();
      deckY = LOW;
      goal = LOW;
      speed = 0;
      deckBox.rise = 0;
      arrivedUp = false;
      lever.rotation.x = 0.5;
      motor.stop();
      place();
    },

    update(delta) {
      board.update(delta);

      // Still by default: a stationary floor has no claim on anybody in the air.
      deckBox.rise = 0;

      if (deckY !== goal) {
        const before = deckY;
        const up = goal > deckY;
        const left = Math.abs(goal - deckY);
        // Slow into the stop rather than arriving at full speed and clamping:
        // the last thing a body standing on this wants is the floor stopping
        // under it in one frame.
        const brake = Math.sqrt(2 * SPEED.ramp * left);
        const cap = Math.min(up ? SPEED.up : SPEED.down, brake);
        speed = Math.min(speed + SPEED.ramp * delta, cap);

        const step = speed * delta;
        deckY = up ? Math.min(goal, deckY + step) : Math.max(goal, deckY - step);
        deckBox.rise = Math.max(0, deckY - before);

        if (deckY === goal) {
          speed = 0;
          motor.stop();
          playSpikeGrind(0.3);
          if (goal === TOP && !arrivedUp) {
            arrivedUp = true;
            showNote('There is a window up here.', 3.6);
          }
        }
        place();
      }

      // How much of the motor you get is how near you are to it, so stepping
      // out of the bucket and letting it go up without you sounds like watching
      // it rather than riding it.
      if (speed > 0) {
        const away = Math.max(0, camera.position.distanceTo(car.position) - 2);
        motor.setLevel(Math.max(0.08, 1 - away / 16));
      }

      const t = performance.now() / 1000;
      for (const [i, fitting] of fittings.entries()) {
        const want = 0.9 + 0.1 * Math.sin(t * 0.41 + i * 2.4);
        fitting.level += (want - fitting.level) * Math.min(1, delta * 2);
        fitting.lamp.intensity = fitting.watt * fitting.level;
        fitting.lens.material.color.setScalar(0.55 + 0.35 * fitting.level);
      }
    },
  };
}
