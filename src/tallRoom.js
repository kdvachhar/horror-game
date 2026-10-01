import * as THREE from 'three';
import {
  makeWallSurface,
  makeFloorSurface,
  makeCeilingSurface,
  makeMetalPanelSurface,
  makeHazardSurface,
  makeDigitTexture,
  cloneSurface,
  metalRepeat,
  worldRepeat,
  UNITS_PER_TILE,
} from './textures.js';
import { createMeatCube } from './meatCube.js';
import { showNote, setObjective } from './hud.js';
import { playSpikeGrind, playGurgle, playMeatLunge, playScreech } from './audio.js';
import { planClimb, refugeLane } from './climbLanes.js';
import { createSeizure } from './seizure.js';
import { buildTallRoomLights } from './tallRoomLights.js';

/**
 * The tall room, and the holes in the walls of it.
 *
 * Fifteen by fourteen and seventy-six high, which is a room you cannot see the
 * top of — the light gives out somewhere around twelve and there is another
 * sixty-four metres of it above that which you have to take on trust.
 *
 * You do not come into it through a door. The hall's far end is simply open, the
 * whole fifteen metres of it and the whole twelve, and this room's floor and
 * side walls are that hall's carried straight on. The only thing that changes at
 * the join is that the ceiling stops: you walk out from under twelve metres of
 * slab and there is seventy-six metres of nothing over you, and there was no
 * threshold and no rectangle to see it through first.
 *
 * That is worth more here than anywhere else in the game so far. Every other
 * room in this building is entered through a hole about the size of a person,
 * which is a way of being told about a room before you are in it — the doorway
 * frames it, and a framed thing is a thing you have already begun to take in.
 * The one room whose whole content is how big it is above your head is the one
 * room that must not be framed.
 *
 * And every wall, on six courses going up, is full of rectangular openings.
 * They are 1.7 by 0.43 — the size of the platform in each one and not a hand's
 * width more — set on a regular pitch of 2.7, in five columns per wall.
 * Ninety-odd of them in a room with one door and one open end.
 *
 * That shape is the point. They were person-sized once, and a person-sized hole
 * is a doorway however you light it: ninety of them made ninety places
 * something could be standing. Cut to the platform, they are slots, and nothing
 * stands in a slot — the wall stops being a honeycomb something lives in and
 * becomes a rack that something was stored in, which is worse, and which is
 * also what every other detail in here was already saying.
 *
 * They are not holes. Each one has a short platform sitting in it, on a pair of
 * rails that run out to the lip and stop a hand's width proud of the wall, and
 * the platforms slide. Most are pulled right back with only the front edge
 * showing; one in seven or so is standing part-way out, and two or three are
 * out far enough to be a step somebody could take. That was the whole of it for
 * a long while — a wall that read as a machine for putting a walkway anywhere
 * in it, and no machine.
 *
 * There is one now. Four buttons in the room at the top of the hoist call the
 * four walls, one at a time, and a called wall runs every deck it has out of
 * its socket. One deck on every course is not a ledge but a telescope five or
 * six metres long, so a called wall is not a row of shelves, it is seventeen
 * catwalks reaching for the middle of the room. They all aim at the same place
 * and the top course aims exactly at it: a square of bolted-down floor at the
 * end of a gangway out of the window, which is the one surface up here that no
 * button can take away.
 *
 * That is the whole difference between this room and the one it was yesterday.
 * A wall full of dark rectangles is a wall full of dark rectangles: unpleasant,
 * inert, nothing to do with you. A wall full of dark rectangles with the ends of
 * rails sticking out of them, and three platforms already halfway out at twenty
 * metres, is a wall that has been used, that works, and that could do it again
 * while you are standing under it.
 *
 * Until a wall is called they are all identical and all out of reach. The
 * lowest sill is at 3.2, which is well clear of the top of your jump, so there
 * is nothing to try and no way to try it: walk in here with the panel unpressed
 * and this is not a puzzle, it is a great many openings that are not for you,
 * arranged by somebody, on a grid, going up further than you can see. The staff
 * doors did a smaller version of the same job — see employeeDoor.js — and the
 * argument is the same one. A building with only the doors the player uses
 * reads as a corridor with rooms bolted on.
 *
 * Call a wall and that same wall is a staircase to the top of the room. That
 * is the whole shape of this place and it is worth saying plainly: the thing
 * that makes the tower climbable is not in the tower. It is four steel pads on
 * a floor seventy-two metres up, which only the bucket can reach, at the top of
 * a hoist only the bucket can ride. You do not solve this room. You stand in
 * the bottom of it and something else does, somewhere you cannot go, and the
 * walls open.
 *
 * Deliberately not varied in size. The first pass had them in three sizes with
 * the odd double-width one, on the reasoning that a regular grid reads as
 * wallpaper; what it actually reads as is a decision. Identical openings on an
 * exact pitch are institutional, and institutional is far worse to be standing
 * under than irregular — irregular is a ruin, and a ruin is nobody's fault.
 */

/**
 * Fourteen deep and seventy-six up. The width is not written here.
 *
 * The hall's way out is the whole end of the hall — fifteen metres of it — and
 * this room's near wall is that opening, so the width has to be the hall's or
 * the two would not line up and there would be a step in the side walls at the
 * join. It is read off the opening handed over, the same way the room's position
 * is, because a number that must equal another number should never be typed
 * twice. See the top of controlRoom.js for why every room in here is built this
 * way round.
 */
export const DEPTH = 14;

/**
 * How far up, and it is the one number in this room meant to be felt rather
 * than seen.
 *
 * It was thirty-four, which is tall enough that you cannot see the top and
 * short enough that you could believe you nearly can. Seventy-six is past
 * arguing with: the light gives out around twelve, the last thing with a shape
 * to it is the window at twenty-four, and there is then fifty metres of nothing
 * above that — more room over your head than the whole of the hall you walked
 * to get here, none of it visible, and no way to find out.
 *
 * Nothing that meets this room moves with it. The way in is the hall's opening,
 * the way on is a door at floor level, the hoist's window is at twenty-four
 * because that is where the hoist stops, and the animal in the bottom is the
 * size it was. All of the new height is empty air at the top, which is the only
 * place height of this kind is worth anything.
 */
export const HEIGHT = 76;

/**
 * The platform in each opening, and the rails it sits on.
 *
 * This is the thing the wall is now measured from, rather than the other way
 * round — see `HOLE` below. The platform is the object; the opening is the gap
 * it comes out of.
 *
 * `inset` is how far back inside the mouth a fully retracted one parks — a
 * couple of hand's widths, so the front edge is in shadow but the top of it
 * still catches light. Flush with the wall it reads as a filled-in hole; any
 * further back and there is nothing to see at all, and the openings go back to
 * being holes.
 *
 * The rails run the depth of the recess and 0.12 past the lip. That overhang is
 * the detail doing the most work in this room: it is the one part of the
 * mechanism that is outside the wall, so it is the only part legible from
 * across the floor and from twenty metres below, and it is what makes a row of
 * dark rectangles read as sockets rather than as damage.
 */
const PLATFORM = { wide: 1.46, deep: 1.25, thick: 0.2, inset: 0.24 };
const RAIL = { wide: 0.09, high: 0.07, proud: 0.12 };

/** The gap left round the platform, and the whole of what the opening is. */
const CLEARANCE = { side: 0.12, over: 0.16 };

/**
 * How far a called deck runs out, and it is no longer one number.
 *
 * It was 0.98 for all of them — a ledge, a place to put a foot, the length of
 * thing that fits in the socket it came out of. Ninety-odd of those is a wall
 * with shelves on it, and a wall with shelves on it is not somewhere you can
 * go: every one of them is within arm's reach of the concrete and there is
 * fifteen metres of air in the middle that nothing has ever crossed.
 *
 * So one deck on every course runs the whole way out instead, to within a
 * metre or so of the room's middle, and that changes what the wall is for. A
 * ledge is a detail. A catwalk seven metres long hanging forty metres up with
 * nothing under it is a route, and four walls of them are four routes that all
 * meet in the same piece of air — which is the piece the animal goes up and
 * down through.
 *
 * `margin` is how far short of the centre line a long one stops. Two facing
 * each other leave twice that between their tips: far enough that the room
 * still has a middle, near enough that a body can see across it and know what
 * it is looking at.
 */
const RUN = { ledge: 0.98, shelf: 2.9, margin: 1.1 };

/**
 * And what a long one is made of, because it cannot be one plank.
 *
 * A seven metre deck does not come out of a socket 1.5 deep. It telescopes:
 * segments that nest inside each other when the wall is home and draw out into
 * a continuous walkway when it is called, each one a little narrower and a
 * hair lower than the one behind it. `lap` is how much each overlaps its
 * neighbour at full extension, which is what stops the walkway having gaps in
 * it, and `taper` and `drop` are what stop the faces fighting over the same
 * pixels while they are nested.
 */
const SEGMENT = { deep: 2.2, lap: 0.4, taper: 0.05, drop: 0.008 };

/**
 * The openings, which are now the platform plus that gap and nothing else.
 *
 * They used to be 1.7 by 2.3 — a person-sized rectangle with a plate lying in
 * the bottom of it, which made every one of them read as a doorway that
 * something might come out of standing up, and made the platform an object
 * dropped in a room rather than the thing the room was built round. Sized to
 * the platform they are slots, and a slot says what this wall actually is:
 * ninety-odd berths for ninety-odd of the same object, most of them still in.
 *
 * The height is the whole stack — rail, then deck, then the gap over it — so
 * nothing here can drift out of agreement with what is built into it. The width
 * is the deck plus a hand's width each side.
 */
const HOLE = {
  wide: PLATFORM.wide + CLEARANCE.side * 2,
  high: RAIL.high + PLATFORM.thick + CLEARANCE.over,
  deep: 1.5,
};

/**
 * Where they go.
 *
 * `SILLS` are the heights the courses start at and `COLUMNS` the offsets along
 * each wall. The lowest sill is the only number here with a rule behind it: the
 * player peaks 1.31 above the floor in a jump and can only land on something
 * within a couple of centimetres of that, so 3.2 is unreachable without looking
 * like it is trying to be. That is still the rule and it is still what the sill
 * is set to — what reaches the floor now is the bottom flight of the stair,
 * which is a thing the wall does rather than a thing the wall is. Retracted,
 * nothing down here has changed.
 *
 * The pitch is the other number that has grown a rule since. It is what the
 * flights are sized against — half of it out, half of it back — so the two
 * halves of a course's stair meet in the middle of the room at exactly the
 * same height. See `FLIGHT`.
 *
 * The courses are counted up rather than listed out. They were a list of six
 * while the room was thirty-four; at seventy-six a list is a list of seventeen
 * numbers each 4.2 more than the last, which is a loop somebody typed by hand.
 * More to the point it is a list that has to be edited every time the room's
 * height changes, and the wall going only two thirds of the way up is the one
 * failure that would make the room look unfinished rather than tall.
 */
const COURSE = { first: 3.2, pitch: 4.2, clear: 2.0 };
const SILLS = [];
for (let v = COURSE.first; v <= HEIGHT - COURSE.clear; v += COURSE.pitch) {
  SILLS.push(+v.toFixed(2));
}
const COLUMNS = [-5.4, -2.7, 0, 2.7, 5.4];

