import * as THREE from 'three';
import { makeEmployeeSignTexture, makeMetalPanelSurface } from './textures.js';

/**
 * The staff doors: the ones that are not for you.
 *
 * There is a building around this game that the game never goes into. You are
 * moved through it — a ward, a corridor, a hall with a spike wall in it, a room
 * with a television that talks — and every one of those places is somewhere you
 * were put. These are the doors the people who put you there use, and the only
 * thing they do is not open.
 *
 * Which is the point of building them. A level whose only doors are the ones
 * you go through is a level with exactly as much building as the player needs,
 * and it reads like a corridor with rooms bolted on. Five identical staff doors
 * in five different rooms say the opposite: that this floor is part of
 * something laid out by somebody who worked here, that it had a use before you
 * were in it, and that most of it is still going on somewhere you cannot get to.
 *
 * They are the same door every time, deliberately — same leaf, same plate, same
 * dead reader — because that sameness is the only thing that makes five props
 * in five rooms read as one building.
 *
 * And it is what the sixth one trades on. There is one in the hall behind the
 * orange door that is lying on the floor with a hole in the wall where it used
 * to be, and it is only worth anything because the other five held.
 *
 * They are scenery, and scenery is all they are: no prompt, no key, no reply.
 * They had a handle you could try at first, which rattled and told you it was
 * locked — and that turns each one into a thing to walk up to and use, five
 * times, for the same sentence. Everything this game asks you to press E on
 * does something. Making the doors answer put them in that category and then
 * had them refuse, which is worse than silence: a prompt is a promise. Read the
 * plate and keep walking.
 */

const WIDTH = 1.02;
const HEIGHT = 2.12;
/** How far the frame stands off the wall it is fixed to. */
const FRAME_DEPTH = 0.1;
const JAMB = 0.09;

/** Where the sign sits on the leaf — just above eye height, as they are. */
const SIGN_Y = 1.72;
const SIGN_WIDTH = 0.62;

/**
 * The hole in the wall one of these needs, for the one that has no leaf in it
 * any more.
 *
 * Given out rather than measured off the frame by the caller, because a wall
 * cut to a number somebody read off this file once is a wall that stops fitting
 * the frame the day the frame changes. The hall behind the orange door cuts its
 * side wall to exactly this.
 */
export const EMPLOYEE_OPENING = { width: WIDTH + JAMB * 2, height: HEIGHT + JAMB };

/**
 * How far back the dark goes behind that one.
 *
 * Longer than it needs to be to hide its own end, and that is the whole reason
 * for the number. At two metres the nearest ceiling lamp reached the back of it
 * and lit three walls and a floor: a cupboard, with a door lying in front of it.
 * Past three the light has fallen off before it gets there and what is through
 * the frame is a passage going somewhere the game does not.
 */
const RECESS = 3.2;
/** And how far off the floor the leaf that came out of it lies. */
const LYING = 0.012;

/** The kit every one of these is made of. */
function doorMaterials() {
  return {
    leafMat: new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(1, 2, '#39423f'),
      color: '#39423f',
      roughness: 0.62,
      metalness: 0.34,
    }),
    frameMat: new THREE.MeshStandardMaterial({
      color: '#2a302d',
      roughness: 0.55,
      metalness: 0.42,
    }),
    trimMat: new THREE.MeshStandardMaterial({
      color: '#5a625b',
      roughness: 0.4,
      metalness: 0.65,
    }),
  };
}

/**
 * The leaf and everything screwed to it: the panel, the handle, the kick plate
 * and the plate that says whose door it is.
 *
 * Built as its own group, standing where it hangs, so that the one lying on the
 * floor of the hall can be the same object turned over. That is the whole
 * reason this is separated out — a door knocked off its hinges has to be
 * recognisably the door you have walked past four times, and the only way to
 * guarantee that is for it to be built by the same lines of code.
 *
 * `face` is how far in front of the wall plane the leaf hangs. Everything on it
 * is measured off that rather than off zero, so the fittings travel with it.
 */
