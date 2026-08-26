import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeConsoleScreenTexture,
  cloneSurface,
  worldRepeat,
  metalRepeat,
} from './textures.js';
import { buildTelevision, createScreenLife } from './screenFace.js';
import { showNote } from './hud.js';

/**
 * The room behind the staff door, and the man in it.
 *
 * The hall outside is the first place in the building that is not an
 * experiment — a corridor, the people who tried it, and a door that does not
 * open. This is the other half of that sentence. Somebody watched, and he is
 * still here: face down on his own console with the screen still going in front
 * of him, a badge round his neck that opens every door in the building, and a
 * wall of machinery running because nobody switched it off. Four metres that
 * way there is a heap of people who died against a door he could have opened.
 *
 * And on the wall above him, the television from the ward. The same one, not a
 * third copy of it — there is one character in this game, it lives on glass,
 * and every room you get into that you were not meant to be in turns out to
 * have it in there already. It is what he was looking at.
 *
 * Nothing in here is interactive, like the hall. There is no terminal to use,
 * no log to read, no button that opens the yellow door — a room with an answer
 * in it would turn the hall outside into a puzzle, and the hall is not a
 * puzzle. What this room is for is the sentence you say to yourself walking
 * back out of it.
 *
 * Which is also why the screen says nothing readable. See
 * makeConsoleScreenTexture: it had words on it once and they explained, in six
 * lines, what a heap of bodies against a door already says.
 */

/**
 * How far the room runs back from the wall the door is in, and how far along
 * that wall each way from the doorway.
 *
 * `racks` is capped by something real rather than chosen: the passage from the
 * orange room into the hall has a wall on this side of it whose collider runs
 * back to z -14.2, and a room built past that has a slab of solid nothing
 * standing in the corner of it. Measured, not guessed — that collider is 3.6m
 * deep and there is no mesh anywhere near it to see.
 */
const DEPTH = 5.9;
const RUN = { racks: 3.5, plant: 4.1 };
/**
 * Taller than the hall outside, and taller than it was.
 *
 * It went from 3.2 to 3.6 when the television arrived. That thing is 1.9 high
 * and it hangs on a wall over a desk with monitors standing on it, and under a
 * 3.2 ceiling there is no height at which it clears the tubes below it and the
 * slab above. A plant room being taller than a corridor is also just true.
 */
const HEIGHT = 3.6;

// Back of house. Dirtier and greener than the hall outside, which is a public
// corridor and gets painted; nobody has decorated in here.
const WALL_TINT = '#4a4f47';
const FLOOR_TINT = '#3e403a';
const TRIM = '#2d312b';
const CASE = '#3a403b';

/** What he is wearing, and what is left of him. Authored dark, like the hall. */
const SHIRT = '#333940';
const TROUSER = '#252925';
const SKIN = '#4a4338';
const HAIR = '#1e1c19';

/**
 * A limb, as two points and a thickness.
 *
 * The bodies in the hall are posed in angles — a rotation per joint, worked out
 * on paper — because they are all the same body lying down thirteen times and
 * the pose is a parameter. There is one of this one and he is folded over a
 * desk, so he is written as where his hands are and where his head is, and the
 * angles fall out of the arithmetic. Two points is also the only description
 * that cannot come apart: a shoulder and an elbow given as angles drift into
 * each other the moment either changes.
 */
const UP = new THREE.Vector3(0, 1, 0);
function bone(from, to, radius, material) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const along = new THREE.Vector3().subVectors(b, a);
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(radius, Math.max(along.length() - radius * 2, 0.01), 3, 7),
    material
  );
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, along.normalize());
  mesh.castShadow = true;
  return mesh;
}

/**
 * The man at the console, face down on his own desk.
 *
 * Built sitting: origin on the floor under the seat, +z the way he is facing,
 * which is at the desk. Every number below is measured off two things that are
 * real — the seat at 0.46 and the worktop at 0.815 — so his hands and his cheek
 * are on the desk rather than near it. That is the entire difficulty of posing
 * something that is touching furniture.
 */
