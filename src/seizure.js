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
export function createSeizure({ camera, player, playerBody, death }) {
  /** The animal doing it, for as long as it is doing it. */
  let meat = null;

  /**
   * Being eaten, as a scene you are in rather than a close-up of the thing
   * that did it.
   *
   * Two versions came before this one and both of them made the same mistake
   * from opposite ends. The first flew the camera up to the mouth over two
   * seconds — snatched off the floor and put in. The second cut instead, hard,
   * to a point five metres off the front of the animal with its mouth open,
   * and nailed the camera down there.
   *
   * The cut was better and it was still wrong, and what was wrong with it only
   * shows up when you die somewhere other than directly in front of the thing.
   * That camera was placed off the *mouth* — maw plus five metres along the
   * face's own normal — so the shot it framed was the animal, at the animal's
   * last position, with you nowhere in it. You died, and the game cut away
   * from you to look at something else. Where it caught you up the shaft, the
   * body it had just taken was below the frame entirely.
   *
   * So the anchor moves from the animal to you. The camera stands on the floor
   * you were standing on, back along the line between you and the mouth and a
   * few metres to one side of it, and it looks at your body. That one change
   * is the whole of the difference: the animal is no longer the subject, it is
   * the fifteen metres of wall that arrives behind the subject and closes over
   * it. You watch yourself get taken, which is a scene, rather than watching
   * where it happened from, which is a photograph of a mouth.
   *
   * And it is square, which took a second go to get right.
   *
   * The first version of this shot put the camera back along the line from
   * your body to the mouth, and three metres off that line for a
   * three-quarter view. Both of those are angles, and the room has no angles
   * in it: it is a square shaft with four flat walls and an animal that is a
   * cube, square to all of them, whose face is a flat plane. Die anywhere but
   * dead centre and the body-to-mouth line runs diagonally across the plan,
   * so the whole frame sits skew to every edge in it — a wall running out of
   * one corner, a face that is not parallel to anything, and a horizon that
   * reads as tilted even though it is level.
   *
   * So the shot is squared to the one surface that matters. `maw.out` is the
   * way out of the face, read off its own matrix, and the camera is placed
   * straight back along it from wherever you were standing and pointed
   * straight back down it. The face is then parallel to the film plane, the
   * shaft's walls run square out of the frame's edges, and the body — which
   * is on that axis because the camera was placed from it — is in the middle
   * of the picture with the animal filling everything behind it.
   *
   *   SHOT.back   straight back along the face's normal, which is always
   *               *away* from the animal and so is also what keeps the camera
   *               out of it without knowing anything about its shape. The
   *               cube plugs its shaft at 14.96 by 13.96 and the only open
   *               space near you is the space you are standing in, on the
   *               near side of the face that is about to lunge.
   *   SHOT.push   and it creeps in, by just over a metre across the lunge,
   *               along that same axis so the move cannot introduce an angle
   *               either. A fixed frame is a photograph and this is a shot; a
   *               metre is enough to be felt without being a camera that is
   *               doing something while you can do nothing, which is the
   *               failure the first version died of.
   *
   * What it does not do is track. There is one axis, fixed when the shot
   * starts, and the camera only slides along it — so the animal grows in the
   * frame rather than being followed, and the framing is still choreography
   * nobody is performing.
   */
  const SHOT = {
    /** Straight back from the body along the face's own normal, in metres. */
    back: 6.2,
    /** Lens height above the floor the body is standing on. */
    high: 1.55,
    /** How far it creeps in over the shot, and over how long. */
    push: 1.25,
    over: 1.2,
  };

  const END = {
    /** Held after the animal has finished arriving, before the screen. */
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
   * The shot, fixed at the moment it starts and then only crept along.
   *
   * `at` is where the lens begins, `in` is the one direction it is allowed to
   * move and the direction it looks, and `yaw`/`pitch` are that direction as
   * the angles the camera is actually written in. Held as angles rather than
   * recomputed each frame because they do not change: the camera slides along
   * its own view axis, which is a move that cannot turn it.
   */
  let end = null;
  const shot = { at: new THREE.Vector3(), in: new THREE.Vector3(), yaw: 0, pitch: 0 };
  /** Scratch, so a shot that runs for a second does not allocate for a second. */
  const lens = new THREE.Vector3();
  const axis = new THREE.Vector3();
  /** Whether the shadow body was already being drawn when the shot started. */
  let wasShown = false;

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
   * fall is allowed to finish — and the mouth the shot is framed against is
   * sampled after that call rather than before it.
   */
  const start = (animal) => {
    if (end) return;
    meat = animal;
    player.setEnabled(false);
    meat.takeHold();

    /**
     * And the body is shown, which is the thing that makes this a scene.
     *
     * The same shadow body you leave standing when you step into the bucket —
     * see possession.js, which is the only other thing that turns it on. It
     * is already being driven every frame from `player.pose` in the main
     * loop, so there is nothing to place: it is standing exactly where you
     * were when you were touched, because it *is* where you were.
     */
    wasShown = playerBody.isVisible;
    playerBody.setVisible(true, player.lookYaw);

    const maw = meat.maw;
    const body = player.position;

    /**
     * The one axis the shot has: the face's own normal, flattened.
     *
     * Flattened because the camera stands on the floor you were standing on
     * rather than flying to a vantage, and because a normal with any tilt in
     * it would put a tilt in the horizon. The face is vertical, so this takes
     * nothing off it — it is a guard against a face that is one day hung at
     * an angle, not a correction to this one.
     *
     * `maw.out` is the way *out* of the face, so moving along it is moving
     * away from the animal, and that is the whole of what keeps the camera
     * from being placed inside fifteen metres of it.
     */
    axis.set(maw.out.x, 0, maw.out.z);
    // Degenerate only if the front face is ever pointed at the floor, which
    // it is not and which nothing in meatCube.js can make it. The fallback is
    // the line from the mouth to you — not square, but in frame, which is the
    // one of the two properties that cannot be given up.
    if (axis.lengthSq() < 1e-4) axis.set(body.x - maw.at.x, 0, body.z - maw.at.z);
    axis.normalize();

    // Straight back along it from where you were standing. No lateral offset:
    // anything off this axis is an angle, and the argument above is that this
    // room has none in it.
    shot.at
      .set(body.x, body.y + SHOT.high, body.z)
      .addScaledVector(axis, SHOT.back);
    // And pointed straight back down the same axis, rather than at the body.
    // Aiming at the body would re-introduce a yaw the moment the body is not
    // exactly on the axis — which it is, by construction, but only until
    // somebody changes how `at` is placed. One axis, used twice.
    shot.in.copy(axis).multiplyScalar(-1);
    shot.yaw = Math.atan2(-shot.in.x, -shot.in.z);
    /**
     * The only tilt in it, and it is a lens height rather than an angle.
     *
     * The camera is 1.55 off your floor and the mouth is wherever the animal
     * is holding it — up the shaft that can be fifty metres over your head.
     * Pitching to find it would point the frame at the ceiling and lose you
     * out of the bottom of it, which is the fault this whole shot exists to
     * fix. So it does not pitch: it stays level, you are at eye height in the
     * middle of the picture, and what is above you stays above you.
     */
    shot.pitch = 0;

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
     * The two sounds are deliberately apart. playMeatLunge is the start: a
     * transient, a wet hit, and the sub. This is what happens next. Together
     * they would be one loud moment; a fifth of a second apart they are a
     * thing noticing you and then a thing coming at you.
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

    // The creep, eased out so it is moving at the cut and slowing by the end
    // — the opposite shape to a camera being driven somewhere.
    const through = Math.min(1, end.t / SHOT.over);
    const eased = 1 - (1 - through) * (1 - through);
    lens.copy(shot.at).addScaledVector(shot.in, SHOT.push * eased);

    // Pointed where it was pointed when the shot started. The creep is along
    // the view axis, so it cannot turn the camera, and nothing else in here
    // is allowed to.
    const hit = trauma * trauma;
    const now = performance.now() / 1000;
    camera.position.copy(lens);
    camera.rotation.set(
      // Written as Euler angles in YXZ rather than through `camera.lookAt`,
      // which writes a quaternion — everything else in this game, the player
      // included, writes YXZ, and mixing the two bakes in a roll that
      // survives the handover back.
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
     * room drive both halves: the shot is framed against the animal, so the
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
     * main.js — so it returns the body, the shadow body and the class on
     * <body> as well as clearing the shot.
     */
    reset() {
      end = null;
      trauma = 0;
      meat = null;
      document.body.classList.remove('cutscene');
      /**
       * And the shadow body put back the way the shot found it, which is not
       * the same as hidden.
       *
       * You can be eaten while you are inside the bucket — your own body is
       * stood where you left it and the animal does not care that nobody is
       * home — and the restart out of a death does not hand you back to
       * yourself (see `onRestart` in main.js, which winds the room back and
       * moves you, but leaves the possession alone). Hiding it flatly would
       * make the body you are standing next to disappear at the exact moment
       * you got it back.
       */
      if (!wasShown) playerBody.setVisible(false);
      wasShown = false;
      player.setEnabled(true);
    },
  };
}
