import * as THREE from 'three';
import { makeMetalPanelSurface, metalRepeat, makeHazardSurface } from './textures.js';
import { playButtonPress, playWardDoor } from './audio.js';

/**
 * A door that will not open for one body.
 *
 * Two plates on the floor, one each side of it, and it lifts when both are
 * stood on at the same moment. There are exactly two bodies in this game and
 * you can only be driving one of them, so "at the same moment" is the whole
 * lock: you park yourself on one, press F, walk the bucket to the other, and
 * the door goes up while you are watching it from the wrong body.
 *
 * Nothing here checks *which* body is on which plate, and that is deliberate
 * rather than unfinished. There are two plates and two bodies; a rule saying
 * the bucket takes the left one would be a rule you could get wrong, and
 * getting it wrong would look exactly like the door being broken. The count
 * is the puzzle.
 *
 * **It latches.** Once both plates have been down together the door stays up.
 * A door that shut again when you stepped off would be a door nobody could
 * ever walk through — whichever body you moved first would close it — so the
 * alternative to latching is not a harder puzzle, it is no puzzle. The
 * gauntlet's plates learned the same thing for a nearly identical reason; see
 * the note on `switchOn` in gauntlet.js.
 *
 * Not orientable. Like every other room in this project it is built for the
 * one wall it is in: the opening faces -x, the room is at -x of it, and the
 * plates sit in front of it on that side. See the top of controlRoom.js for
 * why none of these are written to turn round.
 */

/** The plates. Proud by less than either body's free step — see `proud`. */
const PLATE = {
  size: 1.2,
  /**
   * Low enough that neither body has to think about it.
   *
   * The bucket steps 0.25 for free and you step 0.9, so anything under 0.25
   * is flat ground to both. It is 0.06 because the lock is "stand here" and
   * a lip you have to hop is a different instruction — the pads at the window
   * are 0.6 up on purpose and that is the one place in this room where
   * getting onto a thing is meant to be work.
   */
  proud: 0.06,
  /** How far out from the wall, and how far off the opening's edge. */
  out: 0.95,
  gap: 0.55,
};

/**
 * How the door moves, and sideways is not a style choice.
 *
 * It wanted to lift, the way every other shutter in this game does. It does
 * not fit: the room is 3.4 from floor to ceiling and the opening is 2.2, so
 * there is 1.2 of head over it and a leaf needs its whole height to clear.
 * Lifting put the top of it a metre through the ceiling slab — invisible,
 * because nobody can be above that ceiling, and wrong for exactly as long as
 * that stays true.
 *
 * Sideways it has somewhere to go. The wall it is in runs 4.65 past the jamb
 * on the -z side, and the leaf sits inside the wall's own thickness, so
 * sliding it that way parks it behind solid wall where the room cannot see
 * it. `over` is the travel: the opening's width plus enough that the trailing
 * edge is past the jamb rather than level with it.
 */
const LEAF = { thick: 0.16, speed: 1.6, over: 0.15 };

/**
 * @param parent    what to hang it on, so it moves with the room
 * @param colliders the world's collider list
 * @param x         the room-side face of the wall it is in
 * @param y         the floor it stands on
 * @param z         the middle of the opening
 * @param width     the opening, across
 * @param height    the opening, up
 * @param thick     the wall it is set into, so the leaf is hidden when shut
 * @param bodies    () => positions to test for standing on a plate
 * @param onOpen    called once, the frame the pair is first complete
 */
