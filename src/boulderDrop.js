import * as THREE from 'three';
import { makeRockSurface } from './textures.js';
import { seeded, jitter } from './rockfall.js';
import { playCollapse, playSpikeGrind, playRubble } from './audio.js';

/**
 * The roof coming in across the front of the machine, and the head start it
 * buys you.
 *
 * The thing tears the screen off a wall forty metres away from the door you
 * have to leave by, and from that frame on it is faster than you for the first
 * ten seconds and never much slower than you after that. What is on the other
 * side of the shed is two hundred metres of climb, maze and a lift with an
 * eight-press code on it, and the code is the only part of the route where you
 * have to stand still. Standing still is where the arithmetic failed: the
 * measured gap at the pad was about twenty metres, which is four seconds, which
 * is three presses of eight. The puzzle was unsolvable by anybody who had not
 * already memorised it.
 *
 * So the building takes a hand. The breakout brings the roof down in front of
 * the cabinet — the full width of the shed, right across the apron — and the
 * thing is behind it. That is the whole mechanism: a wall of rock between you
 * and it for a measured number of seconds, which is a measured number of metres
 * you keep all the way to the pad.
 *
 * Why rock rather than a shutter, which this building already has one of and
 * which would have been thirty lines instead of three hundred: a shutter is a
 * thing the building did on purpose, and a second one reads as the game helping
 * you. Twenty tonnes of roof is the opposite — it is the building failing, in
 * your favour, by accident, and the only reason you are alive is that the thing
 * coming out of the wall took the ceiling with it.
 *
 * It also fixes the staging of the reveal, which it was not written to fix. The
 * thing is eleven and a half metres of animal in a ten metre shed and you spent
 * the first version of this chase running away from it down an aisle, which is
 * to say looking at the end of a corridor. Now it comes out, the roof drops,
 * and it is behind a heap it is twice the height of: you get the arms over the
 * top of the rock, and the face coming over after them, from the one distance
 * at which the whole animal fits in the frame.
 */

/**
 * The heap.
 *
 * `deep` is how far into the room it spills and `back`/`front` are how tall it
 * stands at each end of that, so the profile is a slope with its toe pointing
 * at you. Those two numbers are the only ones with a rule attached: `back` has
 * to clear the top of the screen (6.3) or the hole in the wall shows over the
 * top of the rock, and `front` has to beat anything the player can mount —
 * 0.9 of step plus 1.31 of jump — or the head start is a thing you can climb
 * over and look at.
 *
 * `deep` is then as little as it can be and still read as a heap rather than a
 * wall, because every metre of it is a metre of the apron, and the apron is
 * where the button is.
 */
const HEAP = { deep: 4.2, back: 6.6, front: 2.5, spill: 1.4 };

/**
 * The fall.
 *
 * `from` is above the ceiling, which is what makes this rock from somewhere
 * rather than rock that faded in: the shed's roof plane is opaque from
 * underneath and writes depth, so the heap is hidden until it is through it.
 * `gravity` is well over the player's 22 on purpose — twenty tonnes should not
 * take as long to arrive as a jump, and a half second of fall is all the time
 * there is before the reveal needs the floor back.
 */
const DROP = { from: 8.4, gravity: 36, bounce: 0.26, settle: 0.34 };

/**
 * And coming through it, which is a hole and not the heap going away.
 *
 * `wide` is the band of it that gives: six and a half metres of a twenty-six
 * metre heap, so what you hear behind you is a thing making a door for itself
 * in the middle of a collapse that is otherwise still standing. `fall` is how
 * much of the band is left afterwards — rubble you could get over, because a
 * hole a thing that size came through is not a clean opening.
 */
const GAP = { wide: 6.6, fall: 1.05, open: 1.2 };

/**
 * Shaking, for as long as something is leaning on it.
 *
 * `grind` is how often the heap takes the weight audibly and `fall` how often
 * some of it comes loose. Two cadences rather than one, and neither of them a
 * round multiple of the other, so a minute of being held behind this never
 * settles into a rhythm — which is the thing that would make it read as a
 * loop rather than as a heap under load.
 */
