import * as THREE from 'three';
import { playMeatLunge, playScreech } from './audio.js';

/**
 * Being caught by the screen, as a shot.
 *
 * The fourth scripted sequence in this game and a peer of the other three —
 * cutscene.js, wakeUp.js and seizure.js each own the camera for as long as
 * they are playing and hand it back when they are not. Same interface:
 * isPlaying, start, update, reset. See the top of seizure.js for why there
 * is no director over them.
 *
 * **It is first person and seizure.js is the argument for why.** That shot
 * cuts to a camera somebody is holding, five metres off the animal's face,
 * because the animal is forty metres of it and there is no other way to see
 * what has happened to you. Its own notes record that the version standing
 * behind your own body was rejected: "the whole force of this animal is the
 * moment where it is a thing happening to you with nothing between."
 *
 * This thing is already a face, already at head height, and already two
 * metres away when it has you. There is nothing to cut to. Any camera that
 * goes somewhere to get a better look at it is a camera that has taken the
 * one thing it had — that it is in front of you — and swapped it for a
 * composition. So the lens stays exactly where your eyes were.
 *
 * **What makes it a jumpscare and not a death is the order of two frames.**
 * It arrives wearing the face it has been talking to you with for the whole
 * building, and then it is not wearing that. The snarl is a cut rather than
 * an expression changing — see SNARL in screenFace.js — and it lands on the
 * same frame as the view being taken off you and the sound. One frame of the
 * thing you know, one frame of what it actually is.
 */

/**
 * The slam, and the arithmetic that decides where it stops.
 *
 * `fill` is the fraction of the screen's own height the frame is allowed to
 * show. Under one means it overfills, so there is no edge of it anywhere in
 * shot and no room in the frame for anything else to be true. Worked out
 * against the live camera rather than written down as a distance, because
 * the lens is 75 degrees vertical today and a hard-coded three metres would
 * quietly become the wrong three metres the first time anybody touched that.
 *
 * **It was squeezed from both ends until the beast grew a backing.** The
 * face is 86% of the glass, so framed against the glass alone there is 14%
 * of slack in total and both ends of it are spoken for. Too close and the
 * eyes run off the top: at 0.62 the frame is abstract green shapes, and a
 * jumpscare has about four frames to be recognised in. Too far and the
 * glass stops covering the frame: at 0.82 it covered by under two
 * centimetres, which the camera shake swung straight past, so the shot had
 * a strip of racking down one side of it.
 *
 * The fix was not a distance and it was not the beast either. Nothing it
 * can reasonably carry on its back covers a 75 degree lens from three
 * metres — that wants twenty metres of plane, and a black rectangle that
 * size following it down the shed is a hole in the room. So the shot hangs
 * its own backdrop a hand's width behind it, which is what a backdrop is
 * for, and the distance is then free to be set by what the face wants.
 *
 * 0.9 is what it wants. The camera is tilted up at a thing standing on the
 * floor, which spends most of the top of the frame on empty backdrop, so
 * the face has to be given room at the bottom or the mouth goes off it.
 *
 * `over` is how long it takes to get there. Short: two tenths is about as
 * long as a thing can take to cross two metres and still be read as having
 * arrived rather than approached.
 */
const SLAM = { fill: 0.9, over: 0.2 };

/**
 * And how long it stays there before the black.
 *
 * Long enough to be looked at and not a moment past it. The face is held on
 * a shaking camera with the music gone, which is a silence you notice: at
 * 0.9 it is a held beat, and the two or three it wants to be is the shot
 * explaining itself.
 */
const HOLD = { stare: 0.9, said: 'It had been the wall the whole time.' };

/**
 * And the lens goes long for the shot.
 *
 * 58 degrees against the 75 the game is played on. It does two jobs and the
 * second one is the reason it is here.
 *
 * It frames better: a narrower lens is less of the room and more of the
 * thing, which is what this second is about.
 *
 * And it is the only thing that gets the room out of the corners. The
 * backdrop hangs behind the beast, so it can only hide what is further away
 * than the beast — and at 75 degrees the frame's own side edges reach four
 * and a half metres out, which in a shed with an eight-metre aisle is the
 * racking. Nothing hung behind anything fixes that. A tighter lens does: at
 * 58 the edges reach three metres and there is nothing out there.
 *
 * Put back by `reset`, which is also what hands the body back, so the two
 * cannot come apart.
 */