/**
 * And the long ones climb, which is the whole of how this room is got up.
 *
 * The first version of them was level, and level does not work. Courses are
 * 4.2 apart and a body in this game peaks at 1.31 in a jump and can only land
 * on something within a couple of centimetres of that — so from any course,
 * the course above is four times out of reach and the wall is scenery again.
 * A level catwalk at every floor of a building with no stairs in it.
 *
 * So each course grows *two* long decks instead of one, and they are flights:
 *
 *   · the **inward** one has its far end low, out in the middle of the room,
 *     and climbs half a course as you walk in along it to the wall;
 *   · the **outward** one starts at the wall and climbs the other half a
 *     course as you walk out along it.
 *
 * Which makes a switchback stair, and the arithmetic of it closes exactly.
 * Course k's outward tip is at sill_k + 2.1. Course k+1's inward tip is at
 * sill_{k+1} − 2.1, and sill_{k+1} is sill_k + 4.2, so that is sill_k + 2.1 as
 * well: the two tips arrive at the same height, out in the middle, a column
 * apart. Step across and carry on up. Two flights per course is not a flourish
 * — it is the minimum. With one deck per course there is no pair of heights
 * that chains, whatever you set its far end to, and that can be shown rather
 * than argued: you can only ever leave the wall at a height you arrived at it,
 * and every arrival is a sill.
 *
 * `rise` is therefore half the course pitch and is not a number anyone gets to
 * choose. `step` is what one tread is allowed to be, and the tread count comes
 * out of that — the bucket is the shorter body and hops 1.15, so 0.8 leaves
 * room for both of them to be sloppy about it.
 */
const FLIGHT = { rise: COURSE.pitch / 2, step: 0.8 };

/**
 * Where the bottom of the whole thing lands, and it is the reported bug.
 *
 * The lowest sill is 3.2 and nothing in this game can get onto it from the
 * floor — which was correct for as long as this room was scenery and is the
 * first thing that breaks the moment it is a route. The lowest course's inward
 * flight therefore does not stop half a course down like the rest of them; it
 * carries on to here, which is a step the player takes for free and the bucket
 * takes with a hop.
 */
const ENTRY = 0.5;

/**
 * And the refuges: the openings you can actually get into.
 *
 * The animal fills this room. Not most of it — all of it: fifteen by fourteen
 * of meat in a room fifteen by fourteen, travelling the whole height of the
 * shaft you are now expected to climb. There is no line you can take up a wall
 * that it does not pass through, so a stair on its own is a stair you get
 * halfway up.
 *
 * So one opening on every course is not a slot. It is the size the openings
 * used to be, before they were cut down to the platforms that live in them —
 * see the long note at the top of this file, which argued that person-sized
 * holes were the wrong shape because a person-sized hole is a doorway however
 * you light it, and ninety of them made ninety places something could be
 * standing.
 *
 * That argument was right and it is the reason these work. A handful of the
 * old openings, kept, among a hundred and ninety slots: they read as the ones
 * that were never converted, they are the only things on the wall you could
 * fit inside, and the room has been implying for a long time that something
 * used to. Now it is you, with your back against the concrete, while it goes
 * past.
 *
 * `deep` is the number with a rule behind it and the rule is the animal's
 * collider, which is a box the size of the room: to be out of it you have to
 * be past the wall's inside face by more than your own radius. The player is
 * 0.42, so anything over about half a metre clears — 1.5 is the depth the
 * platform recesses already are, it puts your whole body in shadow, and it
 * leaves room to turn round and watch.
 */
const REFUGE = { wide: 2.0, high: 2.1, deep: HOLE.deep, back: 0.4, lip: 0.35, spare: 0.8 };

/*
 * There was a hash here — `isOpen` — that bricked up about a quarter of the
 * sockets at the bottom of the room and about half of them at the top, so that
 * the wall read as a grid with pieces missing rather than as a grid.
 *
 * It is gone, and what killed it is what a *called* wall looks like. The grid
 * is only legible once the decks are out of it, and a wall with a fifth of its
 * decks simply absent does not read as a machine with some berths bricked up —
 * it reads as a machine that half worked. That is the wrong sentence for the
 * button to say, and it is the one it was saying.
 *
 * The resting face does not depend on it. `platformOut` still leaves most
 * decks home and about one in seven standing part way proud, and that variance
 * is what made the wall read as used; the fill was never carrying that.
 */

/**
 * How far this one's platform is standing out of its socket.
 *
 * Zero for most of them. About one in seven is out by something, and of those a
 * few go most of a metre — which is a plank of floor sticking out of a wall
 * with nothing under it, and is the reading the whole room turns on. Hashed
 * like everything else in here, so it is the same three every time and can be
 * screenshotted and walked past twice.
 */
function platformOut(wall, course, column) {
  const n = Math.sin(wall * 33.17 + course * 61.9 + column * 14.31) * 17331.71;
  const r = ((n % 1) + 1) % 1;
  if (r < 0.855) return 0;
  // 0.28 to 0.95, spread over the top sliver of the hash.
  return 0.28 + ((r - 0.855) / 0.145) * 0.67;
}

/** And which of the open ones have run down the wall underneath them. */
function isStained(wall, course, column) {
  const n = Math.sin(wall * 4.1414 + course * 21.7 + column * 91.3) * 24634.6345;
  return ((n % 1) + 1) % 1 > 0.62;
}

// Colder again than the hall, which was the concrete it was poured as. This is
// the same concrete with nothing done to it at all.
const WALL_TINT = '#494c4b';
const FLOOR_TINT = '#3a3c3b';
const TRIM = '#2a2e2c';

/**
 * One wall, built as panels round a set of rectangular openings.
 *
 * The wall is handed a list of holes in its own frame — `u` along it, `v` up
 * from the floor — and works out the panels for itself. It bands the wall
 * horizontally at every hole's top and bottom edge, then splits each band into
 * the runs of wall between whatever holes cross it. A band with no holes in it
 * is one panel; the doorways are holes like any other, so the same code cuts
 * those too and there is no separate path for them.
 *
 * The panels share one material. Each one's UVs are rewritten to the piece of
 * the wall's texture space it actually occupies, so the poured-concrete boards
 * run straight across a join instead of restarting at every panel edge — which
 * is what a per-panel material with its own repeat would give you, and it looks
 * like the wall has been assembled out of offcuts.
 */
function buildHoledWall({ parent, material, width, height, holes }) {
  const edges = new Set([0, height]);
  for (const hole of holes) {
    edges.add(hole.v);
    edges.add(hole.v + hole.h);
  }
  const bands = [...edges].sort((a, b) => a - b);

  const panel = (u0, u1, y0, y1) => {
    const w = u1 - u0;
    const h = y1 - y0;
    if (w < 1e-4 || h < 1e-4) return;
    const geometry = new THREE.PlaneGeometry(w, h);
    // Left edge measured from the wall's own corner, so every panel on this
    // wall samples one continuous texture space.
    const left = (u0 + width / 2) / UNITS_PER_TILE;
    const bottom = y0 / UNITS_PER_TILE;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        left + uv.getX(i) * (w / UNITS_PER_TILE),
        bottom + uv.getY(i) * (h / UNITS_PER_TILE)
      );
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set((u0 + u1) / 2, (y0 + y1) / 2, 0);
    mesh.receiveShadow = true;
    parent.add(mesh);
  };

  for (let i = 0; i < bands.length - 1; i++) {
    const y0 = bands[i];
    const y1 = bands[i + 1];
    // Every hole that spans the whole of this band. A hole only ever starts and
    // ends on a band edge, because the band edges were taken from the holes.
    const cuts = holes
      .filter((hole) => hole.v <= y0 + 1e-6 && hole.v + hole.h >= y1 - 1e-6)
      .map((hole) => [hole.u - hole.w / 2, hole.u + hole.w / 2])
      .sort((a, b) => a[0] - b[0]);

    let u = -width / 2;
    for (const [a, bEdge] of cuts) {
      panel(u, a, y0, y1);
      u = Math.max(u, bEdge);
    }
    panel(u, width / 2, y0, y1);
  }
}

/**
 * The room, hung off the doorway the giant hall hands over.
 *
 * The hall's way out faces -z, so this is the space at -z of it, built the same
 * way every room in this project is built: for the one wall it is behind. See
 * the top of controlRoom.js.
 */
/**
 * A box with no lid on its mouth: five sides, open towards its own +z.
 *
 * Every recess in this room is one inside-out box — `side: BackSide`, so you
 * see its inner surfaces and it reads as a hole rather than as a dark
 * rectangle painted on a wall. That works perfectly for as long as you are
 * outside it. The face at the mouth has its normal pointing out into the
 * room, so to anybody in the room it is front-facing and culled, and the
 * recess is open.
 *
 * Stand *inside* one and that same face is behind-facing, so it renders: a
 * black wall hung across the opening, between you and the room. The two
 * hundred platform sockets have had this since they were built and it has
 * never once been visible, because nothing can get into a slot 0.43 tall.
 * The refuges are the first recesses in this game you can walk into, and they
 * are therefore the first place the lid was ever seen — from in one, it is
 * the whole view.
 *
 * So the mouth comes off. Nothing changes from outside, because that face was
 * already culled from every angle you could see it from; from inside you get
 * the tower back.
 *
 * The face is found through `groups` rather than by counting indices.
 * BoxGeometry lays its six faces down in a fixed order — +x, -x, +y, -y, +z,
 * -z — and the fifth is the one at the mouth, but how many indices each takes
 * depends on the segment counts, and a hard-coded 24..29 is right only for
 * the one-segment case it happened to be written against.
 */
function openBox(width, height, depth) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const mouth = geometry.groups[4];
  const index = geometry.getIndex();
  const kept = [];
  for (let i = 0; i < index.count; i++) {
    if (i >= mouth.start && i < mouth.start + mouth.count) continue;
    kept.push(index.getX(i));
  }
  geometry.setIndex(kept);
  // The groups described the old index buffer and now describe nothing. One
  // material, one draw — see the liner, which is shared by every recess here.
  geometry.clearGroups();
  return geometry;
}

