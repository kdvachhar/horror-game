import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  makeWoodSurface,
  worldRepeat,
  metalRepeat,
  cloneSurface,
} from './textures.js';
import { buildScreenFace, createScreenLife, FACE } from './screenFace.js';
import { playButtonPress, playSpikeGrind, createLiftMotor } from './audio.js';
import { showNote, setObjective } from './hud.js';

/**
 * The storage room at the top, and the thing that has been watching you.
 *
 * Behind the two-body door in the lift room: a long shed of racking seventy-two
 * metres up, full of the parts for everything you have walked through, and at
 * the far end of it a machine the size of the wall with a face on it.
 *
 * **The face is the same face.** It has been on a 3.8 metre television in the
 * ward and on another at the end of the red hall, and screenFace.js is
 * emphatic that if it turns up anywhere else it turns up in one of those,
 * because a face crammed into a different box is a different character wearing
 * the same eyes. This breaks that rule in the one direction the rule was never
 * protecting against. Shrinking it into a desk terminal made it a computer with
 * a face on it; blowing it up to five metres makes it the thing the televisions
 * were always a window onto. Same eyes, same mouth, same voice, nothing
 * redrawn — only finally at the size it has been talking to you from.
 *
 * It is off when you come in. There is one button and it is enormous, which is
 * the whole of the puzzle in this room: everything else up here has asked you
 * to be two bodies in two places, and this asks you to walk up to a thing and
 * press it.
 */

/** The shed. Long in +x from the door, wide in z, and tall enough to store in. */
const LENGTH = 28;
const WIDTH = 20;
const HEIGHT = 7;

/**
 * The two ends of everything that lights up in here, as colours rather than
 * as numbers.
 *
 * Written as hex and interpolated between, because `setRGB` takes the
 * renderer's working space and a dark value handed to it comes back three
 * times lighter than it was authored — the screen was a pale grey slab for
 * exactly that reason. `setStyle`/`new Color(hex)` converts, so a pair of
 * them with `lerp` between is the only way to say "this dark green" and get
 * it. The face does the same thing one line at a time; see createScreenLife.
 */
const DEAD_TUBE = new THREE.Color('#07080a');
const LIVE_TUBE = new THREE.Color('#101d16');
const DEAD_STRIP = new THREE.Color('#141611');
const LIVE_STRIP = new THREE.Color('#b9c49a');
const DEAD_PIP = new THREE.Color('#15110c');
const LIVE_PIP = new THREE.Color('#c08a2a');

const WALL_TINT = '#43463f';
const FLOOR_TINT = '#35372f';

/**
 * The machine, across the far end.
 *
 * `bank` is how much of the wall it takes, `deep` how far it stands off it.
 * The screen is most of it: this is a face in a cabinet and not a cabinet with
 * a face on it, and the proportion is what says so.
 */
const RIG = { bank: 13.5, high: 5.2, deep: 1.1, screen: { wide: 6.8, high: 3.9, at: 2.9 } };

/**
 * How big to draw the face in it.
 *
 * The face is built at about 1.12 across and the television shows it at that,
 * floating in 3.8 of screen. Three and a quarter puts the eyes 2.7 apart in a
 * 6.8 screen, which is the television's own ratio held exactly — so it reads
 * as the same set photographed closer rather than as a different machine.
 */
const FACE_SCALE = 3.25;

/** The button. Giant, because it is the only control in a room this size. */
const BUTTON = { base: 1.9, cap: 1.5, rise: 0.55, dome: 0.34, at: 0.58 };

/**
 * Waking up, in seconds from the press.
 *
 * It is a sequence and not a switch because the room is twenty-eight metres
 * long and the button is in the middle of it: whatever happens has to be
 * legible from where you are standing when you press it, which is with your
 * back to half of it. So the racking lamps come up first and travel away from
 * you down the shed, then the cabinet lamps, then the screen — the light
 * arrives before the face does, and you have turned round by the time it is
 * looking at you.
 */
const WAKE = { lamps: 0.55, bank: 2.4, screen: 3.6, face: 4.4, speak: 5.4 };

