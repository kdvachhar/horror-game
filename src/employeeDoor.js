import * as THREE from 'three';
import { makeEmployeeSignTexture, makeMetalPanelSurface } from './textures.js';
import { showNote } from './hud.js';
import { playLockedDoor } from './audio.js';

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
 * Locked, permanently, with no puzzle behind them and nothing on the other
 * side. Trying one rattles the handle, blinks the badge reader red, and says
 * so. A player who tries the second one already knows what will happen, and
 * that is the intended experience of them: they are scenery that answers.
 */

const WIDTH = 1.02;
const HEIGHT = 2.12;
/** How far the frame stands off the wall it is fixed to. */
const FRAME_DEPTH = 0.1;
const JAMB = 0.09;

/** Where the sign sits on the leaf — just above eye height, as they are. */
const SIGN_Y = 1.72;
const SIGN_WIDTH = 0.62;

/** How long the reader stays red after it turns you down. */
const DENY_SECONDS = 1.1;

/**
 * Every door built, so one call from the loop can pulse whichever one has just
 * been tried. The same arrangement the wire uses, and for the same reason:
 * these are scattered across five rooms and belong to none of them.
 */
const doors = [];

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

  const leafMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(1, 2, '#39423f'),
    color: '#39423f',
    roughness: 0.62,
    metalness: 0.34,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: '#2a302d',
    roughness: 0.55,
    metalness: 0.42,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: '#5a625b',
    roughness: 0.4,
    metalness: 0.65,
  });

  // The leaf, set back inside its frame so the frame reads as a way through the
  // wall rather than a panel screwed onto it.
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH, HEIGHT, 0.07),
    leafMat
  );
  leaf.position.set(0, HEIGHT / 2, face + 0.035);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  group.add(leaf);

  // Jambs down each side and a head across the top. No threshold: a strip of
  // metal across the floor is the first thing a player catches their eye on and
  // it would be the only part of this they ever get close to.
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

  // Hinges, on the side the handle is not.
  for (const hy of [0.36, HEIGHT - 0.36]) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), trimMat);
    hinge.position.set(-WIDTH / 2 - 0.01, hy, face + 0.05);
    group.add(hinge);
  }

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

  // The badge reader beside the handle: a dark slab with one light on it, which
  // is the only part of any of this that is still powered.
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

  const door = {
    group,
    lamp,
    /** Counts down while the reader is showing red. */
    denied: 0,
  };
  doors.push(door);

  /**
   * Where the prompt hangs, and where the player has to be to get it: out in
   * front of the leaf at handle height, not at the door's origin, which is on
   * the floor inside the wall.
   */
  const at = new THREE.Vector3(
    x + Math.sin(facing) * (face + 0.3),
    y + 1.15,
    z + Math.cos(facing) * (face + 0.3)
  );

  return {
    group,
    interaction: {
      position: at,
      label: 'Try the door',
      range: 2.2,
      once: false,
      onInteract() {
        door.denied = DENY_SECONDS;
        playLockedDoor(0.9);
        showNote('Locked. Employees only.', 2.2);
      },
    },
  };
}

/**
 * Pulse whichever readers have just turned somebody down.
 *
 * Costs nothing while nobody is trying a door, which is almost all of the time:
 * with none of them denied this returns on the first line.
 */
export function updateEmployeeDoors(delta) {
  for (const door of doors) {
    if (door.denied <= 0) continue;
    door.denied = Math.max(0, door.denied - delta);
    // Two hard blinks rather than a fade — a reader saying no is a square wave,
    // and a smooth decay would read as the door thinking about it.
    const on = door.denied > 0 && Math.floor(door.denied * 6) % 2 === 1;
    door.lamp.material.color.set(on ? '#ff2a1e' : '#5e0f0c');
  }
}
