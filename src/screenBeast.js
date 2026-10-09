import * as THREE from 'three';
import { makeMetalPanelSurface, metalRepeat } from './textures.js';
import { buildScreenFace, createScreenLife, buildWire, FACE } from './screenFace.js';
import { createChaseMusic, playSpikeGrind, playScreech, playMeatLunge } from './audio.js';

/**
 * The thing that comes out of the wall.
 *
 * It is the screen off the front of the machine in the storage room, torn out
 * of its cabinet with the frame still round it and the cables still trailing
 * out of the back, and it is now coming down the shed at you.
 *
 * **It is the same face, again, and this time that is the horror rather than
 * the economy.** screenFace.js has one character in it and two televisions for
 * it to be on; the storage room made a third at full size, and this makes that
 * third one mobile. Nothing is redrawn. The reason the thing chasing you is
 * frightening is that you have been taking directions from it since the ward.
 *
 * **It does not collide with the world and that is deliberate.** Everything
 * else in this game that moves is pushed out of boxes every frame. This is
 * eleven metres across in a room whose aisle is eight, so a version of it that
 * respected the racking would be a version of it that stopped at the first bay
 * and stood there. Instead it goes through, and the racking goes over: `wreck`
 * is called with where it is, and the room decides what that ruins. The
 * collapsing shelving is not decoration on the chase, it is the chase — it is
 * the only thing in the room that reports how far back the thing is once you
 * have stopped daring to turn round.
 *
 * **It never has to be outrun, only beaten to the hole.** See SPEED.
 */

/**
 * How fast it comes, and why those two numbers.
 *
 * You walk at 3.1 and run at 5.6. It starts at 3.0, which is a shade under
 * your walk — for the first second or two you can back away from it while you
 * work out what you are looking at, and that is the only moment this room
 * gives you to understand what has happened. It ends at 4.6, between the two,
 * so the chase is lost by walking and won by running and there is no third
 * answer.
 *
 * **It ends at 6.4, which is faster than you can run, and that is the only
 * version of this that is a chase.** Two earlier passes topped out under the
 * sprint — 4.6 — and both produced the same thing: a route seventy metres
 * long on which the gap only ever grows, so the thing was never nearer than
 * eight metres, arrived at the hall after the shutter had shut, and the hall
 * built to the width of its screen never had it in it. A pursuer slower than
 * the pursued is not pursuing, it is following.
 *
 * Above the sprint, the arithmetic turns over: you get a head start while it
 * tears itself off the wall, and it spends the rest of the room taking that
 * back about a metre every two seconds. You reach the shutter with it behind
 * you and not much of the head start left. Stop once and it has you.
 *
 * That it demands a sprint is the one real cost. Everything else that chases
 * you in this building is slower than a walk — the wall in the red hall moves
 * at 0.65 — so this is the first time the game asks for the run key, and it
 * says so: see the note on the frame the chase starts.
 */
const SPEED = { from: 3.0, to: 6.4, ramp: 10 };

/**
 * How near it has to be before it has you.
 *
 * `flat` is generous and `high` has to be: it hangs about three metres over
 * your feet, so a catch test that wanted you level with the middle of an
 * eleven-metre screen would never fire. Measured against the player's feet
 * because that is the one point on a body this game always knows.
 */
const REACH = { flat: 1.9, high: 3.8 };

/**
 * Coming out, in seconds from the word go.
 *
 * `shake` is the cabinet failing before anything leaves it, which is the only
 * warning you get and has to be long enough to turn round in. `tear` is the
 * screen coming forward out of the hole. `free` is when it starts hunting —
 * deliberately after the tear has finished, so there is a beat where the thing
 * is out, hanging, and not yet moving. Nothing in this game is as frightening
 * as the moment before it starts.
 *
 * All three are shorter than they want to be, because every second of this is
 * a second the player spends running away from something that is not yet
 * moving. At 4.2 the head start was twenty-three metres before the chase had
 * begun, which is most of the shed. At 2.9 it is about fourteen, which is
 * close enough to see over your shoulder.
 */
export const BREAKOUT = { shake: 1.2, tear: 2.4, free: 2.9 };

/** How far back it can be and still be worth scoring the music off. */
const EARSHOT = 26;

