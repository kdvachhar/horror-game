import * as THREE from 'three';
import { makeMetalPanelSurface, metalRepeat } from './textures.js';
import { buildScreenFace, createScreenLife, FACE } from './screenFace.js';
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
   * The casing, and it is four bars round the glass.
   *
   * This used to be ragged on purpose: torn bars, lumps of cabinet still
   * bolted to the top, nine cables hanging off the back, because the idea
   * was a screen that had been pulled off a wall.
   *
   * That is not what this is any more. It is an animal with a television for
   * a body, and an animal's body is not wreckage — it is the shape it has
   * always been. The casing is clean, the limbs below do the work the tear
   * used to, and what sells "it came out of the wall" is the hole it leaves
   * in the cabinet rather than the bits of cabinet it takes with it.
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

  /**
   * A backing behind all of it, and it is load-bearing twice.
   *
   * Scenery first: there was nothing between the four frame bars but the
   * glass, so from any angle that was not square on you could see the room
   * through the middle of the thing, which is not how a television works.
   *
   * It is a quarter again larger than the frame and no more. There was a
   * version that tried to make this the thing that fills the screen in
   * screenScare.js, which it cannot be: a 75 degree lens three metres off a
   * vertical plane wants about twenty metres of it, and a black rectangle
   * that size trailing the beast down the shed is a hole in the room. The
   * shot carries its own backdrop for that; this is just the back of a
   * television.
   */
  const backing = new THREE.Mesh(
    // The casing's own size and not a bit more. It was a quarter again
    // larger, from when this was a slab with nothing else to its name, and
    // it was then quietly the widest part of the animal: the first span
    // taken after the limbs went on read 14.92, which was this, not them.
    new THREE.PlaneGeometry(screen.wide + edge * 2, screen.high + edge * 2),
    new THREE.MeshBasicMaterial({ color: '#05060a', toneMapped: false, fog: false })
  );
  backing.position.z = -0.1;
  group.add(backing);

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

  /**
   * And the rest of it, which is a lizard.
   *
   * Four banded limbs off the back of the casing and a long banded tail, and
   * the bands are most of what makes it read: a smooth limb is a tube and a
   * ringed one is an animal, which is the whole of the difference between a
   * television with sticks on it and a thing that is about to be on top of
   * you.
   *
   * **The limbs come out from behind the screen and not off its corners.**
   * In the drawing they sprout from the four corners of the set, which is
   * the right picture and the wrong metre: the hall at the top of the stair
   * is cut to this thing's width, half a metre either side, and arms off the
   * corners put five more metres on the span. Rooted inboard at a third of
   * the width and swept up and down more than out, the whole animal still
   * fits through its own door. See `span` below, which is measured rather
   * than asserted.
   */
  const hide = new THREE.MeshStandardMaterial({ color: '#4c4f44', roughness: 0.88, metalness: 0.08 });
  const band = new THREE.MeshStandardMaterial({ color: '#23251e', roughness: 0.92, metalness: 0.1 });

  /**
   * One limb: segments down a chain, each hung off the end of the last, so
   * the whole thing bends from the shoulder by turning one group.
   *
   * Tapered, banded, and finished with four splayed digits — four because
   * that is what is drawn and because a fifth at this size is a rounding
   * error on a shape nobody gets to look at for more than a second.
   */
  const buildLimb = (length, thick) => {
    const root = new THREE.Group();
    const joints = [root];
    const parts = 3;
    let parent = root;
    for (let i = 0; i < parts; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : -(length / parts);
      parent.add(seg);
      const t = thick * (1 - i * 0.16);
      const bone = new THREE.Mesh(new THREE.BoxGeometry(t, length / parts, t * 0.78), hide);
      bone.position.y = -(length / parts) / 2;
      bone.castShadow = true;
      seg.add(bone);
      // The rings. Three to a segment, proud enough to catch the light.
      for (let r = 1; r <= 3; r++) {
        const ring = new THREE.Mesh(
          new THREE.BoxGeometry(t * 1.1, length / parts * 0.07, t * 0.88),
          band
        );
        ring.position.y = -(length / parts) * (r / 4);
        seg.add(ring);
      }
      joints.push(seg);
      parent = seg;
    }
    // The hand, at the end of the last one.
    const paw = new THREE.Group();
    paw.position.y = -(length / parts);
    parent.add(paw);
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(thick * 0.9, thick * 0.7, thick * 0.6),
      hide
    );
    palm.position.y = -thick * 0.3;
    paw.add(palm);
    for (let d = 0; d < 4; d++) {
      const digit = new THREE.Group();
      digit.position.y = -thick * 0.6;
      digit.rotation.z = (d - 1.5) * 0.34;
      paw.add(digit);
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(thick * 0.17, thick * 0.78, thick * 0.17),
        hide
      );
      finger.position.y = -thick * 0.39;
      digit.add(finger);
    }
    return { root, joints, paw };
  };

  /**
   * Where the four of them go, and which way they point.
   *
   * `out` is the sideways lean off vertical. The top pair reach up and out
   * and the bottom pair down and out, which is the drawing's pose and also
   * the one that keeps the span inside the casing's own width.
   */
  /**
   * And they fold, which is the only reason the drawing and the building can
   * both be right.
   *
   * Spread, this animal is about fifteen across and thirteen tall. The hole
   * at the top of the crate stair is 11.5 by 5.9, cut to the television when
   * the television was all there was. One of those numbers had to give, and
   * the ways of giving were: shorter limbs, which is not what is drawn; a
   * bigger hole, which does not fit — the sill is at 3.6 in a room with ten
   * metres of head, so an opening tall enough for it spread would come out
   * through the ceiling; or it tucks.
   *
   * It tucks. Everything with four legs and a door to get through does, and
   * it is the one answer that costs nothing: the limbs swing back flat
   * against the body as it comes up on the wall and open again on the far
   * side. The moment it threads itself through a hole it does not fit
   * through is better than either thing it replaces.
   */
  const TUCK = { from: 7.0, tight: 2.0 };

  const limbs = [];
  for (const [side, up] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const reach = up > 0 ? screen.high * 0.86 : screen.high * 0.78;
    // Thick. At 0.62 against an eleven-metre body they read as sticks; the
    // drawing's are heavy enough to be the reason the thing can move.
    const limb = buildLimb(reach, 0.95);
    // 0.29 and not 0.3. Folded it measured 11.57 across a hole of 11.5, and
    // the seven centimetres were the fingertips.
    limb.root.position.set(side * screen.wide * 0.29, (up * screen.high) / 2 - up * 0.3, -0.34);
    // Built hanging down the -y axis, so a top limb is the same limb turned
    // over. The lean is the same sign as the side it is on.
    limb.root.rotation.z = up > 0 ? Math.PI - side * 0.55 : side * 0.5;
    group.add(limb.root);
    limbs.push({
      ...limb,
      side,
      up,
      phase: (side + 1) + (up + 1) * 1.7,
      lean: limb.root.rotation.z,
      /** The same limb with the lean taken out: straight up, or straight down. */
      straight: up > 0 ? Math.PI : 0,
    });
  }

  /**
   * The tail, which is the same chain again and longer.
   *
   * Off the back and to one side, curling up at the end the way it is drawn.
   * Every segment is a child of the one before it, so a wave put into the
   * first joint travels the whole length without anything having to work out
   * where the end of it is.
   */
  const tail = [];
  {
    let parent = group;
    const links = 11;
    for (let i = 0; i < links; i++) {
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(screen.wide * 0.26, -screen.high * 0.1, -0.5);
      else seg.position.z = -0.78;
      // Gently. Each link is a child of the last, so a turn put in here is
      // paid eleven times: at 0.09 a link the tail came round through eighty
      // degrees and put the animal's widest point three metres outside its
      // own shoulder, which is a tail that does not go through the hole the
      // rest of it does.
      seg.rotation.x = i === 0 ? -0.18 : 0.055;
      seg.rotation.y = i === 0 ? 0.26 : 0.042;
      parent.add(seg);
      const t = 0.66 * (1 - i / (links + 2));
      const bone = new THREE.Mesh(new THREE.BoxGeometry(t, t * 0.9, 0.8), hide);
      bone.position.z = -0.4;
      bone.castShadow = true;
      seg.add(bone);
      const ring = new THREE.Mesh(new THREE.BoxGeometry(t * 1.12, t * 1.0, 0.09), band);
      ring.position.z = -0.72;
      seg.add(ring);
      tail.push(seg);
      parent = seg;
    }
  }

  /**
   * And the maw, which is the face it pulls when it is loose.
   *
   * A jagged burst with a hole in it and a ring of teeth round the hole,
   * drawn flat on the glass in the same light the eyes are, because it is
   * part of the picture on the screen and not a thing bolted to the front of
   * it. Hidden while the thing is still on the wall: up there it has the
   * face it has had all game, and this is what that face turns into.
   *
   * Built out of THREE.Shape rather than boxes. Everything else this
   * character is made of is rectangles because everything else about it is
   * rectangular; a mouth full of triangles is the one place that stops being
   * true, and faking triangles out of turned boxes would show.
   */
  const star = (points, outer, inner) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? inner : outer;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return shape;
  };

  const maw = new THREE.Group();
  maw.position.set(0, -screen.high * 0.16, 0.24);
  maw.scale.set(1.25, 1, 1);
  maw.visible = false;
  group.add(maw);
  const mawParts = [];
  const lit = () => new THREE.MeshBasicMaterial({ color: FACE, toneMapped: false, side: THREE.DoubleSide });

  // The burst: a spiked ring, which is the outline the drawing has round the
  // whole mouth.
  // A bit over a third of the screen's height across, which is roughly the
  // share of the set the drawing gives it.
  const burstOuter = screen.high * 0.38;
  const burstInner = screen.high * 0.185;
  const burst = star(9, burstOuter, burstOuter * 0.66);
  burst.holes.push(star(9, burstInner * 1.08, burstInner * 0.74));
  const burstMesh = new THREE.Mesh(new THREE.ShapeGeometry(burst), lit());
  maw.add(burstMesh);
  mawParts.push(burstMesh);

  // The opening, which is the screen with nothing on it, and the teeth
  // standing in from the top and the bottom of it.
  const gape = new THREE.Mesh(
    new THREE.CircleGeometry(burstInner * 0.78, 18),
    new THREE.MeshBasicMaterial({ color: '#04070a', toneMapped: false })
  );
  gape.position.z = -0.01;
  maw.add(gape);

  for (const row of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const across = (i / 6 - 0.5) * burstInner * 1.42;
      const lip = row * Math.sqrt(Math.max(0, 1 - (across / (burstInner * 0.78)) ** 2)) * burstInner * 0.7;
      const long = burstInner * (0.34 + ((i * 13) % 3) * 0.1);
      const wide = burstInner * 0.19;
      const tooth = new THREE.Shape();
      tooth.moveTo(-wide, 0);
      tooth.lineTo(wide, 0);
      tooth.lineTo(0, -long);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(tooth), lit());
      mesh.position.set(across, lip, 0.01);
      mesh.rotation.z = row > 0 ? 0 : Math.PI;
      maw.add(mesh);
      mawParts.push(mesh);
    }
  }

  const glow = new THREE.PointLight(FACE, 0, 22, 1.7);
  glow.position.z = 1.6;
  group.add(glow);
  // The maw is lit the same way the eyes are: pushed into the face's own
  // parts list, so the breath and the flicker run through it rather than it
  // sitting at a constant brightness in the middle of a screen that is not.
  const life = createScreenLife({
    eyes,
    mouth,
    faceParts: [...faceParts, ...mawParts],
    glow,
    glowLevel: 4.2,
  });

  /**
   * Showing the teeth, which happens once and does not stop.
   *
   * On from the frame it comes off the wall. The drawing is of the thing
   * mid-chase and this is what it looks like mid-chase; the polite face is
   * for the cabinet. The normal mouth goes away while this is up — one face
   * has one mouth, and two would be two characters.
   */
  const bare = (on) => {
    maw.visible = on;
    mouth.visible = !on;
  };

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

  /** 'wait' | 'out' | 'hunt' | 'seized' | 'done' */
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

    /**
     * How big it is, frame and all, for whatever has to fit it in something.
     *
     * The hall is built to this and so is the shot that ends the chase. Both
     * of them asked for it rather than being told, because the one number
     * that must not drift in this game is how wide this thing is.
     */
    /**
     * How wide the whole animal actually is, limbs and all, from its own
     * bounding box.
     *
     * Measured and not worked out, because the thing it has to agree with is
     * a hole in a wall somebody else's file decides the size of. The limbs
     * were drawn off the corners of the set and had to come inboard to fit;
     * this is how that is checked rather than hoped.
     */
    get span() {
      // Measured square-on. The world box of a thing that is turned to face
      // you reports the world axes, which for this animal is its depth where
      // its width should be — the first reading taken that way said it was
      // six metres across, which is the tail.
      const was = group.rotation.y;
      group.rotation.y = 0;
      group.updateMatrixWorld(true);
      const size = new THREE.Vector3();
      new THREE.Box3().setFromObject(group).getSize(size);
      group.rotation.y = was;
      group.updateMatrixWorld(true);
      return { wide: +size.x.toFixed(2), high: +size.y.toFixed(2), deep: +size.z.toFixed(2) };
    },

    get screenSize() {
      return {
        wide: screen.wide + edge * 2,
        high: screen.high + edge * 2,
        /**
         * How high its middle sits when it is standing on the ground.
         *
         * Half its own height and a hand's width, so the bottom edge of the
         * frame is just clear of the floor. The shot uses it; see the note
         * on where it lands in screenScare.js.
         */
        rest: (screen.high + edge * 2) / 2 + 0.1,
      };
    },

    /** Whether the shot has it. */
    get isSeized() {
      return phase === 'seized';
    },

    /**
     * Hand it to screenScare.js, which drives it from here.
     *
     * It stops hunting, stops talking and kills its own music on this frame.
     * The music in particular: a chase cue fading out under a jumpscare is a
     * chase you are losing gently, and this is not that.
     */
    seize() {
      if (phase !== 'hunt') return;
      phase = 'seized';
      script = null;
      music.stop();
      life.stop();
      life.setSnarl(1);
    },

    /** Put it somewhere, for as long as something else owns where it is. */
    place(at, yaw) {
      here.copy(at);
      group.position.copy(here);
      group.rotation.set(0, yaw, 0);
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
      life.setSnarl(0);
      bare(false);
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
        if (since >= BREAKOUT.shake && !maw.visible) bare(true);
        if (since >= BREAKOUT.free) {
          phase = 'hunt';
          playMeatLunge(0.8);
          if (script) life.speak(script);
        }
      } else if (phase === 'seized') {
        // Nothing, and that includes the roll. The shot owns where it is and
        // which way it is facing; everything below this point is the face
        // and the cables, and those go on doing what they do right up to the
        // black. The sway it has while hunting is three degrees, which on
        // something eleven metres wide swings its own edge seventeen
        // centimetres through a frame it is supposed to be filling.
        group.rotation.z = 0;
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

      /**
       * The limbs and the tail, which never stop.
       *
       * It has no gait — it does not walk, it comes at you flat and level —
       * so the limbs are hauling at the air rather than at the ground, which
       * is both easier to animate and more unpleasant to watch. Opposite
       * corners swing against each other, the way everything with four of
       * them does.
       *
       * The wave down the tail is one number used eleven times. Each link is
       * a child of the one in front of it, so a turn put into the first
       * arrives at the last with ten more on top of it, and it whips without
       * anything here knowing where the end of it is.
       */
      const haul = phase === 'hunt' ? 1 : 0.35;
      /**
       * How far folded, from how near the wall with the hole in it is.
       *
       * Two moves at once, because the hole is tight in both directions.
       * Swinging about the shoulder's x takes the limb backward out of the
       * frontal plane, which collapses the height and leaves the width
       * exactly where it was; taking the lean out at the same time brings
       * the width in to the casing's own. Folded, the animal is the
       * television again — 11.48 by 5.59 against a hole of 11.5 by 5.9.
       */
      // Folded by the time it is two metres off the wall rather than at the
      // wall itself, so it is already the right shape when it arrives
      // instead of still becoming it while it is halfway through.
      const tuck =
        phase === 'hunt'
          ? Math.max(
              0,
              Math.min(1, (TUCK.from - Math.abs(here.z - gate.z)) / (TUCK.from - TUCK.tight))
            )
          : 0;
      for (const limb of limbs) {
        const beat = Math.sin(since * 2.6 + limb.phase) * (1 - tuck);
        limb.root.rotation.x = tuck * (Math.PI / 2);
        limb.root.rotation.z =
          limb.lean + (limb.straight - limb.lean) * tuck + beat * 0.2 * haul;
        limb.joints[1].rotation.x = beat * 0.3 * haul;
        limb.joints[2].rotation.x = -beat * 0.42 * haul;
        limb.joints[3].rotation.x = beat * 0.3 * haul;
        limb.paw.rotation.x = -beat * 0.5 * haul;
      }
      tail.forEach((seg, i) => {
        if (i === 0) return;
        seg.rotation.y = 0.042 + Math.sin(since * 2.1 - i * 0.55) * 0.07 * (0.4 + haul);
        seg.rotation.x = 0.055 + Math.cos(since * 1.6 - i * 0.4) * 0.045;
      });

      life.update(delta, 1);
    },
  };
}
