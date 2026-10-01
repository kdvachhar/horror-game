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
   * Being eaten, as a shot. It is one cut and then nothing moves but the
   * animal.
   *
   * The version before this flew the camera up to the mouth over two seconds
   * — snatched off the floor, held at arm's length, put in. It worked and it
   * was wrong, and what was wrong with it is the thing every cutscene gets
   * wrong: it was the game moving you. Two seconds of being carried is two
   * seconds in which the worst has already happened and you are watching the
   * paperwork. It also went stale on the third viewing, which is the only
   * test a death scene has to pass.
   *
   * So: a cut. On the frame of contact the view is somewhere else, five
   * metres off the front of the thing with its mouth open, and it does not
   * travel there — there is no frame between the hall and the mouth. Then it
   * is nailed down. The camera does not move, does not turn, does not track.
   * Everything that happens over the next second happens *to* the frame:
   * fifteen metres of animal comes four metres across the gap and closes it.
   *
   * Which is the trade. The thing that makes being caught frightening is not
   * seeing the mouth, it is being unable to do anything about the mouth, and
   * a camera that is flying somewhere is a camera doing something. Pinning it
   * costs the shot all of its choreography and buys the one thing the
   * choreography was there to fake.
   *
   *   CUT.back   five metres, and it is measured rather than chosen. The
   *              field of view is 75° vertical, so the frame is 1.53 times
   *              as tall as the distance — 7.7m of height at five metres,
   *              from y 1.6 to 9.3. The open mouth spans 0 to 15.4, so the
   *              frame is full of it top to bottom with teeth down both
   *              sides, and the hall's ceiling slab at 12 is out of shot,
   *              which matters: the cube is 14.6 tall coming into a 12 hall
   *              and the top two and a half metres of it go through that
   *              slab on the way. Nobody ever sees it, because by the time
   *              the lunge is a metre in, the frame is nothing but mouth.
   *
   * And the black is not a fade either. The inside of that mouth is one
   * unlit black plane (see buildMouth) and the lunge finishes with it eight
   * tenths of a metre off the lens. The screen goes black because something
   * in the room put itself in front of it. A cut to black tells you a state
   * changed; this is a mouth arriving.
   */
  const END = {
    /** How far off the mouth the cut lands, in metres. See above. */
    back: 5.0,
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
   * It is also the only thing moving the view, and it has to stay small
   * enough to read as a held shot being rattled rather than as a held shot
   * that came loose. Decayed linearly and spent as its own square, so the top
   * of the curve falls away at once and the tail is nothing; three sines at
   * unrelated rates, because a single frequency is a hum you can hear the
   * period of.
   */
  const SHAKE = { decay: 1.7, turn: 0.05, roll: 0.06, hz: 24 };
  let trauma = 0;

  /**
   * The shot, fixed at the moment of the cut and not touched again.
   *
   * Sampled once rather than followed. Everything in the frame is about to
   * move — the mouth comes four metres and grows two and a half upward as it
   * opens — and a camera that tracked any of that would be a camera moving,
   * which is the one thing this scene is not allowed to do.
   */
  let end = null;
  const shot = { at: new THREE.Vector3(), yaw: 0, pitch: 0 };

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

    // Where the cut lands. Off the mouth's own live position and the way out
    // of the face it is on, because none of that can be written down anywhere
    // else — see `maw` in meatCube.js.
    const maw = meat.maw;
    shot.at.copy(maw.at).addScaledVector(maw.out, END.back);
    shot.at.y = maw.at.y;
    const dx = maw.at.x - shot.at.x;
    const dz = maw.at.z - shot.at.z;
    // Straight at it. Written as Euler angles in YXZ rather than through
    // `camera.lookAt`, which writes a quaternion — everything else in this
    // game, the player included, writes YXZ, and mixing the two bakes in a
    // roll that survives the handover back.
    shot.yaw = Math.atan2(-dx, -dz);
    shot.pitch = Math.atan2(maw.at.y - shot.at.y, Math.hypot(dx, dz));

    end = { dark: 0 };
    trauma = 1;
    document.body.classList.add('cutscene');
    playMeatLunge(1);
  };

  const run = (delta) => {
    trauma = Math.max(0, trauma - SHAKE.decay * delta);

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
     *
     * It also gets the output most of the way to itself — see the note on
     * playScreech about the master having no limiter on it.
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

    const hit = trauma * trauma;
    const now = performance.now() / 1000;
    camera.position.copy(shot.at);
    camera.rotation.set(
      shot.pitch + hit * Math.sin(now * SHAKE.hz * 0.91 + 2.4) * SHAKE.turn,
      shot.yaw + hit * Math.sin(now * SHAKE.hz * 1.13) * SHAKE.turn,
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