/**
 * @param scene    the world
 * @param player   whose feet it is coming for
 * @param death    the screen that goes up when it gets there
 * @param screen   { wide, high } of the glass it is built round
 * @param faceScale the same multiple the wall's face was drawn at
 * @param at       where it starts: the middle of the glass, in world space
 * @param gate     { x, y, z, width, height } the one hole it has to fit through
 * @param wreck    called with the beast's position, for the room to ruin
 * @param onCatch  called the frame it has you, before the death screen
 */
export function createScreenBeast({
  scene,
  player,
  death,
  screen,
  faceScale,
  at,
  gate,
  wreck,
  onCatch,
}) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const dark = new THREE.MeshStandardMaterial({ color: '#1d1f1a', roughness: 0.9, metalness: 0.3 });

  /**
   * The frame, and it is four bars rather than a box with a hole in it.
   *
   * It has to read as having been *in* something a second ago. A clean bezel
   * flying at you is a television; four torn bars with the wall's fixings
   * still on them is a television that has been pulled off a wall, and the
   * difference is entirely in the edges.
   */
  const steel = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(screen.wide, screen.high), '#6b6d64'),
    metalness: 0.4,
    roughness: 0.6,
  });
  const edge = 0.46;
  for (const [w, h, x, y] of [
    [screen.wide + edge * 2, edge, 0, screen.high / 2 + edge / 2],
    [screen.wide + edge * 2, edge, 0, -screen.high / 2 - edge / 2],
    [edge, screen.high, -screen.wide / 2 - edge / 2, 0],
    [edge, screen.high, screen.wide / 2 + edge / 2, 0],
  ]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), steel);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    group.add(bar);
  }

  // The tear itself: lumps of the cabinet still bolted to the back of it,
  // ragged along the top where the fixings let go last.
  for (let i = 0; i < 11; i++) {
    const w = 0.5 + ((i * 29) % 5) * 0.22;
    const shard = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3 + ((i * 17) % 4) * 0.26, 0.5), dark);
    shard.position.set(
      -screen.wide / 2 + 0.4 + (i * (screen.wide - 0.8)) / 10,
      screen.high / 2 + edge + 0.1,
      -0.12
    );
    shard.rotation.z = (((i * 13) % 7) - 3) * 0.12;
    group.add(shard);
  }

  // The glass, and the face in it. A second `createScreenLife`, because this
  // is a second screen — the one on the wall is still there with a hole where
  // this came out of it, and they are not the same object.
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#101d16'), toneMapped: false });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(screen.wide, screen.high), glassMat);
  glass.position.z = 0.18;
  group.add(glass);

  const { group: faceGroup, eyes, mouth, faceParts } = buildScreenFace();
  faceGroup.scale.setScalar(faceScale);
  faceGroup.position.z = 0.22;
  group.add(faceGroup);

  const glow = new THREE.PointLight(FACE, 0, 22, 1.7);
  glow.position.z = 1.6;
  group.add(glow);
  const life = createScreenLife({ eyes, mouth, faceParts, glow, glowLevel: 4.2 });

  /**
   * Cables out of the back, which are the only part of it that looks heavy.
   *
   * It has no body. A slab sliding through the air is a slab; a slab dragging
   * nine feeds behind it is a head that has been pulled off something, and the
   * cables are what sell the weight because they are the only part of the
   * silhouette that moves on its own.
   */
  const tails = [];
  for (let i = 0; i < 9; i++) {
    // Each on its own pivot at the point it leaves the back, because a wire
    // swung about the middle of an eleven-metre slab does not swing, it
    // orbits.
    const pivot = new THREE.Group();
    pivot.position.set(
      (i / 8 - 0.5) * screen.wide * 0.86,
      (((i * 23) % 5) / 4 - 0.5) * screen.high * 0.7,
      -0.2
    );
    pivot.add(
      buildWire(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3((i % 3) * 0.2 - 0.2, (i % 2) * 0.3 - 0.15, -1).normalize(),
        1.4 + (i % 4) * 0.55,
        ['#6d2a24', '#2c3a50', '#4a4330'][i % 3]
      )
    );
    group.add(pivot);
    tails.push({ pivot, phase: i * 0.7 });
  }

  /**
   * And the music, which is the red hall's cue a minor third down.
   *
   * Same instrument, same pressure rule, different key — see createChaseMusic.
   * Two monsters in one building should sound like the same building has a
   * second one, not like a second game.
   */
  const music = createChaseMusic({ root: 36.71, tempo: [84, 62] });

  /**
   * Which way it is pointing before it starts turning for itself.
   *
   * The face is drawn in the group's local +z, so a yaw of -pi/2 puts it
   * down the room at -x: the same way the screen on the wall was pointing,
   * because for the first two seconds it still is that screen. It was Math.PI
   * — edge on — and the breakout read as a filing cabinet sliding out of the
   * wall sideways, with the face invisible and the cables across the front
   * of it. Nine metres of the most important moment in the room spent looking
   * at the thin side of it.
   */
  const FACING = -Math.PI / 2;

  /**
   * How high over your feet it hangs, which is not a taste decision.
   *
   * It has no legs and nothing holding it up, so it has to pick a height, and
   * the only wrong answers are the ones that put its bottom edge through the
   * floor you are standing on. Half its own height plus a hand's width of
   * clearance: measured from the slab rather than guessed, so it is still
   * right when the screen is resized, and still right when you are standing
   * on the top of a stack of crates rather than on the floor of the shed.
   */
  const LIFT = screen.high / 2 + edge + 0.2;

  /** 'wait' | 'out' | 'hunt' | 'done' */
  let phase = 'wait';
  let since = 0;
  let hunted = 0;
  let caught = false;
  /**
   * What it is saying, and it does not stop saying it.
   *
   * The face's brows and its frown live on the line being delivered — see
   * createScreenLife — so a screen that has finished talking is a screen with
   * a neutral expression on it, and the first run of this chase had eleven
   * metres of mildly interested face following the player down a corridor.
   *
   * Keeping it talking is the fix and it is also the better scene. It is the
   * same voice that told you where to go for the whole building; the horror
   * is that it has not stopped being conversational about it.
   */
  let script = null;
  let nextLine = 0;
  let quietFor = 0;
  const home = new THREE.Vector3(at.x, at.y, at.z);
  const here = new THREE.Vector3().copy(home);
  const want = new THREE.Vector3();

  /** Which side of the gate's wall a point is on. -1 is the shed, 1 is beyond. */
  const sideOf = (z) => (z < gate.z ? 1 : -1);

  const speed = () => SPEED.from + (SPEED.to - SPEED.from) * Math.min(1, hunted / SPEED.ramp);

  const distanceTo = (p) => Math.hypot(here.x - p.x, here.z - p.z);

  return {
    group,

    get isOut() {
      return phase === 'out' || phase === 'hunt';
    },

    get isHunting() {
      return phase === 'hunt';
    },

    /** Where it is, for a harness and for whatever wants to know how bad it is. */
    get position() {
      return here.clone();
    },

    /** How close it is as the music hears it, nought to one. */
    get pressure() {
      if (phase !== 'hunt') return 0;
      return 1 - Math.min(1, distanceTo(player.position) / EARSHOT);
    },

    /** Metres, flat, to whoever it is after. For a harness. */
    get range() {
      return +distanceTo(player.position).toFixed(2);
    },

    start(lines) {
      if (phase !== 'wait') return;
      phase = 'out';
      since = 0;
      hunted = 0;
      caught = false;
      here.copy(home);
      group.visible = true;
      group.position.copy(home);
      group.rotation.y = FACING;
      playSpikeGrind(1);
      music.start();
      /**
       * Held until it is loose, rather than said on the way out.
       *
       * Two reasons, and the second is a real bug. The scene is better: it
       * comes off the wall in silence and starts talking when it starts
       * moving. And the subtitle is one element shared by every speaker in
       * the game — `hideSubtitle` is module state in voice.js — so a line
       * started here is a line the wall's own screen wipes off the bottom of
       * the frame when the room shuts it up at the breakout, which happens
       * one and a half seconds after this.
       */
      script = lines ?? null;
      nextLine = 0;
      quietFor = 0;
    },

    /**
     * It gave up — something came down between you.
     *
     * No sound of its own. Whatever stopped it is the thing that made the
     * noise, and a second bang on the same frame reads as a bug.
     */
    stop() {
      if (phase === 'done' || phase === 'wait') return;
      phase = 'done';
      music.stop();
      life.stop();
    },

    reset() {
      phase = 'wait';
      since = 0;
      hunted = 0;
      caught = false;
      here.copy(home);
      script = null;
      nextLine = 0;
      quietFor = 0;
      group.visible = false;
      group.position.copy(home);
      group.rotation.y = FACING;
      glassMat.color.set('#101d16');
      life.stop();
      music.stop();
    },

    update(delta) {
      music.setPressure(this.pressure);
      music.update();
      if (phase === 'wait') return;
      since += delta;

      if (phase === 'out') {
        /**
         * Coming forward out of the hole, and dropping as it comes.
         *
         * It is bolted to a wall at four metres and it ends up hanging at
         * head height, so the tear is one move with two parts: out along -x
         * into the room, and down. Eased on a curve that starts slowly —
         * the first second is the fixings going rather than the screen
         * moving, which is what the shaking in the cabinet behind it is.
         */
        const t = Math.max(0, Math.min(1, (since - BREAKOUT.shake) / (BREAKOUT.tear - BREAKOUT.shake)));
        const eased = t * t * (3 - 2 * t);
        here.set(home.x - eased * 3.6, home.y - eased * 1.1, home.z);
        group.position.copy(here);
        group.rotation.z = Math.sin(since * 23) * 0.035 * (1 - eased) + eased * 0.06;
        if (since >= BREAKOUT.shake && since < BREAKOUT.shake + delta) playScreech(0.9);
        if (since >= BREAKOUT.free) {
          phase = 'hunt';
          playMeatLunge(0.8);
          if (script) life.speak(script);
        }
      } else if (phase === 'hunt') {
        hunted += delta;

        // Round again, from wherever it left off, after a beat of quiet. The
        // beat matters: a screen with no gaps in it is a tape, and the point
        // of this is that it is still a person talking to you.
        if (script && !life.isSpeaking) {
          quietFor += delta;
          if (quietFor > 1.6) {
            quietFor = 0;
            life.speak(script.slice(nextLine % script.length).concat(script.slice(0, nextLine % script.length)));
            nextLine += 1;
          }
        }

        /**
         * Where it is going, which is you unless a wall is in the way.
         *
         * The only obstacle it respects in the whole building is the one hole
         * it has to fit through. If you and it are on opposite sides of that
         * wall it steers for the middle of the opening first and for you
         * afterwards, which is the difference between a thing that follows
         * you up through the roof and a thing that slides through eleven
         * metres of brick on the way.
         */
        const prey = player.position;
        const split = sideOf(prey.z) !== sideOf(here.z);
        want.set(
          split ? gate.x : prey.x,
          (split ? gate.y : prey.y + LIFT) + Math.sin(hunted * 1.7) * 0.18,
          split ? gate.z + (sideOf(prey.z) > 0 ? -0.6 : 0.6) : prey.z
        );

        const step = speed() * delta;
        const dx = want.x - here.x;
        const dy = want.y - here.y;
        const dz = want.z - here.z;
        const flat = Math.hypot(dx, dz);
        if (flat > 0.001) {
          const move = Math.min(step, flat);
          here.x += (dx / flat) * move;
          here.z += (dz / flat) * move;
        }
        // Up faster than along, so it is never left hanging under a sill it
        // has already arrived at.
        here.y += Math.max(-step * 1.6, Math.min(step * 1.6, dy));

        group.position.copy(here);
        // Turned to face whatever it is going at. The face is drawn in the
        // group's +z, so this is atan2 of the heading and not the usual
        // atan2(-dx, -dz) the bodies in this game use.
        const look = Math.atan2(prey.x - here.x, prey.z - here.z);
        let turn = look - group.rotation.y;
        while (turn > Math.PI) turn -= Math.PI * 2;
        while (turn < -Math.PI) turn += Math.PI * 2;
        group.rotation.y += turn * (1 - Math.exp(-4 * delta));
        group.rotation.z = Math.sin(hunted * 2.3) * 0.05;

        wreck?.(here);

        if (
          !caught &&
          !death.isShowing &&
          distanceTo(prey) < REACH.flat &&
          Math.abs(here.y - prey.y) < REACH.high
        ) {
          caught = true;
          playScreech(1);
          onCatch?.();
        }
      }

      // The cables, trailing behind whatever it has just done.
      for (const tail of tails) {
        tail.pivot.rotation.x = Math.sin(since * 1.9 + tail.phase) * 0.22;
        tail.pivot.rotation.z = Math.cos(since * 1.4 + tail.phase) * 0.26;
      }

      life.update(delta, 1);
    },
  };
}