/**
 * What it says, the first time.
 *
 * Short, and it does not explain itself. Every other screen in this game has
 * told you where to go; this one has nothing to send you to yet, so it says
 * the thing it has been waiting the whole building to say and stops.
 *
 * `eyes: 'closed'` on the last line is the delivery this face keeps for lines
 * it is pleased with — see createScreenLife, and the note on WAKE_LINES in
 * controlRoom.js, which uses it for the same reason.
 */
const WAKE_LINES = [
  { text: 'Oh.', hold: 1.6 },
  { text: 'You found the rest of me.', hold: 2.8 },
  { text: 'Do you know how long I have been that small?', hold: 3.2, arms: 'crossed' },
  { text: 'Have a look round. Nothing in here works either.', hold: 3.4, eyes: 'closed' },
];

/**
 * @param scene   the world
 * @param doorway where the lift room hands over: the far face of its door
 * @param player  for knowing when you are in here
 */
export function createStorageRoom({ scene, doorway, player }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // Laid out from the doorway, so moving that moves the room.
  const near = doorway.x;
  const far = near + LENGTH;
  const floorY = doorway.y;
  const midZ = doorway.z;
  const minZ = midZ - WIDTH / 2;
  const maxZ = midZ + WIDTH / 2;
  const midX = (near + far) / 2;
  const crown = floorY + HEIGHT;

  // ------------------------------------------------------------- materials ---

  const wallSurface = makeWallSurface(...worldRepeat(LENGTH, HEIGHT), WALL_TINT);
  const wallOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL_TINT,
      metalness: 0,
    });
  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(4, 2), '#4b4e46'),
    metalness: 0.5,
    roughness: 0.6,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#232519', roughness: 0.85, metalness: 0.3 });
  const crateMat = new THREE.MeshStandardMaterial({
    ...makeWoodSurface(2, 1),
    roughness: 0.92,
    metalness: 0,
  });

  // ----------------------------------------------------------------- shell ---

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(LENGTH, WIDTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(LENGTH, WIDTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.PI / 2;
  floor.position.set(midX, floorY, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(LENGTH, WIDTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(LENGTH, WIDTH)),
      color: '#2a2c26',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.rotation.z = Math.PI / 2;
  ceiling.position.set(midX, crown, midZ);
  group.add(ceiling);

  // The floor as a thing to stand on, and the lid as a thing to stop your head.
  solid(near, far, minZ, maxZ, { top: floorY, bottom: floorY - 0.6 });
  solid(near, far, minZ, maxZ, { bottom: crown });

  const panel = (material, w, h, px, py, pz, ry) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(px, py, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  const mid = floorY + HEIGHT / 2;
  // The near wall, in three pieces round the way in — the same way every wall
  // with a hole in it is built in this game.
  const inLow = midZ - doorway.width / 2;
  const inHigh = midZ + doorway.width / 2;
  for (const [w, h, pz, py] of [
    [inLow - minZ, HEIGHT, (minZ + inLow) / 2, mid],
    [maxZ - inHigh, HEIGHT, (inHigh + maxZ) / 2, mid],
    [doorway.width, HEIGHT - doorway.height, midZ, floorY + doorway.height + (HEIGHT - doorway.height) / 2],
  ]) {
    if (w <= 0.001 || h <= 0.001) continue;
    panel(wallOf(w, h), w, h, near, py, pz, Math.PI / 2);
  }
  panel(wallOf(WIDTH, HEIGHT), WIDTH, HEIGHT, far, mid, midZ, -Math.PI / 2);
  panel(wallOf(LENGTH, HEIGHT), LENGTH, HEIGHT, midX, mid, minZ, 0);
  panel(wallOf(LENGTH, HEIGHT), LENGTH, HEIGHT, midX, mid, maxZ, Math.PI);

  /**
   * And the walls as things you cannot walk through.
   *
   * Every one carries a `bottom`, which a wall standing on a floor does not
   * normally need — but this floor is seventy-two metres up over the rooms you
   * climbed to get here, and a box with no `bottom` is solid at every height
   * below itself. Without it these are four slabs standing in the giant hall.
   * See liftTower.js, which learned it the expensive way.
   */
  for (const [a, b, c, d] of [
    [near - 0.3, near, minZ, inLow],
    [near - 0.3, near, inHigh, maxZ],
    [far, far + 0.3, minZ, maxZ],
    [near - 0.3, far + 0.3, minZ - 0.3, minZ],
    [near - 0.3, far + 0.3, maxZ, maxZ + 0.3],
  ]) {
    solid(a, b, c, d, { bottom: floorY });
  }
  // The lintel over the way in, so you cannot climb the doorway's head.
  solid(near - 0.3, near, inLow, inHigh, { bottom: floorY + doorway.height });

  // --------------------------------------------------------------- storage ---

  /**
   * Racking, in two runs down the length with an aisle between them.
   *
   * The aisle is what makes this a room you walk *down* rather than a box with
   * things in it: you come in at one end, the machine is at the other, and
   * everything between the two is shelving taller than you with the lane
   * running straight at it. It also hides the far end until you are committed,
   * which is the only staging this room gets.
   */
  const RACK = { high: 3.4, deep: 1.2, bays: 5, long: 4.0, aisle: 5.0, shelves: 3 };
  const rackLamps = [];
  for (const side of [-1, 1]) {
    const rz = midZ + side * (RACK.aisle / 2 + RACK.deep / 2);
    for (let bay = 0; bay < RACK.bays; bay++) {
      const bx = near + 5.0 + bay * (RACK.long + 0.6) + RACK.long / 2;
      if (bx + RACK.long / 2 > far - RIG.deep - 2.5) continue;

      // Uprights, and shelves between them. Boxes rather than a solid block,
      // because a rack you can see through is the only way the aisle reads as
      // being between two of something.
      for (const end of [-1, 1]) {
        for (const d of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, RACK.high, 0.1), dark);
          post.position.set(
            bx + end * (RACK.long / 2 - 0.08),
            floorY + RACK.high / 2,
            rz + d * (RACK.deep / 2 - 0.08)
          );
          post.castShadow = true;
          group.add(post);
        }
      }
      for (let s = 0; s < RACK.shelves; s++) {
        const sy = floorY + 0.5 + s * ((RACK.high - 0.7) / (RACK.shelves - 1));
        const shelf = new THREE.Mesh(
          new THREE.BoxGeometry(RACK.long, 0.08, RACK.deep),
          steel
        );
        shelf.position.set(bx, sy, rz);
        shelf.castShadow = true;
        shelf.receiveShadow = true;
        group.add(shelf);

        // What is on it. Deterministic from the bay and shelf, like everything
        // else in this project — a room that is a different room every boot is
        // a room nobody can report a bug in.
        const n = 2 + ((bay * 7 + s * 3 + (side + 1)) % 3);
        for (let i = 0; i < n; i++) {
          const h = 0.42 + (((bay + s + i) * 37) % 5) * 0.08;
          const w = 0.5 + (((bay * 3 + i) * 29) % 4) * 0.13;
          const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, RACK.deep - 0.3), crateMat);
          box.position.set(
            bx - RACK.long / 2 + 0.45 + i * (RACK.long - 0.9) / Math.max(1, n - 1),
            sy + 0.04 + h / 2,
            rz + (((i * 13) % 3) - 1) * 0.06
          );
          box.rotation.y = (((bay + i) % 5) - 2) * 0.03;
          box.castShadow = true;
          box.receiveShadow = true;
          group.add(box);
        }
      }

      // One box, floor to the top shelf. The rack is scenery and the point of
      // it is the aisle; a shelf-by-shelf collider is sixty boxes to let you
      // stand on something nobody can reach anyway.
      solid(bx - RACK.long / 2, bx + RACK.long / 2, rz - RACK.deep / 2, rz + RACK.deep / 2, {
        top: floorY + RACK.high,
        bottom: floorY,
      });

      // A strip light under the top shelf of each bay, dead until the machine
      // is. An unlit plane rather than a lamp: there are sixty-two
      // forward-rendered lights in this scene and ten more for ten bays would
      // be the most expensive decoration in the game.
      const tube = new THREE.Mesh(
        new THREE.PlaneGeometry(RACK.long - 0.5, 0.1),
        new THREE.MeshBasicMaterial({ color: '#141611', toneMapped: false })
      );
      tube.rotation.x = Math.PI / 2;
      tube.position.set(bx, floorY + RACK.high - 0.06, rz - side * (RACK.deep / 2 - 0.2));
      group.add(tube);
      rackLamps.push({ tube, at: (bay + (side > 0 ? 0.5 : 0)) / RACK.bays, level: 0 });
    }
  }

  // Pallets and crates in the aisle's edges, so the floor is not swept clean.
  for (const [px, pz, w, h, d, ry] of [
    [near + 3.2, midZ - 3.4, 1.3, 0.9, 1.1, 0.2],
    [near + 3.6, midZ + 3.6, 1.0, 0.65, 0.95, -0.12],
    [near + 2.6, midZ + 3.2, 0.8, 0.5, 0.8, 0.34],
    [far - 6.0, midZ - 3.8, 1.4, 1.0, 1.2, -0.08],
    [far - 5.2, midZ + 4.0, 1.1, 0.75, 1.0, 0.26],
  ]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crateMat);
    box.position.set(px, floorY + h / 2, pz);
    box.rotation.y = ry;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    solid(px - w / 2, px + w / 2, pz - d / 2, pz + d / 2, { top: floorY + h, bottom: floorY });
  }

  // ------------------------------------------------------------ the machine ---

  const rigX = far - RIG.deep / 2;

  const cabinet = new THREE.Mesh(
    new THREE.BoxGeometry(RIG.deep, RIG.high, RIG.bank),
    new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(...metalRepeat(RIG.bank, RIG.high), '#555851'),
      metalness: 0.35,
      roughness: 0.62,
    })
  );
  cabinet.position.set(rigX, floorY + RIG.high / 2, midZ);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  group.add(cabinet);

  solid(far - RIG.deep, far, midZ - RIG.bank / 2, midZ + RIG.bank / 2, {
    top: floorY + RIG.high,
    bottom: floorY,
  });

  // The screen: a dead tube until it is not. Recessed, with a bezel proud of
  // it on all sides, which is the television's own construction at scale.
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, RIG.screen.high + 0.5, RIG.screen.wide + 0.5),
    new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(2, 1, '#84847d'),
      metalness: 0.15,
    })
  );
  bezel.position.set(far - RIG.deep - 0.08, floorY + RIG.screen.at, midZ);
  bezel.castShadow = true;
  group.add(bezel);

  const screenMat = new THREE.MeshBasicMaterial({ color: '#07080a', toneMapped: false });
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(RIG.screen.wide, RIG.screen.high),
    screenMat
  );
  screen.position.set(far - RIG.deep - 0.2, floorY + RIG.screen.at, midZ);
  screen.rotation.y = -Math.PI / 2;
  group.add(screen);

  /**
   * And the face on it, which is the face.
   *
   * Scaled as a group and not rebuilt — same eyes, same three mouth steps,
   * same everything. The group is drawn in the +z plane, so it is turned to
   * face back down the room the way the screen is.
   */
  const { group: faceGroup, eyes, mouth, faceParts } = buildScreenFace();
  faceGroup.scale.setScalar(FACE_SCALE);
  faceGroup.rotation.y = -Math.PI / 2;
  faceGroup.position.set(far - RIG.deep - 0.24, floorY + RIG.screen.at, midZ);
  faceGroup.visible = false;
  group.add(faceGroup);

  // Its own glow thrown back down the shed. One light, off until it wakes.
  const glow = new THREE.PointLight(FACE, 0, 16, 1.8);
  glow.position.set(far - RIG.deep - 1.4, floorY + RIG.screen.at, midZ);
  group.add(glow);

  // Cabinet lamps either side of the screen: two columns of dead planes that
  // come up in a run when it boots, so the machine has something to be doing
  // that is not its face.
  const bankLamps = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const lamp = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 0.12),
        new THREE.MeshBasicMaterial({ color: '#15110c', toneMapped: false })
      );
      lamp.rotation.y = -Math.PI / 2;
      lamp.position.set(
        far - RIG.deep - 0.02,
        floorY + 0.9 + i * 0.52,
        midZ + side * (RIG.screen.wide / 2 + 1.15)
      );
      group.add(lamp);
      bankLamps.push({ lamp, at: i / 6 });
    }
  }

  /**
   * One real lamp over the aisle, and only one.
   *
   * Every strip on the racking is an unlit plane, which is this building's
   * answer to lighting things it cannot afford to light — but a plane lights
   * nothing, and a twenty-eight metre shed whose only actual light source is
   * the face at the far end is a shed you cannot see the middle of. This is
   * the difference between a room that turns on and a room that merely stops
   * being black at one end.
   *
   * One, not a row. There are sixty-three forward-rendered lights in this
   * scene and each of them shades every fragment of every surface; a row of
   * six down an aisle would be the most expensive thing in the building, for
   * a room you walk the length of once. It comes up with the strips so it
   * reads as them rather than as itself.
   */
  const aisleLamp = new THREE.PointLight(0xd2d8c0, 0, 26, 1.5);
  aisleLamp.position.set(near + LENGTH * 0.42, crown - 0.5, midZ);
  group.add(aisleLamp);

  // Cable trays out of the top of it and away across the ceiling, so it is
  // plugged into the building rather than standing in it.
  for (const off of [-4.2, -1.4, 1.4, 4.2]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(LENGTH * 0.62, 0.12, 0.34), dark);
    tray.position.set(far - LENGTH * 0.31, crown - 0.22, midZ + off);
    group.add(tray);
  }

  // ------------------------------------------------------------- the button ---

  /**
   * One control, and it is enormous.
   *
   * In the middle of the aisle, square in front of the machine, because the
   * room has exactly one thing to do and hiding it would make this a search
   * rather than an arrival. The size is the joke and the instruction at once:
   * everything else in this building is worked by standing on something or by
   * being the other body, and this is a button you hit with your hand.
   */
  const buttonX = far - 7.5;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(BUTTON.base / 2, BUTTON.base / 2 + 0.12, BUTTON.rise, 20),
    steel
  );
  base.position.set(buttonX, floorY + BUTTON.rise / 2, midZ);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(BUTTON.cap / 2 + 0.1, BUTTON.cap / 2 + 0.1, 0.1, 20),
    dark
  );
  collar.position.set(buttonX, floorY + BUTTON.rise + 0.05, midZ);
  group.add(collar);

  const capMat = new THREE.MeshStandardMaterial({ color: '#7d2a20', roughness: 0.55, metalness: 0.2 });
  const cap = new THREE.Group();
  cap.position.set(buttonX, floorY + BUTTON.rise + 0.1, midZ);
  group.add(cap);
  const capTop = new THREE.Mesh(
    new THREE.CylinderGeometry(BUTTON.cap / 2, BUTTON.cap / 2, BUTTON.dome, 20),
    capMat
  );
  capTop.position.y = BUTTON.dome / 2;
  capTop.castShadow = true;
  cap.add(capTop);
  const domeTop = new THREE.Mesh(
    new THREE.SphereGeometry(BUTTON.cap / 2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    capMat
  );
  domeTop.position.y = BUTTON.dome;
  domeTop.castShadow = true;
  cap.add(domeTop);

  // Hazard paint round the foot of it, in the one language this building has
  // for "this is the thing".
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BUTTON.base / 2 + 0.14, BUTTON.base / 2 + 0.75, 28),
    new THREE.MeshStandardMaterial({ ...makeHazardSurface(10, 1), roughness: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(buttonX, floorY + 0.006, midZ);
  group.add(ring);

  solid(
    buttonX - BUTTON.base / 2 - 0.12,
    buttonX + BUTTON.base / 2 + 0.12,
    midZ - BUTTON.base / 2 - 0.12,
    midZ + BUTTON.base / 2 + 0.12,
    { top: floorY + BUTTON.rise + BUTTON.at, bottom: floorY }
  );

  // -------------------------------------------------------------- the life ---

  const life = createScreenLife({ eyes, mouth, faceParts, glow, glowLevel: 3.4 });
  const motor = createLiftMotor();

  let awake = false;
  let since = -1;
  let said = false;
  let entered = false;
  let pressed = 0;

  const inside = (x, z) => x > near && x < far && z > minZ && z < maxZ;

  const wake = () => {
    if (awake) return;
    awake = true;
    since = 0;
    playButtonPress(1);
    playSpikeGrind(0.45);
    motor.start(0.8);
  };

  const interactions = [
    {
      position: new THREE.Vector3(buttonX, floorY + BUTTON.rise + 0.3, midZ),
      label: 'Turn it on',
      // Wide, because the thing is 1.9 across and you are standing against it
      // — a reach measured from the middle of a button this size has to clear
      // its own radius before it clears anything else.
      range: 2.6,
      facing: 0.25,
      once: true,
      enabled: () => !awake,
      onInteract() {
        pressed = 1;
        wake();
      },
    },
  ];

  return {
    group,
    colliders,
    interactions,

    /** Whether a point is in this room, for whoever needs to know. */
    contains: (x, z) => inside(x, z),

    /** Just inside the door, looking down the aisle at it. */
    get entry() {
      return { position: [near + 2.2, floorY, midZ], yaw: -Math.PI / 2 };
    },

    /** Whether it has been switched on, for a harness and for whatever asks. */
    get isAwake() {
      return awake;
    },

    /** Where the button is, for a harness and for the debug menu. */
    get button() {
      return { x: buttonX, y: floorY, z: midZ };
    },

    reset() {
      awake = false;
      since = -1;
      said = false;
      entered = false;
      pressed = 0;
      life.stop();
      motor.stop();
      faceGroup.visible = false;
      glow.intensity = 0;
      aisleLamp.intensity = 0;
      screenMat.color.copy(DEAD_TUBE);
      cap.position.y = floorY + BUTTON.rise + 0.1;
      for (const { tube } of rackLamps) tube.material.color.copy(DEAD_STRIP);
      for (const { lamp } of bankLamps) lamp.material.color.copy(DEAD_PIP);
    },

    update(delta) {
      const here = player.position;
      if (!entered && inside(here.x, here.z)) {
        entered = true;
        showNote('Racking, in the dark, as far back as the light goes.', 3.2);
        setObjective('Find the switch');
      }

      // The cap, pushed down and let back up. Not a toggle — it is one press
      // and the spring is the only part of it that happens afterwards.
      if (pressed > 0) {
        pressed = Math.max(0, pressed - delta * 2.2);
        cap.position.y = floorY + BUTTON.rise + 0.1 - 0.13 * Math.sin(pressed * Math.PI);
      }

      if (!awake) return;
      since += delta;

      /**
       * The lamps, each on its own place in the run.
       *
       * `at` is how far down the shed a fitting is, nought to one, so the
       * light travels away from the button rather than arriving everywhere
       * at once. Eased in over a third of a second each — a row of planes
       * snapping to full is a row of planes, and the whole reason this is a
       * sequence is that it has to read as a machine coming up.
       */
      for (const fitting of rackLamps) {
        const t = (since - WAKE.lamps - fitting.at * 1.3) / 0.35;
        const level = Math.max(0, Math.min(1, t));
        fitting.tube.material.color.copy(DEAD_STRIP).lerp(LIVE_STRIP, level);
      }
      // The aisle with them, on the same ramp as the last strip to come up.
      aisleLamp.intensity = 26 * Math.max(0, Math.min(1, (since - WAKE.lamps - 1.1) / 1.4));

      for (const fitting of bankLamps) {
        const t = (since - WAKE.bank - fitting.at * 0.7) / 0.25;
        const level = Math.max(0, Math.min(1, t));
        fitting.lamp.material.color.copy(DEAD_PIP).lerp(LIVE_PIP, level);
      }

      // The tube warming, then the face in it.
      const warm = Math.max(0, Math.min(1, (since - WAKE.screen) / 0.9));
      screenMat.color.copy(DEAD_TUBE).lerp(LIVE_TUBE, warm);
      if (since >= WAKE.face) faceGroup.visible = true;

      if (!said && since >= WAKE.speak) {
        said = true;
        life.speak(WAKE_LINES, () => setObjective('Find the way on'));
      }

      // `lit` is the fade the screen is behind — full once the tube is warm,
      // and nothing before that, so the face does not blink in the dark.
      life.update(delta, since >= WAKE.face ? 1 : 0);
    },
  };
}