function buildOperator() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.9, metalness: 0 });
  const trouser = new THREE.MeshStandardMaterial({ color: TROUSER, roughness: 0.94, metalness: 0 });
  const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.86, metalness: 0 });
  const hair = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.95, metalness: 0 });

  // Hips on the seat, and the spine folded forward until the shoulders are over
  // the front edge of the worktop.
  group.add(bone([0, 0.44, -0.04], [0, 0.5, 0.1], 0.15, trouser));
  // Flattened across, because a capsule at the width a back needs is a sausage
  // at the depth a back does not: a person seen from behind is wider than they
  // are thick and everything about reading him as a person is that shape.
  const spine = bone([0, 0.5, 0.08], [0, 0.7, 0.3], 0.16, shirt);
  spine.scale.set(1.3, 1, 0.85);
  group.add(spine);
  // Shoulders across the top of it, so the arms come off something.
  group.add(bone([-0.18, 0.7, 0.27], [0.18, 0.7, 0.27], 0.075, shirt));

  // The head, on its side on the desk with the neck at the angle that puts it
  // there — and haired over almost completely, which is not a detail.
  //
  // The face is into the desk, so from every angle a player can stand at, what
  // they are looking at is the back of a skull. Built the obvious way — a skin
  // sphere with a smaller cap of hair on top of it — he read from behind as a
  // bald white ball with the screen lighting it, which is the one thing in this
  // room that has to not look like a prop. So the hair is the larger sphere and
  // the skin shows through at the front, where it is face down on the worktop.
  group.add(bone([0, 0.71, 0.32], [0.02, 0.84, 0.42], 0.055, skin));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), skin);
  // 0.50 and not 0.53: the front of the middle tube's casing is 0.115 further
  // on, and at 0.53 his skull and it share the same four millimetres.
  head.position.set(0.05, 0.925, 0.5);
  head.castShadow = true;
  group.add(head);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.119, 12, 10), hair);
  crown.position.set(0.05, 0.941, 0.478);
  crown.scale.set(0.98, 0.93, 1);
  crown.castShadow = true;
  group.add(crown);

  // Arms out along the desk either side of the keyboard, which is why the hands
  // are 0.34 off the middle: straight ahead they are inside the monitor.
  for (const side of [-1, 1]) {
    group.add(bone([side * 0.17, 0.7, 0.26], [side * 0.32, 0.8, 0.44], 0.055, shirt));
    group.add(bone([side * 0.32, 0.8, 0.44], [side * 0.34, 0.845, 0.62], 0.048, side > 0 ? skin : shirt));
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 8, 6), skin);
    hand.position.set(side * 0.34, 0.845, 0.66);
    hand.scale.set(0.8, 0.6, 1.2);
    hand.castShadow = true;
    group.add(hand);
  }

  // Legs under the desk, in the gap the modesty panel leaves for them.
  for (const side of [-1, 1]) {
    group.add(bone([side * 0.11, 0.45, 0.02], [side * 0.13, 0.46, 0.4], 0.075, trouser));
    group.add(bone([side * 0.13, 0.44, 0.4], [side * 0.13, 0.1, 0.48], 0.06, trouser));
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), hair);
    shoe.position.set(side * 0.13, 0.04, 0.53);
    group.add(shoe);
  }

  // And the badge on its lanyard, hanging off the front of the desk.
  //
  // The one thing in this room that would open every door in the building, on a
  // strap round the neck of the man who is not going to use it. It is not a
  // pickup and there is no prompt on it — see the top of this file.
  const strap = new THREE.MeshStandardMaterial({ color: '#20242a', roughness: 0.95 });
  for (const side of [-1, 1]) {
    group.add(bone([side * 0.07, 0.75, 0.3], [side * 0.03, 0.86, 0.46], 0.008, strap));
  }
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.08, 0.006),
    new THREE.MeshStandardMaterial({ color: '#8d8878', roughness: 0.6, metalness: 0.1 })
  );
  badge.position.set(0.02, 0.845, 0.5);
  badge.rotation.set(Math.PI / 2, 0.3, 0);
  group.add(badge);

  return group;
}

