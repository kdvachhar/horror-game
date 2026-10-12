import * as THREE from 'three';
import { makeMeatSurface } from './textures.js';
import {
  playScreech,
  playMeatLunge,
  playBucketJump,
  playBucketLand,
  playCrush,
  playCollapse,
} from './audio.js';
import { setObjective } from './hud.js';

/**
 * The end of it, at the window.
 *
 * The fifth scripted sequence in this game and a peer of the other four —
 * cutscene.js, wakeUp.js, seizure.js and screenScare.js each own the camera
 * for as long as they are playing and hand it back when they are not. Same
 * interface: isPlaying, start, update, reset.
 *
 * **It is the only scene in the game with both bodies and the animal in it
 * at once, and that is the whole reason it exists.** The bucket has been
 * with you since the two-body door; the last thing that happened to it was
 * being left on the wrong side of a bank of rock at the lift, which is the
 * one loss the game has in it. This is where that is paid: it turns up, it
 * goes for the face, and it is killed doing it — and the thing it kills is
 * the thing that has been talking to you since the ward.
 *
 * **First person, and the lens does not move.** Same argument as
 * screenScare.js, which spells it out: any camera that goes somewhere to
 * get a better look has swapped the one thing this has — that it is
 * happening in front of you, at your height, close enough to touch — for a
 * composition. So the lens stays where your eyes were and only the aim is
 * taken off you. The shot is three turns: the animal, the floor where what
 * is left of your friend lands, and then behind you at the window.
 *
 * **Nothing here is physics.** Every body in this is on a clock: the beast
 * is handed over with `seize`, which leaves its limbs and its face running
 * and its position to whoever is driving, and the bucket is the real one
 * with its own update switched off for the duration. Both of those are the
 * actual objects rather than stand-ins, because a scene that ends a game
 * with a model of your friend in it is a scene about a model.
 */

/**
 * The clock, in seconds, and every number in it is a cut.
 *
 * Read it as a storyboard: the thing arrives and fills the frame, the bucket
 * comes in off the floor and goes for its face, it screeches and thrashes
 * with the bucket hanging off it, a hand comes in and takes the bucket,
 * closes, and drops what is left; then it screams, goes over, and lands
 * face down on the concrete in front of you, and the arm that is still
 * hanging over you comes down across the window.
 *
 * The one timing that was measured rather than felt is `grab` minus `hit`:
 * under a second and a half, the bucket reads as having bounced off rather
 * than as having got hold of it, and the whole point of the shot is that the
 * animal cannot get it off.
 *
 * `dying` to `down` is the fall and it is in two parts on purpose. For a
 * second it is still standing and failing to — that is `dying`, the sag, and
 * the screech that goes with it — and then at `topple` it stops being held
 * up at all and the last one and three fifths of a second is the thing going
 * over. Both halves have to be there: a body this size that starts falling
 * the frame it dies has not died, it has been switched off.
 *
 * `swing` is the arm, and the gap between `down` and it is a beat on a dead
 * animal lying on a floor — the only still frame in the sequence and the one
 * the ending needs, or the hand comes down while you are still watching the
 * thing land.
 */
const AT = {
  close: 1.0,
  leap: 1.25,
  hit: 1.6,
  grab: 3.4,
  caught: 4.1,
  crush: 4.3,
  crushed: 5.5,
  drop: 5.7,
  dying: 6.2,
  topple: 7.3,
  down: 8.9,
  swing: 10.0,
  glass: 10.9,
  over: 13.3,
};

/**
 * How big the arm is, and why it is not as big as the ones on the animal.
 *
 * Five metres of it, against the seven a limb on the creature runs to. The
 * corridor is five and a half from floor to ceiling: a longer arm has to
 * come in from above to reach anything, and from above means its shoulder
 * is through the slab. At five it comes in sideways across a nine metre
 * room with its elbow inside the walls, which is the only direction this
 * room has room in.
 *
 * `lean` is the angle the whole thing hangs at, and everything else is
 * worked back from it: see `putHandAt`, which is given a point for the palm
 * and solves for where the shoulder has to be.
 */
const ARM = { upper: 2.6, fore: 2.4, thick: 0.95, palm: 1.5, digit: 1.3, lean: -1.0 };

