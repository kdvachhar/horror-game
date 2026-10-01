import * as THREE from 'three';
import { makeMetalPanelSurface, makeHazardSurface, makeDigitTexture, metalRepeat } from './textures.js';
import { playButtonPress } from './audio.js';

/**
 * The numbered treads at the window: a stage with four big pads on it, pressed
 * by standing on them.
 *
 * This was a panel on a wall with four buttons you pressed by looking at them
 * and holding E, and that was the wrong machine for this room. E is what the
 * *player* does, and the player is never up here — the only body that can reach
 * this floor is the bucket, seventy-two metres up a hoist it drove itself. A
 * puzzle whose input is an interaction prompt is a puzzle for a body that is
 * somewhere else.
 *
 * So the input is the bucket's own weight. The pads are floor, they are big
 * enough to stand on, and standing on one is the whole of pressing it. The
 * bucket steps 0.25 for free and hops 1.15, so a stage at 0.6 is past the first
 * number and well inside the second: it cannot be walked onto and it cannot be
 * missed. Getting up there is a jump you have to mean.
 *
 * That turns a keypad into somewhere you go. The order is a path across a
 * platform rather than four presses from one spot, walking off the end is a
 * mistake you can make, and the whole of it happens in front of the window —
 * which is the one thing in this room worth standing near, and now the thing
 * you are standing on the edge of while you work.
 *
 * What they drive is the tall room on the other side of the glass: pad 3 runs
 * that room's third wall out and the rest of them back in. See main.js for the
 * wire and tallRoom.js for what arrives. `sequence` is still the other output —
 * the last few presses, which nothing reads yet.
 *
 * And this floor is as far as the bucket goes. One pane of the window is out
 * and there is a gangway on the other side of it, but that is not the bucket's
 * — see liftTower.js, which puts a collider across the bay that only the
 * bucket can feel. What it does here is press, and then watch what it did
 * through ten metres of glass, which is the whole of its part: the body that
 * changes the far room is the one body that cannot go into it.
 */

/** The stage. `rise` is the number doing the work — see the note above. */
const STAGE = { deep: 1.4, rise: 0.6, lip: 0.06 };
/** The pads on it, square, proud of the deck by a step the bucket gets free. */
const PAD = { size: 1.15, proud: 0.08, pitch: 1.7 };
/** How long a press stays lit after the body steps off. */
const PRESS = { lit: 0.9 };
/** Presses kept. Enough for any lock worth building; short enough to be a hint. */
const MEMORY = 8;

/**
 * @param parent    what to hang it on — the room's group, so it moves with it
 * @param colliders the world's collider list; the stage and pads are floor
 * @param x         the near edge of the stage; it runs from here towards +x
 * @param y         the floor it stands on
 * @param z         the middle of the run
 * @param labels    the pads, in the order they are laid out along +z to -z
 * @param bodies    () => positions to test for standing on a pad
 * @param onPress   (label, sequence) when a body arrives on a pad
 */