const LENS = 58;

/**
 * The hit, which decays, and the hand under it, which does not.
 *
 * The same split as seizure.js and it is the same reason: the rattle is the
 * impact and is over in half a second, and the float is the camera existing.
 * Without the second one the last half of the shot is a photograph of a
 * face, and a photograph is something you have time to look at.
 *
 * It is allowed to be a real shake because the thing it is shaking in front
 * of has a backing on it — see screenBeast.js. Tuned against the glass alone
 * these numbers had to come down to about two degrees, which on an impact is
 * a wobble, and they still only just fitted.
 */
const SHAKE = { turn: 0.05, roll: 0.038, hz: 23, decay: 2.6 };
const FLOAT = { turn: 0.006, hz: [0.23, 0.31, 0.17] };

/**
 * @param scene  the world, for the one prop this shot owns
 * @param camera the one camera
 * @param player whose view is being taken off them
 * @param death  the screen that goes up when the beat is over
 */
export function createScreenScare({ scene, camera, player, death }) {
  /** The thing doing it, for as long as it is doing it. */
  let beast = null;
  let run = null;
  let trauma = 0;
  /** The lens the game is played on, to be given back. See LENS. */
  let wide = camera.fov;

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const here = new THREE.Vector3();
  const forward = new THREE.Vector3();

  /**
   * The backdrop, and it belongs to the shot rather than to the thing.
   *
   * One unlit black plane, hung a hand's width behind the beast and turned
   * the same way. Nothing can get between them — there is thirty-five
   * centimetres in there — so everything further away than the beast is
   * gone for as long as the shot runs.
   *
   * **It does not fix the corners and it never could.** It hides what is
   * behind the beast, and the thing that was getting into the edges of the
   * frame was the racking, which is beside you and nearer than the beast
   * is. That is LENS's job. This is for the catches that happen somewhere
   * with distance behind them — in the hall, the far end of the run is
   * thirty metres of lit corridor straight past its shoulder.
   *
   * Off at all other times, which is why it is here and not on the beast: a
   * plane this size following the chase down the shed is a rectangular hole
   * in the racking.
   */
  const backdrop = new THREE.Mesh(
    // Bigger than it looks like it needs to be. A frustum's corners reach a
    // good deal further than its edges, and at 26 by 22 the top-left of the
    // frame still found its way past the corner of this and out into the
    // racking. Nothing is paying for the extra: it is one unlit plane that
    // exists for about a second.
    new THREE.PlaneGeometry(40, 34),
    new THREE.MeshBasicMaterial({ color: '#04050a', toneMapped: false, fog: false })
  );
  backdrop.visible = false;
  scene.add(backdrop);

  /**
   * How far off the lens its own height exactly overfills the frame.
   *
   * Vertical only. The screen is twice as wide as it is tall and the window
   * is wider than it is tall as well, so height is always the binding
   * constraint — solve that and the width has already gone off both sides.
   */
  const mark = (high) => (high * SLAM.fill) / (2 * Math.tan((LENS * Math.PI) / 360));

  return {
    /** True while it has you, which is also while the room must not update. */
    get isPlaying() {
      return run !== null;
    },

    /** How far through the slam, nought to one, for a harness. */
    get travel() {
      return run ? +Math.min(1, run.t / SLAM.over).toFixed(3) : 0;
    },

    /** Where the lens is, for a harness that wants to check it did not move. */
    get lens() {
      return camera.position.clone();
    },

    start(thing) {
      if (run) return;
      beast = thing;
      player.setEnabled(false);
      document.body.classList.add('cutscene');
      wide = camera.fov;
      camera.fov = LENS;
      camera.updateProjectionMatrix();

      /**
       * It stops being a chase and starts being a shot, and the handover is
       * one call so there is one place it can be wrong.
       *
       * The beast kills its own music here rather than this doing it. A
       * chase cue that fades out under a jumpscare is a chase you are losing
       * gently; cut dead on the frame it has you, the silence is the loudest
       * thing in the room.
       */
      beast.seize();

      // The lens does not move. It stays exactly where your eyes were — see
      // the note at the top — and only the aim is taken off you.
      here.copy(camera.position);
      const at = beast.position;
      const dx = at.x - here.x;
      const dz = at.z - here.z;
      // YXZ, like the player and like seizure.js. `lookAt` writes a
      // quaternion and mixing the two bakes a roll into the handover back.
      const yaw = Math.atan2(-dx, -dz);

      /**
       * Where it comes from is wherever it actually was. Where it goes is
       * square on the lens, at the distance its own height fills the frame,
       * sitting on the floor — and the camera looks up at it.
       *
       * Two wrong answers came first. Aiming at the beast's live centre and
       * then moving it somewhere else left the lens pointed at the ceiling
       * over a face that had come down to meet it. Bringing it down to your
       * eye line instead put the frame dead on the face and then sank the
       * bottom two metres of it through the floor, which the floor duly drew
       * over: the shot had carpet along the bottom of it and a crate in the
       * corner.
       *
       * It is five and a half metres tall. There is no version of this where
       * it is level with your eyes and also above the ground. So it stands
       * on the ground, and you look up at it — which is the honest framing
       * anyway. It has been looking down at you since it came off the wall.
       */
      from.copy(at);
      forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      const stop = mark(beast.screenSize.high);
      to.copy(here).addScaledVector(forward, stop);
      to.y = player.position.y + beast.screenSize.rest;
      const pitch = Math.atan2(to.y - here.y, stop);

      backdrop.position.copy(to).addScaledVector(forward, 0.35);
      backdrop.rotation.set(0, yaw, 0);
      backdrop.visible = true;

      run = { t: 0, yaw, pitch, dark: 0, done: false };
      trauma = 1;
      // Both voices at once, which is the one place in this game they are
      // not held apart. seizure.js splits them by a fifth of a second to make
      // two beats out of a thing noticing you and a thing coming at you.
      // There is no noticing here. It is already on you.
      playMeatLunge(1);
      playScreech(1);
    },

    reset() {
      run = null;
      trauma = 0;
      beast = null;
      backdrop.visible = false;
      camera.fov = wide;
      camera.updateProjectionMatrix();
      document.body.classList.remove('cutscene');
      player.setEnabled(true);
    },

    update(delta) {
      if (!run) return;
      run.t += delta;
      trauma = Math.max(0, trauma - SHAKE.decay * delta);

      /**
       * In, on a curve that is already moving on its first frame.
       *
       * Eased in rather than out — the opposite of the push in seizure.js,
       * and the opposite thing is wanted. That one is a camera somebody is
       * walking forward; this is a mass arriving, so it has to be fastest at
       * the end and nearly stopped when it lands.
       */
      const through = Math.min(1, run.t / SLAM.over);
      const eased = through * through;
      /**
       * Turned to the same yaw the camera is looking along, and not that
       * plus pi.
       *
       * The face is drawn in the group's local +z, and the direction from
       * the beast back to the lens is the opposite of the way the camera is
       * pointing — two negatives, which cancel. Adding half a turn on top of
       * them put its back to you for the whole shot: a dark slab of frame
       * and nine cables, with the room visible round the edges of it. The
       * hunt has had this right all along; see `look` in screenBeast.js.
       */
      beast.place(here.clone().set(
        from.x + (to.x - from.x) * eased,
        from.y + (to.y - from.y) * eased,
        from.z + (to.z - from.z) * eased
      ), run.yaw);

      if (through >= 1) {
        run.dark += delta;
        if (run.dark >= HOLD.stare && !run.done) {
          run.done = true;
          death?.kill(HOLD.said);
        }
      }

      const now = performance.now() / 1000;
      const hit = trauma * trauma;
      camera.position.copy(here);
      camera.rotation.set(
        run.pitch +
          Math.sin(now * FLOAT.hz[0] * 6.283 + 0.8) * FLOAT.turn +
          hit * Math.sin(now * SHAKE.hz * 0.91 + 2.4) * SHAKE.turn,
        run.yaw +
          Math.sin(now * FLOAT.hz[1] * 6.283) * FLOAT.turn +
          hit * Math.sin(now * SHAKE.hz * 1.13) * SHAKE.turn,
        Math.sin(now * FLOAT.hz[2] * 6.283 + 2.9) * FLOAT.turn +
          hit * Math.sin(now * SHAKE.hz * 0.77 + 0.6) * SHAKE.roll,
        'YXZ'
      );

      beast.update(delta);
    },
  };
}
