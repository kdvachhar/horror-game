import * as THREE from 'three';

/**
 * Every lamp in the building, drawn by twenty-four of them.
 *
 * **This is the single biggest thing in this project's frame.** Measured at
 * 1512 x 850 with the pixel ratio pinned at 1, median frame interval, by
 * switching this file off and on mid-run:
 *
 *                      every lamp   pooled    mean luminance
 *   the first hall        36.9ms     23.4ms      +4.0%
 *   the red hall          69.9ms     25.2ms      -0.6%
 *   the giant hall        74.4ms     24.4ms      +2.2%
 *   the medical room      33.7ms     16.6ms      +0.2%
 *   the splits            70.1ms     16.7ms       0.0%
 *
 * Between one and a half and four times faster for the same picture — the
 * luminance column is the mean brightness of the frame read back off the
 * buffer, and what is left of it is the building's own flickering.
 *
 * Before this, every scene in the game sat on the bottom step of the adaptive
 * resolution — 0.6, the softest it can draw — and still missed sixty. That is
 * what "the game is lagging a lot" was. See also `tuneResolution` in main.js,
 * which could only ever walk that number *down*, for the other half of it.
 *
 * The reason is that three.js's forward renderer shades every lit fragment
 * against one global list. A lamp in the medical ward is a lamp on the cost of
 * the giant hall, and `intensity = 0` does not help, because the cost is the
 * shader's loop bound and that is decided by how many lights exist and not by
 * how bright they are. Two files already knew this and worked around it by
 * hand — splitHalls.js and codeLift.js add and remove their lamps from the
 * scene as you approach — and the note in splitHalls.js is the clearest
 * statement of the problem in the repo. This is that trick, done once, for
 * everything.
 *
 * **A point light with a `distance` contributes exactly nothing beyond it.**
 * So a lamp whose sphere does not reach the camera's frustum cannot change any
 * pixel that is going to be drawn, and dropping it is not an approximation, it
 * is removing a term that is zero. That is the whole of the cull: every frame,
 * test each lamp's sphere against the view frustum, and keep the nearest
 * twenty-four of whatever survives.
 *
 * The thing that makes this work rather than stutter is that the count never
 * changes. three.js keys its shader programs on how many lights of each type
 * are in the list, so a count that varies frame to frame compiles a fresh
 * program per material per count — a hitch every time you turn around. So the
 * real lamps are taken out of the list for good (`visible = false`, which is
 * what three.js tests when it gathers them) and twenty-four **slots** stand in
 * for them: real PointLights, permanently in the scene, whose position,
 * colour, intensity, distance and decay are copied from whichever lamps won
 * the frame. Unused slots sit at zero. One program set, forever, and one fewer
 * source of the recompiles splitHalls.js had to design around.
 *
 * What it does not touch: anything that casts a shadow (three of them, and a
 * shadow map belongs to the light object that owns it), and anything that is
 * not a point light — the ambient, the hemisphere and the back room's spot are
 * one each and are the cheapest things in the scene.
 */

/**
 * How many lamps can be lit at once.
 *
 * The measurements above say 24 and 8 are within half a millisecond of each
 * other, so this is not where the remaining cost is and there is no reason to
 * be mean with it. What it has to beat is the most lamps that can share one
 * view, and the honest way to know that is to count: `peak` reports it, and
 * the debug readout shows it. If peak ever sits on the pool size, raise this —
 * a pool that is one lamp short does not look like a slow frame, it looks like
 * the furthest lamp in a long room going out.
 */
const POOL = 24;

/** How often to look for lamps that have appeared or gone, in seconds. */
const RESCAN = 0.4;

