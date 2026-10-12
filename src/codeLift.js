import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  worldRepeat,
  metalRepeat,
  cloneSurface,
} from './textures.js';
import {
  createLiftMotor,
  playButtonPress,
  playRefuse,
  playWardDoor,
  playSpikeGrind,
  playScreech,
  playGlassBreak,
} from './audio.js';
import { showNote, setObjective } from './hud.js';

/**
 * The lift at the end of the splits, the thing you have to tell it, and the
 * corridor it lets you out into.
 *
 * **The car does not have floors on it, it has directions.** Four arrows and
 * nothing else — no numbers, no plate saying what is where — and it will not
 * move until it has been given the eight it is waiting for. That is the whole
 * puzzle and it is the right one for this point in the building: you have just
 * spent three junctions learning that this place does not tell you where
 * anything is, and here is a machine with the same manners.
 *
 * The sequence is on the wall above the pad, which is not a concession. A
 * combination you have to find elsewhere is a fetch quest; a combination in
 * front of you that you still have to enter without a slip is a minute of
 * quiet concentration in a building that has spent the last two minutes
 * screaming at you. Getting one wrong costs all eight, which is the only
 * pressure in the room and is enough.
 *
 * **Picking an arrow is done by looking at it, and that needed solving.** The
 * interaction system picks the nearest registered target you are roughly
 * facing, judged on the horizontal — which is exactly the wrong test for a
 * pad with an up and a down on it, because those two sit at the same place on
 * the floor and the nearer of them is decided by how tall you are. So the pad
 * is one target, not four: it works out where on the wall you are aiming and
 * presses that. See `aimed`.
 *
 * Not orientable: the doors face +z and the car runs down. See the top of
 * controlRoom.js for why none of these are written to turn round.
 */

/** The car. Big enough to turn round in, small enough to be a box. */
const CAR = { wide: 3.2, deep: 3.2, high: 2.9 };
/** Its doorways, one at each end. */
const DOOR = { wide: 2.4, high: 2.5, leaf: 0.12 };

/** How far down it goes, and how long it takes about it. */
const RIDE = { drop: 12, seconds: 8.5, shut: 1.3, open: 1.6 };

/**
 * The corridor at the bottom.
 *
 * Wider than it was, because it is no longer somewhere you walk. The thing
 * comes down the shaft after the car and the last twenty-two metres of this
 * building are a sprint, and a creature that crushes itself to the room it is
 * in reads as a smaller animal in a narrower room: at five metres across it
 * came out of the lift at four and a half, which is a third of what came off
 * the wall in the shed. At six and a half it was the size it was in the maze.
 *
 * Nine by five and a half now, and the reason is the ending rather than the
 * sprint. What happens at the window is the only scene in this game with two
 * bodies and an animal in it at once — see finale.js — and it needs the
 * animal at something like its own size, a hand's length of air over it, and
 * floor for it to come down onto. At six and a half by three and a half it
 * was crushed to the width of a corridor and its head was in the ceiling; it
 * now stands in here at about eight and a half across, which is within a
 * metre of the thing that came off the wall in the shed.
 *
 * The length is untouched at twenty-two, because that one is a clock: see
 * CHASE below, which is measured in metres of this corridor.
 */
const OUT = { wide: 9.0, long: 22, high: 5.4 };

/**
 * When it comes out of the shaft after you, in metres down the corridor.
 *
 * Measured from the lift's doorway. Too close and the doors open onto a death;
 * too far and the twenty-two metres is a walk with a noise at the end of it.
 * Five is the length of the car behind you: you are clear of it, you are not
 * clear of anything else, and the sixteen metres left to the window is a
 * sprint you win by about a second.
 *
 * It is the only number this stretch has left, and that is the change. There
 * used to be a cross-wall six metres short of the window with a hole in it
 * the size of a person — the last gap in the building, the thing that held
 * when the lift did not. You went through it, it did not, and you got
 * fourteen seconds of quiet at the glass before the hole gave.
 *
 * The wall is gone, and so are its three clocks. What is at the end of this
 * corridor now is a window and nothing else: twenty-two metres, one lamp at
 * the far end, no door in the middle of it and nothing between you and what
 * came down the shaft. You do not get through anything and you do not get a
 * beat to breathe — you get to the glass, and it arrives. See the trigger in
 * main.js, which hands the last few metres to finale.js.
 */
const CHASE = { after: 5.0 };

/**
 * The window at the end of it, and the first one in the building.
 *
 * Every opening you have been through so far has had another room behind it.
 * This one has weather behind it, and that is the point of the whole stretch:
 * you came down twelve metres to an outside wall, and what is outside is
 * another face of the same building going up further than the haze goes.
 *
 * Four by two and a six, up from three by one and nine, and both of those
 * numbers are about the last thing that happens to it: something the size of
 * the thing in the corridor comes down on this and takes it out. A pane a
 * person could not get through is a pane that reads as a porthole when a
 * hand that size lands on it.
 */
const WINDOW = { wide: 4.0, high: 2.6, sill: 1.0 };

/**
 * The combination.
 *
 * Eight, which is long enough that you have to actually read it and short
 * enough to re-enter without resentment after a slip. Written here as the one
 * list the pad, the plates above it and any harness all work off — the lamps
 * draw their own arrows out of this, so the display cannot drift from the
 * answer.
 */
const CODE = ['right', 'up', 'down', 'right', 'down', 'up', 'left', 'down'];

/**
 * Which way each arrow points, as a turn off "up" — and the sign of it is not
 * obvious, so here is the working.
 *
 * Every glyph is drawn on the car's left-hand wall, which is turned a quarter
 * to face across the car. You stand in front of it looking at -x, so *your*
 * right hand is at -z, which is where the plane's own +x ends up after that
 * quarter turn. A rotation of t about z takes the arrow's point from +y to
 * (-sin t, cos t), so putting the point at +x — your right — wants t of
 * -pi/2. It was written as the negative of this and every left and right in
 * the car came out mirrored: the plate above the pad read "left, up, down,
 * left…" for a combination that starts with a right.
 *
 * It was self-consistent, which is the dangerous part. The keys were mirrored
 * by the same amount as the plate, so a player following the pictures would
 * have opened it — by pressing a key labelled with the wrong arrow.
 */
const TURN = { up: 0, down: Math.PI, left: Math.PI / 2, right: -Math.PI / 2 };