export function createTallRoom({ scene, doorway, player, port, camera, death }) {
  /**
   * Being eaten, which this room triggers and does not stage.
   *
   * `camera` and `death` are taken only to hand straight to it. The shot is
   * seizure.js, a peer of cutscene.js and wakeUp.js — see the note there on
   * why a room has no business writing camera.rotation.
   */
  const seizure = createSeizure({ camera, player, death });
  const group = new THREE.Group();
  scene.add(group);

  const colliders = [];
  const solid = (minX, maxX, minZ, maxZ, extra) =>
    colliders.push({ minX, maxX, minZ, maxZ, ...extra });

  const WIDTH = doorway.width;
  const maxZ = doorway.z;
  const minZ = maxZ - DEPTH;
  const minX = doorway.x - WIDTH / 2;
  const maxX = doorway.x + WIDTH / 2;
  const midX = doorway.x;
  const midZ = (minZ + maxZ) / 2;

  let entered = false;

  /**
   * The way on: another doorway, in the far wall, off to one side.
   *
   * Off to one side rather than opposite the one you come in by, so the room is
   * crossed on a diagonal and looked around rather than walked through in a
   * straight line. It is the same 2.4 by 2.8 as every other opening in this
   * stretch of the building — which is exactly the point of it against the
   * holes: two doors at a person's size, ninety-odd openings at something
   * else's, and only the doors go anywhere.
   */
  const OUT = { x: minX + 3.6, width: 2.4, height: 2.8, depth: 3.2 };
  const outEnd = minZ - OUT.depth;

  const wallSurface = makeWallSurface(...worldRepeat(WIDTH, HEIGHT), WALL_TINT);

  // ----------------------------------------------------------------- shell ---

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH),
    new THREE.MeshStandardMaterial({
      ...makeFloorSurface(...worldRepeat(WIDTH, DEPTH)),
      color: FLOOR_TINT,
      metalness: 0,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(midX, 0, midZ);
  floor.receiveShadow = true;
  group.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, DEPTH),
    new THREE.MeshStandardMaterial({
      ...makeCeilingSurface(...worldRepeat(WIDTH, DEPTH)),
      color: '#262826',
      metalness: 0,
    })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(midX, HEIGHT, midZ);
  group.add(ceiling);

  /**
   * And the ceiling as a thing your head stops against.
   *
   * A lid is a box with a `bottom` and no `top`: an underside with open space
   * beneath and nothing to climb onto. That is all it has to be —
   * `ceilingHeight` in collision.js takes the lowest underside overhead, and
   * the `bottom` also keeps the slab out of the sideways collision, which
   * would otherwise treat a box with no `top` as solid at every height and
   * make the room impassable.
   */
  colliders.push({
    minX: (midX) - (WIDTH) / 2,
    maxX: (midX) + (WIDTH) / 2,
    minZ: (midZ) - (DEPTH) / 2,
    maxZ: (midZ) + (DEPTH) / 2,
    bottom: HEIGHT,
  });

  // ----------------------------------------------------------------- walls ---

  /**
   * The four walls, each in its own group so that everything on it can be
   * written flat — `u` along the wall and `v` up it — and the group's turn is
   * the only place the room's orientation is dealt with. Working in world
   * coordinates on four walls facing four ways is four chances to get a sign
   * wrong, and every one of them looks like a hole in the wrong place.
   */
  const liner = new THREE.MeshStandardMaterial({
    color: '#0c0d0c',
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: '#4e534f',
    roughness: 0.42,
    metalness: 0.7,
  });
  const deckMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(1.5, 1.25), '#5b605a'),
    color: '#5b605a',
    roughness: 0.6,
    metalness: 0.45,
  });
  // The same plate, sampled for a longer piece of it. A segment 1.7 deep drawn
  // with the 1.25 deck's repeat is the same panel stretched, and stretched
  // panel lines are the one thing that reads as a texture rather than as steel.
  const segmentMat = new THREE.MeshStandardMaterial({
    ...makeMetalPanelSurface(...metalRepeat(1.5, SEGMENT.deep), '#5b605a'),
    color: '#5b605a',
    roughness: 0.6,
    metalness: 0.45,
  });
  const stripeMat = new THREE.MeshStandardMaterial({
    ...makeHazardSurface(2, 1),
    roughness: 0.75,
    metalness: 0.05,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: TRIM, roughness: 0.7, metalness: 0.3 });
  const stainMat = new THREE.MeshStandardMaterial({
    color: '#25231f',
    roughness: 0.98,
    transparent: true,
    opacity: 0.75,
  });

  const holeCount = { open: 0, filled: 0, refuges: 0 };
  /**
   * The person-sized openings, gathered per wall in that wall's own frame.
   *
   * The wall's *mesh* can cut them as it goes — `buildHoledWall` takes any
   * rectangle. Its collider cannot: that is built in world space, after all
   * four walls are up, and it has to know every hole in a wall before it can
   * work out what is left of it. So they are collected here and spent below.
   */
  const wallCuts = [[], [], [], []];

  /**
   * The window in the east wall, in that wall's own frame.
   *
   * It is not this room's window. It belongs to the room at the top of the
   * hoist, which is on the other side of this wall — the two share the plane at
   * `maxX`, and have since this room was built, because that plane is the giant
   * hall's near wall carried up. See liftTower.js, which owns the opening and
   * hands it over; all this file does is cut its own side of it.
   *
   * Handed over rather than agreed on. A hole that two files each draw half of
   * is a hole that is in two places the first time either of them moves.
   */
  const WINDOW = port
    ? { u: port.z - midZ, v: port.cill, w: port.width, h: port.height }
    : null;
  /** Do two openings in the same wall frame overlap at all? */
  const clashes = (a, b) =>
    Math.abs(a.u - b.u) < (a.w + b.w) / 2 && a.v < b.v + b.h && b.v < a.v + a.h;

  /**
   * The four walls as machines, which is what the room said they were from the
   * first line of this file and what they have not been until now.
   *
   * Each holds its own platforms and one number: `out`, nought to one, how far
   * that wall has run its decks out of their sockets. `want` is where it is
   * going. Nothing else in here has state — the room was built once and stood
   * there — so this is the whole of it.
   *
   * Driven from the treads in the room at the top of the hoist: pad 1 runs wall
   * 1 out, and running one out runs the others back in. See controlPanel.js for
   * the input and main.js for the wire between them. One wall at a time is the
   * decision worth noticing: it makes the panel a thing you keep going back to
   * rather than four switches you set once, and it means the room has a *state*
   * that can be wrong, which is the difference between a puzzle and a display.
   */
  const walls = [0, 1, 2, 3].map(() => ({ platforms: [], out: 0, want: 0 }));

  /**
   * The hub: a square of floor in the middle of the room, at the height of the
   * top course, and the one piece of this room that is always there.
   *
   * Everything else up here belongs to a wall and goes away when another wall
   * is called. That cannot be all of it. A puzzle whose every surface can be
   * taken away by the puzzle's own input is a puzzle you can only lose once,
   * and the body that loses it is seventy metres up. So there is one place to
   * stand that no button can retract, it is where all four walls' long decks
   * come to meet, and it is reached from the window by a gangway that is also
   * bolted down. Press whatever you like from out there and you are still
   * standing on something.
   *
   * It is under the window rather than dead centre, because the gangway has to
   * start at the open bay and a gangway with a kink in it is two runs of
   * AABB colliders and a corner to fall off. The rooms are three metres out of
   * step, so this sits a metre and a half off the room's centre line — near
   * enough to be the middle of the room to look at, and the four walls aim at
   * it rather than at the centre, which is the only thing that has to be true.
   */
  const HUB = { half: 1.15, gap: 1.0 };
  const hubY = SILLS[SILLS.length - 1] + RAIL.high + PLATFORM.thick;
  const hub = port
    ? { x: midX, z: port.bay ? port.bay.z : port.z, half: HUB.half, y: hubY }
    : null;

  /**
   * How the gangway is cut up, worked out here rather than where it is built.
   *
   * The walls need it. The window wall's top course runs underneath the stair
   * and has to stop before the last tread, and "before the last tread" is a
   * number that belongs to the stair. Measuring it here and building from it
   * later is the same rule as everywhere else in this file: whoever decides a
   * number keeps it, and everyone else is handed it.
   *
   * `rise` is the tallest step either body should have to make — the bucket
   * hops 1.15 — and the count of treads comes out of the drop rather than the
   * other way round, so if the window or the top course ever moves the stair
   * grows a tread instead of a cliff.
   */
  const STAIR = { rise: 0.62, thick: 0.14 };
  const stair =
    hub &&
    (() => {
      const reach = maxX - (hub.x + hub.half);
      const fall = Math.max(0, port.cill - hubY);
      const steps = Math.max(1, Math.ceil(fall / STAIR.rise));
      const treads = steps + 1;
      return {
        reach,
        fall,
        steps,
        treads,
        long: reach / treads,
        wide: Math.min(port.bay?.width ?? 1.7, 1.9),
      };
    })();

  /**
   * Which column on this wall carries the long deck, and it walks.
   *
   * One per course, and a different one each course, so a called wall is not
   * seventeen catwalks stacked in a line but a stagger — you come down onto a
   * course and the way out to the middle is somewhere else along the wall,
   * which is the whole of what makes it a route rather than a ladder. Each
   * wall is given its own phase so the four of them do not agree.
   *
   * The top course is the exception and is aimed: every wall puts its long
   * deck on the column nearest the hub, so that the four routes and the
   * gangway all arrive at the same place. That is the junction the panel is
   * for — press a number at the window, walk out, and the wall you called is
   * the one with a deck waiting at the end of the gangway.
   */
  const TOP_COURSE = SILLS.length - 1;
  const nearestColumn = (v) => {
    let best = 0;
    for (let i = 1; i < COLUMNS.length; i++) {
      if (Math.abs(COLUMNS[i] - v) < Math.abs(COLUMNS[best] - v)) best = i;
    }
    return best;
  };
  /**
   * The hub in a wall's own frame. Each wall group is turned to face into the
   * room, so `u` runs the opposite way on opposing walls; working it out once
   * here is cheaper than getting a sign wrong four times.
   */
  const hubU = (index) =>
    index === 0 ? midX - hub.x : index === 1 ? hub.x - midX : index === 2 ? hub.z - midZ : midZ - hub.z;
  /**
   * Which wall owns which stretch of the climb, and in what order.
   *
   * Every wall used to carry a complete ladder from the floor to the hub,
   * which meant one press of one button got you the whole way up and the
   * other three walls were scenery you could have called instead. The wall
   * selection was something the bucket *could* do rather than something the
   * climb *needed*, and a mechanism nobody needs is a mechanism nobody reads.
   *
   * So the ladder is cut into four and one wall carries each piece. You climb
   * as far as a wall goes, the bucket calls the next one, and you go up that.
   * Four presses, in a fixed order, each of them the only way past the height
   * you are at.
   *
   * The order is not free. Walls 1 and 2 face each other across the room and
   * so do 3 and 4, so an opposite pair has no shared corner and nothing near
   * enough to hand over at — every step of the order has to be between
   * *adjacent* walls, which means it has to alternate between the two pairs.
   * 4, 1, 3, 2 does; so do seven other sequences; this one starts on the wall
   * beside the way in and finishes on the one the gangway reaches.
   *
   * The near wall cannot be first. Its bottom twelve metres is the hall's
   * opening and its first course is at 15.8, so a band starting there would
   * start fifteen metres off the floor. Second is fine, and second is where
   * it is.
   */
  const ORDER = [3, 0, 2, 1];

  /**
   * The bands, worked out rather than written down, so that changing the
   * room's height or its course pitch re-cuts them instead of silently
   * leaving the top of the shaft with no route on it.
   *
   * `Math.floor`, so the remainder falls on the *last* band, and that is not
   * a rounding preference — it is the only place it can go without costing a
   * handover.
   *
   * How far a band's last outward flight finishes from the next band's first
   * inward flight depends on how many courses the band had, because the lane
   * walk is a triangle wave and where it has got to by the end is a function
   * of its length. Measured: bands of three or four courses end one column
   * off the middle and hand over across 2.03m; bands of five or six end
   * three columns off and hand over across 3.66m. Seventeen courses over
   * four walls has to put a spare course somewhere, and the last band is the
   * one with nothing above it to reach — its top is the hub, which is a deck
   * this room builds deliberately rather than a gap anybody has to cross. So
   * the long band goes there and all three real handovers stay short.
   */
  /**
   * The lane plan, which is arithmetic and lives in climbLanes.js.
   *
   * Out of this file because it is the only part of the room with no geometry
   * in it, which makes it the only part that can be tested in a millisecond
   * rather than behind a ninety-second headless boot — and it is where the two
   * worst bugs in the room came from. See test/lanes.test.js.
   */
  const PLAN = planClimb({
    order: ORDER,
    courseCount: SILLS.length,
    columnCount: COLUMNS.length,
  });
  const { bands: BANDS, owns, laneIn, laneOut } = PLAN;

  /*
   * There was a `laneHole` here that picked a column for the refuge — one
   * clear of the two the stair was using, so the hole sat beside the flights
   * rather than in one of them.
   *
   * The refuge does not need a column of its own any more. It goes directly
   * above the flight you arrive on, so the column is `laneIn` and there is
   * nothing to choose. See the refuge block below.
   */

  /**
   * And at the top, the level deck that reaches for the junction. It takes the
   * outward flight's place — the top course is where the climb ends, so there
   * is nothing above for an outward flight to meet, and what is up there
   * instead is the gangway. Nudged along if it lands on the inward flight's
   * own column, because two decks in one socket is one deck.
   */
  const laneHub = (index) => {
    const want = nearestColumn(hubU(index));
    if (want !== laneIn(index, TOP_COURSE)) return want;
    return want > 0 ? want - 1 : want + 1;
  };

  /**
   * And how far that long deck runs.
   *
   * Every course but the top aims at the room's middle and stops `margin`
   * short of it. The top course aims at the hub instead and stops `gap` short
   * of its edge — a jump, not a step, because arriving at the junction should
   * cost something and because a deck that touched the hub would weld the
   * wall you called to the one piece of floor that is meant to survive it.
   */
  const toMiddle = (index) => (index < 2 ? DEPTH / 2 : WIDTH / 2) - RUN.margin + PLATFORM.inset;
  const toHub = (index) => {
    const d =
      index === 0
        ? maxZ - (hub.z + hub.half)
        : index === 1
          ? hub.z - hub.half - minZ
          : index === 2
            ? maxX - (hub.x + hub.half)
            : hub.x - hub.half - minX;
    return d - HUB.gap + PLATFORM.inset;
  };
  /** The wall the window is in, and so the one the gangway hangs off. */
  const GLAZED = 2;
  const runOf = (index, course) => {
    if (course !== TOP_COURSE || !hub) return toMiddle(index);
    /**
     * This one wall cannot aim at the hub, because the gangway is already in
     * the way: the stair comes off this wall at exactly this height and a deck
     * reaching for the hub would run the length of it and finish coplanar with
     * the last tread. Two surfaces at the same height in the same place is a
     * seam in the floor and a fight over the pixels.
     *
     * So it runs *under* the stair and stops short of the last tread. That is
     * not a consolation — it is the better join. The treads above it are half
     * a metre apart, so getting onto this wall is a step down off the stair
     * and getting off it is a step back up, which is the only connection in
     * this room that does not cost a jump over a drop.
     */
    if (index === GLAZED) return stair.long * (stair.treads - 1) - 0.25 + PLATFORM.inset;
    return toHub(index);
  };

  // [wall index, x, z, yaw, width along it, the doorway in it if any]
  const WALLS = [
    // The one you come in by. Turned to face -z, into the room.
    [0, midX, maxZ, Math.PI, WIDTH, { u: midX - doorway.x, w: doorway.width, h: doorway.height }],
    // The far one, with the way on in it.
    [1, midX, minZ, 0, WIDTH, { u: OUT.x - midX, w: OUT.width, h: OUT.height }],
    // The east one. No doorway, but the hoist's window is in it.
    [2, maxX, midZ, -Math.PI / 2, DEPTH, null],
    [3, minX, midZ, Math.PI / 2, DEPTH, null],
  ];

  for (const [index, wx, wz, yaw, span, door] of WALLS) {
    const wall = new THREE.Group();
    wall.position.set(wx, 0, wz);
    wall.rotation.y = yaw;
    group.add(wall);

    const material = new THREE.MeshStandardMaterial({
      ...cloneSurface(wallSurface, 1, 1),
      color: WALL_TINT,
    });

    const holes = [];
    if (door) holes.push({ u: door.u, v: 0, w: door.w, h: door.h });
    const window = index === 2 && WINDOW ? WINDOW : null;
    if (window) holes.push({ ...window });

    /**
     * Whether a socket can exist here at all, asked before anything is built.
     *
     * The three reasons a hole is not cut — off the end of the wall, inside a
     * doorway, inside the hoist's window — used to live inline in the column
     * loop. The stair needs to ask the same question from outside that loop
     * (see `ground` below), and a rule that decides where the building has
     * walls should not be written down twice.
     */
    const missing = (course, i) => {
      const sill = SILLS[course];
      const column = COLUMNS[i];
      if (Math.abs(column) + HOLE.wide / 2 > span / 2 - 0.5) return true;
      if (door && sill < door.h && Math.abs(column - door.u) < (door.w + HOLE.wide) / 2) return true;
      if (window && clashes({ u: column, v: sill, w: HOLE.wide, h: HOLE.high }, window)) return true;
      return false;
    };

    /**
     * The course the stair comes down to the floor at, or none at all.
     *
     * The bottom flight does not stop half a course down like the rest of
     * them; it carries on to `ENTRY`, which is the step off the floor and the
     * reason any of this is reachable. Which course that is, is not course
     * zero — it is the lowest course this particular wall actually has.
     *
     * The wall you walk in by has none. Its bottom twelve metres is the hall's
     * opening: the whole width, the whole height, no wall, no sockets, and the
     * first course it owns is at 15.8. A flight from there to the floor would
     * be a fifteen metre drop dressed as a staircase — twenty-odd treads in a
     * six metre run, which is a ladder drawn as stairs. So it does not get
     * one, and the honest consequence is that calling that wall gives you a
     * stair you cannot get onto from the ground. That is a fact about the room
     * rather than a bug: the wall with the doorway in it is the wall with no
     * bottom to it, and the other three are how you get off the floor.
     */
    const ENTRY_MAX = 6.0;
    let ground = BANDS[index].from;
    while (ground <= BANDS[index].to && missing(ground, laneIn(index, ground))) ground++;
    if (ground > BANDS[index].to || SILLS[ground] + RAIL.high + PLATFORM.thick - ENTRY > ENTRY_MAX) {
      ground = -1;
    }

    SILLS.forEach((sill, course) => {
      /**
       * What this course grows besides ledges: the two flights of the stair,
       * or at the top the inward flight and the level deck to the junction.
       *
       * Worked out once per course rather than asked per column, because the
       * three of them have to agree about which columns they are on and that
       * is easier to see written down together than inferred five times.
       */
      const deckTop = sill + RAIL.high + PLATFORM.thick;
      /**
       * The route's columns, on every course of every wall.
       *
       * Worked out everywhere and *used* only on the courses this wall owns —
       * see `flight` below, which is where the band actually bites. The
       * distinction is not pedantry, it cost a bug: gating the whole route on
       * the band turned off two different things at once, because being on
       * the route is what forces a socket open as well as what earns it a
       * long deck. Without the forcing, thirteen courses a wall fell back to
       * the hash, which bricks up about one in four, and the filled sockets
       * went from 55 to 114. Pressing a button then lit a wall with a third
       * of it missing.
       *
       * So the pattern of open sockets is the same on every course it always
       * was, and what changes across a band edge is only how far what is in
       * them reaches.
       */
      const route = [
        {
          lane: laneIn(index, course),
          run: toMiddle(index),
          // The bottom one carries on down to the floor. Everywhere else it is
          // half a course, which is what makes the stair close on itself.
          climb: course === ground ? -(deckTop - ENTRY) : -FLIGHT.rise,
        },
        course === TOP_COURSE && hub
          ? { lane: laneHub(index), run: runOf(index, course), climb: 0 }
          : { lane: laneOut(index, course), run: toMiddle(index), climb: FLIGHT.rise },
      ];

      /**
       * And the refuge on this course, if this wall has room for one.
       *
       * Directly over the flight you arrive on: same column, and its floor on
       * top of that flight's own socket. You come up the stair, reach the
       * wall, and the way in is the hole above the deck under your feet — a
       * 0.16 step, which is the height of the socket's headroom and nothing
       * more.
       *
       * It used to sit a column to one side at exactly the deck's height, and
       * getting in was a sideways walk along a 0.35 ledge with a drop under
       * it. That reads as a place to fall off rather than a place to get into,
       * and it also cost the course a socket — the column the refuge took was
       * a column with no platform in it. Stacked, the wall keeps every deck it
       * has and the hole is where you already are.
       */
      const refuge = (() => {
        // On this wall's own stretch only. A refuge forty metres up a wall
        // whose route is somewhere else is shelter you cannot reach, and
        // sixty-four of those made the resting face of every wall read as a
        // colander. Now there is one per course of one wall per course of
        // height, which is the same thing said once.
        if (!owns(index, course)) return null;
        // The flight you come up. The socket below is this same column, and
        // the refuge starts where that socket's head stops.
        const col = refugeLane(PLAN, index, course);
        const u = COLUMNS[col];
        const v = sill + HOLE.high;
        if (Math.abs(u) + REFUGE.wide / 2 > span / 2 - 0.5) return null;
        if (door && v < door.h && Math.abs(u - door.u) < (door.w + REFUGE.wide) / 2) return null;
        if (window && clashes({ u, v, w: REFUGE.wide, h: REFUGE.high }, window)) return null;
        // Nothing to walk along any more: the flight is underneath, not
        // beside. `towards` stays on the object at nought because the wall
        // cutting and the `refuges` getter both read it.
        return { col, u, v, w: REFUGE.wide, h: REFUGE.high, towards: 0, deck: deckTop };
      })();

      if (refuge) {
        holeCount.refuges++;
        holes.push({ u: refuge.u, v: refuge.v, w: refuge.w, h: refuge.h });
        wallCuts[index].push(refuge);

        // The box it is: one inside-out mesh for the two sides, the soffit
        // and the back, exactly as the platform sockets do it — which is the
        // point, because from any distance it should read as one of them that
        // never got cut down.
        //
        // Open at the mouth, which the sockets are not and do not need to be.
        // This is a recess you stand in, and a closed box seen from the
        // inside has a black wall across the way out. See openBox.
        const box = new THREE.Mesh(openBox(REFUGE.wide, REFUGE.high, REFUGE.deep), liner);
        box.position.set(refuge.u, refuge.v + REFUGE.high / 2, -REFUGE.deep / 2 - 0.01);
        wall.add(box);

        // Plate on the floor of it. Concrete underfoot would say "hole"; a
        // steel floor says somebody stood here, which is the whole of what
        // this opening has to communicate from forty metres away.
        const pan = new THREE.Mesh(
          new THREE.BoxGeometry(REFUGE.wide - 0.06, 0.04, REFUGE.deep - 0.04),
          deckMat
        );
        pan.position.set(refuge.u, refuge.v + 0.02, -REFUGE.deep / 2);
        pan.receiveShadow = true;
        wall.add(pan);

        // And the threshold painted, in the one language this building has for
        // an edge. It is also the only part of the refuge that catches the
        // room's light, so it is what you actually see: a bar of yellow in a
        // wall of slots, once every course, going up.
        /**
         * And the threshold across its mouth.
         *
         * This was a ledge that ran sideways out of the opening and along the
         * wall to the stair a column away, because the stair was a column
         * away and a pocket you can only enter by a standing jump into a hole
         * over a drop is an unreadable move. With the refuge stacked on its
         * own flight there is nowhere to run to — the deck is directly below
         * — so what is left is the thing the ledge started as: a plate at the
         * sill, the width of the mouth, that you step up onto.
         */
        const span2 = REFUGE.wide;
        const ledgeU = refuge.u;
        const ledge = new THREE.Mesh(
          new THREE.BoxGeometry(span2, 0.06, REFUGE.lip),
          deckMat
        );
        ledge.position.set(ledgeU, refuge.v - 0.03, REFUGE.lip / 2);
        ledge.castShadow = true;
        wall.add(ledge);
        refuge.ledge = { u: ledgeU, w: span2 };

        const paint = new THREE.Mesh(
          new THREE.PlaneGeometry(span2, REFUGE.lip),
          stripeMat
        );
        paint.rotation.x = -Math.PI / 2;
        paint.position.set(ledgeU, refuge.v + 0.005, REFUGE.lip / 2);
        wall.add(paint);

        // A strip at the back that carries its own light. Not a lamp — there
        // are sixty-two of those already and this would be another seventeen
        // per wall. An unlit plane reads as a thing glowing in a hole, which
        // is what it needs to be: findable from below, and from across.
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(REFUGE.wide - 0.5, 0.07),
          new THREE.MeshBasicMaterial({ color: '#2e4a3a', toneMapped: false })
        );
        glow.position.set(refuge.u, refuge.v + REFUGE.high - 0.3, -REFUGE.deep + 0.03);
        wall.add(glow);
      }

      COLUMNS.forEach((column, i) => {
        // The refuge's column is built like any other. It used to be skipped,
        // because the refuge *was* that column's opening; now it sits above
        // the socket and the socket is the step into it.
        // Off the end of the wall, inside a doorway, or inside the hoist's
        // window. Skipped before the count, because these are not sockets that
        // were filled in — they are pieces of wall that are not there.
        if (missing(course, i)) return;
        /**
         * And carrying the climb: only on this wall's own stretch.
         *
         * This is the whole of the band. Everything below reads `flight` —
         * how long the deck is, how many segments it telescopes into, how
         * far it climbs, what it is made of — so outside the band the same
         * socket gets the same treatment any other non-route socket gets: one
         * short ledge, 1.25 deep, going nowhere.
         *
         * Which is what gates the climb. The courses are 4.2 apart and a body
         * in this game can mount 1.33, so a column of single ledges is short
         * of a ladder by a factor of three. Calling the wrong wall gets you a
         * wall that comes all the way out and still will not take you up.
         */
        const flight = owns(index, course) ? route.find((r) => r.lane === i) : null;
        // And it is a socket. Every position on the grid that the building
        // actually has wall at is one — `missing` above has already taken out
        // the ones that are off the end, in the doorway or in the hoist's
        // window, and those are the only three reasons left for a gap. Press a
        // button and every deck on that wall comes out; there is nothing on it
        // any more that stays in.
        holeCount.open++;
        holes.push({ u: column, v: sill, w: HOLE.wide, h: HOLE.high });

        // The recess behind it: a box turned inside out, so one mesh gives the
        // three sides, the soffit and the back of the hole. Unlit and nearly
        // black — what makes an opening read as a hole rather than as a dark
        // rectangle painted on a wall is that its top and sides catch a little
        // of the room's light near the mouth and nothing at all further in.
        const recess = new THREE.Mesh(
          new THREE.BoxGeometry(HOLE.wide, HOLE.high, HOLE.deep),
          liner
        );
        recess.position.set(column, sill + HOLE.high / 2, -HOLE.deep / 2 - 0.01);
        wall.add(recess);

        // The rails, out to the lip and a little past it.
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(
            new THREE.BoxGeometry(RAIL.wide, RAIL.high, HOLE.deep + RAIL.proud),
            railMat
          );
          rail.position.set(
            column + side * (PLATFORM.wide / 2 - 0.18),
            sill + RAIL.high / 2,
            -HOLE.deep / 2 + RAIL.proud / 2
          );
          wall.add(rail);
        }

        // And the platform on them. Steel against the concrete of the wall,
        // which is most of what says it is a separate object that moves rather
        // than a ledge cast into the opening.
        // `rest` is where this one sits when its wall is not called: mostly
        // home, one in seven part way out. That hash is still the room's
        // resting face — it is what makes the wall read as used rather than as
        // a grid — and a called wall runs every deck out past it.
        const rest = platformOut(index, course, i);
        const deckY = sill + RAIL.high + PLATFORM.thick / 2;

        /**
         * One deck, or a telescope of them.
         *
         * A ledge is a single plank 1.25 deep that slides its own length out
         * of the hole. A long one cannot be: the socket is 1.5 deep and the
         * walkway is five or six metres, so it is built as a run of segments
         * that all sit in the hole together and draw out to their own
         * fractions of the run. Segment `s` goes to `(s+1)/count` of the way,
         * which spaces them evenly and leaves each one overlapping the next by
         * whatever is left of its depth — `SEGMENT.lap`, which is what fixes
         * the count.
         *
         * Both kinds are the same list of segments with the same arithmetic on
         * it, because the alternative is two code paths for the same object
         * and a wall where half the decks obey the machine.
         */
        /**
         * And how far out it goes, which is not the same question as whether
         * it carries the climb.
         *
         * Off the band a deck used to run `RUN.ledge` — 0.98, of which 0.74
         * clears the wall. That is the room's *resting* face, and it is the
         * right size for a thing that has never been called. It is the wrong
         * size for a thing that has just been called: press a button and
         * thirteen of a wall's seventeen courses twitch out seventy
         * centimetres and stop, which from the floor of a seventy-six metre
         * shaft is a wall that did nothing. The one wall where it looked
         * right was the one whose band is at the bottom, and that is not the
         * wall reading correctly — that is the other three being read at a
         * distance of forty metres.
         *
         * So a called wall runs every deck out to something you can see and
         * stand on, and only the band's own sockets run out to a flight.
         *
         * This costs the gating nothing, and that is worth saying plainly
         * rather than trusting. What stops a column of shelves being a ladder
         * is the course pitch: they are 4.2 apart and a body here mounts 1.33.
         * Depth does not enter into it — every shelf on a course is at that
         * course's own height, so a deeper one is a longer thing to walk
         * along at the same altitude. The only heights in this room that are
         * not a course are the flights' treads and the three landings, and
         * both sit exactly half a course off the decks either side of them:
         * 2.1, which is still a third again more than a body can climb.
         */
        const run = flight ? flight.run : RUN.shelf;
        const climb = flight ? flight.climb : 0;
        // A telescope whenever the run is longer than one plank, flight or not
        // — which is the same rule the flights were already using, asked about
        // the run instead of about what the run is for.
        const telescoped = run > PLATFORM.deep;
        const deep = telescoped ? SEGMENT.deep : PLATFORM.deep;
        /**
         * How many treads, and it is whichever of the two limits bites.
         *
         * A long deck needs enough segments that they still overlap when they
         * are all the way out, and a *climbing* one needs enough that no one
         * step is taller than a body can hop. The first rule sizes the level
         * deck at the top and the second sizes the flights, and taking the
         * larger of the two means neither has to know about the other.
         */
        const count = telescoped
          ? Math.max(
              2,
              Math.ceil(run / (SEGMENT.deep - SEGMENT.lap)),
              Math.ceil(Math.abs(climb) / FLIGHT.step) + 1
            )
          : 1;
        const home = -PLATFORM.inset - deep / 2;
        /**
         * Where it sits when its wall is not called, as a fraction of the run.
         *
         * A ledge keeps the room's resting face exactly as it was: the hash
         * says most are home and one in seven is part way out, and that is
         * what makes the wall read as used. A flight is home, unless the hash
         * had it well out, in which case it is a third out — which is two
         * metres of half-risen stair hanging in the dark with nothing on the
         * end of it, and is the best thing this room has ever put in front of
         * a body standing at the bottom of it.
         */
        const restF = flight ? (rest > 0.6 ? 0.3 : 0) : Math.min(1, rest / run);

        /**
         * The segments, which slide out and rise as they go.
         *
         * Tread `s` draws out to `(s+1)/count` of the run and lifts to
         * `s/(count-1)` of the climb — so the innermost one stays flush with
         * its own sill and the outermost lands exactly on the flight's far
         * end. Both are fractions of the extension, which is what lets the
         * whole thing fold back into a slot 0.43 high: retracted, every tread
         * is at the sill and inside the socket, and it is only on the way out
         * that it becomes a stair at all. A wall that extrudes a staircase is
         * a stranger machine than a wall that pushes out a plank, and this
         * room has been calling itself a machine for putting a walkway
         * anywhere in it since the day it was built.
         */
        const segments = [];
        for (let s = 0; s < count; s++) {
          const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(PLATFORM.wide - s * SEGMENT.taper, PLATFORM.thick, deep),
            flight ? segmentMat : deckMat
          );
          const out = (run * (s + 1)) / count;
          const lift = count > 1 ? (climb * s) / (count - 1) : 0;
          // The nested hair of height is only wanted where the treads are
          // otherwise coplanar. A flight separates them by half a metre on its
          // own and does not need the fudge.
          const nest = climb === 0 ? -s * SEGMENT.drop : 0;
          mesh.position.set(column, deckY + nest + restF * lift, home + restF * out);
          // Shadows near the floor only. There are some hundreds of these now
          // and the top forty metres of this room has no light to cast one.
          const shadow = sill < 20;
          mesh.castShadow = restF > 0 && shadow;
          wall.add(mesh);
          segments.push({ mesh, out, lift, home, shadow, base: deckY + nest });
        }
        const tip = segments[segments.length - 1];

        // A hazard line on the leading edge, hidden while the deck is home.
        // Every platform has one now, because any of them can come out; what
        // used to be true — that only the three that stick out are painted —
        // is now a thing about the wall's *state* rather than about which
        // platform it is, so it is `visible` and not an `if`. It rides the
        // outermost tread, which is the only edge anything can walk off.
        const lip = new THREE.Mesh(
          new THREE.BoxGeometry(PLATFORM.wide - (count - 1) * SEGMENT.taper, PLATFORM.thick + 0.02, 0.1),
          stripeMat
        );
        lip.position.set(column, tip.base + restF * tip.lift, -PLATFORM.inset + restF * tip.out - 0.04);
        lip.visible = restF * tip.out > 0.2;
        wall.add(lip);

        /**
         * And the treads as things to stand on, but only while they are out.
         *
         * `bottom` on every one of them, without fail: these are plates in the
         * air, and a box with a `top` and no `bottom` is solid at every height
         * below it — one tread would be a column of stone from the socket to
         * the floor, and there are some hundreds of them.
         *
         * One box per tread rather than one for the whole deck, because a
         * flight's treads are at half a metre's difference from each other and
         * a single box would be a ramp pretending to be a step. It also
         * retires a hack: the old single box had to be cut to the *narrowest*
         * segment across the wall so that the tapered end was never air you
         * could stand on. Per-tread, each box is exactly its own plank.
         *
         * The bounds are read off the meshes at full extension rather than
         * worked out from the wall's yaw by hand — see the same argument in
         * controlPanel.js. Turned meshes know where they are; trigonometry
         * written out twice does not.
         */
        const state = walls[index];
        for (const seg of segments) {
          seg.mesh.position.z = seg.home + seg.out;
          seg.mesh.position.y = seg.base + seg.lift;
        }
        wall.updateMatrixWorld(true);
        for (const seg of segments) {
          const bounds = new THREE.Box3().setFromObject(seg.mesh);
          colliders.push({
            minX: bounds.min.x,
            maxX: bounds.max.x,
            minZ: bounds.min.z,
            maxZ: bounds.max.z,
            top: bounds.max.y,
            /**
             * A hair under the walking surface, not under the plate.
             *
             * `bottom` is the height a body's head has to be below to pass
             * underneath, and taking it from the mesh meant taking the deck's
             * full two hundred millimetres of thickness with it. That put the
             * underside of the tread at 1.99 at a height of 1.77 — and the
             * player is 1.80. Three centimetres, and the whole bottom flight
             * of the stair became a wall you could not walk up to, because
             * the second tread of it caught you on the head from below.
             *
             * These are plates. Treating them as having no thickness at all
             * for the purpose of passing under is both the fix and the honest
             * reading: what stops you is the floor, and a floor stops you by
             * being under your feet.
             */
            bottom: bounds.max.y - 0.02,
            // Only when it has actually arrived. A collider that appears half
            // way through the travel is a step that exists before you can see
            // it — and on a flight it is a step at the wrong height as well.
            enabled: () => state.out > 0.92,
          });
        }
        for (const seg of segments) {
          seg.mesh.position.z = seg.home + restF * seg.out;
          seg.mesh.position.y = seg.base + restF * seg.lift;
        }

        state.platforms.push({ segments, lip, tip, restF });

        // And the run down the wall under some of them.
        if (!isStained(index, course, i)) return;
        const stain = new THREE.Mesh(
          new THREE.PlaneGeometry(HOLE.wide * 0.8, 1.6),
          stainMat
        );
        stain.position.set(column, sill - 0.8, 0.012);
        wall.add(stain);
      });
    });

    buildHoledWall({ parent: wall, material, width: span, height: HEIGHT, holes });

    /**
     * And the wall's number, painted on it twice.
     *
     * Twice because the room has two viewpoints and they are sixty metres
     * apart. From the floor you are looking up at the bottom of it, so there is
     * one at head height and a bit; from the window at the top of the hoist you
     * are looking down and across, and the low one is a smudge four hundred
     * feet away. The high pair are what make the treads mean anything — press
     * 3, watch 3 — and the low pair are what make the room legible to a body
     * standing in the doorway wondering what it is looking at.
     *
     * Painted, not plated: a stencil with nothing behind it, taking the wall's
     * own light. A grey card with a number on it hung on a grey wall is a sign;
     * this is a mark on the concrete, which is what a working building has.
     */
    {
      const numeral = new THREE.MeshStandardMaterial({
        map: makeDigitTexture(String(index + 1), 'paint'),
        transparent: true,
        roughness: 0.95,
        metalness: 0,
      });
      /**
       * The low one is not low, and the animal is why.
       *
       * It was at 5.4 — head height and a bit, for a body standing on the floor
       * reading the room. There is no such body. The cube is 14.6 in a room
       * fifteen by fourteen and its front face stands in the plane of the way
       * in, so from the hall you are looking at meat and nothing else, and a
       * number painted at 5.4 is a number painted on the far side of an animal.
       *
       * Eighteen clears its crown at 14.53 with room to spare, and puts it where
       * something might actually be: a body on a platform this panel has just
       * run out of the opposite wall. Above the beast, below the window, at the
       * one height in this room that is both lit and reachable.
       */
      const low = 18.0;
      for (const [v, size] of [[low, 2.6], [63.7, 3.4]]) {
        const mark = new THREE.Mesh(new THREE.PlaneGeometry(size, size), numeral);
        mark.position.set(0, v, 0.02);
        wall.add(mark);
      }
    }

    // Lined out, so walking through a doorway is walking through the thickness
    // of a wall. The holes get no such treatment and want none: their liner is
    // the recess above, and it is deeper than any of this.
    if (door) {
      for (const [w, h, u, v, rx, ry] of [
        [0.5, door.h, door.u - door.w / 2, door.h / 2, 0, Math.PI / 2],
        [0.5, door.h, door.u + door.w / 2, door.h / 2, 0, -Math.PI / 2],
        [door.w, 0.5, door.u, door.h, Math.PI / 2, 0],
      ]) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshStandardMaterial({ color: '#3d403b', roughness: 0.93 })
        );
        panel.position.set(u, v, -0.25);
        panel.rotation.set(rx, ry, 0);
        panel.userData.notWall = true;
        wall.add(panel);
      }
    }
  }

  /**
   * And the colliders: four walls, cut round everything that goes through them.
   *
   * This used to be eight hand-written boxes, because there were only ever two
   * holes to work around and both of them were doorways at floor level. There
   * are seventeen more per wall now and they are at every height, so it is
   * generated: each wall is handed its openings in its own frame and works out
   * what is left of itself, which is the same arrangement `buildHoledWall`
   * has for the mesh and for the same reason. Two files' worth of trigonometry
   * agreeing about where a hole is, is two chances to be wrong.
   *
   * Still not cut round the *slots*. Those are 0.43 high and nothing can get
   * into one, so cutting the wall for them would be a hundred and ninety gaps
   * in a surface nobody can reach and a hundred and ninety chances to wedge
   * the bucket in a wall. The refuges are cut because the refuges are the
   * point: they are the only openings in this room a body fits through.
   */
  const inLow = doorway.x - doorway.width / 2;
  const inHigh = doorway.x + doorway.width / 2;
  const outLow = OUT.x - OUT.width / 2;
  const outHigh = OUT.x + OUT.width / 2;

  /**
   * How thick a wall is to the collision code, and it is now the refuge's
   * business rather than a round number.
   *
   * It was a metre — enough to be a wall, thrown outward so it does not eat
   * the room it encloses. A refuge is 1.5 deep, which is deeper than that, so
   * a pocket cut into a one metre wall would have its back open onto nothing
   * and the first thing you did inside it would be to walk out of the world.
   * The wall is therefore as thick as a refuge plus something to stand the
   * back of one in.
   */
  const WALL_T = REFUGE.deep + REFUGE.back;

  /**
   * A slab of one wall's thickness, in that wall's own frame: `u` along it,
   * `d` in from the room-side face. Every sign this room could get wrong is
   * written once, here.
   */
  const wallSlab = (index, u0, u1, d0, d1, extra) => {
    if (u1 - u0 < 1e-4) return;
    if (index === 0) solid(midX - u1, midX - u0, maxZ + d0, maxZ + d1, extra);
    else if (index === 1) solid(midX + u0, midX + u1, minZ - d1, minZ - d0, extra);
    else if (index === 2) solid(maxX + d0, maxX + d1, midZ + u0, midZ + u1, extra);
    else solid(minX - d1, minX - d0, midZ - u1, midZ - u0, extra);
  };

  /**
   * One wall, as the runs of solid left between its openings.
   *
   * Split along the wall at every opening's edges, then up each run at every
   * opening that crosses it. A run with nothing in it is one box. A run with
   * holes in it is a box under the lowest, a box between each pair, and a box
   * over the highest — and the box *under* an opening is what gives a refuge
   * its floor, for free and at exactly the right height, which is the one
   * piece of arithmetic in here that cannot drift.
   *
   * `open` marks a hole that goes all the way through — the two doorways. A
   * refuge is a pocket, so it gets a back: a slab across the far part of the
   * thickness, over that opening's height and no further.
   *
   * `cap` is a wall that stops where somebody else's floor starts. Two of them
   * do: the room at the top of the hoist stands against the east wall and over
   * the end of the near one, and a wall that carried on up through it would be
   * a metre of this room standing in that one. The number is the neighbour's,
   * handed over with the window rather than written down here.
   */
  const buildWallSolid = (index, openings, cap) => {
    const half = (index < 2 ? WIDTH : DEPTH) / 2 + WALL_T;
    const edges = new Set([-half, half]);
    for (const o of openings) {
      edges.add(o.u - o.w / 2);
      edges.add(o.u + o.w / 2);
    }
    const runs = [...edges].sort((a, b) => a - b);
    for (let i = 0; i < runs.length - 1; i++) {
      const a = runs[i];
      const b = runs[i + 1];
      const mid = (a + b) / 2;
      const crossing = openings
        .filter((o) => Math.abs(o.u - mid) < o.w / 2)
        .sort((x, y) => x.v - y.v);
      let sofar = null;
      for (const o of crossing) {
        if (o.v > (sofar ?? 0) + 0.01) {
          wallSlab(index, a, b, 0, WALL_T, {
            ...(sofar === null ? {} : { bottom: sofar }),
            top: o.v,
          });
        }
        if (!o.open) {
          wallSlab(index, a, b, REFUGE.deep, WALL_T, { bottom: o.v, top: o.v + o.h });
          // And the ledge, which runs past this opening's own width along to
          // the flight. It is emitted from its own u-range rather than the
          // run's, because it is the one part of a refuge that is outside the
          // wall and so is not cut by anything in it. `bottom` on it like
          // every other plate in this room: it hangs in the air.
          if (o.ledge) {
            /**
             * `bottom` a hair under its own face, not 0.45 under it.
             *
             * It was the deeper box when the plate hung over open air with
             * the nearest deck a column away. Stacked, there is a deck 0.16
             * below it and 0.35 behind it, and a box 0.45 deep at that height
             * is a bar across the shins of anybody walking up their own
             * flight to the wall — you would arrive at the refuge and be
             * unable to reach it. A plate is a plate: you stand on top and
             * you pass under, and what stops you is the floor.
             */
            wallSlab(index, o.ledge.u - o.ledge.w / 2, o.ledge.u + o.ledge.w / 2, -REFUGE.lip, 0.02, {
              top: o.v,
              bottom: o.v - 0.02,
            });
          }
        }
        sofar = o.v + o.h;
      }
      wallSlab(index, a, b, 0, WALL_T, {
        ...(sofar === null ? {} : { bottom: sofar }),
        ...(cap === undefined ? {} : { top: cap }),
      });
    }
  };

  buildWallSolid(
    0,
    [{ u: midX - doorway.x, v: 0, w: doorway.width, h: doorway.height, open: true }, ...wallCuts[0]],
    port ? port.floor : undefined
  );
  buildWallSolid(
    1,
    [{ u: OUT.x - midX, v: 0, w: OUT.width, h: OUT.height, open: true }, ...wallCuts[1]],
    undefined
  );
  buildWallSolid(2, wallCuts[2], port ? port.floor : undefined);
  buildWallSolid(3, wallCuts[3], undefined);

  // ------------------------------------------------------------- the way on ---

  /**
   * A lined passage stopping in the dark, capped, the same as every unfinished
   * end in this stretch of the building. `wayOn` hands it over for whatever
   * comes next.
   */
  {
    const passage = new THREE.MeshStandardMaterial({ color: '#32342f', roughness: 0.94 });
    const throat = minZ - OUT.depth / 2;
    for (const [w, h, px, py, rx, ry] of [
      [OUT.depth, OUT.height, outLow, OUT.height / 2, 0, Math.PI / 2],
      [OUT.depth, OUT.height, outHigh, OUT.height / 2, 0, -Math.PI / 2],
      [OUT.width, OUT.depth, OUT.x, OUT.height, Math.PI / 2, 0],
      [OUT.width, OUT.depth, OUT.x, 0.004, -Math.PI / 2, 0],
    ]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), passage);
      panel.position.set(px, py, throat);
      panel.rotation.set(rx, ry, 0);
      panel.receiveShadow = true;
      group.add(panel);
    }
    const cap = new THREE.Mesh(
      new THREE.PlaneGeometry(OUT.width, OUT.height),
      new THREE.MeshStandardMaterial({ color: '#0a0b09', roughness: 1 })
    );
    cap.position.set(OUT.x, OUT.height / 2, outEnd);
    group.add(cap);

    solid(outLow - 0.6, outLow, outEnd, minZ, {});
    solid(outHigh, outHigh + 0.6, outEnd, minZ, {});
    solid(outLow - 0.6, outHigh + 0.6, outEnd - 0.6, outEnd, {});
  }

  // --------------------------------------------------------------- gangway ---

  /**
   * The top of the climb: a junction in the middle of the air, and a stair off
   * it to the window.
   *
   * It was built the other way round and it is worth keeping that straight,
   * because the geometry did not change and the meaning did. It was the way
   * *out* — one pane of the window removed so that the bucket, which had spent
   * the whole room pressing buttons at a hundred and ninety-five decks it
   * could never touch, could finally walk out among them.
   *
   * The bucket no longer goes through that gap; there is a collider across it
   * that only the bucket can feel (see liftTower.js). What runs up the wall
   * now is a staircase, and the body that climbs it is you, from the floor,
   * seventy metres. So this is the last four metres of that climb: you come up
   * the top course, cross to the junction, and go up the stair into the lit
   * room where the bucket has been standing on the pads the whole time.
   *
   * Everything here is bolted down and none of it is on the `walls` machine.
   * That is the rule this room needs most: the input can take away every other
   * surface in the air, so the place the climb finishes cannot be one of them.
   *
   * It steps rather than running level because the cill and the top course are
   * two metres apart and neither of them is negotiable — the window is where
   * the hoist stops and the course is where the wall's grid put it. The step is
   * sized off what the shorter of the two bodies can hop, which is now a
   * tolerance rather than a requirement, and the count is derived from the
   * drop, so the day either end moves the stair grows a tread instead of a
   * cliff.
   */
  const gangway = { treads: [], hub: null };
  if (hub) {
    const grating = new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(...metalRepeat(2.2, stair.wide), '#4d514a'),
      color: '#4d514a',
      roughness: 0.55,
      metalness: 0.6,
    });

    const { fall, steps, treads, long } = stair;
    const lowZ = hub.z - stair.wide / 2;
    const highZ = hub.z + stair.wide / 2;

    for (let k = 0; k < treads; k++) {
      const top = port.cill - (fall * k) / steps;
      const x1 = maxX - k * long;
      const x0 = x1 - long;
      const tread = new THREE.Mesh(new THREE.BoxGeometry(long, STAIR.thick, stair.wide), grating);
      tread.position.set((x0 + x1) / 2, top - STAIR.thick / 2, hub.z);
      tread.castShadow = true;
      tread.receiveShadow = true;
      group.add(tread);

      // A stringer down each side, deeper than the tread, so the thing has a
      // section to it from below — which is the only angle most of it is ever
      // seen from, being seventy metres up over a room you stand at the bottom
      // of.
      for (const sz of [lowZ + 0.04, highZ - 0.04]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(long, 0.22, 0.07), trimMat);
        beam.position.set((x0 + x1) / 2, top - 0.17, sz);
        group.add(beam);
      }

      colliders.push({
        minX: x0,
        maxX: x1,
        minZ: lowZ,
        maxZ: highZ,
        top,
        // A plate in the air, like every other plate in this room. Without a
        // bottom this stair is five columns of stone standing on the floor
        // seventy metres below it. Shallow, because the window wall's own top
        // course runs along underneath these and the two must not meet.
        bottom: top - 0.3,
      });
      gangway.treads.push({ x: (x0 + x1) / 2, y: top, z: hub.z });
    }

    // The junction itself.
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(hub.half * 2, STAIR.thick, hub.half * 2),
      grating
    );
    pad.position.set(hub.x, hubY - STAIR.thick / 2, hub.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);

    for (const [w, d, ox, oz] of [
      [hub.half * 2, 0.07, 0, hub.half],
      [hub.half * 2, 0.07, 0, -hub.half],
      [0.07, hub.half * 2, hub.half, 0],
      [0.07, hub.half * 2, -hub.half, 0],
    ]) {
      const kerb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), trimMat);
      kerb.position.set(hub.x + ox, hubY - 0.19, hub.z + oz);
      group.add(kerb);
    }

    // A hazard border round it, which is this building's word for edge and is
    // the only word it has that carries at forty metres.
    const paint = new THREE.MeshStandardMaterial({
      ...makeHazardSurface(6, 1),
      roughness: 0.78,
      metalness: 0.06,
    });
    for (const [w, d, ox, oz] of [
      [hub.half * 2, 0.24, 0, hub.half - 0.12],
      [hub.half * 2, 0.24, 0, -hub.half + 0.12],
      [0.24, hub.half * 2, hub.half - 0.12, 0],
      [0.24, hub.half * 2, -hub.half + 0.12, 0],
    ]) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(hub.x + ox, hubY + 0.006, hub.z + oz);
      group.add(mark);
    }

    /**
     * And four rods going up out of sight.
     *
     * A square of steel floating in the middle of a room is a square of steel
     * floating in the middle of a room. Hung off something it is a platform,
     * and what it is hung off has to be above it — which here is five metres
     * of nothing and then a slab nobody has ever seen. That is exactly the
     * right answer: the rods leave the top of the hub, get thinner, and are
     * gone before they arrive anywhere. The room's whole argument is that
     * there is more of it above you than you can account for, and this is the
     * first object in it that is visibly held up by that.
     *
     * On the corners, and that is not symmetry for its own sake. Two rods on
     * an axis was the first version and it put one of them dead in the middle
     * of the view from the junction back to the stair — and dead in the line
     * you walk to get there. Everything arrives at this square along one of
     * the two axes, because that is where the gangway is and where the walls
     * are, so the corners are the only four places a post can stand without
     * being in somebody's way.
     */
    for (const ox of [-1, 1]) {
      for (const oz of [-1, 1]) {
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, HEIGHT - hubY, 6),
          trimMat
        );
        rod.position.set(hub.x + ox * (hub.half - 0.1), (hubY + HEIGHT) / 2, hub.z + oz * (hub.half - 0.1));
        group.add(rod);
      }
    }

    colliders.push({
      minX: hub.x - hub.half,
      maxX: hub.x + hub.half,
      minZ: hub.z - hub.half,
      maxZ: hub.z + hub.half,
      top: hubY,
      bottom: hubY - 0.3,
    });
    gangway.hub = { x: hub.x, y: hubY, z: hub.z, half: hub.half };
  }

  // -------------------------------------------------------------- landings ---

  /**
   * Three plates hanging in the middle of the shaft, one at each band
   * boundary, and they are the only pieces of floor in this room that do not
   * retract.
   *
   * They exist for two reasons and either one on its own would have been
   * enough.
   *
   * The first is reach. A band's last outward flight and the next band's
   * first inward flight finish at the same height — that falls out of the
   * arithmetic, because half a course up from one course is half a course
   * down from the next — but they finish 2.03m apart, and they cannot be
   * made to finish closer. See LANE_START in climbLanes.js: every band
   * starts its lane walk on the middle column, which is the near one, and no
   * walk of 2n entries stepping a column at a time can come back to the
   * column it started on.
   * The player's standing jump is about 2.1. Three centimetres of margin
   * over a forty metre drop is not a design, it is a dare.
   *
   * The second is that something has to be standing still when the walls
   * swap. Calling a wall retracts the other three, so the moment the bucket
   * presses the next button the thing you climbed up folds into the
   * concrete. Every other surface in this room is on one wall or another and
   * goes with it. You need one square of floor that belongs to neither, and
   * you need it exactly where the handover is.
   *
   * Which is why they are worth the intrusion. A permanent plate in the
   * middle of an otherwise empty shaft is a loud object, and this one says
   * the right thing: it is the only place in seventy metres that is always
   * there, and it is where you stand and wait while the room rearranges
   * itself underneath you.
   */
  const LANDING = {
    /**
     * How far past the two tips the plate reaches, and the least it can be.
     *
     * Sized off the gap rather than set to a number, because the gap is a
     * consequence of the band lengths and the band lengths are derived. A
     * constant here is a plate that fits until somebody changes the room's
     * height, and then silently does not — which shows up as a step into
     * thin air forty metres up rather than as anything that looks like a
     * mistake in this file.
     */
    over: 1.1,
    least: 2.6,
    thick: 0.18,
  };

  /**
   * The far end of a flight, in world terms, from the wall it is on and the
   * column it is in.
   *
   * The same four sign cases as `wallSlab` and the refuge spots, and written
   * out for the third time rather than shared, because the other two are in
   * a wall's own frame and this one is not — it wants a point out in the
   * middle of the room, measured from a wall it is not attached to.
   */
  const flightTip = (index, col) => {
    const u = COLUMNS[col];
    const run = toMiddle(index);
    if (index === 0) return { x: midX - u, z: maxZ - run };
    if (index === 1) return { x: midX + u, z: minZ + run };
    if (index === 2) return { x: maxX - run, z: midZ + u };
    return { x: minX + run, z: midZ - u };
  };

  const landings = [];
  for (let k = 0; k < ORDER.length - 1; k++) {
    const below = ORDER[k];
    const above = ORDER[k + 1];
    const last = BANDS[below].to;
    const first = BANDS[above].from;
    if (first !== last + 1) continue;

    // Both tips are at the same height by construction — half a course above
    // the lower band's top deck is half a course below the upper band's
    // first. Taken off the lower one, and the upper one is checked against
    // it rather than assumed, because a band boundary that ever stops being
    // consecutive should fail loudly here rather than quietly leave a plate
    // floating half a course off the route.
    const height = SILLS[last] + RAIL.high + PLATFORM.thick + FLIGHT.rise;
    const a = flightTip(below, laneOut(below, last));
    const b = flightTip(above, laneIn(above, first));
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;

    const gap = Math.hypot(a.x - b.x, a.z - b.z);
    const size = Math.max(LANDING.least, gap + LANDING.over);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(size, LANDING.thick, size), deckMat);
    plate.position.set(cx, height - LANDING.thick / 2, cz);
    plate.castShadow = true;
    plate.receiveShadow = true;
    group.add(plate);

    // Painted round the edge, in the one language this building has for a
    // drop. It is also the only thing that makes the plate findable: it is
    // hanging in unlit air in the middle of a shaft, and the stripe is lit
    // from the wall lamps at a grazing angle when nothing else up here is.
    for (const [w, d, ox, oz] of [
      [size, 0.22, 0, size / 2 - 0.11],
      [size, 0.22, 0, -size / 2 + 0.11],
      [0.22, size - 0.44, size / 2 - 0.11, 0],
      [0.22, size - 0.44, -size / 2 + 0.11, 0],
    ]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stripeMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(cx + ox, height + 0.004, cz + oz);
      group.add(bar);
    }

    solid(cx - size / 2, cx + size / 2, cz - size / 2, cz + size / 2, {
      top: height,
      // Thin to anything passing under it, like every other plate in this
      // room — see the treads. A body one course down is walking about with
      // its head at the underside of this, and a plate that is solid for its
      // whole thickness is a ceiling you are stopped dead by.
      bottom: height - 0.02,
    });

    landings.push({
      between: [below + 1, above + 1],
      y: +height.toFixed(2),
      x: +cx.toFixed(2),
      z: +cz.toFixed(2),
      // How far the two flights it joins actually finish apart, for the
      // harness: this is the number the plate exists to cover.
      gap: +gap.toFixed(2),
      size: +size.toFixed(2),
    });
  }

  // ----------------------------------------------------------------- light ---

  /**
   * The lamps, which are in tallRoomLights.js.
   *
   * Out of this file because they are the largest stretch of it that adds
   * nothing but meshes — no colliders, no openings, nothing to stand on — so
   * the cut costs no shared state. `fittings` comes back because the room
   * flickers them; everything else about them stays over there.
   */
  const fittings = buildTallRoomLights({
    parent: group,
    bounds: { midX, midZ, minX, maxX, minZ, maxZ, HEIGHT },
    // The way in, which the one lamp outside the room is hung beside.
    out: OUT,
    port,
    window: WINDOW,
    trimMat,
  });

  // ------------------------------------------------------------------ floor ---

  // A grating in the middle of it, because a room whose floor is one flat sheet
  // of concrete has no middle. It also answers the stains: whatever runs down
  // the walls goes somewhere.
  {
    const surround = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 2.2), trimMat);
    surround.position.set(midX, 0.025, midZ);
    surround.receiveShadow = true;
    group.add(surround);
    const pit = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshStandardMaterial({ color: '#0c0d0b', roughness: 1 })
    );
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(midX, 0.008, midZ);
    group.add(pit);
    for (let i = 0; i < 9; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.06), trimMat);
      bar.position.set(midX, 0.045, midZ - 0.95 + (i + 0.5) * (1.9 / 9));
      group.add(bar);
    }
    // No collider. It stands two fingers proud of the floor, which the step
    // height swallows without noticing.
  }

  // ------------------------------------------------------------------ meat ---

  /**
   * And the thing standing in it, which is now most of it.
   *
   * Dead centre, square to the walls, and touching them.
   *
   * None of that is a choice any more. It is 14.6 metres in a room fifteen by
   * fourteen — deliberately over the room's depth — so anywhere but the middle
   * puts it through a wall and any angle at all puts its corners through two:
   * its diagonal is 20.6 and the room is 15. `fit` is the room's own inside
   * handed to it as half-extents, and the cube's surface is clamped to that,
   * which is what lets a cube touch four walls of a room that is not square.
   * Front and back are pressed flat against the concrete for their whole area;
   * the sides reach it where the meat swells.
   *
   * There is no aisle. The room is sealed — the far wall it is pressed against
   * is the one with the way on in it, and its front face stands in the plane of
   * the opening. You walk the length of the hall and what is at the end of it is
   * not a room you can enter.
   *
   * It stands over the floor grating, which is where whatever runs down these
   * walls was always going.
   */
  const meat = createMeatCube({
    parent: group,
    colliders,
    x: midX,
    z: midZ,
    yaw: 0,
    // A hair inside the wall planes, so it presses on them without the two
    // surfaces fighting over the same pixels.
    fit: { x: WIDTH / 2 - 0.02, z: DEPTH / 2 - 0.02 },
    player,
    /**
     * And when it gets hold of you, this room is told once and takes it from
     * there. meatCube.js moves the animal and has no opinion about what being
     * caught by it means; see `theEnd` below, which is the opinion.
     */
    onTouched: () => {
      if (seizure.isPlaying) return;
      // The greeting is the room's, not the shot's. It cannot be running —
      // the cube gates the touch on `scripted` — but it can be about to, and
      // one firing over the top of this would take the camera off the shot.
      greeting = null;
      greeted = true;
      seizure.start(meat);
    },
    /**
     * And it climbs. The ceiling is all it is told — how tall the animal is,
     * and therefore how far up it can go before its crown is against the slab,
     * is meatCube.js's own business, because the crown was sampled off the
     * surface rather than derived from a number anyone here could repeat.
     *
     * What this does to the room is the point of it. The way in is sealed by
     * the thing standing in it, and now the thing standing in it leaves: for a
     * stretch of every cycle the hall's opening is a hall's opening, the floor
     * of this room is a floor, and the grating in the middle of it is something
     * you can walk to and stand on. It comes back.
     */
    /**
     * It stops below the top course now, rather than at the slab.
     *
     * It used to climb until its crown was against the ceiling, which was the
     * honest reading of "goes up the tower" and was fine while the tower was
     * empty. There is a gangway and a junction up there now, at the top
     * course, and a body standing on either of them was inside fifteen metres
     * of animal for a quarter of every cycle — thrown off, or carried to the
     * roof, depending on which face of it got them first. A hazard you cannot
     * be anywhere to avoid is not a hazard, it is a clock that deletes the
     * puzzle.
     *
     * So the top course is the lid. Everything below it — every route down
     * this room has, every catwalk on every wall — is still swept by the
     * thing on its way past, which is the whole danger of being out there.
     * The junction is the one place it cannot reach, and what it does instead
     * is come up and stop just underneath it: fourteen and a half metres of
     * meat arriving level with your feet, and no longer moving.
     */
    travel: { ceiling: SILLS[SILLS.length - 1] },
  });

  /** Inside the room at all — the passage in does not count. */
  const contains = (x, z) => x > minX && x < maxX && z > minZ && z < maxZ;

  /**
   * The greeting: it comes down, it looks at you, and it goes back up.
   *
   * Once, the first time you get near the mouth of this room while the animal
   * is high enough for a drop to be a drop. Everything it uses already exists —
   * the fall, the eyes that track you, the haul — and the whole of what this
   * adds is a reason and a clock. That is deliberate: a set piece built out of
   * the room's own machinery keeps working when the machinery changes, and this
   * one has already survived the travel going from 1.6 to 8 and the descent
   * turning into a free fall.
   *
   * It will not fire while the thing is on the floor. If you arrive to find the
   * way blocked by meat, you get no cutscene — you get a wall that leaves, and
   * then, when you step up to the gap it left, the wall comes back. Which is
   * the better version of this beat anyway, and it costs one condition.
   *
   * `reach` is measured from the plane of the opening rather than from a point,
   * because that opening is fifteen metres wide and a radius would fire in the
   * middle and not at the edges.
   */
  const GREET = { reach: 9.0, minHeight: 25, hold: 2.8, clear: 12 };
  let greeted = false;
  let greeting = null;
  let aimYaw = 0;
  let aimPitch = 0;

  const nearTheMouth = () => {
    const p = player.position;
    return (
      p.z > maxZ &&
      p.z < maxZ + GREET.reach &&
      p.x > minX - 0.5 &&
      p.x < maxX + 0.5
    );
  };

  /**
   * Point the camera at it, easing rather than snapping.
   *
   * `teleport` is the only public way to set the player's yaw, so this hands it
   * back its own position every frame and changes nothing but where it is
   * looking. It is safe while the body is disabled — nothing else is writing
   * the camera then, which is the reason the body is disabled at all.
   */
  const aimAtTheAnimal = (delta) => {
    const p = player.position;
    const dx = midX - p.x;
    const dz = maxZ - 1.5 - p.z;
    const dy = meat.ride.y - (p.y + 1.68);
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
    // Shortest way round, so a target behind you does not spin the long way.
    let turn = wantYaw - aimYaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const k = Math.min(1, delta * 4.5);
    aimYaw += turn * k;
    aimPitch += (wantPitch - aimPitch) * k;
    player.teleport({ position: p.toArray(), yaw: aimYaw, pitch: aimPitch });
  };

  // ------------------------------------------------------------- the end ----


  return {
    group,
    colliders,
    contains,
    /** How many openings ended up open, for the harness. */
    holes: holeCount,
    /**
     * Where the refuges are, in world terms, for the harness and for anything
     * that ever needs to send a body to one.
     *
     * Handed out as the spot to stand in rather than as the opening, because
     * the opening is a rectangle in a wall's own frame and standing in it is
     * the only thing anybody wants to know.
     */
    get refuges() {
      const stand = REFUGE.deep - 0.6;
      /**
       * A point on this wall, in world terms, from its `u` along and its `d`
       * in from the room-side face. The same four sign cases `wallSlab` has,
       * and for the same reason — every one of them is written once.
       */
      const spot = (index, u, d) =>
        index === 0
          ? { x: midX - u, z: maxZ + d }
          : index === 1
            ? { x: midX + u, z: minZ - d }
            : index === 2
              ? { x: maxX + d, z: midZ + u }
              : { x: minX - d, z: midZ - u };
      return wallCuts.flatMap((cuts, index) =>
        cuts.map((o) => {
          const inside = spot(index, o.u, stand);
          /**
           * And where you come at it from: straight down, on the deck of the
           * flight the refuge is stacked on. Same `u`, far enough off the
           * face to be standing on the deck rather than in the wall, and at
           * the deck's own height rather than the refuge's — it is 0.16
           * lower, and a harness checking for footing at the sill would find
           * air.
           */
          const from = spot(index, o.u, -PLATFORM.deep / 2);
          return {
            wall: index + 1,
            y: +o.v.toFixed(2),
            x: +inside.x.toFixed(2),
            z: +inside.z.toFixed(2),
            towards: +(o.towards ?? 0).toFixed(2),
            from: [+from.x.toFixed(2), +(o.deck ?? o.v).toFixed(2), +from.z.toFixed(2)],
            // How far along the wall the shelf reaches, for anything checking
            // that the walk between the two is on something.
            ledge: o.ledge ? { u: +o.ledge.u.toFixed(2), w: +o.ledge.w.toFixed(2) } : null,
          };
        })
      );
    },
    /**
     * The gangway out of the window and the junction at the end of it, for the
     * harness and for whatever else needs to know where the one piece of floor
     * up here that cannot be retracted actually is.
     */
    gangway,
    /** The three transfer plates, for the harness and for whoever asks. */
    landings,
    /** Which wall carries which stretch of the climb, and in what order. */
    get bands() {
      return ORDER.map((wall, k) => ({
        order: k + 1, wall: wall + 1,
        courses: [BANDS[wall].from, BANDS[wall].to],
        from: +SILLS[BANDS[wall].from].toFixed(2),
        to: +SILLS[BANDS[wall].to].toFixed(2),
      }));
    },
    meat,

    /**
     * Outside it, in the hall, looking at the opening.
     *
     * Still outside, even though the animal climbs now and the room is
     * enterable for part of every cycle. The debug jump has to land somewhere
     * that is a floor whenever it is used, and "whenever" here means "at a
     * moment nobody chose" — a spawn that works for ninety seconds and puts you
     * inside fifteen metres of meat for the other sixty is not an entry, it is
     * a coin toss. Three metres back down the hall is a floor at every point in
     * the cycle, and from there you can watch it leave and walk in after it.
     */
    get entry() {
      return { position: [doorway.x, 0, maxZ + 3.0], yaw: 0 };
    },

    /** The far end of the passage out, for whatever gets built on it. */
    get wayOn() {
      return { x: OUT.x, y: 0, z: outEnd, width: OUT.width, height: OUT.height };
    },

    reset() {
      entered = false;
      meat.reset();
      // And whatever the end of the shot left behind. `reset` is the only way
      // back from a death — see `respawn` in main.js — so it has to put the
      // camera, the body and the class on <body> back as well as the animal.
      seizure.reset();
      greeting = null;
    },

    /**
     * Run one wall's platforms out, and everything else's back in.
     *
     * `n` is what is painted on the wall and what is stamped on the tread that
     * called it — 1 to 4, not an index. The two ends of this wire are a metre
     * of steel plate seventy-two metres up and a hundred and ninety-five decks
     * spread over four walls, and the only thing they share is that number, so
     * it is the number that travels.
     */
    showWall(n) {
      const index = Number(n) - 1;
      if (!(index >= 0 && index < walls.length)) return;
      for (const [i, wall] of walls.entries()) wall.want = i === index ? 1 : 0;
      playSpikeGrind(0.55);
    },

    /** Which wall is out, and how far, for a harness and for whoever asks. */
    get wallState() {
      return walls.map((wall, i) => ({ wall: i + 1, out: +wall.out.toFixed(2), want: wall.want }));
    },

    update(delta) {
      /**
       * Being eaten wins over everything else in the room.
       *
       * Returned out of rather than run alongside. The platforms, the
       * fittings and the greeting are all things that happen to a room you
       * are standing in, and for the next two seconds you are not standing in
       * it. The animal keeps breathing and keeps its eyes on you because that
       * is `meat.update`, which runs first and is the whole of what the shot
       * is looking at.
       */
      // While it has you, this is not a room you are standing in and nothing
      // in it moves. The sequence drives the animal itself, because the shot
      // is looking at it and the order of the two matters.
      if (seizure.isPlaying) {
        seizure.update(delta);
        return;
      }

      // The travel. Slow enough to be a machine — a metre of deck arriving in
      // under a second is a switch, not a wall thinking about it — and the same
      // rate in both directions, because a wall that snaps home is a wall that
      // was never carrying anything.
      for (const wall of walls) {
        if (wall.out === wall.want) continue;
        const step = delta * 0.55;
        wall.out = wall.want > wall.out
          ? Math.min(wall.want, wall.out + step)
          : Math.max(wall.want, wall.out - step);
        for (const platform of wall.platforms) {
          // A fraction, not a distance, because the decks on one wall are not
          // all the same length any more. `out` is how far the wall has run;
          // how far that is in metres is each deck's own business.
          const f = Math.max(platform.restF, wall.out);
          for (const seg of platform.segments) {
            seg.mesh.position.z = seg.home + f * seg.out;
            seg.mesh.position.y = seg.base + f * seg.lift;
            seg.mesh.castShadow = f > 0 && seg.shadow;
          }
          platform.lip.position.y = platform.tip.base + f * platform.tip.lift;
          platform.lip.position.z = -PLATFORM.inset + f * platform.tip.out - 0.04;
          platform.lip.visible = f * platform.tip.out > 0.2;
        }
      }

      const t = performance.now() / 1000;
      for (const [i, fitting] of fittings.entries()) {
        const want = 0.9 + 0.1 * Math.sin(t * 0.41 + i * 2.4) * Math.sin(t * 0.17 + i);
        fitting.level += (want - fitting.level) * Math.min(1, delta * 2);
        if (fitting.lamp) fitting.lamp.intensity = fitting.watt * fitting.level;
        fitting.lens.material.color.setScalar((0.5 + 0.4 * fitting.level) * fitting.gain);
      }

      meat.update(delta);

      // ---------------------------------------------------------- greeting ---
      if (!greeted && !greeting && nearTheMouth() && meat.ride && meat.ride.y > meat.ride.low + GREET.minHeight) {
        greeting = { phase: 'drop', timer: 0 };
        aimYaw = player.pose.yaw;
        aimPitch = player.pose.pitch;
        player.setEnabled(false);
        meat.scripted(true);
        meat.letGo();
      }

      if (greeting) {
        greeting.timer += delta;
        aimAtTheAnimal(delta);

        if (greeting.phase === 'drop' && meat.landed) {
          greeting.phase = 'look';
          greeting.timer = 0;
          // It has arrived, it is filling the opening, and its eyes are already
          // on you — that part is not scripted, it is what they always do.
          playGurgle(1);
          showNote('It is looking at you.', 3.0);
        } else if (greeting.phase === 'look' && greeting.timer > GREET.hold) {
          greeting.phase = 'leave';
          greeting.timer = 0;
          meat.haulUp();
        } else if (greeting.phase === 'leave' && meat.ride.y > meat.ride.low + GREET.clear) {
          // Handed back while it is still going up, not once it has gone: the
          // last thing you get is the control, and the first thing you do with
          // it is watch the rest of it leave.
          greeting = null;
          greeted = true;
          meat.scripted(false);
          player.setEnabled(true);
        }
      }

      if (!entered && contains(player.position.x, player.position.z)) {
        entered = true;
        setObjective('Find the way on');
        showNote('They go up further than the light does.', 3.8);
      }
    },
  };
}