export function createControlPanel({
  parent,
  colliders,
  x,
  y,
  z,
  labels = ['1', '2', '3', '4'],
  bodies,
  onPress,
}) {
  const group = new THREE.Group();
  parent.add(group);

  const RUN = PAD.pitch * (labels.length - 1) + PAD.size + 0.5;
  const deckTop = y + STAGE.rise;
  const padTop = deckTop + PAD.proud;
  const midX = x + STAGE.deep / 2;

  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(RUN, STAGE.deep), '#4a4d45'),
    metalness: 0.6,
    roughness: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#212319', roughness: 0.85, metalness: 0.3 });

  // The stage itself, and legs under it rather than a solid block: a box on a
  // floor is a box, and four legs with a shadow under them is a thing that was
  // carried in and stood up. It is also the only way the bucket can see that
  // there is nothing beneath it to catch a missed jump.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(STAGE.deep, 0.12, RUN), steel);
  deck.position.set(midX, deckTop - 0.06, z);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, STAGE.rise, 0.1), dark);
      leg.position.set(midX + dx * (STAGE.deep / 2 - 0.14), y + STAGE.rise / 2, z + dz * (RUN / 2 - 0.2));
      leg.castShadow = true;
      group.add(leg);
    }
  }

  // A hazard edge along the window side of the deck. It is a drop on that side
  // and the room already says "edge" in this language — the landing has it and
  // so does the cill.
  const edge = new THREE.Mesh(
    new THREE.PlaneGeometry(RUN, 0.3),
    new THREE.MeshStandardMaterial({ ...makeHazardSurface(Math.round(RUN), 1), metalness: 0.1, roughness: 0.8 })
  );
  edge.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  edge.position.set(x + 0.16, deckTop + 0.007, z);
  group.add(edge);

  const pads = [];
  const sequence = [];

  labels.forEach((label, i) => {
    // Laid out from +z, which is the end the landing is at: the bucket comes in
    // off the hoist, turns at the window, and 1 is the pad nearest to it.
    const pz = z + (RUN - PAD.size - 0.5) / 2 - i * PAD.pitch;

    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(PAD.size, PAD.proud, PAD.size),
      new THREE.MeshStandardMaterial({
        map: makeDigitTexture(label),
        roughness: 0.72,
        metalness: 0.28,
      })
    );
    plate.position.set(midX, deckTop + PAD.proud / 2, pz);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    // A rim round each one, so where a pad ends is visible from on top of it —
    // standing on a pad you are looking down at a metre of plate and nothing
    // else, and the pads are what the puzzle is counted in.
    for (const [w, d, ox, oz] of [
      [PAD.size, 0.05, 0, PAD.size / 2],
      [PAD.size, 0.05, 0, -PAD.size / 2],
      [0.05, PAD.size, PAD.size / 2, 0],
      [0.05, PAD.size, -PAD.size / 2, 0],
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, PAD.proud + 0.03, d), dark);
      rim.position.set(midX + ox, deckTop + PAD.proud / 2, pz + oz);
      group.add(rim);
    }

    // The lamp, and it is a plane and not a light. Sixty-two lights shade every
    // surface in this scene already; four more for four pads in one room would
    // be the most expensive decoration in the game.
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(PAD.size * 0.82, 0.09),
      new THREE.MeshBasicMaterial({ color: '#2a1512', toneMapped: false })
    );
    lamp.rotation.x = -Math.PI / 2;
    lamp.position.set(midX, deckTop + PAD.proud + 0.004, pz + PAD.size / 2 - 0.12);
    group.add(lamp);

    pads.push({
      label,
      lamp,
      minX: midX - PAD.size / 2,
      maxX: midX + PAD.size / 2,
      minZ: pz - PAD.size / 2,
      maxZ: pz + PAD.size / 2,
      held: 0,
      on: false,
    });
  });

  /**
   * The stage as floor, and every box of it carries a `bottom`.
   *
   * This stands on a floor seventy-two metres up over rooms the bucket walks
   * through, and a box with a `top` and no `bottom` is solid at every height
   * *below* it — this would be four steel columns standing in the chamber, the
   * tower and the hall at once. Every prop on this floor carries one. See
   * liftTower.js, which learned it the expensive way.
   *
   * The deck is one box and each pad is another sitting 0.08 proud of it. That
   * 0.08 is under the bucket's free step, so once it is up there the pads are
   * flat ground; the 0.6 to the deck is not, which is the point.
   */
  if (colliders) {
    colliders.push({
      minX: x,
      maxX: x + STAGE.deep,
      minZ: z - RUN / 2,
      maxZ: z + RUN / 2,
      top: deckTop,
      bottom: y,
    });
    for (const pad of pads) {
      colliders.push({
        minX: pad.minX,
        maxX: pad.maxX,
        minZ: pad.minZ,
        maxZ: pad.maxZ,
        top: padTop,
        bottom: y,
      });
    }
  }

  let handler = onPress;
  const press = (pad) => {
    sequence.push(pad.label);
    if (sequence.length > MEMORY) sequence.shift();
    playButtonPress(0.85);
    handler?.(pad.label, [...sequence]);
  };

  /** Is a body standing on this pad? Feet on it, not merely over or under it. */
  const stoodOn = (pad, here) =>
    here.x > pad.minX - 0.12 &&
    here.x < pad.maxX + 0.12 &&
    here.z > pad.minZ - 0.12 &&
    here.z < pad.maxZ + 0.12 &&
    // Feet *on* it. The deck is 0.08 below a pad's face, so a body standing
    // beside one on the bare deck must not read as standing on it, and a body
    // hopping over it must not either.
    here.y > padTop - 0.05 &&
    here.y < padTop + 0.25;

  return {
    group,
    /** Nothing to press with E any more. The pads are the input. */
    interactions: [],
    /**
     * What the pads drive, bound late.
     *
     * The thing they drive is the tall room, and the tall room is built after
     * this is — it needs the window this room owns before it can cut its own
     * side of it. So the wiring is handed over once both exist rather than
     * passed in at construction, which would mean building them in an order
     * neither of them wants. See main.js.
     */
    wireTo(fn) {
      handler = fn;
    },
    /** The last few presses, oldest first. Whatever gets wired to this reads it. */
    get sequence() {
      return [...sequence];
    },
    /** Which pads have something standing on them, for a harness. */
    get lit() {
      return pads.filter((pad) => pad.on).map((pad) => pad.label);
    },
    /** Where to stand on one, for a harness and for whatever wires it up. */
    padAt(label) {
      const pad = pads.find((p) => p.label === label);
      return pad && { x: (pad.minX + pad.maxX) / 2, y: padTop, z: (pad.minZ + pad.maxZ) / 2 };
    },
    reset() {
      sequence.length = 0;
      for (const pad of pads) {
        pad.held = 0;
        pad.on = false;
        pad.lamp.material.color.set('#2a1512');
      }
    },
    update(delta) {
      const here = bodies?.() ?? [];
      for (const pad of pads) {
        const on = here.some((body) => body && stoodOn(pad, body));
        // The edge, not the state: a pad fires when something arrives on it.
        // Held down it would fire sixty times a second, and a sequence you can
        // only enter by hopping is a sequence nobody enters.
        if (on && !pad.on) press(pad);
        pad.on = on;
        if (on) pad.held = PRESS.lit;
        else if (pad.held > 0) pad.held = Math.max(0, pad.held - delta);

        const glow = on ? 1 : pad.held > 0 ? pad.held / PRESS.lit : 0;
        pad.lamp.material.color.setRGB(0.16 + 0.74 * glow, 0.08 + 0.24 * glow, 0.07 + 0.14 * glow);
      }
    },
  };
}