const WALL_TINT = '#3a3e36';
const FLOOR_TINT = '#2f312b';
const CAR_TINT = '#55584f';
/**
 * The four states a plate on the combination strip can be in.
 *
 * **The arrow is readable in every one of them**, which is the correction
 * this went through. It was a dark glyph on a dark tile when unentered and a
 * green glyph on the same tile when entered — which made "how far through you
 * are" perfectly clear and "what the combination is" invisible. In a
 * screenshot the strip is eight black squares. The combination being on the
 * wall is the entire reason this puzzle is fair, so the thing that changes on
 * a correct press is the *tile*, and the arrow stays legible throughout.
 */
const PLATE = {
  dark: new THREE.Color('#0c0e0a'),
  live: new THREE.Color('#9cc06a'),
  wrong: new THREE.Color('#a85440'),
};
const GLYPH = {
  waiting: new THREE.Color('#7f8a6e'),
  done: new THREE.Color('#10160c'),
};

/**
 * One arrow, as a shape rather than a texture.
 *
 * A canvas glyph would have been fewer lines and it would also have been a
 * second way of drawing things in a file whose every other mark is geometry.
 * Seven points: a stem, two shoulders and a point.
 */
function arrowShape() {
  const shape = new THREE.Shape();
  for (const [i, [x, y]] of [
    [-0.17, -0.5],
    [0.17, -0.5],
    [0.17, 0.04],
    [0.43, 0.04],
    [0, 0.5],
    [-0.43, 0.04],
    [-0.17, 0.04],
  ].entries()) {
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  return shape;
}

/**
 * @param scene   the world
 * @param doorway the lobby's lift opening: { x, y, z, width, height }
 * @param player  whose feet ride down with it
 * @param camera  for working out which arrow is being looked at
 * @param onInTheCar every frame you are standing in the car with the code
 *                 still to enter — which is every frame whatever is chasing
 *                 you cannot get at you, and the reason the code is
 *                 enterable at all
 * @param onShut   once, the frame the doors start to shut on the ride — which
 *                 is the frame whatever is chasing you is shut out of the car
 * @param onOut    once, when you are far enough down the bottom corridor that
 *                 something can come out of the shaft behind you
 */
export function createCodeLift({
  scene,
  doorway,
  player,
  camera,
  onInTheCar,
  onShut,
  onOut,
}) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) => {
    const box = { minX, maxX, minZ, maxZ, ...extra };
    colliders.push(box);
    return box;
  };

  // Laid out from the lobby's opening, so moving that moves all of this.
  const axis = doorway.x;
  const deck = doorway.y;
  /** The far face of the lobby wall: where the car's front lives. */
  const landing = doorway.z - 0.3;
  const back = landing - CAR.deep;
  const floorBelow = deck - RIDE.drop;

  // ------------------------------------------------------------- materials ---

  /**
   * One generated surface each, cloned per panel rather than regenerated.
   *
   * makeWallSurface paints three canvases every time it is called. There are
   * about twenty walls in this file and a dozen steel faces, and generating
   * thirty-two sets of textures for them would be thirty-two canvases in
   * memory and a measurable slice of a boot that already takes fifteen
   * seconds. cloneSurface shares the pixels and gives each panel its own
   * repeat, which is the only thing that was ever different between them.
   */
  const wallSurface = makeWallSurface(...worldRepeat(10, OUT.high), WALL_TINT);
  const wallOf = (w, h, tint = WALL_TINT) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: tint,
      metalness: 0,
    });
  const steelSurface = makeMetalPanelSurface(...metalRepeat(CAR.wide, CAR.high), CAR_TINT);
  const steelOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(steelSurface, ...metalRepeat(w, h)),
      metalness: 0.45,
      roughness: 0.55,
    });
  const unlit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const dark = new THREE.MeshStandardMaterial({ color: '#1e2019', roughness: 0.9, metalness: 0.2 });

  const panel = (material, w, h, px, py, pz, ry) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // -------------------------------------------------------------- the shaft ---

  /**
   * The hole the car runs in, which exists to be seen from the two landings.
   *
   * Nobody is ever in it. It is four dark walls and a floor at the bottom, so
   * that the moment before the doors open and the moment after they shut have
   * something behind them other than the end of the world.
   */
  const shaftX0 = axis - CAR.wide / 2 - 0.5;
  const shaftX1 = axis + CAR.wide / 2 + 0.5;
  const shaftZ0 = back - 0.06;
  const shaftZ1 = landing + 0.01;
  const shaftFloor = floorBelow - 1.6;
  const shaftTop = deck + CAR.high + 2.4;
  const shaftMid = (shaftFloor + shaftTop) / 2;
  const shaftHigh = shaftTop - shaftFloor;
  for (const [w, px, pz, ry] of [
    [shaftX1 - shaftX0, (shaftX0 + shaftX1) / 2, shaftZ0, 0],
    [shaftZ1 - shaftZ0, shaftX0, (shaftZ0 + shaftZ1) / 2, Math.PI / 2],
    [shaftZ1 - shaftZ0, shaftX1, (shaftZ0 + shaftZ1) / 2, -Math.PI / 2],
  ]) {
    panel(wallOf(w, shaftHigh, '#2b2e28'), w, shaftHigh, px, shaftMid, pz, ry);
  }
  const pit = new THREE.Mesh(
    new THREE.PlaneGeometry(shaftX1 - shaftX0, shaftZ1 - shaftZ0),
    new THREE.MeshStandardMaterial({ ...makeFloorSurface(3, 3), color: '#24261f', metalness: 0 })
  );
  pit.rotation.x = -Math.PI / 2;
  pit.position.set((shaftX0 + shaftX1) / 2, shaftFloor, (shaftZ0 + shaftZ1) / 2);
  group.add(pit);

  // ---------------------------------------------------------------- the car ---

  const car = new THREE.Group();
  group.add(car);

  /**
   * Built at y = 0 and moved as a group, which is the only way a room that
   * travels stays maintainable: everything in here is written relative to the
   * car's own floor, and the one number that changes is `car.position.y`.
   */
  // `car.position.y` is the world height of its floor, and everything inside
  // it is written at the height it sits above that floor. One number moves
  // the room.
  const carFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(CAR.wide, CAR.deep),
    new THREE.MeshStandardMaterial({ ...makeFloorSurface(2, 2), color: FLOOR_TINT, metalness: 0.1 })
  );
  carFloor.rotation.x = -Math.PI / 2;
  carFloor.position.set(axis, 0, (landing + back) / 2);
  carFloor.receiveShadow = true;
  car.add(carFloor);

  const carLid = new THREE.Mesh(
    new THREE.PlaneGeometry(CAR.wide, CAR.deep),
    new THREE.MeshStandardMaterial({ ...makeCeilingSurface(2, 2), color: '#2a2c25', metalness: 0 })
  );
  carLid.rotation.x = Math.PI / 2;
  carLid.position.set(axis, CAR.high, (landing + back) / 2);
  car.add(carLid);

  const carMid = CAR.high / 2;
  // The two blank sides.
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(CAR.deep, CAR.high), steelOf(CAR.deep, CAR.high));
    face.position.set(axis + (side * CAR.wide) / 2, carMid, (landing + back) / 2);
    face.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    car.add(face);
  }
  // And the two ends, which are jambs and a head round a doorway.
  const jambLow = axis - DOOR.wide / 2;
  const jambHigh = axis + DOOR.wide / 2;
  for (const [pz, ry] of [
    [landing, Math.PI],
    [back, 0],
  ]) {
    for (const [w, h, px, py] of [
      [jambLow - (axis - CAR.wide / 2), CAR.high, (axis - CAR.wide / 2 + jambLow) / 2, carMid],
      [axis + CAR.wide / 2 - jambHigh, CAR.high, (jambHigh + axis + CAR.wide / 2) / 2, carMid],
      [DOOR.wide, CAR.high - DOOR.high, axis, DOOR.high + (CAR.high - DOOR.high) / 2],
    ]) {
      if (w <= 0.001 || h <= 0.001) continue;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), steelOf(w, h));
      face.position.set(px, py, pz);
      face.rotation.y = ry;
      car.add(face);
    }
  }

  /**
   * The doors, two leaves a side, parting in the middle.
   *
   * `shut` is 1 and open is 0, and both pairs are driven off one number
   * because they are never both open. The leaves slide their own half-width
   * plus a hand, so at 0 the opening is clear rather than nearly clear.
   */
  const leaves = [];
  for (const [end, pz] of [
    ['top', landing],
    ['bottom', back],
  ]) {
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(DOOR.wide / 2, DOOR.high, DOOR.leaf),
        steelOf(DOOR.wide / 2, DOOR.high)
      );
      leaf.position.set(axis + (side * DOOR.wide) / 4, DOOR.high / 2, pz);
      leaf.castShadow = true;
      car.add(leaf);
      leaves.push({ leaf, end, side, home: leaf.position.x });
    }
  }

  // --------------------------------------------------------------- the pad ---

  /**
   * The four arrows, on the left-hand wall at a height you read standing.
   *
   * A diamond and not a row, which is worth the trouble it caused: four
   * buttons in a line are four buttons, and four buttons arranged up, down,
   * left and right are a *direction*. The row was the easy fix for the
   * picking problem and it threw away the only thing that makes this pad
   * legible at a glance.
   */
  const padX = axis - CAR.wide / 2 + 0.06;
  const padZ = (landing + back) / 2;
  const padY = 1.5;
  const PAD = { reach: 0.44, size: 0.3 };
  const BUTTONS = [
    { dir: 'up', dy: PAD.reach, dz: 0 },
    { dir: 'down', dy: -PAD.reach, dz: 0 },
    // Facing the wall you are facing -x, so your right hand is at -z.
    { dir: 'right', dy: 0, dz: -PAD.reach },
    { dir: 'left', dy: 0, dz: PAD.reach },
  ];

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), steelOf(1.5, 1.5));
  plate.position.set(padX - 0.02, padY, padZ);
  plate.rotation.y = Math.PI / 2;
  car.add(plate);

  const arrowGeometry = new THREE.ShapeGeometry(arrowShape());
  const keys = [];
  for (const button of BUTTONS) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.34), dark);
    cap.position.set(padX, padY + button.dy, padZ + button.dz);
    car.add(cap);

    const face = new THREE.Mesh(arrowGeometry, unlit('#6f7a60'));
    face.scale.setScalar(PAD.size);
    face.position.set(padX + 0.05, padY + button.dy, padZ + button.dz);
    face.rotation.y = Math.PI / 2;
    face.rotation.z = TURN[button.dir];
    car.add(face);

    keys.push({ ...button, cap, face });
  }

  /**
   * The eight plates, which are the display and the answer at the same time.
   *
   * Dim, they are the combination — you read them left to right and that is
   * what to press. Lit, they are how far through it you are. One element, two
   * jobs, and no way for the thing on the wall to disagree with the thing in
   * the lock, because the lamps draw their arrows straight out of CODE.
   */
  const lamps = [];
  CODE.forEach((dir, i) => {
    const at = padZ + (CODE.length / 2 - 0.5 - i) * 0.19;
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), unlit(PLATE.dark.clone()));
    tile.position.set(padX + 0.04, padY + 0.95, at);
    tile.rotation.y = Math.PI / 2;
    car.add(tile);

    const glyph = new THREE.Mesh(arrowGeometry, unlit(GLYPH.waiting.clone()));
    glyph.scale.setScalar(0.14);
    glyph.position.set(padX + 0.05, padY + 0.95, at);
    glyph.rotation.y = Math.PI / 2;
    glyph.rotation.z = TURN[dir];
    car.add(glyph);
    lamps.push({ tile, glyph });
  });

  // A lamp of its own, because the car is a sealed box and the corridor
  // lights do not come in with you.
  const bulb = new THREE.PointLight(0xc8d0b6, 0, 9, 1.7);
  bulb.position.set(axis, CAR.high - 0.2, padZ);
  const ceilingPlate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), unlit('#9aa88a'));
  ceilingPlate.rotation.x = Math.PI / 2;
  ceilingPlate.position.set(axis, CAR.high - 0.03, padZ);
  car.add(ceilingPlate);

  // --------------------------------------------------- the corridor at the end ---

  const outX0 = axis - OUT.wide / 2;
  const outX1 = axis + OUT.wide / 2;
  const outZ1 = back - 0.3;
  const outZ0 = outZ1 - OUT.long;
  const outCrown = floorBelow + OUT.high;
  const outMidZ = (outZ0 + outZ1) / 2;
  const outMidY = floorBelow + OUT.high / 2;

  const outFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(OUT.wide, OUT.long),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(OUT.wide, OUT.long)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  outFloor.rotation.x = -Math.PI / 2;
  outFloor.position.set(axis, floorBelow, outMidZ);
  outFloor.receiveShadow = true;
  group.add(outFloor);

  const outLid = new THREE.Mesh(
    new THREE.PlaneGeometry(OUT.wide, OUT.long),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(OUT.wide, OUT.long)),
      color: '#25271f',
      metalness: 0,
    })
  );
  outLid.rotation.x = Math.PI / 2;
  outLid.position.set(axis, outCrown, outMidZ);
  group.add(outLid);

  solid(outX0, outX1, outZ0, outZ1, { top: floorBelow, bottom: floorBelow - 0.6 });
  solid(outX0, outX1, outZ0, outZ1, { bottom: outCrown });

  panel(wallOf(OUT.long, OUT.high), OUT.long, OUT.high, outX0, outMidY, outMidZ, Math.PI / 2);
  panel(wallOf(OUT.long, OUT.high), OUT.long, OUT.high, outX1, outMidY, outMidZ, -Math.PI / 2);
  for (const [a, b, c, d] of [
    [outX0 - 0.3, outX0, outZ0 - 0.3, outZ1 + 0.3],
    [outX1, outX1 + 0.3, outZ0 - 0.3, outZ1 + 0.3],
  ]) {
    solid(a, b, c, d, { bottom: floorBelow });
  }

  // The near end, round the lift's lower doorway.
  for (const [w, h, px, py] of [
    [jambLow - outX0, OUT.high, (outX0 + jambLow) / 2, outMidY],
    [outX1 - jambHigh, OUT.high, (jambHigh + outX1) / 2, outMidY],
    [DOOR.wide, OUT.high - DOOR.high, axis, floorBelow + DOOR.high + (OUT.high - DOOR.high) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, px, py, outZ1, Math.PI);
  }
  solid(outX0 - 0.3, jambLow, outZ1, outZ1 + 0.3, { bottom: floorBelow });
  solid(jambHigh, outX1 + 0.3, outZ1, outZ1 + 0.3, { bottom: floorBelow });
  solid(jambLow, jambHigh, outZ1, outZ1 + 0.3, { bottom: floorBelow + DOOR.high });

  /**
   * The far end, round the window.
   *
   * Four pieces, which is the first time in this building a wall has been cut
   * for something other than a way through.
   */
  const winLow = axis - WINDOW.wide / 2;
  const winHigh = axis + WINDOW.wide / 2;
  const winBottom = floorBelow + WINDOW.sill;
  const winTop = winBottom + WINDOW.high;
  for (const [w, h, px, py] of [
    [winLow - outX0, OUT.high, (outX0 + winLow) / 2, outMidY],
    [outX1 - winHigh, OUT.high, (winHigh + outX1) / 2, outMidY],
    [WINDOW.wide, WINDOW.sill, axis, floorBelow + WINDOW.sill / 2],
    [WINDOW.wide, outCrown - winTop, axis, (winTop + outCrown) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, px, py, outZ0, 0);
  }
  /**
   * And the wall it is in, which is a doorway for the last eight seconds of
   * the game and a wall for the rest of them.
   *
   * Built the way every opening in this building is built — a piece either
   * side, a piece under the sill and a piece over the head — plus a fifth
   * one filling the hole, which is the pane. That one is the only collider
   * in the project that answers to a mesh being visible: while there is
   * glass in the window there is a wall across it, and the frame the hand
   * takes the glass out is the frame the four metres by two and six become
   * a hole you can get through. Nothing is added or removed; one box stops
   * saying yes.
   *
   * The sill's piece is a metre high and the step a body can walk up is
   * nine tenths of one, which is three decimal places of the whole ending:
   * you cannot step out of this window, and a jump clears 1.31. See
   * `isOutTheWindow`.
   */
  solid(outX0 - 0.3, winLow, outZ0 - 0.3, outZ0, { bottom: floorBelow });
  solid(winHigh, outX1 + 0.3, outZ0 - 0.3, outZ0, { bottom: floorBelow });
  solid(winLow, winHigh, outZ0 - 0.3, outZ0, { bottom: floorBelow, top: winBottom });
  solid(winLow, winHigh, outZ0 - 0.3, outZ0, { bottom: winTop });
  solid(winLow, winHigh, outZ0 - 0.3, outZ0, {
    bottom: winBottom,
    top: winTop,
    enabled: () => glass.visible,
  });

  /**
   * And nothing between it and the lift.
   *
   * There was a wall across here — six metres short of the window, a piece
   * either side and a piece over the head, with a hole in it the size of a
   * person. It was the last gap in the building and it was lit from the
   * wrong side on purpose: what you ran at down twenty-two dark metres was
   * a lit rectangle, and what ran at the back of a wall was the thing
   * behind you.
   *
   * It is not here any more, and what that costs is the one safe moment at
   * the end of this game. What it buys is the room: this is now a single
   * unbroken twenty-two by nine by five and a half with one lamp at the far
   * end of it, which is both the whole length of a thing coming at you and
   * enough floor for what happens when it arrives. See finale.js, which was
   * staging five metres of animal in a six metre pocket.
   */

  // The frame, the sill and the glass.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(WINDOW.wide + 0.5, 0.14, 0.34), dark);
  sill.position.set(axis, winBottom - 0.07, outZ0 + 0.12);
  group.add(sill);
  for (const [w, h, py, pz] of [
    [WINDOW.wide + 0.2, 0.1, winTop + 0.05, outZ0 + 0.06],
    [0.1, WINDOW.high, (winBottom + winTop) / 2, outZ0 + 0.06],
  ]) {
    for (const px of w < 0.2 ? [winLow - 0.05, winHigh + 0.05] : [axis]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), dark);
      bar.position.set(px, py, pz);
      group.add(bar);
    }
  }
  // A mullion, because a three metre pane with nothing across it reads as a
  // hole in the wall rather than as a window.
  const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, WINDOW.high, 0.12), dark);
  mullion.position.set(axis, (winBottom + winTop) / 2, outZ0 + 0.06);
  group.add(mullion);

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(WINDOW.wide, WINDOW.high),
    new THREE.MeshBasicMaterial({
      color: '#243041',
      transparent: true,
      opacity: 0.17,
      toneMapped: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  glass.position.set(axis, (winBottom + winTop) / 2, outZ0 + 0.02);
  group.add(glass);

  /**
   * And what is left of it when something lands on it.
   *
   * Twelve shards hung off the frame, pointing inwards, hidden until the
   * pane goes. They are the same unlit near-black as the cracks on the
   * creature's own screen and for the same reason: broken glass at night is
   * not a bright thing, it is the absence of the flat sheet that was
   * catching the light a frame ago, with the lit facade outside suddenly
   * coming through unfiltered.
   *
   * No collider changes. The wall across this opening stays solid — the
   * window is a thing to look out of and the building has not decided to
   * let you out of it, which is the state the end of this game is in.
   */
  const shards = new THREE.Group();
  shards.visible = false;
  group.add(shards);
  for (let i = 0; i < 12; i++) {
    const side = i % 4;
    const along = ((i * 7) % 5) / 4 - 0.5;
    const deep = 0.22 + ((i * 11) % 4) * 0.12;
    const piece = new THREE.Shape();
    piece.moveTo(0, 0);
    piece.lineTo(0.34 + ((i * 13) % 3) * 0.2, 0);
    piece.lineTo(0.12 + ((i * 5) % 3) * 0.16, -deep);
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(piece),
      new THREE.MeshBasicMaterial({ color: '#0a1016', toneMapped: false, side: THREE.DoubleSide })
    );
    const midY = (winBottom + winTop) / 2;
    if (side === 0) mesh.position.set(axis + along * WINDOW.wide, winTop, outZ0 + 0.02);
    else if (side === 1) mesh.position.set(axis + along * WINDOW.wide, winBottom, outZ0 + 0.02);
    else mesh.position.set(side === 2 ? winLow : winHigh, midY + along * WINDOW.high, outZ0 + 0.02);
    mesh.rotation.z = side === 0 ? Math.PI : side === 1 ? 0 : side === 2 ? -Math.PI / 2 : Math.PI / 2;
    mesh.rotation.z += (((i * 17) % 7) / 6 - 0.5) * 0.5;
    shards.add(mesh);
  }

  /**
   * Light down here, and it is two strips and one lamp.
   *
   * The corridor had none at all in its first cut, which is a thing that only
   * shows up in a screenshot: the window at the end works beautifully — a lit
   * facade across a void — and you reach it down twenty-two metres of pure
   * black, because the only light source anywhere past the lift was the bulb
   * inside the car. The strips cost nothing and give it a length; the lamp is
   * the one point light in the file and it is at the window end, where it is
   * needed for something other than finding your way: a sill, a frame and a
   * mullion are what make an opening read as a window rather than as a hole,
   * and unlit they are three black bars against a dark view.
   */
  for (const at of [0.3, 0.68]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.12, OUT.long * 0.26), unlit('#8ea17b'));
    strip.rotation.x = Math.PI / 2;
    strip.position.set(axis, outCrown - 0.04, outZ1 - OUT.long * at);
    group.add(strip);
  }
  const endLamp = new THREE.PointLight(0xb9c4a8, 44, 20, 1.5);
  endLamp.position.set(axis, outCrown - 0.5, outZ0 + 4.5);

  /**
   * Both of them in and out of the scene with the player, for the reason
   * splitHalls.js sets out at length: in three.js a lamp down here is a lamp
   * on the frame cost of every room in the building, and the only way to not
   * pay for one is for it not to exist.
   *
   * The line is thirty metres back up the corridors, which is the far side
   * of the second junction — far enough that the compile this triggers is
   * over long before anything of this file is in shot.
   */
  let lampsIn = false;
  const houseLights = (want) => {
    if (want === lampsIn) return;
    lampsIn = want;
    if (want) {
      car.add(bulb);
      group.add(endLamp);
    } else {
      car.remove(bulb);
      group.remove(endLamp);
    }
  };

  /**
   * And what is out there, which is the other half of this building.
   *
   * A face of it, forty metres off and going up out of sight, with lit
   * windows in it. Everything big is fogged — the scene's own FogExp2 at 0.011
   * puts a wall at that distance almost entirely into haze, which is exactly
   * the read we want and costs nothing. Only the lit windows opt out of fog,
   * because a light that fades into the murk at the same rate as the murk is
   * not a light, it is a smudge. That contrast is the whole image: a wall you
   * can barely make out, covered in windows you can see perfectly.
   */
  const outside = new THREE.Group();
  group.add(outside);
  const far = outZ0 - 42;
  const facade = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshBasicMaterial({ color: '#10161c' })
  );
  facade.position.set(axis - 6, floorBelow + 30, far);
  outside.add(facade);
  // Two blocks nearer than it, so the gap between them has depth in it.
  for (const [w, h, d, px, py, pz] of [
    [26, 90, 18, axis - 34, floorBelow + 20, far + 16],
    [22, 70, 16, axis + 30, floorBelow + 10, far + 24],
  ]) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshBasicMaterial({ color: '#0c1116' })
    );
    block.position.set(px, py, pz);
    outside.add(block);
  }
  /**
   * The windows. Deterministic, on a grid with three quarters of them out.
   *
   * Two materials for the lot of them rather than one each: the variation
   * that matters is which squares are lit, not what shade each one is, and
   * seventy-odd one-off materials is seventy-odd shader lookups for a detail
   * seen through a three metre hole.
   */
  const paneGeometry = new THREE.PlaneGeometry(1.5, 1.0);
  const paneMats = ['#c9b784', '#8fa69b'].map(
    (color) =>
      new THREE.MeshBasicMaterial({
        color,
        toneMapped: false,
        fog: false,
        transparent: true,
        opacity: 0.62,
      })
  );
  let seed = 9173;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  /**
   * Denser and tighter than the first pass, and the reason is the aperture.
   *
   * You see this through a three metre hole from about five metres back,
   * which is a cone that is only twenty-odd metres wide by the time it
   * reaches the facade — on a grid of 4.6 at one lit square in four, that is
   * three lit windows in the whole view. The grid is the thing being looked
   * at through a letterbox, so it has to be denser than it would be if you
   * could see all of it.
   */
  for (let row = 0; row < 22; row++) {
    for (let col = 0; col < 24; col++) {
      if (next() > 0.34) continue;
      const pane = new THREE.Mesh(paneGeometry, paneMats[next() > 0.7 ? 0 : 1]);
      pane.position.set(axis - 42 + col * 3.6, floorBelow - 6 + row * 3.4, far + 0.3);
      outside.add(pane);
    }
  }

  // ------------------------------------------------------------- the boxes ---

  /**
   * The car as things you cannot walk through, and they move.
   *
   * Held rather than pushed and forgotten: a collider is read fresh every
   * frame, so a room that travels is a handful of boxes whose numbers are
   * rewritten in `update`. The floor carries `rise` for the same reason the
   * hoist's does — a surface that moves under a body has to carry it rather
   * than eject it — even though this one only ever goes down, where the worst
   * it can do is drop you a centimetre.
   */
  const carFloorBox = solid(axis - CAR.wide / 2, axis + CAR.wide / 2, back, landing, {
    top: deck,
    bottom: deck - 0.5,
    rise: 0,
  });
  const carLidBox = solid(axis - CAR.wide / 2, axis + CAR.wide / 2, back, landing, {
    bottom: deck + CAR.high,
  });
  const carWalls = [];
  for (const [a, b, c, d] of [
    [axis - CAR.wide / 2 - 0.25, axis - CAR.wide / 2, back - 0.25, landing + 0.25],
    [axis + CAR.wide / 2, axis + CAR.wide / 2 + 0.25, back - 0.25, landing + 0.25],
    [axis - CAR.wide / 2 - 0.25, jambLow, landing, landing + 0.25],
    [jambHigh, axis + CAR.wide / 2 + 0.25, landing, landing + 0.25],
    [axis - CAR.wide / 2 - 0.25, jambLow, back - 0.25, back],
    [jambHigh, axis + CAR.wide / 2 + 0.25, back - 0.25, back],
  ]) {
    carWalls.push(solid(a, b, c, d, { bottom: deck, top: deck + CAR.high }));
  }

  /** 1 shut, 0 open. Both pairs run off it; they are never both open. */
  let shut = 1;
  /** 'wait' | 'closing' | 'riding' | 'opening' | 'done' */
  let phase = 'wait';
  let since = 0;
  let entered = 0;
  let wrongAt = -9;
  let told = false;
  let arrived = false;
  /**
   * The last stretch, as one one-way flag.
   *
   * `chasedOut` is whether the thing has been let out of the shaft behind
   * you. There were three of these — one for being through the gap and two
   * for the beat at the window and the quiet that was counted off it — and
   * they went with the wall. One-way because it is an event with a sound on
   * it, and a thing that fires twice is a thing you hear twice.
   */
  let chasedOut = false;
  /** How much of the ride is left to make a noise on, and the shake of it. */
  let banged = 0;
  let shook = 0;

  /** How far the car is off each stop, for gating the doors and the sills. */
  let carY = deck;
  const atTop = () => Math.abs(carY - deck) < 0.06;
  const atBottom = () => Math.abs(carY - floorBelow) < 0.06;

  /**
   * A doorway is a hole only at the stop it opens at, and that is the second
   * thing about the doors that had to be said twice.
   *
   * There is one `shut`, because the two pairs are never both open and one
   * number driving both is the simplest true statement about them. The leaves
   * already knew that — `slide` only moves the pair at the stop the car is
   * standing at — but the colliders did not, so at the bottom, with the lower
   * doors open and the upper leaves visibly shut, the upper doorway was a
   * hole. Measured by walking out of it: the player went forty metres through
   * the shaft wall and fell sixty-nine metres to the floor of the building.
   *
   * So a doorway is passable when the car is at *its* stop and the doors are
   * open, and solid every other instant, including mid-ride.
   */
  const openAt = (end) => (end === 'top' ? atTop() : atBottom()) && shut < 0.08;

  const topDoorBox = solid(jambLow, jambHigh, landing - DOOR.leaf, landing + DOOR.leaf, {
    bottom: deck,
    top: deck + DOOR.high,
    enabled: () => !openAt('top'),
  });
  const bottomDoorBox = solid(jambLow, jambHigh, back - DOOR.leaf, back + DOOR.leaf, {
    bottom: deck,
    top: deck + DOOR.high,
    enabled: () => !openAt('bottom'),
  });

  /**
   * The two thresholds, which are the strip of floor inside a wall's own
   * thickness. Without them the step into the car is a thirty centimetre hole
   * with a twelve metre shaft under it.
   */
  solid(jambLow, jambHigh, landing, doorway.z, { top: deck, bottom: deck - 0.4, enabled: atTop });
  solid(jambLow, jambHigh, outZ1, back, {
    top: floorBelow,
    bottom: floorBelow - 0.4,
    enabled: atBottom,
  });
  // And the landings, shut off whenever the car is not standing at them.
  solid(jambLow, jambHigh, landing, doorway.z, { bottom: deck, enabled: () => !atTop() });
  solid(jambLow, jambHigh, outZ1, back, { bottom: floorBelow, enabled: () => !atBottom() });

  // ------------------------------------------------------------- the panel ---

  const motor = createLiftMotor();
  const hit = new THREE.Vector3();
  const look = new THREE.Vector3();

  /**
   * Which arrow is being looked at, or null.
   *
   * The camera's ray against the plane of the pad, then the nearest button to
   * where it lands. This is the whole of the fix for the up-and-down problem:
   * the game's interaction system asks "what are you near and roughly facing",
   * which cannot separate two buttons that are at the same place on the floor,
   * and this asks "what are you pointing at", which is the question a person
   * pressing a button is actually answering.
   */
  const aimed = () => {
    camera.getWorldDirection(look);
    const plane = padX + 0.05;
    if (look.x > -1e-3) return null;
    const t = (plane - camera.position.x) / look.x;
    if (t <= 0 || t > 4) return null;
    hit.set(plane, camera.position.y + look.y * t, camera.position.z + look.z * t);
    let best = null;
    let bestAt = PAD.reach * 0.95;
    for (const key of keys) {
      const d = Math.hypot(
        hit.y - (car.position.y + padY + key.dy),
        hit.z - (padZ + key.dz)
      );
      if (d < bestAt) {
        bestAt = d;
        best = key;
      }
    }
    return best;
  };

  const press = (dir) => {
    if (dir === CODE[entered]) {
      entered += 1;
      playButtonPress(0.9);
      if (entered === CODE.length) {
        phase = 'closing';
        since = 0;
        setObjective('Hold on');
        /**
         * And this is where the thing behind you stops, which is the whole
         * job of the lift.
         *
         * Everything from the shed to the lobby is a route it can follow,
         * because everything from the shed to the lobby is a hole it can
         * fold or crush through. The car's doorway is two metres eight. It
         * is the first opening in the building that is simply too small,
         * and the eight arrows are the price of using it.
         *
         * Called on the doors starting to shut rather than on arrival at
         * the bottom: it follows where you have been, and twelve metres of
         * shaft is somewhere you have been.
         */
        onShut?.();
      }
      return;
    }
    // Wrong, and it costs all of them. See the note at the top.
    entered = 0;
    wrongAt = 0;
    playRefuse(0.9);
  };

  const pressThePad = {
    position: new THREE.Vector3(padX, deck + padY, padZ),
    get label() {
      const key = aimed();
      return key ? `Press ${key.dir}` : 'The pad';
    },
    range: 2.4,
    facing: 0.2,
    once: false,
    enabled: () => phase === 'wait' && aimed() !== null,
    onInteract() {
      const key = aimed();
      if (key) press(key.dir);
    },
  };

  const interactions = [pressThePad];

  const place = (y) => {
    carY = y;
    car.position.y = y;
    const moved = y - carFloorBox.top;
    carFloorBox.top = y;
    carFloorBox.bottom = y - 0.5;
    // How far it climbed, which on this car is never: see STEP_DOWN in
    // player.js for what holds a body on a floor that is going the other way.
    carFloorBox.rise = Math.max(0, moved);
    carLidBox.bottom = y + CAR.high;
    for (const box of carWalls) {
      box.bottom = y;
      box.top = y + CAR.high;
    }
    for (const box of [topDoorBox, bottomDoorBox]) {
      box.bottom = y;
      box.top = y + DOOR.high;
    }
    pressThePad.position.set(padX, y + padY, padZ);
  };

  const slide = () => {
    for (const { leaf, end, side, home } of leaves) {
      const open = (end === 'top' ? atTop() : atBottom()) ? 1 - shut : 0;
      leaf.position.x = home + side * open * (DOOR.wide / 2 + 0.06);
    }
  };

  const inside = (x, z) =>
    x > axis - CAR.wide / 2 && x < axis + CAR.wide / 2 && z > back && z < landing;
  const inCorridor = (x, z) => x > outX0 && x < outX1 && z > outZ0 && z < outZ1;

  place(deck);
  shut = 0;
  slide();

  return {
    group,
    colliders,
    interactions,

    /** Whether a point is in the car or the corridor under it. */
    contains: (x, z) => inside(x, z) || inCorridor(x, z),

    /** Standing in the car at the top, facing the pad. */
    get entry() {
      return { position: [axis + 0.7, deck, padZ], yaw: Math.PI / 2 };
    },

    /**
     * How much room there is down here, for whatever is following you.
     *
     * The same contract as transferHall and splitHalls — see the note in
     * main.js that chains the three of them. Only the corridor answers: the
     * car and the shaft are places the thing is never drawn, and a clearance
     * for a three metre box would be a licence to crush into one.
     */
    clearance(x, z) {
      if (!inCorridor(x, z)) return null;
      /**
       * One number now, where there used to be two.
       *
       * The gap handed out its own two and a bit metres while it was letting
       * the thing through it, which is how something that could not fit came
       * through a door without the door animating — a room that declares a
       * clearance gets a creature crushed to fit it, see `cram` in
       * screenBeast.js. With the wall gone there is nothing down here to be
       * the size of, so the corridor answers for all twenty-two metres of
       * itself and the animal comes at you at the biggest it has been since
       * the shed.
       */
      return { wide: OUT.wide - 0.5, high: OUT.high - 0.4 };
    },

    /** Whether a point is in the bottom corridor, for a checkpoint. */
    inTheCorridor: (x, z) => inCorridor(x, z),

    /**
     * The mouth of the shaft at the bottom, which is where it comes out.
     *
     * A metre into the corridor rather than in the doorway itself, so the
     * first frame of it is a thing in the room with you and not a thing in a
     * hole. Yaw pi faces -z, which is the way you went: the face is drawn in
     * the group's local +z — see screenBeast.js — so this is atan2 of the
     * heading rather than the usual atan2(-dx, -dz).
     */
    get atTheShaft() {
      return { x: axis, y: floorBelow + 2.4, z: outZ1 - 1.0, yaw: Math.PI };
    },

    /**
     * Whether you are at the end of the building.
     *
     * The last seven metres of the corridor, and it used to be the last
     * three. It is the ending's own staging that sets this: the shot stands
     * you five metres off the glass — see the mark in finale.js — so a test
     * that only fired inside three metres was a test that could not fire
     * without moving you backwards out of it.
     *
     * It used to be the gap that said the chase was over; there is no gap,
     * so this does — see the trigger in main.js, which wants it along with
     * a thing in the room behind you.
     */
    atTheGlass: (x, z) => inCorridor(x, z) && z < outZ0 + 7.0,

    /** The lobby wall the doors are in, for whatever has to stay outside it. */
    get doorZ() {
      return doorway.z;
    },

    /** The pane at the end: where it is and how big, for whatever breaks it. */
    get windowAt() {
      return {
        x: axis,
        y: (winBottom + winTop) / 2,
        z: outZ0,
        wide: WINDOW.wide,
        high: WINDOW.high,
        floor: floorBelow,
        crown: outCrown,
        across: OUT.wide,
      };
    },

    /** Whether the pane has gone. */
    get isGlazed() {
      return glass.visible;
    },

    /**
     * Whether you are through it, which is the last thing this game asks.
     *
     * The plane of the wall and the width of the hole, and it only answers
     * once the pane is out — see the pane's own collider, which is what
     * makes crossing this line possible in the first place. A tenth of a
     * metre past the face rather than at it, so what fires this is a body
     * that is through rather than a body leaning on the sill.
     */
    isOutTheWindow: (x, z) =>
      !glass.visible && z < outZ0 - 0.1 && x > winLow - 0.5 && x < winHigh + 0.5,

    /**
     * Take the window out.
     *
     * One line of state and two of scenery, because the sound is doing most
     * of this — see playGlassBreak, which is written for this single frame.
     */
    breakTheWindow() {
      if (!glass.visible) return;
      glass.visible = false;
      // With the bar down the middle of it, because the thing that takes a
      // pane out from the outside with a hand four metres across does not
      // leave the mullion standing, and a mullion left standing is a post
      // through the middle of the way out.
      mullion.visible = false;
      shards.visible = true;
      playGlassBreak(1);
    },

    /** Just out of the car at the bottom, which is the corridor's checkpoint. */
    get atTheCar() {
      return { position: [axis, floorBelow, outZ1 - 1.2], yaw: 0 };
    },

    /**
     * Back to the bottom of the shaft with the last stretch re-armed.
     *
     * The checkpoint for the corridor, and it is not `reset`: dying a few
     * metres from the window should not cost the eight arrows, and `reset`
     * sends the car back up to the lobby with the combination wiped. This
     * keeps the ride spent and winds back the one event that makes up the run
     * for the window, so the thing comes out of the shaft at you again.
     */
    backToTheCar() {
      phase = 'done';
      since = 0;
      shut = 0;
      place(floorBelow);
      slide();
      arrived = true;
      chasedOut = false;
    },

    /** Out of the lift at the bottom, looking down the corridor. */
    get atTheWindow() {
      // yaw 0 is -z, which is down the corridor at the window. It was Math.PI,
      // which is back up it at the shut lift.
      return { position: [axis, floorBelow, outZ0 + 3.2], yaw: 0 };
    },

    /** Where one of the four arrows is in the world, for a harness. */
    padAt(dir) {
      const key = keys.find((k) => k.dir === dir);
      return key ? [padX, carY + padY + key.dy, padZ + key.dz] : null;
    },

    /** The combination, for a harness and for nothing else. */
    get code() {
      return [...CODE];
    },

    /** How many of it are in, for a harness. */
    get entered() {
      return entered;
    },

    /** Where the car is, for a harness. */
    get carHeight() {
      return +carY.toFixed(2);
    },

    get isRiding() {
      return phase === 'closing' || phase === 'riding' || phase === 'opening';
    },

    get hasRun() {
      return phase === 'done';
    },

    /** Press one, by name, without having to stand anywhere. For a harness. */
    push(dir) {
      if (phase !== 'wait') return;
      press(dir);
    },

    /** Straight to the bottom with the doors open, for a scene jump. */
    sendDown() {
      phase = 'done';
      entered = CODE.length;
      since = 0;
      shut = 0;
      place(floorBelow);
      slide();
      arrived = true;
    },

    reset() {
      glass.visible = true;
      mullion.visible = true;
      shards.visible = false;
      phase = 'wait';
      since = 0;
      entered = 0;
      wrongAt = -9;
      told = false;
      arrived = false;
      chasedOut = false;
      banged = 0;
      shook = 0;
      shut = 0;
      place(deck);
      slide();
      motor.stop();
      houseLights(false);
      bulb.intensity = 0;
    },

    update(delta) {
      const here = player.position;
      houseLights(here.z < doorway.z + (lampsIn ? 40 : 30));
      const near = inside(here.x, here.z) || inCorridor(here.x, here.z);
      bulb.intensity = near || phase !== 'wait' ? 11 : 0;

      /**
       * While you are in the car, which is while you are not catchable —
       * and the whole of what pays for the eight arrows.
       *
       * The roof in the shed used to pay for them, by standing the thing
       * behind a heap for eighteen seconds two hundred metres from here. It
       * does not any more, so this does: the car's doorway is two metres
       * eight and the animal is eleven and a half, which makes it the first
       * opening in the building that is simply too small. It comes into the
       * lobby, it fills the hole, and it watches you type.
       *
       * **Every frame, and not once when you step in.** A one-shot here is
       * a thing standing at the lift for ever: board the car, walk back out
       * past it, and the lobby is a room with a frozen monster in it. What
       * is wired to this is a hold that lasts a fraction of a second, so it
       * is true exactly while this is being called and the moment you leave
       * the car it comes off it — audibly, which is the right answer to
       * stepping back out.
       *
       * Keyed on standing in the car rather than on the first press,
       * because a player who steps in and reads the strip for ten seconds
       * before touching anything is the player this is for.
       */
      if (phase === 'wait' && inside(here.x, here.z)) onInTheCar?.(delta);

      if (!told && inside(here.x, here.z)) {
        told = true;
        showNote('No floors on it. Just the four ways it can be told.', 3.8);
        setObjective('Work the pad');
      }

      // The lamps: dim is the combination, lit is how far in you are. The
      // whole row flashes once on a refusal, because eight dark lamps on
      // their own do not read as "that was wrong", they read as "nothing
      // happened".
      if (wrongAt >= 0) wrongAt += delta;
      const flash = wrongAt >= 0 && wrongAt < 0.4 && Math.sin(wrongAt * 48) > 0;
      lamps.forEach(({ tile, glyph }, i) => {
        const on = i < entered;
        tile.material.color.copy(on ? PLATE.live : flash ? PLATE.wrong : PLATE.dark);
        glyph.material.color.copy(on || flash ? GLYPH.done : GLYPH.waiting);
      });

      if (phase === 'closing') {
        since += delta;
        shut = Math.min(1, since / RIDE.shut);
        slide();
        if (shut >= 1) {
          phase = 'riding';
          since = 0;
          motor.start(1);
        }
      } else if (phase === 'riding') {
        since += delta;
        const t = Math.min(1, since / RIDE.seconds);
        // Eased at both ends, because a lift that starts and stops at full
        // speed is a lift that would have killed everyone who ever used it.
        const eased = t * t * (3 - 2 * t);
        place(deck - RIDE.drop * eased);
        /**
         * And something arrives on the roof about two seconds in.
         *
         * This is the whole of the handover and it is deliberately all sound.
         * The thing is eleven metres of animal and the shaft is three and a
         * quarter: drawn in here it would be crushed to a quarter of itself in
         * a box you cannot see into anyway, which is a lot of work to make a
         * monster small. So it is not drawn. It lands, it drags itself down
         * the shaft after you for eight and a half seconds, and the only
         * evidence is overhead — which is the most frightening it has been
         * since it was a face on a television.
         *
         * The car shakes on each hit, and that is the second reason to do it
         * this way: the sway is already there to make the box feel hung, and a
         * hit is the same number with a spike in it.
         */
        banged -= delta;
        if (banged <= 0 && t > 0.2 && t < 0.92) {
          banged = 2.1;
          playSpikeGrind(0.85);
          playScreech(0.55);
          shook = 1;
        }
        shook = Math.max(0, shook - delta * 1.6);
        // A hand's worth of sway, on nothing in particular, so the box feels
        // hung rather than driven.
        car.position.x =
          Math.sin(since * 7.3) * 0.012 * (t < 0.95 ? 1 : 0) +
          Math.sin(since * 46) * 0.055 * shook * shook;
        if (t >= 1) {
          phase = 'opening';
          since = 0;
          car.position.x = 0;
          motor.stop();
        }
      } else if (phase === 'opening') {
        since += delta;
        shut = Math.max(0, 1 - since / RIDE.open);
        slide();
        if (shut <= 0) {
          phase = 'done';
          playWardDoor(0.7);
        }
      }

      if (!arrived && phase === 'done' && inCorridor(here.x, here.z)) {
        arrived = true;
        showNote('A window. The first one in this building.', 4.0);
        setObjective('Get to the window');
      }

      /**
       * And the last twenty-two metres, which is now one event.
       *
       * It used to be three: out of the shaft, through the gap, and the beat
       * at the glass the quiet was counted from. The gap is gone and both of
       * the events that belonged to it went with it, so what is left is the
       * thing being let out behind you — keyed on where you are and not on a
       * clock, because it is about you: a player who sprints out of the car
       * and a player who edges out of it should both get the same corridor,
       * which is the thing coming out of the lift five metres behind them.
       *
       * Nothing in here ends the chase any more. That is finale.js, off the
       * glass and whatever is standing near it — see the trigger in main.js.
       */
      if (arrived && !chasedOut && here.z < outZ1 - CHASE.after) {
        chasedOut = true;
        // It comes out of the doorway you just came out of, and takes it with
        // it. One sound for both halves of that.
        playSpikeGrind(1);
        playScreech(0.95);
        showNote('It came down the shaft.', 2.4);
        onOut?.();
      }
    },
  };
}