export function createPairDoor({
  parent,
  colliders,
  x,
  y,
  z,
  width,
  height,
  thick = 0.3,
  bodies,
  onOpen,
}) {
  const group = new THREE.Group();
  parent.add(group);

  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(width, height), '#4e4a42'),
    metalness: 0.55,
    roughness: 0.55,
  });
  const dark = new THREE.MeshStandardMaterial({ color: '#23251f', roughness: 0.85, metalness: 0.3 });

  // ------------------------------------------------------------- the leaf ---

  const leaf = new THREE.Group();
  group.add(leaf);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(LEAF.thick, height, width), steel);
  slab.position.set(x + thick / 2, y + height / 2, z);
  slab.castShadow = true;
  slab.receiveShadow = true;
  leaf.add(slab);

  // Ribs, for the same reason the gauntlet's shutters have them: a flat slab
  // moving is almost impossible to read as moving, and this one moves while
  // you are looking at it from across the room through a body you are not
  // used to being short in.
  for (let v = 0.3; v < height - 0.12; v += 0.42) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(LEAF.thick + 0.03, 0.055, width - 0.08), dark);
    rib.position.set(x + thick / 2, y + v, z);
    leaf.add(rib);
  }

  /**
   * The frame, and it is trim on the room's face rather than a box in the
   * hole.
   *
   * Thin, and standing 0.04 proud of the wall, because the leaf has to pass
   * behind it. A jamb built at the middle of the wall's thickness — where the
   * leaf is — is a jamb the leaf drives through on its way open.
   */
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, width + 0.32), dark);
  trim.position.set(x - 0.04, y + height + 0.07, z);
  group.add(trim);

  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.08, height + 0.14, 0.16), dark);
    jamb.position.set(x - 0.04, y + (height + 0.14) / 2, z + side * (width / 2 + 0.08));
    group.add(jamb);
  }

  /**
   * And the leaf as a thing you cannot walk through, gated rather than added
   * and removed.
   *
   * `enabled` and not splicing the array, because the two bodies hold a
   * reference to the collider list and it has to keep its identity — the same
   * rule the hall's doorway is built on. It carries a `bottom` for the reason
   * every prop on this floor does: without one it would be solid at every
   * height below itself as well, which is a slab of steel standing in the
   * rooms underneath. See liftTower.js, which learned it the expensive way.
   */
  colliders.push({
    minX: x,
    maxX: x + thick,
    minZ: z - width / 2,
    maxZ: z + width / 2,
    bottom: y,
    top: y + height,
    enabled: () => lift < 0.01,
  });

  // ----------------------------------------------------------- the plates ---

  const plates = [];
  for (const side of [-1, 1]) {
    const pz = z + side * (width / 2 + PLATE.gap + PLATE.size / 2);
    const px = x - PLATE.out - PLATE.size / 2;

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(PLATE.size, PLATE.proud, PLATE.size),
      new THREE.MeshStandardMaterial({
        ...makeHazardSurface(2, 2),
        roughness: 0.78,
        metalness: 0.1,
      })
    );
    pad.position.set(px, y + PLATE.proud / 2, pz);
    pad.receiveShadow = true;
    group.add(pad);

    for (const [w, d, ox, oz] of [
      [PLATE.size, 0.06, 0, PLATE.size / 2],
      [PLATE.size, 0.06, 0, -PLATE.size / 2],
      [0.06, PLATE.size, PLATE.size / 2, 0],
      [0.06, PLATE.size, -PLATE.size / 2, 0],
    ]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(w, PLATE.proud + 0.03, d), dark);
      rim.position.set(px + ox, y + PLATE.proud / 2, pz + oz);
      group.add(rim);
    }

    /**
     * A plane that carries its own colour rather than a light.
     *
     * The same answer this building gives every time something has to be
     * findable in the dark — the refuges, the handovers — and for the same
     * reason: there are sixty-two forward-rendered lights in this scene
     * already and two more for two floor plates would be the most expensive
     * decoration in the game. Green when it is down, so that from the window
     * you can see which of the two you have not solved yet.
     */
    const lamp = new THREE.Mesh(
      new THREE.PlaneGeometry(PLATE.size * 0.72, 0.08),
      new THREE.MeshBasicMaterial({ color: '#5a1e16', toneMapped: false })
    );
    lamp.rotation.x = -Math.PI / 2;
    lamp.position.set(px, y + PLATE.proud + 0.005, pz + PLATE.size / 2 - 0.14);
    group.add(lamp);

    colliders.push({
      minX: px - PLATE.size / 2,
      maxX: px + PLATE.size / 2,
      minZ: pz - PLATE.size / 2,
      maxZ: pz + PLATE.size / 2,
      top: y + PLATE.proud,
      bottom: y,
    });

    plates.push({
      lamp,
      on: false,
      minX: px - PLATE.size / 2,
      maxX: px + PLATE.size / 2,
      minZ: pz - PLATE.size / 2,
      maxZ: pz + PLATE.size / 2,
      at: { x: px, y: y + PLATE.proud, z: pz },
    });
  }

  const padTop = y + PLATE.proud;
  /** Feet on it, not merely over or under it — the pads at the window's rule. */
  const stoodOn = (plate, here) =>
    here.x > plate.minX - 0.12 &&
    here.x < plate.maxX + 0.12 &&
    here.z > plate.minZ - 0.12 &&
    here.z < plate.maxZ + 0.12 &&
    here.y > padTop - 0.05 &&
    here.y < padTop + 0.25;

  let latched = false;
  let lift = 0;
  /**
   * Shut and held shut, over the top of the latch.
   *
   * The latch exists so the door cannot be closed by stepping off a plate —
   * see the note at the top of this file. `jammed` is the one thing allowed
   * to overrule it, and it is not a puzzle state: it is for the moment the
   * building decides you are not going back that way. It leaves `latched`
   * alone, so releasing it puts the door back up without asking the two of
   * you to stand on the plates again.
   */
  let jammed = false;

  return {
    group,

    /** Where to stand, for a harness and for whatever wires this up. */
    get plates() {
      return plates.map((p) => ({ ...p.at, on: p.on }));
    },

    /** Whether the pair has ever been complete. The door is up iff this is. */
    get isOpen() {
      return latched;
    },

    /** How far up the leaf actually is, nought to one, for a harness. */
    get travel() {
      return +lift.toFixed(3);
    },

    /** The opening, for whatever gets built on the other side of it. */
    get wayOn() {
      return { x: x + thick, y, z, width, height };
    },

    /** Whether it has been shut over the top of its own latch. */
    get isJammed() {
      return jammed;
    },

    /** Down, now, and it stays down until something releases it. */
    slam() {
      if (jammed) return;
      jammed = true;
      lift = 0;
      leaf.position.z = 0;
      playWardDoor();
    },

    /** And back to wherever the latch had left it. */
    release() {
      if (!jammed) return;
      jammed = false;
      if (latched) {
        lift = 1;
        leaf.position.z = -(width + LEAF.over);
      }
    },

    reset() {
      latched = false;
      lift = 0;
      jammed = false;
      leaf.position.z = 0;
      for (const plate of plates) {
        plate.on = false;
        plate.lamp.material.color.set('#5a1e16');
      }
    },

    update(delta) {
      const here = bodies?.() ?? [];
      let down = 0;
      for (const plate of plates) {
        const on = here.some((body) => body && stoodOn(plate, body));
        // The edge, so arriving says so once rather than sixty times a second.
        if (on && !plate.on) playButtonPress(0.8);
        plate.on = on;
        if (on) down++;
        plate.lamp.material.color.set(on ? '#2e8c3a' : '#5a1e16');
      }

      if (!latched && down === plates.length) {
        latched = true;
        playWardDoor();
        onOpen?.();
      }

      if (latched && !jammed && lift < 1) {
        lift = Math.min(1, lift + delta * LEAF.speed);
        leaf.position.z = -lift * (width + LEAF.over);
      }
    },
  };
}