export function createLightPool({ scene, camera, size: want = POOL }) {
  let size = want;
  const slots = [];
  const mine = new Set();
  for (let i = 0; i < size; i++) {
    const slot = new THREE.PointLight(0xffffff, 0, 0.001, 1.5);
    scene.add(slot);
    slots.push(slot);
    mine.add(slot);
  }

  /** The lamps this stands in for. Refreshed on a slow tick: rooms build them
   * lazily and two of them add and remove their own as you come and go. */
  let lamps = [];
  let since = RESCAN * 2;
  let peak = 0;
  let onNow = 0;
  let managing = true;

  const frustum = new THREE.Frustum();
  const view = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const here = new THREE.Vector3();
  const eye = new THREE.Vector3();
  /**
   * This frame's winners, in slots that are written over rather than made.
   *
   * Forty entries a frame at sixty frames a second is two and a half thousand
   * objects a second handed to the collector for nothing, and a collection in
   * a game loop is a dropped frame. The world position comes along for the
   * ride because working it out means walking an object's parents — the
   * television's own lamp hangs off a creature that moves — and it is wanted
   * twice: once to rank the lamp and once to place the slot standing in for
   * it.
   */
  const won = [];
  const take = (i) => {
    while (won.length <= i) won.push({ lamp: null, at: 0, at3: new THREE.Vector3() });
    return won[i];
  };
  let count = 0;

  const rescan = () => {
    lamps = [];
    scene.traverse((object) => {
      if (!object.isPointLight || mine.has(object)) return;
      // A shadow caster keeps its own light: the map is rendered from this
      // object's matrix and a stand-in would not bring the shadow with it.
      if (object.castShadow) return;
      // Out of the list for good. This is what three.js tests when it gathers
      // lights, so it is exactly as effective as removing it from the scene
      // and costs nothing to toggle.
      object.visible = false;
      lamps.push(object);
    });
  };

  return {
    /** How many slots there are, and how many were used last frame. */
    get size() {
      return size;
    },
    get lit() {
      return onNow;
    },
    /** The most that have ever been in one view. See POOL. */
    get peak() {
      return peak;
    },
    get managed() {
      return lamps.length;
    },

    /**
     * Put the real lamps back and take the slots out, for a harness that wants
     * to measure what this is worth — in frame time and in light.
     *
     * `managing` is not decoration: without it the next rescan, four tenths of
     * a second later, hides every lamp it finds again and the scene goes black
     * with the slots already switched off. The first set of measurements taken
     * through this said the unpooled building was *darker* and faster than the
     * pooled one, which is what a scene with no lights in it at all looks like.
     */
    /**
     * Change how many slots there are, for a harness working out what the
     * pool size is worth. Not for the game: this is the one thing in here
     * that changes the light count, which is the thing the whole design
     * exists to hold still, and it will make three.js compile a program per
     * material on the next frame.
     */
    resize(next) {
      while (slots.length > next) {
        const slot = slots.pop();
        mine.delete(slot);
        scene.remove(slot);
      }
      while (slots.length < next) {
        const slot = new THREE.PointLight(0xffffff, 0, 0.001, 1.5);
        scene.add(slot);
        slots.push(slot);
        mine.add(slot);
      }
      size = next;
      peak = 0;
    },

    off() {
      managing = false;
      for (const slot of slots) slot.visible = false;
      for (const lamp of lamps) lamp.visible = true;
    },
    on() {
      managing = true;
      for (const slot of slots) slot.visible = true;
      for (const lamp of lamps) lamp.visible = false;
    },

    update(delta) {
      if (!managing) return;
      since += delta;
      if (since >= RESCAN) {
        since = 0;
        rescan();
      }

      // The camera's own matrix, because this runs before the renderer updates
      // the world and a frustum built from last frame's view culls lamps on
      // the edge of this one.
      camera.updateMatrixWorld();
      view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(view);
      eye.setFromMatrixPosition(camera.matrixWorld);

      count = 0;
      for (const lamp of lamps) {
        // Dark, or its room has taken it out of the scene. Both are things the
        // rooms do constantly — most of the building's lamps are at zero until
        // you walk into the room they are in.
        if (lamp.intensity <= 0.0005) continue;
        if (lamp.parent === null) continue;
        if (lamp.parent === scene) here.copy(lamp.position);
        else lamp.getWorldPosition(here);
        /**
         * A lamp with no `distance` reaches everywhere, so it cannot be culled
         * by reach — only by the pool being full, and it should win that.
         */
        const reach = lamp.distance > 0 ? lamp.distance : Infinity;
        if (reach !== Infinity) {
          sphere.center.copy(here);
          sphere.radius = reach;
          if (!frustum.intersectsSphere(sphere)) continue;
        }
        const entry = take(count);
        entry.lamp = lamp;
        entry.at = here.distanceToSquared(eye) - reach * reach;
        entry.at3.copy(here);
        count += 1;
      }

      if (count > peak) peak = count;
      // Nearest first, measured from the surface of its reach rather than its
      // middle: of two lamps the same distance away, the one that reaches
      // further into the room is the one that is doing something. Sorted only
      // when it matters, which is when more are in view than there are slots.
      if (count > size) {
        // The spare entries are parked at the far end rather than cut off the
        // array: truncating it would throw away the very objects this is
        // keeping in order not to allocate, and they would be made again next
        // frame. Nothing below reads past `onNow`, which cannot reach them.
        for (let i = count; i < won.length; i++) won[i].at = Infinity;
        won.sort((a, b) => a.at - b.at);
      }

      onNow = Math.min(count, size);
      for (let i = 0; i < size; i++) {
        const slot = slots[i];
        if (i < onNow) {
          const { lamp, at3 } = won[i];
          slot.position.copy(at3);
          slot.color.copy(lamp.color);
          slot.intensity = lamp.intensity;
          slot.distance = lamp.distance;
          slot.decay = lamp.decay;
        } else {
          slot.intensity = 0;
          slot.distance = 0.001;
        }
      }
    },
  };
}