const EASE = (t) => t * t * (3 - 2 * t);
/** Nought to one across a window of the clock, clamped at both ends. */
const over = (t, from, to) => Math.max(0, Math.min(1, (t - from) / (to - from)));

export function createFinale({ scene, camera, player, beast, friend, lift, onFinished }) {
  const group = new THREE.Group();
  scene.add(group);

  const flesh = new THREE.MeshStandardMaterial({
    ...makeMeatSurface(2, 2),
    roughness: 1,
    metalness: 0,
  });

  /**
   * The arm, and it is a prop rather than one of the animal's own.
   *
   * The creature has ten limbs on a chain each, animated every frame from
   * its own update, and borrowing one would mean an API for aiming a limb
   * at a point in the world plus a way to stop the beat fighting it. This
   * is a free arm that is drawn the same way out of the same meat, posed by
   * this file alone, and it does two jobs: it takes the bucket, and at the
   * end it is what comes down on the window. Nobody counts arms on a thing
   * with ten of them.
   */
  const arm = new THREE.Group();
  arm.visible = false;
  group.add(arm);

  const bone = (length, thick) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, length, thick * 0.82), flesh);
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    return mesh;
  };

  // Shoulder, elbow, wrist, and four digits off the palm. Each joint hangs
  // off the end of the one before it, so the whole thing bends by turning
  // three groups.
  const shoulder = new THREE.Group();
  arm.add(shoulder);
  shoulder.add(bone(ARM.upper, ARM.thick));
  const elbow = new THREE.Group();
  elbow.position.y = -ARM.upper;
  shoulder.add(elbow);
  elbow.add(bone(ARM.fore, ARM.thick * 0.86));
  const wrist = new THREE.Group();
  wrist.position.y = -ARM.fore;
  elbow.add(wrist);
  const palm = new THREE.Mesh(
    new THREE.BoxGeometry(ARM.palm, 0.55, ARM.palm * 0.9),
    flesh
  );
  palm.position.y = -0.3;
  palm.castShadow = true;
  wrist.add(palm);

  /** The four of them, and they close together. See `grip`. */
  const digits = [];
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Group();
    root.position.set((i / 3 - 0.5) * ARM.palm * 0.78, -0.5, ARM.palm * 0.3);
    wrist.add(root);
    let parent = root;
    const joints = [root];
    for (let j = 0; j < 3; j++) {
      const seg = new THREE.Group();
      if (j > 0) seg.position.y = -ARM.digit / 3;
      parent.add(seg);
      const t = 0.3 * (1 - j * 0.18);
      const piece = new THREE.Mesh(new THREE.BoxGeometry(t, ARM.digit / 3, t), flesh);
      piece.position.y = -ARM.digit / 6;
      piece.castShadow = true;
      seg.add(piece);
      joints.push(seg);
      parent = seg;
    }
    digits.push({ root, joints, lean: (i / 3 - 0.5) * 0.3 });
  }

  /** Nought is open flat, one is closed on something. */
  const grip = (amount) => {
    for (const digit of digits) {
      digit.root.rotation.z = digit.lean;
      digit.joints[1].rotation.x = -0.2 - amount * 1.1;
      digit.joints[2].rotation.x = -amount * 1.3;
      digit.joints[3].rotation.x = -amount * 1.1;
    }
  };
  grip(0);

  /**
   * Put the palm on a point.
   *
   * The arm is a straight chain hanging down its own -y with the whole
   * thing leant over by ARM.lean, so the wrist sits a fixed offset from the
   * root, and the root is that offset taken off wherever the hand is
   * wanted. No inverse kinematics and nothing to tune: one angle, one
   * length, and a shoulder that goes wherever it has to — which is off
   * frame in both of the two shots this appears in.
   *
   * The roll on it is a breath rather than a pose. A hand that arrives at
   * exactly the same angle on every frame of a two second move reads as a
   * prop on a rail, which is what it is.
   */
  const putHandAt = (point, t) => {
    const span = ARM.upper + ARM.fore;
    arm.rotation.set(0, 0, ARM.lean + Math.sin(t * 2.1) * 0.05);
    arm.position.set(
      point.x - span * Math.sin(arm.rotation.z),
      point.y + span * Math.cos(arm.rotation.z),
      point.z
    );
  };

  /**
   * One lamp, and the shot carries it rather than the room.
   *
   * The corridor has a single light in it, at the window, pointed the other
   * way: everything in this scene happens two metres from the lens with its
   * back to that lamp, and the first cut of it was a silhouette holding
   * another silhouette. A shot that needs light brings light — screenScare
   * hangs its own backdrop for the same reason.
   *
   * On the camera, nine metres of reach and no further, so what it lifts is
   * the face, the hand, the floor it all ends up on and the glass five
   * metres the other way, while the rest of the corridor stays as black as
   * it was. It was seven, which stopped a metre and a half short of a
   * window that is now behind you rather than against your back.
   */
  const fill = new THREE.PointLight('#c8d2c0', 0, 9, 1.6);
  fill.visible = false;
  camera.add(fill);

  let run = null;
  let done = false;

  const here = new THREE.Vector3();
  const want = new THREE.Vector3();
  const look = new THREE.Vector3();
  const bucketAt = new THREE.Vector3();

  /**
   * The point on the animal the shot is about, which is its face and not its
   * middle: it is turned to look at you, the face is drawn on the front of
   * it, and the front of it is a metre nearer the lens than the body it is
   * set into.
   */
  const faceOf = (at) => look.set(at.x, at.y, at.z - 1.0);

  /**
   * Turn the lens toward a point, at a rate.
   *
   * YXZ and no roll, like the player and like every other shot in here —
   * `lookAt` writes a quaternion, and mixing the two bakes a roll into the
   * handover back to the player at the end.
   */
  const aim = (point, rate, delta) => {
    const dx = point.x - camera.position.x;
    const dy = point.y - camera.position.y;
    const dz = point.z - camera.position.z;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz) || 0.001);
    let turn = wantYaw - run.yaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const k = 1 - Math.exp(-rate * delta);
    run.yaw += turn * k;
    run.pitch += (wantPitch - run.pitch) * k;
    camera.rotation.set(run.pitch, run.yaw, 0, 'YXZ');
  };

  return {
    group,

    get isPlaying() {
      return run !== null;
    },

    /** Whether it has played. The bucket stays dead afterwards. */
    get hasRun() {
      return done;
    },

    /** How far through, for a harness. */
    get at() {
      return run ? +run.t.toFixed(2) : 0;
    },

    /** Called with the thing a few metres off you and still coming. */
    start() {
      if (run || done) return;

      const win = lift.windowAt;
      /**
       * You are put on a mark, and it is the one liberty this takes.
       *
       * Five metres off the glass, which is two and a half times what it
       * was. Everything in this shot is staged off the lens and the lens
       * used to be two metres from the back wall, which is close enough
       * that the window at the end of it was a pane filling the frame
       * rather than a window in a wall, and close enough that a body going
       * over forwards had nowhere to land but on top of you.
       *
       * At five there is room behind the lens for the thing to come down
       * in and room behind your head for the window to read as what it is
       * — a hole in the end of a building with a lit city in it — when the
       * shot turns round to it. The corridor is twenty-two metres long and
       * you are standing in the fifth of them, so there is nothing else
       * this costs.
       *
       * Off to one side still, because something is going to come down on
       * that glass.
       */
      player.teleport({
        position: [win.x + 0.9, win.floor, win.z + 5.0],
        yaw: Math.PI,
        pitch: 0,
      });
      const eye = camera.position.clone();
      const at = beast.position.clone();

      run = {
        t: 0,
        yaw: player.lookYaw,
        pitch: 0,
        eye,
        win,
        /** Where it was when the shot took it, and where it ends up. */
        from: at,
        /**
         * Square on, three and a half metres off the lens, on the floor.
         *
         * Both numbers are the corridor rather than taste. Three and a half
         * metres is where a five metre body fits in a lens standing two
         * metres off the glass: closer and the frame is a mouth, further
         * back and there is corridor either side of it, and there is now
         * twenty-two metres of corridor behind it to be further back into.
         * And the height is measured off the
         * floor and not off your eyes: the body is about five metres tall
         * once it has crushed itself down to this corridor, so its middle
         * sits at 2.9 to leave its bottom edge a hand's width clear of the
         * concrete — which is what makes the sink at the end read as going
         * down rather than as going through.
         */
        to: new THREE.Vector3(win.x, win.floor + 2.9, eye.z + 3.2),
        broke: false,
        died: false,
        /** Where the hand was holding it, which is where the swing starts. */
        heldAt: null,
        /** And where it was when the hand opened, which is where it stays. */
        restAt: null,
        screeched: false,
        wailed: false,
        jumped: false,
        grabSaid: false,
        crushSaid: false,
        dropSaid: false,
      };

      /**
       * It stops being a chase and starts being a shot, and the handover is
       * one call. `seize` keeps the limbs, the tail and the face running and
       * leaves where it is and which way it is looking to whoever is driving
       * — which from here is this file, every frame, to the end.
       */
      beast.seize();
      fill.visible = true;
      fill.intensity = 0;
      player.setEnabled(false);
      document.body.classList.add('cutscene');

      // The bucket is the real one. Its own update is switched off for the
      // duration by the loop in main.js, so writing to the mesh sticks.
      friend.mesh.visible = true;
      friend.mesh.scale.set(1, 1, 1);
      friend.mesh.rotation.set(0, 0, 0);
      // Out of shot, on the floor, off to the side it will come in from.
      friend.mesh.position.set(at.x + 3.2, win.floor, at.z - 1.0);
      bucketAt.copy(friend.mesh.position);
    },

    update(delta) {
      if (!run) return;
      run.t += delta;
      const t = run.t;
      const { win } = run;
      // Up over the first second, down over the last two: the scene arrives
      // out of the dark and goes back into it.
      fill.intensity = 9 * Math.min(1, t / 1.0) * (1 - over(t, AT.over - 2.0, AT.over));

      // ---------------------------------------------------------- the animal
      /**
       * It comes the last of the distance and then it is held there,
       * because everything after that happens to it rather than by it.
       */
      const closing = EASE(over(t, 0, AT.close));
      here.lerpVectors(run.from, run.to, closing);

      /**
       * The thrash, which runs from the frame the bucket lands on its face
       * to the frame the hand opens, and comes off as it dies rather than
       * stopping. There is no second number in here: `fury` is one up at
       * the hit and one down over the squeeze, and everything that shakes
       * is that number times an amplitude.
       */
      const fury = (1 - over(t, AT.crushed, AT.down)) * (t > AT.hit ? 1 : 0);
      here.x += Math.sin(t * 23) * 0.32 * fury;
      here.y += Math.sin(t * 17 + 1.3) * 0.22 * fury;

      /**
       * And it dies, which is it going over rather than going away.
       *
       * It used to sink — straight down, with a lean on it — on the
       * reasoning that something this size does not topple in a corridor
       * nine metres across. What it actually reads as is a lift descending,
       * and what a thing dying in front of you does is fall over.
       *
       * So it falls, and face first, because the face is the whole animal:
       * everything you have been afraid of for the last twenty minutes is
       * on the front of it and the shot ends with that front against the
       * floor. Two parts — `sag`, a second of it failing to hold itself up,
       * and `tip`, squared rather than eased because the last third of a
       * fall is faster than the first and a smoothstep lands things like
       * feathers.
       *
       * The three numbers under it are all one measurement. The body is
       * five and a half metres from its bottom edge to its top and its
       * middle is 2.9 off the floor, so a quarter turn about that middle
       * has to come down a bit over two metres to put the flat of it on the
       * concrete, and the top half of it — which is the half coming at you
       * — sweeps two and three quarters forward in the doing. It goes back
       * nine tenths of a metre while it falls so that what lands in front
       * of the lens lands in front of it and not through it.
       */
      const sag = EASE(over(t, AT.dying, AT.topple));
      const going = over(t, AT.topple, AT.down);
      const tip = going * going;
      here.y -= sag * 0.35 + tip * 1.75;
      here.z += tip * 0.9;
      beast.group.position.copy(here);
      /**
       * Negative, and that is not a taste call.
       *
       * The face is drawn in the group's local +z and the group is turned a
       * half turn to look at you, so with y at pi the local +z is pointing
       * down the corridor at the lens. Under that turn a positive x tips the
       * face up at the ceiling and lays the thing on its back — which is
       * what the lean on the old sink was doing, at a fifth of a radian,
       * too small for anybody to notice it was the wrong way. A quarter turn
       * the other way is the face against the floor.
       */
      beast.group.rotation.x =
        -(sag * 0.14 + tip * (Math.PI / 2 - 0.14)) + Math.sin(t * 13) * 0.04 * fury;
      beast.group.rotation.y = Math.PI + Math.sin(t * 9) * 0.06 * fury;

      /**
       * The scream, which is the one sound in this it makes about itself.
       *
       * Everything else it has screeched at is a thing it was doing to you.
       * This one is on `dying` and not on the impact: it goes up as the body
       * starts to give, and what cuts it off is the floor.
       */
      if (t >= AT.dying && !run.wailed) {
        run.wailed = true;
        playScreech(1);
      }

      /**
       * And the frame it lands is the frame the screen goes out, which is
       * the only way this animal has of being dead. See `die`.
       *
       * Both halves of the sound, because this is five metres of meat and a
       * television arriving on concrete at once: the collapse is the mass
       * and the lunge is the wet of it.
       */
      if (t >= AT.down && !run.died) {
        run.died = true;
        beast.die();
        playCollapse(0.85);
        playMeatLunge(1);
      }

      if (t >= AT.hit && !run.screeched) {
        run.screeched = true;
        playScreech(1);
        playMeatLunge(0.9);
      }

      // ---------------------------------------------------------- the bucket
      faceOf(here);
      if (t < AT.leap) {
        // Standing on the floor, having come from somewhere it should not
        // have been able to come from, which is the last thing it does.
        if (!run.jumped && t > AT.close) {
          run.jumped = true;
          playBucketJump(1);
        }
        friend.mesh.position.copy(bucketAt);
        friend.mesh.lookAt(look.x, win.floor, look.z);
      } else if (t < AT.hit) {
        // The leap: a parabola at the face, not a lerp, because the one
        // thing that has to read here is that it jumped.
        const k = over(t, AT.leap, AT.hit);
        friend.mesh.position.lerpVectors(bucketAt, look, k);
        friend.mesh.position.y += Math.sin(k * Math.PI) * 0.9;
        friend.mesh.rotation.x = -k * 1.2;
      } else if (t < AT.caught) {
        // On the face, and going wherever the face goes.
        friend.mesh.position.set(look.x, look.y + 0.1, look.z - 0.25);
        friend.mesh.rotation.x = -1.2 + Math.sin(t * 27) * 0.25;
        friend.mesh.rotation.z = Math.sin(t * 19) * 0.3;
      } else if (t < AT.drop) {
        // In the hand, and then the hand closes.
        const squeeze = over(t, AT.crush, AT.crushed);
        friend.mesh.position.copy(run.palmAt ?? friend.mesh.position);
        friend.mesh.scale.set(1 + squeeze * 0.35, 1 - squeeze * 0.62, 1 - squeeze * 0.3);
        if (t >= AT.crush && !run.crushSaid) {
          run.crushSaid = true;
          playCrush(1);
        }
      } else {
        /**
         * What is left of it, on the floor.
         *
         * Where the hand was when it opened, and not where the hand is:
         * the same hand goes on to the window, and a bucket that follows it
         * there is a bucket being carried rather than dropped.
         */
        run.restAt = run.restAt ?? (run.palmAt ? run.palmAt.clone() : here.clone());
        const fell = over(t, AT.drop, AT.drop + 0.5);
        if (!run.dropSaid && fell >= 1) {
          run.dropSaid = true;
          playBucketLand(0.9);
        }
        const y = run.restAt.y * (1 - fell) + (win.floor + 0.18) * fell;
        friend.mesh.position.set(run.restAt.x, y, run.restAt.z + 0.4);
        friend.mesh.rotation.set(1.3, 0.4, 0.6);
      }

      // ------------------------------------------------------------ the hand
      if (t >= AT.grab) {
        arm.visible = true;
        /**
         * Where the palm goes, as a point, and the arm is solved to it.
         *
         * Three moves and one solver, so the hand is never in a pose this
         * file did not ask for: in from the right onto the thing stuck to
         * the face, then still, then up over the lens and down onto the
         * glass.
         *
         * The still one is the fall. The reach is written against `look`,
         * which is the animal's face and is live every frame, and for as
         * long as the body only sank that was the hand coming down with it.
         * A face that goes over sends the face two and three quarter metres
         * forward, and an arm still tracking it swings through the lens and
         * out of the back of your head. So the frame the hand opens is the
         * frame it stops being told where the face is: it hangs where it
         * let go, which is also what an arm that has just dropped something
         * does.
         */
        const holding = t < AT.drop + 0.4;
        if (holding) {
          const reach = EASE(over(t, AT.grab, AT.caught));
          want.set(
            look.x + 3.4 - reach * 2.6,
            look.y + 1.0 - reach * 1.1,
            look.z - 0.2 - reach * 0.5
          );
          grip(over(t, AT.caught, AT.crushed));
          if (t >= AT.drop) grip(Math.max(0, 1 - over(t, AT.drop, AT.drop + 0.4)));
          if (!run.grabSaid && reach >= 1) {
            run.grabSaid = true;
            playMeatLunge(0.7);
          }
          run.heldAt = run.heldAt ?? new THREE.Vector3();
          run.heldAt.copy(want);
        } else if (t < AT.swing) {
          want.copy(run.heldAt);
          grip(0.18);
        } else {
          /**
           * And it comes down, which is the last thing in the building.
           *
           * Over the top of you rather than at you: the hand goes up out of
           * frame, across, and lands on the one pane of glass in this place
           * a metre and a half from your face. The lift in the middle of
           * the swing is what makes it an arc and not a slide.
           */
          const swing = EASE(over(t, AT.swing, AT.glass));
          const from = run.heldAt;
          want.set(
            from.x + (win.x - from.x) * swing,
            from.y + (win.y - from.y) * swing + Math.sin(swing * Math.PI) * 1.8,
            from.z + (win.z + 0.7 - from.z) * swing
          );
          grip(0.18);
          if (swing >= 1 && !run.broke) {
            run.broke = true;
            lift.breakTheWindow();
            // An instruction and not an observation. It is the last one in
            // the game and the only way out of the building, and a metre of
            // sill means it is also the only objective in here that cannot
            // be walked into.
            setObjective('Out of the window');
          }
        }
        putHandAt(want, t);

        // Where the palm actually ended up, which is where the bucket is
        // once the hand has it. Off the matrix rather than worked out,
        // because three nested rotations is exactly the sort of arithmetic
        // that is wrong by a hand's width and looks it.
        palm.updateWorldMatrix(true, false);
        run.palmAt = run.palmAt ?? new THREE.Vector3();
        run.palmAt.setFromMatrixPosition(palm.matrixWorld);
        run.palmAt.y -= 0.3;
      }

      // ------------------------------------------------------------ the lens
      /**
       * Four turns and nothing else.
       *
       * The animal while it is still an animal; the floor, while what is
       * left of your friend is landing on it; back up to the animal for the
       * fall, which is the one thing in this sequence you could not be
       * looking away from; and then round behind you for the window.
       *
       * The third of those is `look`, which is the face — so the lens goes
       * over with it, and the turn down onto the floor at the end of the
       * fall is the camera following a thing down rather than a camera
       * being pointed at a floor.
       */
      if (t < AT.drop) aim(look, 6, delta);
      else if (t < AT.dying) aim(friend.mesh.position, 3.4, delta);
      else if (t < AT.swing) aim(look, 3.0, delta);
      else aim(run.broke ? { x: win.x, y: win.y, z: win.z } : arm.position, 2.6, delta);

      /**
       * And the floor kicks, for half a second, on the frame it lands.
       *
       * Written onto the camera after the aim and not into `run.pitch`, so
       * it shakes the shot without being in the angle the player is handed
       * back at the end of it.
       */
      if (t >= AT.down && t < AT.down + 0.55) {
        const kick = 1 - (t - AT.down) / 0.55;
        camera.rotation.x += Math.sin((t - AT.down) * 46) * 0.055 * kick * kick;
      }

      if (t >= AT.over) {
        const yaw = run.yaw;
        const pitch = run.pitch;
        run = null;
        done = true;
        // The arm stays where it fell. It is the last thing in the building
        // and it is lying across a broken window, which is the state this
        // game ends in.
        document.body.classList.remove('cutscene');
        // Handed back looking where the shot left off, or the last frame of
        // this is a cut to somewhere you were not.
        player.teleport({ position: player.position.toArray(), yaw, pitch });
        player.setEnabled(true);
        onFinished?.();
      }
    },

    reset() {
      run = null;
      done = false;
      arm.visible = false;
      fill.visible = false;
      fill.intensity = 0;
      grip(0);
      friend.mesh.scale.set(1, 1, 1);
      friend.mesh.rotation.set(0, 0, 0);
      document.body.classList.remove('cutscene');
    },
  };
}