/**
 * The room, hung off the doorway the hall hands over.
 *
 * Built for the one wall it is behind: the doorway faces +x out of its wall and
 * the room is the space at -x. Everything in this project that is a room behind
 * a door is written that way — the hall behind the orange door assumes it runs
 * along +z — because a room that can be built against any wall in any
 * orientation is a room whose every position is two lines of trigonometry, and
 * there is one of these.
 */
export function createControlRoom({ scene, doorway, player }) {
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  // The wall between here and the hall: its hall face is the doorway's, its
  // room face is that less the wall's thickness. The hall owns the collider for
  // it, split round the opening — see corpseHall.js.
  const front = doorway.x - doorway.thickness;
  const back = front - DEPTH;
  const minZ = doorway.z - RUN.racks;
  const maxZ = doorway.z + RUN.plant;
  const midZ = (minZ + maxZ) / 2;
  const midX = (front + back) / 2;

  let entered = false;

  const wallSurface = makeWallSurface(...worldRepeat(maxZ - minZ, HEIGHT), WALL_TINT);
  const wallOf = (w, h) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, ...worldRepeat(w, h)),
      color: WALL_TINT,
    });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPTH, maxZ - minZ),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(DEPTH, maxZ - minZ)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(DEPTH, maxZ - minZ),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(DEPTH, maxZ - minZ)),
      color: '#35382f',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, HEIGHT, midZ);
  group.add(ceiling);

  // Back wall and the two ends.
  for (const [w, h, px, pz, ry] of [
    [maxZ - minZ, HEIGHT, back, midZ, Math.PI / 2],
    [DEPTH, HEIGHT, midX, minZ, 0],
    [DEPTH, HEIGHT, midX, maxZ, Math.PI],
  ]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallOf(w, h));
    wall.position.set(px, HEIGHT / 2, pz);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    group.add(wall);
  }
  // The two ends stop at this room's face of the shared wall and not a metre
  // past it. A metre past it is inside the hall: they put a pair of invisible
  // blocks in the corners out there, one of them across the end you come in by.
  // The wall's own collider covers the gap between `front` and the hall.
  solid(back - 1, back, minZ - 1, maxZ + 1, {});
  solid(back - 1, front, minZ - 1, minZ, {});
  solid(back - 1, front, maxZ, maxZ + 1, {});

  // The wall with the door in it, from this side: three pieces round the hole,
  // and then the hole itself lined so that walking through it is walking
  // through half a metre of concrete rather than through a plane.
  const holeLow = doorway.z - doorway.width / 2;
  const holeHigh = doorway.z + doorway.width / 2;
  for (const [w, h, pz, py] of [
    [holeLow - minZ, HEIGHT, (minZ + holeLow) / 2, HEIGHT / 2],
    [maxZ - holeHigh, HEIGHT, (holeHigh + maxZ) / 2, HEIGHT / 2],
    [doorway.width, HEIGHT - doorway.height, doorway.z, (HEIGHT + doorway.height) / 2],
  ]) {
    if (w <= 0 || h <= 0) continue;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallOf(w, h));
    wall.position.set(front, py, pz);
    wall.rotation.y = -Math.PI / 2;
    wall.receiveShadow = true;
    group.add(wall);
  }

  // The reveal: two cheeks, a soffit and a strip of floor, all of it inside the
  // thickness of the wall.
  //
  // Tagged as not-wall for the stripe painter. These sit in the hall's wall
  // plane and are as thick as the wall is, which is exactly what that painter
  // looks for in a wall — it would run the band across the open doorway. The
  // only thing keeping it out today is that the opening is 4cm shorter than the
  // top of the band, which is not a reason.
  const reveal = new THREE.MeshStandardMaterial({
    color: '#40453d',
    roughness: 0.92,
    metalness: 0,
  });
  const inWall = (front + doorway.x) / 2;
  for (const [w, h, px, py, pz, rx, ry] of [
    [doorway.thickness, doorway.height, inWall, doorway.height / 2, holeLow, 0, 0],
    [doorway.thickness, doorway.height, inWall, doorway.height / 2, holeHigh, 0, Math.PI],
    // Soffit and threshold. Their width is the wall's thickness and their
    // length is the opening's, which is the way round a plane rotated about x
    // lands: its own y ends up along world z.
    [doorway.thickness, doorway.width, inWall, doorway.height, doorway.z, Math.PI / 2, 0],
    [doorway.thickness, doorway.width, inWall, 0.003, doorway.z, -Math.PI / 2, 0],
  ]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), reveal);
    panel.position.set(px, py, pz);
    panel.rotation.set(rx, ry, 0);
    panel.userData.notWall = true;
    panel.receiveShadow = true;
    group.add(panel);
  }

  // ------------------------------------------------------------------ light ---

  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.6, metalness: 0.3 });
  const fittings = [];
  // Two live fittings and a dead one over the console.
  //
  // One lamp at the hall's own intensity was the first try and the room came
  // out as a black box with a green rectangle in it. The hall is a corridor
  // three metres wide with four of them down it; this is forty-five square
  // metres, and everything in it is two to four metres from the ceiling rather
  // than one to two. It took two lamps at two and a half times the hall's to
  // make the machinery visible at all. The dead one is over the desk on
  // purpose — the console is lit by its own screen, which is the picture.
  for (const [fx, fz, alive] of [
    [midX + 0.9, doorway.z - 2.2, true],
    [midX + 0.9, doorway.z + 2.4, true],
    [back + 0.9, doorway.z - 0.4, false],
  ]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.16), trimMat);
    housing.position.set(fx, HEIGHT - 0.03, fz);
    group.add(housing);
    const tube = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.05, 0.1),
      new THREE.MeshBasicMaterial({ color: alive ? '#c6cfbe' : '#23261f', toneMapped: false })
    );
    tube.position.set(fx, HEIGHT - 0.08, fz);
    group.add(tube);
    if (!alive) continue;
    const lamp = new THREE.PointLight(0xd2dbca, 38, 17, 2);
    lamp.position.set(fx, HEIGHT - 0.2, fz);
    group.add(lamp);
    fittings.push({ lamp, tube, level: 1 });
  }

  // ---------------------------------------------------------------- console ---

  const deskZ = doorway.z;
  const caseMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(1.4, 1), CASE),
    color: CASE,
    roughness: 0.66,
    metalness: 0.3,
  });
  const darkGlass = new THREE.MeshStandardMaterial({
    color: '#0e120f',
    roughness: 0.24,
    metalness: 0.1,
  });
  const lit = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

  // Deeper than a desk needs to be, and the reason is the man at it. The tubes
  // are 0.46 front to back and stand at the wall; at 0.9 that left a 0.33 strip
  // of clear worktop in front of them, and a pair of hands reaching out along it
  // came down inside the middle one. A console desk is that deep anyway.
  const DESK = { deep: 1.05, long: 3.8, top: 0.78 };
  const deskFront = back + DESK.deep;

  const worktop = new THREE.Mesh(
    new THREE.BoxGeometry(DESK.deep, 0.07, DESK.long),
    new THREE.MeshStandardMaterial({ color: '#4c4740', roughness: 0.78, metalness: 0.08 })
  );
  worktop.position.set(back + DESK.deep / 2, DESK.top, deskZ);
  worktop.castShadow = true;
  worktop.receiveShadow = true;
  group.add(worktop);

  // A pedestal at each end and a modesty panel across the front, so there is a
  // knee space in the middle where the chair was.
  for (const end of [-1, 1]) {
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(DESK.deep - 0.08, DESK.top - 0.04, 0.62), caseMat);
    pedestal.position.set(back + DESK.deep / 2, (DESK.top - 0.04) / 2, deskZ + end * (DESK.long / 2 - 0.35));
    pedestal.castShadow = true;
    group.add(pedestal);
    for (const dy of [0.22, 0.46]) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.5), trimMat);
      drawer.position.set(deskFront - 0.02, dy, deskZ + end * (DESK.long / 2 - 0.35));
      group.add(drawer);
    }
  }
  // Modesty panel in two pieces with a knee space between them, which is how a
  // desk somebody sits at is built — and here it has to be, because somebody is
  // sitting at it and a single panel runs straight through his shins.
  for (const end of [-1, 1]) {
    const modesty = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.44, 0.7), caseMat);
    modesty.position.set(deskFront - 0.06, 0.5, deskZ + end * 0.85);
    group.add(modesty);
  }
  solid(back, deskFront, deskZ - DESK.long / 2, deskZ + DESK.long / 2, { top: DESK.top + 0.04 });

  /**
   * Three tubes on the desk, one of them still on.
   *
   * These are somebody's monitors and they are not the face — the face is on
   * the wall above them, on its own set. See below.
   */
  const screenTexture = makeConsoleScreenTexture();
  const monitors = [];
  for (const [i, offset] of [-1.25, 0, 1.25].entries()) {
    const casing = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.4, 0.5), caseMat);
    casing.position.set(back + 0.34, DESK.top + 0.24, deskZ + offset);
    casing.castShadow = true;
    group.add(casing);
    // A tube is deeper than it is tall and tapers toward the back; the taper is
    // most of what says CRT rather than flat panel.
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.36), caseMat);
    boot.position.set(back + 0.11, DESK.top + 0.24, deskZ + offset);
    group.add(boot);
    const alive = i === 1;
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.4, 0.3),
      alive
        ? new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false })
        : darkGlass
    );
    glass.position.set(back + 0.575, DESK.top + 0.25, deskZ + offset);
    glass.rotation.y = Math.PI / 2;
    group.add(glass);
    if (!alive) continue;
    monitors.push({ glass });
    // No lamp on this one. It had a small green one, back when this readout was
    // the only lit thing in the room; the television above it throws green over
    // the whole desk now and a second source of the same colour a foot below
    // the first is a light you can only see by looking for it.
  }

  /**
   * And the thing on the wall above them.
   *
   * The same television as the ward's and the same one as the console at the end
   * of the red hall — the object, not a copy of it, which is the entire point of
   * it being here. There is one character in this game and it lives on glass,
   * and every time you find a room you were not meant to be in, it is already in
   * that room, further along than you are. See screenFace.js.
   *
   * It is the set and not the face on a desk terminal, and that is a rule this
   * project has already learned once: the wide grey box, the wires out of the
   * top and bottom, the face floating in the middle of far too much screen. The
   * first attempt at the red hall's console shrank the face into a small monitor
   * and it read as a computer with a face on it rather than as the thing from
   * the ward. The three tubes on the desk are somebody's computers; this is not.
   *
   * It does not talk in here, and that is a decision rather than an omission.
   * Both places it has spoken it wanted something from you — a door to go
   * through, a button to press. This is a room you were not invited into, with
   * the man who watched the hall dead at the desk under it, and the thing on
   * the wall is on, and blinking, and looking at you. It has nothing to ask.
   */
  const television = buildTelevision();
  // Against the back wall, turned to face the door, hung so its bottom edge
  // clears the tubes on the desk under it by a hand's width.
  television.group.position.set(back + television.depth / 2 + 0.02, 2.35, deskZ);
  television.group.rotation.y = Math.PI / 2;
  group.add(television.group);
  // Its glow is part of the set and it is the room's green now — see the
  // monitors above, which gave theirs up for it.
  const life = createScreenLife({
    eyes: television.eyes,
    mouth: television.mouth,
    faceParts: television.faceParts,
    glow: television.glow,
  });

  // Keyboard, pushed back the way you push one back when you stand up.
  const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.44), caseMat);
  keyboard.position.set(back + 0.66, DESK.top + 0.05, deskZ - 0.1);
  keyboard.rotation.y = 0.14;
  group.add(keyboard);

  // Paper, a mug, and a telephone with no line in it any more.
  const paper = new THREE.MeshStandardMaterial({ color: '#6d6a5e', roughness: 0.95 });
  for (const [px, pz, ry] of [[0.5, 1.05, 0.4], [0.58, 1.22, -0.7], [0.62, -1.5, 0.2]]) {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.008, 0.3), paper);
    sheet.position.set(back + px, DESK.top + 0.04, deskZ + pz);
    sheet.rotation.y = ry;
    group.add(sheet);
  }
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 0.8 })
  );
  mug.position.set(back + 0.72, DESK.top + 0.08, deskZ + 0.55);
  group.add(mug);

  // The panel of switches, and a row of lamps that are still on because
  // whatever they watch is still doing it.
  //
  // Along the wall past the end of the desk rather than above it, where it was.
  // The wall above the desk is the television's now, and 3.8m of television on a
  // 7.6m wall leaves exactly one stretch of it long enough for this.
  const panelZ = deskZ - 2.7;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 1.3), caseMat);
  panel.position.set(back + 0.045, 1.5, panelZ);
  group.add(panel);
  for (let i = 0; i < 8; i++) {
    const sw = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), trimMat);
    sw.rotation.z = Math.PI / 2;
    sw.position.set(back + 0.11, 1.32, panelZ - 0.42 + i * 0.12);
    group.add(sw);
  }
  for (let i = 0; i < 9; i++) {
    // Mostly dead, two of them not. A wall of lit lamps reads as a working
    // building; two in a row of nine reads as a building nobody is left in.
    const on = i === 2 || i === 6;
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 8, 6),
      on ? lit(i === 2 ? '#7d1a12' : '#2f6a2c') : new THREE.MeshStandardMaterial({ color: '#24281f', roughness: 0.7 })
    );
    bulb.position.set(back + 0.1, 1.66, panelZ - 0.48 + i * 0.12);
    group.add(bulb);
  }

  /**
   * The chair, pulled up to the desk, and the man in it.
   *
   * He was an empty chair on its side for one commit and that was a worse room.
   * An overturned chair is somebody having got up, which puts the interesting
   * event somewhere the player cannot see and leaves the room a set. He is the
   * whole point of it: everyone in the hall outside died four metres that way,
   * against a door, trying to get out — and the one man who could have opened
   * anything in this building never stood up.
   *
   * Slumped forward onto the desk in front of the tube that is still lit, which
   * is the only arrangement of him that works. Face down on the floor and he is
   * another body, and there are thirteen of those through the wall.
   */
  {
    const seatAt = deskFront + 0.32;

    const chair = new THREE.Group();
    chair.position.set(seatAt, 0, deskZ);
    // Swivelled, so the backrest is at his shoulder instead of across his back.
    //
    // Square behind him it hid him: from the doorway, two metres back and dead
    // on, the whole of the man was a chair with the top of a head over it. An
    // office chair turns, everyone knows it turns, and turned it puts his back
    // and both arms in view from the one place every player enters from.
    chair.rotation.y = Math.PI - 0.85;
    group.add(chair);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 14), caseMat);
    seat.position.y = 0.46;
    seat.castShadow = true;
    chair.add(seat);
    const backRest = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.42), caseMat);
    backRest.position.set(-0.2, 0.72, 0);
    backRest.castShadow = true;
    chair.add(backRest);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.36, 8), trimMat);
    column.position.y = 0.24;
    chair.add(column);
    for (let i = 0; i < 5; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.06), trimMat);
      spoke.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.15, 0.06, Math.sin((i / 5) * Math.PI * 2) * 0.15);
      spoke.rotation.y = -(i / 5) * Math.PI * 2;
      chair.add(spoke);
      const castor = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), trimMat);
      castor.position.set(Math.cos((i / 5) * Math.PI * 2) * 0.27, 0.04, Math.sin((i / 5) * Math.PI * 2) * 0.27);
      chair.add(castor);
    }

    const operator = buildOperator();
    operator.position.set(seatAt, 0, deskZ);
    // Built facing +z like every other prop in this project, and turned to face
    // the desk, which is at -x.
    operator.rotation.y = -Math.PI / 2;
    group.add(operator);

    // One box for the pair of them, and no top: he is not something to stand
    // on. It butts up against the desk's, so between them the middle of the
    // console is closed off and you look at him from the side.
    solid(deskFront, seatAt + 0.4, deskZ - 0.46, deskZ + 0.46, {});
  }

  // ------------------------------------------------------------- machinery ---

  // Cabinets along the wall on your right coming in. Same kit repeated, because
  // that is what a rack room looks like, and one of them with its front off.
  const rackDepth = 0.66;
  const racks = [];
  for (let i = 0; i < 4; i++) {
    const rx = back + 1.15 + i * 0.78;
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.74, 2.05, rackDepth), caseMat);
    cabinet.position.set(rx, 1.025, minZ + rackDepth / 2);
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    group.add(cabinet);

    const open = i === 2;
    if (open) {
      // The one that is open: the panel is off and leaning on the next one, and
      // what is behind it is dark. Nothing modelled in there — an unlit cavity
      // reads as full of equipment and a modelled one reads as four boxes.
      const cavity = new THREE.Mesh(
        new THREE.PlaneGeometry(0.66, 1.86),
        new THREE.MeshStandardMaterial({ color: '#0c0e0b', roughness: 1 })
      );
      cavity.position.set(rx, 1.03, minZ + rackDepth + 0.002);
      cavity.rotation.y = Math.PI;
      group.add(cavity);
      const leaning = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.04), caseMat);
      leaning.position.set(rx + 0.62, 0.95, minZ + rackDepth + 0.24);
      leaning.rotation.set(-0.22, 0.1, 0.06);
      leaning.castShadow = true;
      group.add(leaning);
    } else {
      // Vent slots across the front, cut as separate strips: at this light a
      // drawn-on texture reads flat and a stack of thin boxes catches the lamp.
      for (let s = 0; s < 9; s++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.03, 0.02), trimMat);
        slot.position.set(rx, 0.5 + s * 0.14, minZ + rackDepth + 0.01);
        group.add(slot);
      }
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.2, 6), trimMat);
      handle.position.set(rx + 0.28, 1.72, minZ + rackDepth + 0.03);
      group.add(handle);
    }

    // And the lamps down the side of each one, which are the only thing in this
    // room that moves.
    const lamps = [];
    for (let l = 0; l < 6; l++) {
      const bulb = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.02, 0.014),
        lit(l % 3 === 0 ? '#2f6a2c' : '#1e4a1c')
      );
      bulb.position.set(rx - 0.3, 1.9 - l * 0.1, minZ + rackDepth + 0.012);
      group.add(bulb);
      lamps.push(bulb);
    }
    racks.push({ lamps, phase: i * 1.7 });
  }
  // Out as far as the panel leaning off the open one, not just as far as the
  // cabinet fronts — otherwise the one loose thing in the room is the one thing
  // you can walk through.
  solid(back + 0.75, back + 1.15 + 3 * 0.78 + 0.4, minZ, minZ + 1.15, {});

  // The plant on the other side: a compressor with a tank on top of it and its
  // pipework going up through the ceiling. This is the thing you can hear if
  // this game ever gets a hum.
  {
    const plantX = back + 2.6;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.0), caseMat);
    base.position.set(plantX, 0.575, maxZ - 0.5);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.7, 16), caseMat);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(plantX, 1.62, maxZ - 0.55);
    tank.castShadow = true;
    group.add(tank);
    for (const end of [-1, 1]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), caseMat);
      cap.position.set(plantX + end * 0.85, 1.62, maxZ - 0.55);
      cap.scale.x = 0.5;
      group.add(cap);
    }
    // Pipes up into the ceiling, and one running back along it toward the
    // console — a room whose machinery does not go anywhere is a room with
    // props in it.
    for (const [px, radius] of [[plantX - 0.62, 0.075], [plantX + 0.58, 0.055]]) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, HEIGHT - 2.04, 10),
        trimMat
      );
      pipe.position.set(px, 2.04 + (HEIGHT - 2.04) / 2, maxZ - 0.55);
      group.add(pipe);
    }
    const run = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, maxZ - minZ - 1.6, 10),
      trimMat
    );
    run.rotation.x = Math.PI / 2;
    run.position.set(plantX + 0.58, HEIGHT - 0.18, midZ - 0.2);
    group.add(run);
    // Gauge and lever on the front of it.
    const gauge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 12), trimMat);
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(plantX - 0.5, 0.92, maxZ - 1.01);
    group.add(gauge);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12), lit('#4a5340'));
    dial.position.set(plantX - 0.5, 0.92, maxZ - 1.04);
    dial.rotation.y = Math.PI;
    group.add(dial);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), trimMat);
    lever.position.set(plantX + 0.5, 1.05, maxZ - 1.05);
    lever.rotation.x = 0.5;
    group.add(lever);
    solid(plantX - 0.98, plantX + 0.98, maxZ - 1.05, maxZ, {});
  }

  // The cable tray, from the racks across the ceiling to the console, with the
  // cables that feed the desk dropping off the end of it.
  {
    // Centred on the room, not measured off one end: run off the rack wall it
    // came out through the far one by 0.6m, on the outside where there is
    // nothing to see it happen against.
    const trayLength = maxZ - minZ - 2.4;
    const trayZ = midZ - trayLength / 2;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, trayLength), trimMat);
    tray.position.set(back + 1.5, HEIGHT - 0.24, midZ);
    group.add(tray);
    // Landing wide of the middle, past the end of the television, because the
    // wall they used to run down is 3.8m of it now and a cable hanging across
    // that face is a cable across the one thing in the room you are looking at.
    for (const [side, drop] of [[-0.1, 0.5], [0.06, 0.62]]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(back + 1.5 + side, HEIGHT - 0.28, trayZ),
        new THREE.Vector3(back + 1.3 + side, HEIGHT - 0.28 - drop, deskZ + 1.4),
        new THREE.Vector3(back + 1.05 + side, 2.0, deskZ + 2.0),
        new THREE.Vector3(back + 0.95 + side, 1.0, deskZ + 2.1),
      ]);
      const cable = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.022, 6, false),
        new THREE.MeshStandardMaterial({ color: '#17191a', roughness: 0.9 })
      );
      group.add(cable);
    }
  }

  /** Inside the room at all — the doorway itself does not count. */
  const contains = (x, z) => x > back && x < front && z > minZ && z < maxZ;

  return {
    group,
    colliders,
    contains,

    /**
     * Just inside the door, facing the console — where the debug menu drops
     * you. Given by the room rather than worked out by the caller, like every
     * other entry in this game.
     */
    get entry() {
      return { position: [front - 1.1, 0, doorway.z], yaw: Math.PI / 2 };
    },

    reset() {
      entered = false;
    },

    update(delta) {
      const t = performance.now() / 1000;

      // The lamp is on its way out too, but slower than the hall's and without
      // the stutter — this one dips and comes back, like something is drawing
      // off the same supply.
      for (const fitting of fittings) {
        const want = 0.72 + 0.28 * Math.sin(t * 0.9) * Math.sin(t * 0.31);
        fitting.level += (want - fitting.level) * Math.min(1, delta * 3);
        fitting.lamp.intensity = 38 * fitting.level;
        fitting.tube.material.color.setScalar(0.3 + 0.5 * fitting.level);
      }

      // The screen breathes, and the rack lamps run. Nothing in this room is
      // interactive, so this is the entire difference between it and a
      // photograph of it.
      for (const monitor of monitors) {
        const flicker = 0.86 + 0.14 * Math.sin(t * 7.7) + 0.04 * Math.sin(t * 23.1);
        monitor.glass.material.color.setScalar(flicker);
      }
      // The face: breathing, blinking, watching. Always fully lit — the fade
      // the other two screens have is for a thing being switched on or going
      // out, and this one has been on the whole time.
      life.update(delta, 1);
      for (const rack of racks) {
        for (const [i, bulb] of rack.lamps.entries()) {
          const on = Math.sin(t * (1.3 + i * 0.37) + rack.phase) > (i % 2 ? 0.2 : 0.6);
          bulb.material.color.set(on ? '#3f8a39' : '#14300f');
        }
      }

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        // Said on the way in, before you are close enough to see what is at the
        // desk. The line is the suspicion; he is the answer to it.
        showNote('Somebody was in here the whole time.', 3.4);
      }
    },
  };
}