const STRAIN = { shift: 0.05, rate: 23, grind: 2.4, fall: 1.3 };

const ROCK_TINT = '#4a4b44';

/**
 * @param x        the plane it comes down against — the face of the machine.
 * @param side     which way the room is along x from that plane. -1 for a
 *                 machine at +x of the room, which is the one that exists.
 * @param z,width  the middle of the shed and how much of it to fill, which is
 *                 all of it: a heap with a way round it is scenery.
 * @param floorY   the floor, and `ceilingY` the roof it comes through.
 * @param clear    one {x, z, r} nothing is allowed to land on, which is the
 *                 button: the toe of this reaches it and a boulder resting on
 *                 the only control in the room is a boulder on the only
 *                 control in the room.
 */
export function createBoulderDrop({
  scene,
  parent = scene,
  colliders,
  player,
  x,
  z,
  width,
  floorY,
  ceilingY,
  side = -1,
  seed = 31,
  clear = null,
}) {
  const group = new THREE.Group();
  (parent ?? scene).add(group);
  group.visible = false;
  group.position.y = floorY;

  const random = seeded(seed);
  const out = (d) => x + side * d;
  /**
   * Every stone in here is authored in local y from nought, which is the only
   * way a heap built against a profile reads, and the group then stands on the
   * floor. Worth stating because it bit: the group was left at the world
   * origin and the colliders were written from `floorY`, so the rock was drawn
   * seventy-two metres under the building and the only thing in front of the
   * machine was nine boxes of solid nothing. It measured perfectly — the thing
   * was held, the player was shoved, the hold bought its seconds — and there
   * was no heap.
   */
  const base = floorY;
  const minZ = z - width / 2;
  const maxZ = z + width / 2;
  /** The face of it, which is the plane the thing behind it is held at. */
  const front = out(HEAP.deep);

  const rockMaterial = new THREE.MeshStandardMaterial({
    ...makeRockSurface(2, 2),
    color: ROCK_TINT,
    metalness: 0.02,
    roughness: 0.95,
  });

  // ------------------------------------------------------------- the rock ---

  /** How tall the heap stands, `along` metres out from the wall. */
  const profile = (along) => {
    const t = Math.max(0, Math.min(1, along / HEAP.deep));
    return HEAP.back + (HEAP.front - HEAP.back) * t ** 0.78;
  };

  const shapes = [];
  for (let i = 0; i < 8; i++) {
    const base =
      i % 3 === 0
        ? new THREE.DodecahedronGeometry(0.5, 0)
        : i % 3 === 1
          ? new THREE.IcosahedronGeometry(0.52, 0)
          : new THREE.IcosahedronGeometry(0.5, 1);
    shapes.push(jitter(base, random, i % 3 === 2 ? 0.24 : 0.38));
  }

  /**
   * Every stone, as a record rather than as a mesh.
   *
   * Two things want this. The band in the middle has to be able to get out of
   * the way and then be put back, and a stone whose only account of itself is
   * its own transform cannot be told where it started — see `reset`. And two
   * hundred and twenty-two meshes is two hundred and twenty-two draw calls in
   * the one room in this game that is already the most expensive in it.
   *
   * It is worth saying what that bought, because it is not what it looks
   * like. Measured, the heap costs about 1.5 ms a frame on top of 24 either
   * way: as individual meshes it was 2.3, as eight instanced bodies it is 1.5,
   * and the difference is close enough to the noise that I would not defend
   * it. The cost of this heap is the area of screen it covers — two hundred
   * opaque rocks shaded against seventy-odd point lights — and not the number
   * of objects it is submitted as. That is the same answer the creature's own
   * body gave when thirteen lumps were swapped for nineteen. The instancing
   * stays because eight objects in the graph is the right shape for a thing
   * that is one object, not because it won the frame back.
   *
   * So the stones are drawn as eight InstancedMeshes, one per shape, and a
   * stone is a slot in one of them. That is the same trade liftTower.js makes
   * for its ladder rungs and for the same reason. Nothing about the heap moves
   * except the hole, so the matrices are written once at build and then only
   * for the forty-odd stones that are shoved out of the way.
   */
  const stones = [];
  const parcels = shapes.map(() => []);
  const place = (bx, by, bz, scale) => {
    const which = Math.floor(random() * shapes.length);
    const stone = {
      which,
      home: new THREE.Vector3(bx, by, bz),
      turn: new THREE.Euler(random() * 6.3, random() * 6.3, random() * 6.3),
      size: new THREE.Vector3(
        scale * (0.84 + random() * 0.34),
        scale * (0.72 + random() * 0.4),
        scale * (0.84 + random() * 0.34)
      ),
      // Where it is now, where it was when it was asked to move, where it is
      // going, and what it is turning into on the way.
      at: new THREE.Vector3(bx, by, bz),
      facing: new THREE.Euler(),
      from: new THREE.Vector3(bx, by, bz),
      to: new THREE.Vector3(bx, by, bz),
      spin: new THREE.Euler(),
    };
    stone.facing.copy(stone.turn);
    parcels[which].push(stone);
    stones.push(stone);
    return stone;
  };

  /**
   * Big stones and not many of them.
   *
   * This face is twenty-six across and six and a half tall, which is four
   * times the area of the only other heap in this game, and filling it with
   * that heap's half-metre rubble is eight hundred meshes for a thing you run
   * past in six seconds. At a metre and a half a stone it is two hundred, and
   * a shed with boulders in it reads better anyway: half-metre chippings are
   * what a wall falling down leaves, and this is a roof.
   *
   * Two passes. The body packs the whole cross-section against the profile —
   * uniform in height under the slope, which is what fills a face evenly
   * rather than piling everything on the floor. The toe then spills a few out
   * past the front of it, low and thinning, because rock that stops dead in a
   * plane is rock that was placed.
   */
  for (let i = 0; i < 180; i++) {
    const along = random() * HEAP.deep;
    const bz = minZ + random() * width;
    const tall = profile(along);
    const by = 0.2 + random() * (tall - 0.4);
    place(out(along), by, bz, 0.78 + random() * 1.05);
  }
  for (let i = 0; i < 46; i++) {
    const reach = random() * random() * HEAP.spill;
    const bz = minZ + random() * width;
    const by = 0.22 + random() * random() * (HEAP.front * 0.8) * (1 - reach / HEAP.spill);
    const bx = out(HEAP.deep + reach);
    const size = 0.6 + random() * 0.7;
    // Nothing on the button, and the toe of this reaches it: the drawn heap
    // measured out to the button's own middle, and the one thing in the apron
    // that the player has to be able to walk up to and hit is the one thing
    // that must not have a boulder leaning on it. It is also where whoever is
    // standing in the footprint gets put — see the shove in `drop`.
    if (clear && Math.hypot(bx - clear.x, bz - clear.z) < clear.r + size * 0.6) continue;
    place(bx, by, bz, size);
  }

  /**
   * And every stone, written into the instances it is a slot in.
   *
   * `facing` and `at` are the live transform and `turn`/`home` the one it was
   * built with, so a stone that has been shoved knows both where it is and
   * where it came from.
   */
  const bodies = [];
  const matrix = new THREE.Matrix4();
  const turning = new THREE.Quaternion();
  shapes.forEach((geometry, i) => {
    const slots = parcels[i];
    if (!slots.length) return;
    const body = new THREE.InstancedMesh(geometry, rockMaterial, slots.length);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    slots.forEach((stone, n) => {
      stone.body = body;
      stone.slot = n;
    });
    bodies.push(body);
  });
  const write = (stone) => {
    turning.setFromEuler(stone.facing);
    matrix.compose(stone.at, turning, stone.size);
    stone.body.setMatrixAt(stone.slot, matrix);
  };
  const flush = () => {
    for (const body of bodies) {
      body.instanceMatrix.needsUpdate = true;
      /**
       * And its own bounds, because an InstancedMesh does not get them for
       * free.
       *
       * Frustum culling tests one sphere per object, and for an instanced mesh
       * that sphere comes from the geometry — a single half-metre rock at the
       * group's origin. Twenty-six metres of heap hung off that is a heap that
       * vanishes the moment the origin leaves the frame, which is most of the
       * time you are looking at it.
       */
      body.computeBoundingSphere();
    }
  };
  for (const stone of stones) write(stone);
  flush();

  /**
   * And the hole it came through.
   *
   * A black quad let into the roof over the footprint, hidden until the heap
   * is down. It is two triangles and it answers the only question the heap
   * raises when you turn round and look at it from down the shed, which is
   * where twenty tonnes of rock came from in a building with a roof on it.
   */
  const hole = new THREE.Mesh(
    new THREE.PlaneGeometry(HEAP.deep + HEAP.spill, width),
    new THREE.MeshBasicMaterial({ color: '#07080a', toneMapped: false })
  );
  hole.rotation.x = Math.PI / 2;
  hole.position.set(out((HEAP.deep + HEAP.spill) / 2), ceilingY - 0.03, z);
  hole.visible = false;
  (parent ?? scene).add(hole);

  // --------------------------------------------------------- the colliders ---

  /**
   * Nine boxes, which is three slices of depth by three bands of width.
   *
   * The depth slices are a staircase down the profile, so the heap is solid at
   * something like the height it is drawn at rather than at one height — the
   * toe you cannot climb, the middle you cannot see over, the back you cannot
   * do anything about. The width bands exist for one reason: one of them is
   * going to become the hole, and when the thing comes through it the three
   * boxes in that band drop to rubble and the six either side do not move.
   *
   * Which band is not known at build time, and that is the point of having
   * three. The thing is held off the back of this heap for eighteen seconds
   * and it spends them sliding along it after you, so where it finally pushes
   * through is wherever it has got to — see `open`, which is told.
   *
   * `enabled` on all nine, because for most of this game there is nothing here
   * — the collider list is built once at boot and this heap is in the air for
   * all of it. See the dump fixture, which counts them.
   */
  const slices = 3;
  const bands = [
    [minZ, z - GAP.wide / 2],
    [z - GAP.wide / 2, z + GAP.wide / 2],
    [z + GAP.wide / 2, maxZ],
  ];
  /** The bands, kept so whichever one gives can be lowered. */
  const banded = bands.map(() => []);
  for (let i = 0; i < slices; i++) {
    // Each slice is solid to the height the profile has at its *shallow* end,
    // which is the lower of its two ends: a box as tall as its back edge is a
    // box standing proud of the rock drawn on it.
    const nearEdge = out(HEAP.deep - (i * HEAP.deep) / slices);
    const farEdge = out(HEAP.deep - ((i + 1) * HEAP.deep) / slices);
    const tall = profile(HEAP.deep - (i * HEAP.deep) / slices);
    for (let b = 0; b < bands.length; b++) {
      const box = {
        minX: Math.min(nearEdge, farEdge),
        maxX: Math.max(nearEdge, farEdge),
        minZ: bands[b][0],
        maxZ: bands[b][1],
        top: floorY + tall,
        bottom: floorY,
        enabled: () => state !== 'up',
      };
      colliders.push(box);
      banded[b].push({ box, top: floorY + tall });
    }
  }

  // ------------------------------------------------------------- the clock ---

  /** up → falling → down → giving → open. */
  let state = 'up';
  let lift = 0;
  let fell = 0;
  let strain = 0;
  let giving = 0;
  let grind = 0;
  let falling = 0;

  const dropIt = () => {
    if (state !== 'up') return;
    state = 'falling';
    lift = DROP.from;
    fell = 0;
    group.visible = true;
    hole.visible = true;
    group.position.y = base + lift;
    playCollapse(1);
    /**
     * And whoever is standing in it, put outside it.
     *
     * The apron in front of the machine is clear floor with one button on it,
     * and there is nothing to stop a player walking up to the cabinet and
     * reading the face at arm's length while it talks. The heap is nine boxes
     * of solid that appear in one frame: somebody inside that footprint is
     * inside rock, and the collider resolution would spend the next second
     * deciding which of six faces to post them out of.
     *
     * So they get shoved clear of the front of it, keeping their speed and
     * their aim. It is not a teleport and must not read as one — it is two
     * metres, outward, on the frame the roof arrives, which is a thing that
     * happens to you rather than a thing the game did to you. Two and not one,
     * because the button is 1.9 across and sits a metre and a half out from
     * the toe of this: a shorter shove posts the player into the one piece of
     * furniture in the apron and the collider resolution stands them on it.
     */
    const feet = player?.position;
    // `along` is metres out from the wall, which is the only frame of
    // reference in this file that does not need a sign in it.
    if (feet && (feet.x - x) * side < HEAP.deep + 0.5) feet.x = front + side * 1.9;
  };

  return {
    group,
    hole,

    /** The face of it, for whatever has to be held on the far side. */
    get front() {
      return front;
    },

    /** How tall it stands at its toe, for whoever is drawing a conclusion. */
    get height() {
      return HEAP.front;
    },

    /**
     * What it actually occupies, for a harness.
     *
     * Its own measurement rather than a Box3 over the group, because the group
     * holds InstancedMeshes and `setFromObject` reads one geometry per object
     * and the transform of the object — for an instanced mesh that is a single
     * rock at the heap's origin, which is not a wrong answer so much as an
     * answer to a different question.
     */
    get extent() {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const stone of stones) {
        const r = [stone.size.x * 0.55, stone.size.y * 0.55, stone.size.z * 0.55];
        const at = [stone.at.x, stone.at.y + base, stone.at.z];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], at[a] - r[a]);
          hi[a] = Math.max(hi[a], at[a] + r[a]);
        }
      }
      return { stones: stones.length, bodies: bodies.length, lo, hi };
    },

    /** Whether the roof has come in at all, which is a one-way door. */
    get hasFallen() {
      return state !== 'up';
    },

    get isDown() {
      return state === 'down' || state === 'giving' || state === 'open';
    },

    get isOpen() {
      return state === 'open';
    },

    drop: dropIt,

    /**
     * It is coming through.
     *
     * Called when whatever is behind it stops being held, and not a frame
     * before: the sound, the stones going and the hole in the colliders are
     * one event, and the thing walking out of an unbroken heap is the version
     * of this that makes the heap a cutscene.
     */
    open(atZ = z) {
      if (state !== 'down') return;
      state = 'giving';
      giving = 0;
      // One sound, not two. The thing coming through makes its own noise —
      // see `heldUntil` in screenBeast.js, which grinds and screeches on the
      // frame it stops being held — and this is the rock's half of it.
      playCollapse(0.85);
      /**
       * Where the middle of it goes.
       *
       * Forward and sideways, which is what a thing pushing through a heap
       * does to it — the stones end up outside the hole and in front of it,
       * not gone. Anything already low enough to be rubble stays where it is:
       * a hole in a heap has a sill, and lifting the floor of it out as well
       * leaves a clean doorway with rocks around the edge.
       */
      const through = Math.max(minZ + GAP.wide / 2, Math.min(maxZ - GAP.wide / 2, atZ));
      for (const stone of stones) {
        const { home } = stone;
        if (Math.abs(home.z - through) > GAP.wide / 2) continue;
        if (home.y < GAP.fall) continue;
        const aside = Math.sign(home.z - through || 1);
        stone.from.copy(stone.at);
        stone.to.set(
          home.x - side * (0.8 + random() * 2.2),
          0.25 + random() * 0.8,
          home.z + aside * (1.6 + random() * 2.4)
        );
        stone.spin.set(
          stone.turn.x + (random() - 0.5) * 3.2,
          stone.turn.y + (random() - 0.5) * 3.2,
          stone.turn.z + (random() - 0.5) * 3.2
        );
      }
      // And the band it went through, as something you could get over. Which
      // band that is comes from where it was, not from the middle of the heap.
      const which = bands.findIndex(([low, high]) => through >= low && through < high);
      for (const { box } of banded[Math.max(0, which)]) box.top = floorY + GAP.fall;
    },

    reset() {
      state = 'up';
      lift = 0;
      fell = 0;
      strain = 0;
      giving = 0;
      grind = 0;
      falling = 0;
      group.visible = false;
      group.position.set(0, base, 0);
      hole.visible = false;
      for (const stone of stones) {
        stone.at.copy(stone.home);
        stone.facing.copy(stone.turn);
        // And their orders with them, or a second collapse moves the stones a
        // first one already moved. Only the debug menu can get here twice.
        stone.from.copy(stone.home);
        stone.to.copy(stone.home);
        write(stone);
      }
      flush();
      for (const band of banded) for (const entry of band) entry.box.top = entry.top;
    },

    update(delta) {
      if (state === 'up') return;

      if (state === 'falling') {
        fell += delta;
        lift = Math.max(0, DROP.from - 0.5 * DROP.gravity * fell * fell);
        if (lift <= 0) {
          state = 'down';
          fell = 0;
        }
        group.position.y = base + lift;
        return;
      }

      /**
       * Landed. It bounces once — about a quarter of a metre, over a third of
       * a second — and then shakes for as long as something is leaning on it.
       *
       * The bounce is the only part of this that is not physical and it is
       * worth the lie. The heap arrives at nineteen metres a second and stops
       * in one frame, and a thing that stops in one frame has no weight: the
       * eye reads the settle, not the fall.
       */
      if (state === 'down' || state === 'giving') {
        fell += delta;
        const settle = fell < DROP.settle ? Math.sin((fell / DROP.settle) * Math.PI) : 0;
        /**
         * And the shake, which is the only report you get.
         *
         * You are running the other way with your back to it. Everything else
         * about being chased in this room was legible because the shelving
         * went over beside you; the heap is forty metres behind you and the
         * one thing it can do is move. It comes up over about a second, so
         * the first stone of it is not already shaking.
         */
        strain = Math.min(1, strain + delta * 1.1);
        const quake = state === 'down' ? strain : 0;
        group.position.set(
          Math.sin(fell * STRAIN.rate) * STRAIN.shift * quake,
          base - DROP.bounce * settle - Math.abs(Math.sin(fell * STRAIN.rate * 0.7)) * 0.03 * quake,
          Math.sin(fell * STRAIN.rate * 1.3 + 1.1) * STRAIN.shift * 0.7 * quake
        );
        grind -= delta;
        if (state === 'down' && grind <= 0) {
          grind = STRAIN.grind;
          playSpikeGrind(0.2 + 0.3 * strain);
        }
        /**
         * And rock coming off it, which is the only thing in this game that
         * tells you the heap is losing.
         *
         * You are forty metres away with your back to it for every second of
         * this and the shake is invisible from there. What is left is the
         * sound: something big is leaning on twenty tonnes of roof and the
         * roof is shedding — stones finding somewhere else to sit, eighteen
         * seconds of them, getting worse as the strain comes up. Jittered so
         * no two falls land on the same beat.
         */
        falling -= delta;
        if (state === 'down' && falling <= 0) {
          falling = STRAIN.fall * (0.7 + Math.random() * 0.6);
          playRubble(0.35 + 0.65 * strain);
        }
      }

      if (state === 'giving') {
        giving = Math.min(1, giving + delta / GAP.open);
        // Out of the hole fast and into its new place slowly, which is a
        // stone being shoved rather than a stone being animated.
        const t = 1 - (1 - giving) ** 2.4;
        for (const stone of stones) {
          if (stone.from.equals(stone.to)) continue;
          stone.at.lerpVectors(stone.from, stone.to, t);
          stone.facing.set(
            stone.turn.x + (stone.spin.x - stone.turn.x) * t,
            stone.turn.y + (stone.spin.y - stone.turn.y) * t,
            stone.turn.z + (stone.spin.z - stone.turn.z) * t
          );
          write(stone);
        }
        flush();
        if (giving >= 1) {
          state = 'open';
          // Done shaking: there is nothing behind it any more.
          group.position.set(0, base, 0);
        }
      }
    },
  };
}