function buildLeaf({ leafMat, frameMat, trimMat }, face) {
  const group = new THREE.Group();

  // The leaf, set back inside its frame so the frame reads as a way through the
  // wall rather than a panel screwed onto it.
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, 0.07), leafMat);
  leaf.position.set(0, HEIGHT / 2, face + 0.035);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  group.add(leaf);

  // Lever handle: an escutcheon, a knuckle standing off it, and the bar.
  //
  // Three pieces rather than two, and the escutcheon in the frame's colour
  // rather than the bright trim. Built flat — a pale plate with a bar across
  // the middle of it — it read at a glance as a plus sign painted on the door
  // rather than as something you could take hold of. What fixes it is depth and
  // contrast: the bar has to stand off its plate and be the only bright thing.
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.015), frameMat);
  plate.position.set(WIDTH / 2 - 0.12, 1.02, face + 0.078);
  group.add(plate);
  const knuckle = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 10), trimMat);
  knuckle.rotation.x = Math.PI / 2;
  knuckle.position.set(WIDTH / 2 - 0.12, 1.02, face + 0.105);
  group.add(knuckle);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.16, 8), trimMat);
  lever.rotation.z = Math.PI / 2;
  // Sloping down and away from the knuckle, the way a lever hangs.
  lever.rotation.y = 0.12;
  lever.position.set(WIDTH / 2 - 0.2, 0.995, face + 0.122);
  group.add(lever);

  // Kick plate along the bottom, scuffed brighter than the leaf because that is
  // the one part of a door like this that gets touched every day.
  const kick = new THREE.Mesh(new THREE.BoxGeometry(WIDTH - 0.08, 0.3, 0.012), trimMat);
  kick.position.set(0, 0.2, face + 0.075);
  group.add(kick);

  // The plate.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(SIGN_WIDTH, SIGN_WIDTH * (168 / 512)),
    new THREE.MeshStandardMaterial({
      map: makeEmployeeSignTexture(),
      roughness: 0.5,
      metalness: 0.1,
    })
  );
  sign.position.set(0, SIGN_Y, face + 0.073);
  group.add(sign);

  return group;
}

/**
 * The frame: a jamb down each side and a head across the top.
 *
 * No threshold: a strip of metal across the floor is the first thing a player
 * catches their eye on and it would be the only part of this they ever get
 * close to.
 */
function buildFrame({ frameMat }, frameDeep) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(JAMB, HEIGHT + JAMB, frameDeep),
      frameMat
    );
    jamb.position.set(side * (WIDTH + JAMB) / 2, (HEIGHT + JAMB) / 2, frameDeep / 2);
    jamb.castShadow = true;
    group.add(jamb);
  }
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH + JAMB * 2, JAMB, frameDeep),
    frameMat
  );
  head.position.set(0, HEIGHT + JAMB / 2, frameDeep / 2);
  head.castShadow = true;
  group.add(head);
  return group;
}

/**
 * The badge reader beside the handle: a dark slab with one light on it.
 *
 * Fixed to the wall rather than to the leaf, which is why the fallen door still
 * has one. The light stays as it is, dull and red and doing nothing. It used to
 * blink when you tried a door and it is better as a thing that never changes —
 * something left on in a building where most things are not, which is a detail
 * you notice rather than a response you triggered.
 */
function buildReader({ frameMat }, face) {
  const group = new THREE.Group();
  const reader = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.05), frameMat);
  reader.position.set(WIDTH / 2 + JAMB + 0.13, 1.18, face + 0.06);
  group.add(reader);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.017, 8, 6),
    // toneMapped off: at this size it has to be a light rather than a red dot,
    // and ACES turns an authored red into a pink smudge.
    new THREE.MeshBasicMaterial({ color: '#5e0f0c', toneMapped: false })
  );
  lamp.position.set(WIDTH / 2 + JAMB + 0.13, 1.23, face + 0.088);
  group.add(lamp);
  return group;
}

/**
 * One staff door, standing on a wall.
 *
 * `facing` is the yaw that turns it to face into the room — the whole thing is
 * built facing +z, like every other prop in this project, and the caller says
 * which way is out of the wall.
 *
 * Nothing here is a collider. The door stands a tenth of a metre off a wall
 * that already stops you, and the player's own radius is four times that, so
 * there is nothing to walk into: adding boxes for these would be five more
 * chances to wedge the bucket for no gain.
 */
export function createEmployeeDoor({ scene, x, z, facing = 0, y = 0, standoff = 0 }) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = facing;
  scene.add(group);

  // How far the leaf sits in front of the wall plane, and how deep the frame
  // has to be to reach back to it.
  //
  // Zero on a bare wall. The room you wake up in has a skirting rail running
  // the length of both long walls that stands 12cm out — further out than this
  // leaf does — so a door flat on that wall gets a rail cutting across the
  // bottom of it. Standing the leaf clear and deepening the frame to follow it
  // back puts the rail behind the frame, where it reads as dying into it, which
  // is what a skirting board does when it meets a door.
  const face = standoff;
  const frameDeep = FRAME_DEPTH + standoff;

  const materials = doorMaterials();
  group.add(buildFrame(materials, frameDeep));
  group.add(buildLeaf(materials, face));
  group.add(buildReader(materials, face));

  // Hinges, on the side the handle is not.
  for (const hy of [0.36, HEIGHT - 0.36]) {
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8),
      materials.trimMat
    );
    hinge.position.set(-WIDTH / 2 - 0.01, hy, face + 0.05);
    group.add(hinge);
  }

  // Only the group: there is nothing to drive and nothing to press. The caller
  // wants it for the render layer, which is the one thing about a staff door
  // that depends on which room it is standing in.
  return { group };
}

