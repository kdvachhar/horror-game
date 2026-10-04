import * as THREE from 'three';
import { playMeatLunge, playScreech } from './audio.js';

/**
 * The death shot, as its own scripted sequence.
 *
 * It used to live inside tallRoom.js, which meant a room took `camera` and
 * `death` and wrote `camera.position` and `camera.rotation` directly — a room
 * doing cinematography, because it was the module that happened to notice the
 * need.
 *
 * Out here it has the shape the other two scripted sequences in this game
 * already have: cutscene.js and wakeUp.js each own the camera for as long as
 * they are playing and hand it back when they are not. Three peers rather
 * than a director over them — a thing holding three unrelated sequences would
 * be an abstraction with nothing to abstract. What they share is an
 * interface: isPlaying, start, update, reset.
 *
 * The animal is handed to `start` rather than held from construction, because
 * the room owns it and the room's reset rebuilds it; a reference kept here
 * would eventually be a shot aimed at a mouth that no longer exists.
 */
export function createSeizure({ camera, player, death }) {
  /** The animal doing it, for as long as it is doing it. */
  let meat = null;

  /**
   * Being eaten, as a piece of footage of the mouth.
   *
   * Three versions came before this one and the useful thing is what each of
   * them was wrong about.
   *
   * The first flew the camera to the mouth over two seconds. Two seconds of
   * being carried is two seconds in which the worst has already happened and
   * you are watching the paperwork.
   *
   * The second cut instead, which was right, and then nailed the camera down
   * five metres off the face, which was nearly right. The frame was correct —
   * the field of view is 75 degrees vertical, so at five metres the frame is
   * 7.7m tall against a mouth that spans 0 to 15.4, which is mouth top to
   * bottom with teeth down both sides and the hall's ceiling slab at 12 safely
   * out of shot. What was wrong with it was that nothing in it moved except
   * the animal. A camera that cannot move is not a camera, it is a window, and
   * the eye reads it as one.
   *
   * The third went and stood behind your own body instead, so the shot had a
   * subject it could be about. That bought a scene and sold the mouth: you
   * were six metres back watching a figure get taken, which is a thing that
   * happened to somebody, and the whole force of this animal is the moment
   * where it is a thing happening to you with nothing between.
   *
   * So: the second one's frame, and a camera somebody is holding. It starts
   * 6.2 off the face and ends on the old mark at 5.0 as the mouth arrives,
   * so the push and the lunge close the same gap from both ends. Under that
   * it floats — a slow, small, unending drift in the aim and the lens
   * position, at three rates that do not divide into each other. None of it
   * is big enough to notice as movement. All of it is what the eye uses to
   * decide that something is footage of a place rather than a picture of one,
   * and the difference between those two readings is the whole of why this
   * shot did not land.
   *
   * The float does not decay and the rattle does. They are different things:
   * the rattle is the hit, and it is over in half a second; the float is the
   * camera existing, and it has to still be there on the last frame or the
   * shot dies back into a photograph just as the mouth closes on it.
   */
  const SHOT = {
    /** Where the cut lands, off the face along its own normal, in metres. */
    back: 6.2,
    /** And where it finishes: 6.2 less 1.2 is the 5.0 the frame was tuned at. */
    push: 1.2,
    /** How long the push takes. The lunge is about this. */
    over: 1.15,
  };

  /**
   * The hand holding it. Three rates, none of them a multiple of another, so
   * the drift never repeats inside the second the shot lasts.
   *
   * Radians and metres. The turn is a quarter of a degree and the sway is
   * three centimetres at six metres — under the width of a pixel of travel
   * for anything in the middle of the frame, and still enough that the edges
   * of it are never twice in the same place.
   */
  const FLOAT = {
    turn: 0.0045,
    roll: 0.0062,
    sway: 0.031,
    rise: 0.019,
    hz: [0.37, 0.53, 0.29, 0.44],
  };

  const END = {
    /** Held on the black, once the animal has finished arriving. */
    dark: 0.32,
    /** What the death screen says. */
    said: 'You touched it',
  };

  /**
   * The rattle, which is local to this scene and not the player's.
   *
   * It lived on the player body for one version of this, as trauma the body
   * spent in its own camera write. That was right while the shake happened to
   * a body that was still walking around. It does not happen to a body that
   * is still walking around any more — the first thing this scene does is
   * switch that body off, which switches off the code that would have spent
   * it. The shake belongs to whatever is holding the camera, and for the next
   * second that is this.
   *
   * Decayed linearly and spent as its own square, so the top of the curve
   * falls away at once and the tail is nothing; three sines at unrelated
   * rates, because a single frequency is a hum you can hear the period of.
   */
  const SHAKE = { decay: 1.7, turn: 0.05, roll: 0.06, hz: 24 };
  let trauma = 0;

  /**
   * The shot, fixed at the moment of the cut and then only pushed along.
   *
   * Sampled once rather than followed. Everything in the frame is about to
   * move — the mouth comes four metres and grows two and a half upward as it
   * opens — and a camera that tracked any of that would be a camera being
   * driven, which is a different thing from a camera being held.
   */
  let end = null;
  const shot = {
    at: new THREE.Vector3(),
    in: new THREE.Vector3(),
    side: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
  };
  /** Scratch, so a shot that runs for a second does not allocate for a second. */
  const lens = new THREE.Vector3();

  /**
   * It has you. Called once, by the cube, on the frame of contact.
   *
   * Everything is taken away here rather than a frame later: `setEnabled`
   * stops the body walking *and* stops it answering the keyboard, which is
   * what stops you jumping, running or possessing the bucket out of your own
   * death. `takeHold` stops the animal leaving in the middle of the shot.
   *
   * It is not necessarily at the bottom of its cycle when it gets you: the
   * other way to touch this thing is to be standing in the room when it comes
   * back down, which arrives as contact the instant its underside passes your
   * eye line. So the rule is the one meatCube.js draws — a climb is cut, a
   * fall is allowed to finish — and the mouth the shot is aimed at is sampled
   * after that call rather than before it.
   */
  const start = (animal) => {
    if (end) return;
    meat = animal;
    player.setEnabled(false);
    meat.takeHold();

    /**
     * Where the cut lands. Off the mouth's own live position and the way out
     * of the face it is on, because none of that can be written down anywhere
     * else — see `maw` in meatCube.js.
     *
     * Level with the mouth rather than with the floor, which is what makes
     * this frame the frame: the animal can be fifty metres up its shaft when
     * it takes you, and a camera at your height would be pointed at its belly
     * with the mouth out of shot above.
     */
    const maw = meat.maw;
    shot.at.copy(maw.at).addScaledVector(maw.out, SHOT.back);
    shot.at.y = maw.at.y;

    const dx = maw.at.x - shot.at.x;
    const dz = maw.at.z - shot.at.z;
    // Straight at it. Written as Euler angles in YXZ rather than through
    // `camera.lookAt`, which writes a quaternion — everything else in this
    // game, the player included, writes YXZ, and mixing the two bakes in a
    // roll that survives the handover back.
    shot.yaw = Math.atan2(-dx, -dz);
    shot.pitch = Math.atan2(maw.at.y - shot.at.y, Math.hypot(dx, dz));
    // The two axes the hand is allowed to move along: into the mouth, and
    // across it. Both flat, so a sway can never put a tilt in the horizon.
    shot.in.set(-maw.out.x, 0, -maw.out.z).normalize();
    shot.side.set(-shot.in.z, 0, shot.in.x);

    end = { dark: 0, t: 0 };
    trauma = 1;
    document.body.classList.add('cutscene');
    playMeatLunge(1);
  };

  const run = (delta) => {
    trauma = Math.max(0, trauma - SHAKE.decay * delta);
    end.t += delta;

    /**
     * And it screeches, on the frame it starts coming rather than on the
     * frame it got you.
     *
     * Cued off the animal having actually moved, not off a timer counting the
     * same fifth of a second meatCube.js is already counting. There is one
     * clock for when this thing lunges and it belongs to the thing that
     * lunges — a copy here would be right until somebody retunes SEIZE.hold
     * and then silently a frame out forever.
     *
     * The two sounds are deliberately apart. playMeatLunge is the cut: a
     * transient, a wet hit, and the sub. This is what happens next. Together
     * they would be one loud moment; a fifth of a second apart they are a
     * thing noticing you and then a thing coming at you, which is the same
     * two beats the picture is cut on.
     */
    if (!end.screeched && meat.seized.out > 0) {
      end.screeched = true;
      playScreech(1);
    }

    // The animal's clock, not a copy of it. It says when it has finished
    // arriving; this only counts the beat afterwards.
    if (meat.seized.arrived) {
      end.dark += delta;
      if (end.dark >= END.dark && !end.done) {
        end.done = true;
        death?.kill(END.said);
      }
    }

    const now = performance.now() / 1000;
    const hit = trauma * trauma;

    // The push, eased out: moving at the cut and slowing into the mark, which
    // is the opposite shape to a camera being driven somewhere.
    const through = Math.min(1, end.t / SHOT.over);
    const eased = 1 - (1 - through) * (1 - through);
    lens
      .copy(shot.at)
      .addScaledVector(shot.in, SHOT.push * eased)
      // And the hand under it, which never stops.
      .addScaledVector(shot.side, Math.sin(now * FLOAT.hz[2] * 6.283) * FLOAT.sway);
    lens.y += Math.sin(now * FLOAT.hz[3] * 6.283 + 1.7) * FLOAT.rise;

    camera.position.copy(lens);
    camera.rotation.set(
      shot.pitch +
        Math.sin(now * FLOAT.hz[0] * 6.283 + 0.8) * FLOAT.turn +
        hit * Math.sin(now * SHAKE.hz * 0.91 + 2.4) * SHAKE.turn,
      shot.yaw +
        Math.sin(now * FLOAT.hz[1] * 6.283) * FLOAT.turn +
        hit * Math.sin(now * SHAKE.hz * 1.13) * SHAKE.turn,
      Math.sin(now * FLOAT.hz[0] * 6.283 + 2.9) * FLOAT.roll +
        hit * Math.sin(now * SHAKE.hz * 0.77 + 0.6) * SHAKE.roll,
      'YXZ'
    );
  };

  return {
    /** True while it has you, which is also while the room must not update. */
    get isPlaying() {
      return end !== null;
    },
    start,
    /**
     * The animal first, then the shot.
     *
     * The order is the reason this takes the delta rather than letting the
     * room drive both halves: the shot is looking at the animal, so the
     * animal has to have moved this frame before the camera is written, or
     * the frame is one behind the thing it is a frame of.
     */
    update(delta) {
      if (!end) return;
      meat?.update(delta);
      run(delta);
    },
    /**
     * Put it all back. This is the only way out of a death — see `respawn` in
     * main.js — so it returns the body and the class on <body> as well as
     * clearing the shot.
     */
    reset() {
      end = null;
      trauma = 0;
      meat = null;
      document.body.classList.remove('cutscene');
      player.setEnabled(true);
    },
  };
}