/**
 * The one that is not standing any more: an empty frame, the dark behind it,
 * and the leaf face-up on the floor in front of it.
 *
 * It only works because the other five exist. Four rooms of walking past a shut
 * grey door that says EMPLOYEES ONLY is what makes this one mean anything —
 * every one of those held, and this one is lying down, in the hall where
 * everybody died. The player has been reading that plate all game from a metre
 * away; here they read it from above, off the floor, which is the same sentence
 * in a much worse tense.
 *
 * Which way it went matters and is the one thing to get right: the leaf is out
 * in the hall, not folded back into the doorway. It was not opened. Something
 * came through it, outwards, into the corridor with the people in it.
 *
 * Where it landed is given in the frame's own terms — `out` in front of the
 * wall, `aside` along it toward the handle side, `slew` turned off square — and
 * all three of them are really one decision, which is which way up the plate
 * ends up. Text on the floor is only the right way up to somebody it points
 * away from. Laid straight out from its frame the door lies across the corridor
 * and the plate faces the wall it came out of, so the one person who ever reads
 * it — somebody walking down the hall — reads it upside down. Turned to lie
 * down the hall instead, it faces them.
 */
export function createFallenEmployeeDoor({
  scene,
  x,
  z,
  facing = 0,
  slew = 0,
  out = 0.3,
  aside = 0,
}) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = facing;
  scene.add(group);

  const materials = doorMaterials();
  group.add(buildFrame(materials, FRAME_DEPTH));
  // Still armed, on a door that no longer exists. Nobody came to turn it off.
  group.add(buildReader(materials, 0));

  // The hinges it tore off, still on the jamb and bent out of line. The top one
  // further than the bottom, because that is the one that goes last.
  for (const [hy, bend, twist] of [[0.36, 0.22, 0.16], [HEIGHT - 0.36, -0.64, 0.5]]) {
    const hinge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8),
      materials.trimMat
    );
    hinge.position.set(-WIDTH / 2 - 0.01, hy, 0.05);
    hinge.rotation.set(twist, 0, bend);
    group.add(hinge);
  }

  // What is behind it: a stub of somewhere else, unlit.
  //
  // The player never gets in here — the wall this is cut into still stops them
  // a stride short of the opening — so the whole job of it is to give the light
  // in the room a floor and two sides to die on. Five planes rather than a box,
  // because a box has a front face and the front face is the doorway.
  const recess = new THREE.Group();
  group.add(recess);
  const { width: OPEN_W, height: OPEN_H } = EMPLOYEE_OPENING;
  const inside = new THREE.MeshStandardMaterial({
    color: '#0f120f',
    roughness: 0.98,
    metalness: 0,
  });
  const back = new THREE.MeshStandardMaterial({ color: '#040504', roughness: 1, metalness: 0 });
  for (const [w, h, px, py, pz, rx, ry] of [
    [OPEN_W, OPEN_H, 0, OPEN_H / 2, -RECESS, 0, 0],                                  // the end of it
    [RECESS, OPEN_H, -OPEN_W / 2, OPEN_H / 2, -RECESS / 2, 0, Math.PI / 2],          // sides
    [RECESS, OPEN_H, OPEN_W / 2, OPEN_H / 2, -RECESS / 2, 0, -Math.PI / 2],
    [OPEN_W, RECESS, 0, 0.004, -RECESS / 2, -Math.PI / 2, 0],                        // floor
    [OPEN_W, RECESS, 0, OPEN_H, -RECESS / 2, Math.PI / 2, 0],                        // and lid
  ]) {
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      pz === -RECESS ? back : inside
    );
    panel.position.set(px, py, pz);
    panel.rotation.set(rx, ry, 0);
    // Not the wall, and not a fitting on it: a hole. Without this the stripe
    // reads the far side of the recess as a surface at the wall plane and
    // paints its three colours straight across the opening.
    panel.userData.notWall = true;
    recess.add(panel);
  }

  // And the leaf, face-up on the floor where it landed.
  //
  // The turn is the whole of it: built hanging, it is taken over forwards and
  // then over again onto its back, so the plate faces the ceiling and the top
  // of the door points away from the wall. Face-down would have been one
  // rotation instead of two and would have thrown away the only reason to put
  // it here — the sign has to be readable from standing.
  // `out` and `aside` are both put on the group the slew turns, and not on the
  // leaf inside it, so that they mean what they say. Carried on the leaf they
  // are measured along the leaf's own turned axes instead of the wall's: at a
  // seventy-degree slew half a metre of clearance became a fifth of one and the
  // near corner of the door was buried in the wall it came out of.
  const fallen = new THREE.Group();
  fallen.position.set(aside, 0, out);
  fallen.rotation.y = slew;
  group.add(fallen);
  const leaf = buildLeaf(materials, 0);
  leaf.rotation.set(Math.PI / 2, Math.PI, 0);
  leaf.position.set(0, LYING, 0);
  fallen.add(leaf);

  return { group };
}
