import * as THREE from 'three';
import { makeMetalPanelSurface, makeMeatSurface, metalRepeat, cloneSurface } from './textures.js';
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
/**
 * And it has two speeds, because it now has two jobs.
 *
 * `to` is the sprint-beating 6.4 and it is right for forty-two metres of
 * straight hall: the whole of that room is "you cannot outrun this, you can
 * only reach the hole first". It is catastrophic for the hundred and fifty
 * metres that come after it. A pursuer a metre a second faster than you, over
 * a route with a climb and three wrong turns in it, is not a chase — it is a
 * countdown with scenery, and it ends the same way every time no matter what
 * the player does.
 *
 * So the burst decays. It ramps to 6.4 in the first ten seconds, holds while
 * the hall is being run, and settles to `cruise` by twenty-six. From there it
 * is always behind you and always closer than it was, because everything that
 * costs you time costs you distance: the climb, a wrong branch, a missed
 * jump, the eight presses at the end.
 *
 * `cruise` is 5.1 against a sprint of 5.6, and the half a metre is the whole
 * design of the second half of this chase. At 4.5 the first measured run
 * never saw it closer than twenty metres across the entire route — which is
 * a thing following you at a polite distance, not a thing chasing you. At 5.1
 * a player who never stops arrives at the lift with it about a dozen metres
 * back, and a player who takes one wrong branch arrives with it in the
 * corridor behind them.
 */
const SPEED = { from: 3.0, to: 6.4, ramp: 10, cruise: 5.1, settle: 26 };

/**
 * How it finds its way through a building it cannot see.
 *
 * It follows where you have been. Every `step` metres of your travel drops a
 * crumb, the crumbs are a queue, and it walks the queue — so it comes round
 * corners, up the heap, into the dead end you just came out of, without
 * anything in this file knowing that any of those exist. There is no navmesh
 * in this game and there is not going to be one for a single pursuer.
 *
 * Inside `cut` it stops following the trail and comes straight at you, which
 * matters at the end of a corridor: a thing that insists on walking your
 * exact path when it is four metres away reads as a tram, and a thing that
 * stops caring about the path once it can reach you reads as having seen you.
 */
const TRAIL = { step: 1.1, cut: 9.0, keep: 260 };

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
 * @param clearance (x, z) => { wide, high } of the space there, or null for
 *                 somewhere nothing has an opinion about. What it squeezes to.
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
  clearance,
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

  /**
   * The meat, which everything that is not the television is made of.
   *
   * makeMeatSurface is what the thing in the shaft is covered in, and the two
   * of them being obviously the same substance is the most useful thing this
   * body does: there was something in the basement made of this and there is
   * something in the roof made of this.
   */
  const meatSurface = makeMeatSurface(2, 2);
  const flesh = new THREE.MeshStandardMaterial({
    ...cloneSurface(meatSurface, 3, 2),
    roughness: 1,
    metalness: 0,
  });
  const gristle = new THREE.MeshStandardMaterial({ color: '#2a0f0d', roughness: 0.6, metalness: 0.03 });

  /** One lump, so the body, the face and the shoulders are made the same way. */
  const lumpInto = (parent, x, y, z, rx, ry, rz, turn, tumble = true) => {
    const lump = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), flesh);
    lump.position.set(x, y, z);
    lump.scale.set(rx, ry, rz);
    /**
     * Tumbled in the body, rolled in the face.
     *
     * The body wants all three axes: it is a sack, there is no up in it, and
     * turning every lump is most of what stops nineteen spheres reading as
     * nineteen spheres. A face is the opposite — it has an up, and the same
     * turn applied to it was catastrophic in a way that only showed on
     * screen: a brow is a two and a half metre bar a third of a metre thick,
     * and a bar like that rolled sixty degrees is a sausage. Nine of them
     * made a heap of offal hanging over a television.
     */
    if (tumble) lump.rotation.set(turn * 1.7, turn * 2.3, turn * 0.9);
    else lump.rotation.z = turn;
    /**
     * It casts nothing and receives nothing, and neither is laziness.
     *
     * The body lives behind a lit screen in a room with seventy point lights
     * in it. Nobody is ever on the side of it where its shadow would land,
     * and the shadow it would receive is one the screen in front of it is
     * drowning anyway. Switched on, the body put six milliseconds a frame on
     * the chase — a quarter again on the scene it happens in — for an effect
     * that is by construction invisible. The limbs and the tail keep theirs:
     * those are the parts that are seen against the room.
     */
    parent.add(lump);
    return lump;
  };

  /** A deterministic wobble, -1 to 1, from an index and a salt. */
  const wob = (i, salt) => (((i * 37 + salt * 17) % 13) / 6) - 1;

  /**
   * Where the glass stops being glass.
   *
   * The middle of the screen is gone. Everything the face does — the eyes,
   * the maw, the flesh pressing out — happens inside this, and the four
   * plates below are what is left round the outside of it.
   */
  const GAP = { x: screen.wide * 0.232, y: screen.high * 0.44 };

  /**
   * The face, and it is not on the screen any more. It is behind it.
   *
   * This is the thing the broken glass is broken to show: a head's worth of
   * the same meat the body is, filling the back of the set, bulging forward
   * through the hole where the picture used to be. The brow, the two swollen
   * rings the eyes sit in, the cheeks either side of the mouth, the jaw under
   * it.
   *
   * **The eyes stay.** They are the only part of the character that survives
   * into this, and they are the whole reason it is frightening rather than
   * merely unpleasant: the thing in the meat is still the thing that has been
   * giving you directions since the ward. Everything round them changed; what
   * is looking out of them did not.
   *
   * Hidden until the glass goes. Up on the wall this is a television.
   */
  const visage = new THREE.Group();
  visage.visible = false;
  group.add(visage);

  // The backing of meat, so the hole in the glass has something in it rather
  // than the black back of the set.
  const mask = new THREE.Mesh(new THREE.PlaneGeometry(screen.wide, screen.high), flesh);
  visage.add(mask);

  /**
   * The lumps it is made of, written as the depth of their own front face.
   *
   * **The z in the table is where the front of the lump is, not where its
   * middle is**, and the difference is the whole of why the first cut of
   * this was a heap of sausages laid over a television. A sphere's scale is
   * its radius: a lump half a metre thick sitting at z 0.12 has its front at
   * 0.62, which is four tenths of a metre in front of glass that lives at
   * 0.18. Every one of them was outside the set, so instead of a face behind
   * a broken screen there was a pile of meat in front of an intact one.
   *
   * Written this way the rule is readable instead of arithmetic: anything
   * under 0.18 is behind the glass, and anything over it is a part of the
   * face pressing out through the hole — which is allowed, and only for the
   * lumps that sit inside GAP.
   *
   * And they are flat. A face is relief on a surface, not a bag of
   * ellipsoids: the mask behind them is already a wall of meat, and these
   * are the three or four swellings that make it a head.
   *
   * [across, up, where its front face is, and its three radii]
   */
  /**
   * Nothing over the eyes comes forward of them.
   *
   * The eyes are drawn at z 0.22 and the brow is the one piece of the face
   * that reaches across them, so a brow proud of the glass is a brow with
   * the top of both eyes behind it. Everything on the top half of this is
   * held at 0.19 — still relief, still lit from the side, and never in front
   * of the only part of this that is the character. The cheeks and the jaw
   * are nowhere near them and are free to press out through the break.
   */
  for (const [x, y, front, rx, ry, rz, roll] of [
    [0, 2.0, 0.19, 2.6, 0.3, 0.3, 0], // the brow, over both eyes
    [-1.35, 2.06, 0.19, 1.0, 0.26, 0.28, 0.1], // heavier above each one
    [1.35, 2.06, 0.19, 1.0, 0.26, 0.28, -0.1],
    [0, 0.8, 0.2, 0.36, 0.8, 0.26, 0], // the bridge between them
    [-2.15, -0.45, 0.25, 1.25, 1.05, 0.32, 0.22], // cheeks, either side of the mouth
    [2.15, -0.45, 0.25, 1.25, 1.05, 0.32, -0.22],
    [0, -1.9, 0.21, 2.2, 0.46, 0.28, 0], // the jaw, under it
  ]) {
    lumpInto(visage, x, y, front - rz, rx, ry, rz, roll, false);
  }

  /**
   * The sockets: a ring of swollen meat round each eye, with a pit behind it.
   *
   * A ring and not a lid, because a lump over the eye is a lump in front of
   * the eye — a sphere thick enough to read sticks out past the glass and
   * puts meat between you and the one part of this that is still the
   * character. The torus leaves the middle of itself empty, which is where
   * the eye goes, and the unlit disc behind it means the eye is glowing in a
   * hole rather than glowing on a surface.
   */
  const eyeAt = { x: 0.42 * faceScale, y: 0.28 * faceScale };
  for (const side of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.24, 8, 14), flesh);
    socket.position.set(side * eyeAt.x, eyeAt.y, 0.06);
    socket.scale.set(1, 1.12, 0.8);
    visage.add(socket);
    const pit = new THREE.Mesh(
      new THREE.CircleGeometry(0.84, 18),
      new THREE.MeshBasicMaterial({ color: '#06070a', toneMapped: false })
    );
    pit.position.set(side * eyeAt.x, eyeAt.y, 0.1);
    visage.add(pit);
  }

  /**
   * Sinew across the break.
   *
   * Five strands of gristle strung over the hole, which is the one detail in
   * here that says the glass broke from the inside: nothing falls out of a
   * television and leaves threads behind it.
   */
  for (let i = 0; i < 5; i++) {
    const x = GAP.x * (-0.86 + (i / 4) * 1.72) * 0.92;
    const long = GAP.y * (1.1 + wob(i, 4) * 0.25);
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.055, long, 0.055), gristle);
    strand.position.set(x, GAP.y * 0.1 * wob(i, 2), 0.24);
    strand.rotation.z = wob(i, 6) * 0.42;
    visage.add(strand);
  }

  // The glass, and the face in it. A second `createScreenLife`, because this
  // is a second screen — the one on the wall is still there with a hole where
  // this came out of it, and they are not the same object.
  const glassMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#101d16'), toneMapped: false });

  /** The screen while it is still a screen: on the wall, whole, showing a face. */
  const glassWhole = new THREE.Mesh(new THREE.PlaneGeometry(screen.wide, screen.high), glassMat);
  glassWhole.position.z = 0.18;
  group.add(glassWhole);

  /**
   * And the screen after it comes out of the wall, which is four plates.
   *
   * **Four plates and not one pane with a hole in it.** A rectangle with a
   * ragged hole punched through it is one THREE.Shape and it would have been
   * less code, but it is also the wrong picture and a worse shape: the hole
   * has to clear the eyes at the top and the teeth at the bottom, which on a
   * pane this flat leaves the opening within a few centimetres of the pane's
   * own edge, and a hole whose rim touches the outline triangulates into
   * nonsense. Glass does not break into a doughnut anyway. It breaks into
   * pieces still gripped by the frame, with nothing in the middle — so that
   * is what this is: a plate up each side and a sliver along the top and the
   * bottom, each with a jagged edge facing the hole, each a hair off its
   * neighbour's depth so two coplanar pieces cannot fight over a pixel.
   */
  const broken = new THREE.Group();
  broken.visible = false;
  group.add(broken);
  const hw = screen.wide / 2;
  const hh = screen.high / 2;
  const plate = (pts, z) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), glassMat);
    mesh.position.z = z;
    broken.add(mesh);
  };
  // The two sides. The jagged edge is always at or outside GAP.x, so the hole
  // is never narrower than the face that has to come through it.
  for (const side of [-1, 1]) {
    const pts = [[side * hw, -hh], [side * hw, hh]];
    for (let i = 0; i <= 7; i++) {
      pts.push([side * (GAP.x + 0.5 * (0.5 + wob(i, side + 3) * 0.5)), hh - (i / 7) * hh * 2]);
    }
    plate(side < 0 ? pts : pts.reverse(), side < 0 ? 0.178 : 0.18);
  }
  // The top and bottom slivers, between the two plates.
  for (const row of [1, -1]) {
    const pts = [[-GAP.x - 0.5, row * hh], [GAP.x + 0.5, row * hh]];
    for (let i = 0; i <= 6; i++) {
      pts.push([GAP.x + 0.5 - (i / 6) * (GAP.x * 2 + 1), row * (GAP.y + 0.24 * (0.5 + wob(i, row + 5) * 0.5))]);
    }
    plate(row > 0 ? pts : pts.reverse(), row > 0 ? 0.182 : 0.184);
  }
  /**
   * And the shards still hanging off the rim, turned out of the plane.
   *
   * Flat in the pane they would be invisible — more glass, the same colour,
   * at the same depth. Turned, they catch the room, which is the only thing
   * in here that reads as *glass* rather than as a dark shape. Double sided,
   * because a turned piece is seen from its back about half the time.
   */
  const shardMat = new THREE.MeshBasicMaterial({
    color: '#16241d',
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  // Small. At a metre and a half they were the biggest shapes on the front
  // of the animal — pale triangles across the brow and over one eye, reading
  // as paper rather than as glass, in a face that has four things to say and
  // no room for a fifth.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + wob(i, 5) * 0.3;
    const long = 0.26 + ((i * 13) % 4) * 0.11;
    const piece = new THREE.Shape();
    piece.moveTo(0, 0);
    piece.lineTo(long * (0.5 + wob(i, 2) * 0.22), long * 0.85);
    piece.lineTo(long * 1.15, 0);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(piece), shardMat);
    mesh.position.set(Math.cos(a) * GAP.x * 1.02, Math.sin(a) * GAP.y * 1.02, 0.188);
    mesh.rotation.set(wob(i, 3) * 0.5, wob(i, 7) * 0.6, a + Math.PI / 2);
    broken.add(mesh);
  }

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
  /**
   * The body, and it is meat.
   *
   * The television is set into the front of a mass of flesh — the screen is
   * the only part of this that is a machine, and everything carrying it is
   * the same stuff the thing in the shaft is made of.
   *
   * Lumps, not a shape. Nineteen spheres squashed, turned and overlapped on a
   * deterministic hash, which is all a body like this is — there is nothing
   * to read on it, it is only ever seen in silhouette behind a lit screen,
   * and the one thing it has to do is not look manufactured.
   *
   * **It is bigger than the hole it has to get through, and it goes through
   * anyway.** This used to be bounded inside the casing's own outline, which
   * kept the door arithmetic trivial and made the animal a television with a
   * cushion behind it: the mass could never be the biggest thing about it,
   * because the biggest thing about it had to be 11.5 by 5.9. The bound is
   * gone. The body is a metre and a half wider than the set on each side and
   * a metre taller, and the way it gets through the hole is the way the limbs
   * do — it gives. See the squash in the update, which is the same `tuck`
   * ramp the fold runs on: the meat narrows and lengthens as it comes up on
   * the wall and swells again on the far side. A thing that has to deform to
   * follow you through a gap is worth more than any amount of mass that
   * happens to fit.
   */
  /**
   * How far it goes, and it is no longer bounded by the casing.
   *
   * `wide` and `high` are half-extents of the mass, `deep` is how far back it
   * runs. Each lump is still placed so its own longest radius lands inside
   * these — the bound is the *longest* axis, not the one being bounded,
   * because these are turned as well as squashed and a tumbled ellipsoid can
   * present any of its three radii in any direction. Bounding height by the
   * height is what made an earlier cut of this seven and three-quarter metres
   * tall inside a five and a half metre casing.
   */
  const CARCASS = { wide: screen.wide / 2 + 1.5, high: (screen.high + edge * 2) / 2 + 1.1, deep: 5.4 };
  const body = new THREE.Group();
  body.position.z = -1.8;
  group.add(body);
  /**
   * Thirteen of them, and what that did and did not buy.
   *
   * This body costs about eight milliseconds a frame on its own, measured by
   * switching it off mid-chase with the thing square on at nine metres,
   * which is the worst case and also the shot the room is built around. None
   * of it is geometry — thirteen ellipsoids is three thousand triangles. It
   * is fill: a mass thirteen metres across, every pixel of it shaded against
   * a room with seventy point lights in it.
   *
   * **Going from nineteen to thirteen did not change that by a millisecond,
   * and that is the useful finding.** Opaque meshes are drawn front to back,
   * so a fragment behind a lump already drawn is rejected before it is
   * shaded; the cost is the area the mass covers, which is set by CARCASS
   * and is the same either way. The only thing that would make this cheaper
   * is making it smaller, which is the one thing it is not allowed to be.
   *
   * Thirteen stays because it is the same silhouette for six fewer draw
   * calls, not because it was the fix. A cheaper material is the other lever
   * and it was measured too: Lambert instead of Standard is worth about two
   * milliseconds, which is not enough to make this body out of different
   * meat from the thing in the shaft.
   */
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const rx = 2.0 + ((i * 17) % 4) * 0.36;
    const ry = 1.5 + ((i * 13) % 4) * 0.3;
    const rz = 1.5 + ((i * 7) % 3) * 0.44;
    const reach = Math.max(rx, ry, rz);
    const across = ((((i * 37) % 11) / 10) * 2 - 1) * Math.max(0, CARCASS.wide - reach);
    const up = ((((i * 23) % 7) / 6) * 2 - 1) * Math.max(0, CARCASS.high - reach);
    lumpInto(body, across, up, -0.4 - ((i * 29) % 7) * (CARCASS.deep / 7), rx, ry, rz, t);
  }

  /**
   * How much it gives to get through.
   *
   * `by` is how far the mass is squeezed in at full tuck and `out` is how far
   * it stretches backwards to make up for it. The numbers are not taste: the
   * mass is 6.78 out from the middle and the hole is 5.75, so a quarter off
   * the width is the least that will do it, and 3.9 tall against 2.95 is
   * where the 0.3 on the vertical comes from. Both are checked rather than
   * trusted — see `span`.
   */
  const SQUASH = { wide: 0.26, high: 0.3, out: 0.5 };

  const band = new THREE.MeshStandardMaterial({ color: '#23251e', roughness: 0.92, metalness: 0.1 });

  /**
   * One limb: segments down a chain, each hung off the end of the last, so
   * the whole thing bends from the shoulder by turning one group.
   *
   * Made of the same meat the body is, because that is what it is: the
   * drawing has the limbs coming off the lump and not off the television,
   * and a grey arm bolted to a set is a prop where a meat one is an animal
   * wearing a screen.
   *
   * Tapered, banded, and finished with four splayed digits — four because
   * that is what is drawn and because a fifth at this size is a rounding
   * error on a shape nobody gets to look at for more than a second.
   */
  const buildLimb = (length, thick, { rings = 3, digits = 4, shadow = true } = {}) => {
    const root = new THREE.Group();
    const joints = [root];
    const parts = 3;
    let parent = root;
    for (let i = 0; i < parts; i++) {
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0 : -(length / parts);
      parent.add(seg);
      const t = thick * (1 - i * 0.16);
      const bone = new THREE.Mesh(new THREE.BoxGeometry(t, length / parts, t * 0.78), flesh);
      bone.position.y = -(length / parts) / 2;
      bone.castShadow = shadow;
      seg.add(bone);
      // The rings. Three to a segment on the four that are seen against the
      // room, one on the arms off the back of the mass — they are behind the
      // body from every angle you ever have on this thing, and a ring you
      // cannot see is a draw call in a room with seventy lights in it.
      for (let r = 1; r <= rings; r++) {
        const ring = new THREE.Mesh(
          new THREE.BoxGeometry(t * 1.1, length / parts * 0.07, t * 0.88),
          band
        );
        ring.position.y = -(length / parts) * (r / (rings + 1));
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
      flesh
    );
    palm.position.y = -thick * 0.3;
    paw.add(palm);
    for (let d = 0; d < digits; d++) {
      const digit = new THREE.Group();
      digit.position.y = -thick * 0.6;
      digit.rotation.z = (d - (digits - 1) / 2) * 0.34;
      paw.add(digit);
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(thick * 0.17, thick * 0.78, thick * 0.17),
        flesh
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
    /**
     * Rooted in the meat and not on the casing.
     *
     * 0.29 of the width and not 0.3, because folded it measured 11.57 across
     * a hole of 11.5 and the seven centimetres were the fingertips. Back at
     * -1.2 rather than -0.34, so the shoulder is inside the body rather than
     * stuck on the back of the television — with a knuckle of flesh over it,
     * which is what stops a limb that starts in mid-air.
     *
     * And 0.6 in from the casing's edge rather than 0.3: the knuckle is a
     * metre across, and at the old inset it stood a hand's width proud of
     * the top and bottom of the set, which folded is the one direction the
     * hole has nothing to spare in.
     */
    limb.root.position.set(side * screen.wide * 0.29, (up * screen.high) / 2 - up * 0.6, -1.2);

    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 9), flesh);
    socket.position.copy(limb.root.position);
    socket.scale.set(1.15, 1.15, 1.3);
    group.add(socket);
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
   * And the rest of the arms, which come out of the meat rather than the set.
   *
   * Four was the drawing and four was a lizard. The mass behind the screen is
   * bigger than the screen now, and a body that size with one limb at each
   * corner reads as a creature carrying a television; six more of them coming
   * out of the flanks and the back of it reads as the body being the animal
   * and the television being the part of it that talks. They are shorter,
   * thinner and set deeper, in no pattern — paired limbs are a skeleton and
   * this does not have one.
   *
   * **Rooted inside the casing's own width even though the body is not.** The
   * fold takes the lean out and swings the limb back along the body, so a
   * folded arm is exactly as wide as the point it is rooted at: these sit
   * between 1.8 and 3.3 out, which is inside the hole with room to spare, and
   * the mass they emerge from is what gives instead. Their rings and their
   * shadows are off — behind a body this size they are never seen against
   * anything.
   *
   * [side, height, how far back, length as a share of the screen, thickness]
   */
  const EXTRA = [
    [-1, 1.9, -2.6, 0.72, 0.78],
    [1, 1.3, -3.2, 0.66, 0.72],
    [-1, -1.4, -3.6, 0.62, 0.7],
    [1, -2.0, -2.9, 0.7, 0.76],
    [-1, 0.2, -4.6, 0.58, 0.66],
    [1, -0.4, -4.9, 0.54, 0.64],
  ];
  EXTRA.forEach(([side, y, z, reach, thick], i) => {
    const limb = buildLimb(screen.high * reach, thick, { rings: 1, digits: 3, shadow: false });
    limb.root.position.set(side * screen.wide * (0.17 + ((i * 7) % 3) * 0.07), y, z);
    const down = y < 0;
    limb.root.rotation.z = down
      ? side * (0.7 + (i % 3) * 0.14)
      : Math.PI - side * (0.8 + (i % 3) * 0.12);
    group.add(limb.root);
    const socket = new THREE.Mesh(new THREE.SphereGeometry(thick, 10, 8), flesh);
    socket.position.copy(limb.root.position);
    socket.scale.set(1.2, 1.2, 1.4);
    group.add(socket);
    limbs.push({
      ...limb,
      side,
      up: down ? -1 : 1,
      phase: 0.4 + i * 1.27,
      lean: limb.root.rotation.z,
      straight: down ? 0 : Math.PI,
    });
  });

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
      const bone = new THREE.Mesh(new THREE.BoxGeometry(t, t * 0.9, 0.8), flesh);
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
   * The screen, broken.
   *
   * Cracks out of the rim of the hole, each a polyline of three or four
   * segments drawn as thin unlit strips, with the shorter splinters hanging
   * off them. Deterministic from an index like everything else in
   * this project — a creature that is cracked differently every boot is a
   * creature nobody can report a bug in.
   *
   * Unlit and nearly black, laid a few millimetres proud of the glass. They
   * are the absence of a lit screen rather than marks on top of one, which
   * is why they are drawn dark and not drawn in the face's colour: a crack
   * is where the picture stopped.
   */
  const crackMat = new THREE.MeshBasicMaterial({ color: '#05070a', toneMapped: false });
  const cracks = new THREE.Group();
  cracks.position.z = 0.19;
  cracks.visible = false;
  group.add(cracks);
  /**
   * One length of crack, clipped to the glass.
   *
   * The clip is the whole of this. Cracks are grown outward from a point in
   * three or four steps of a couple of metres each, and left to run they go
   * straight off the edge of the screen and hang in the air beside it — the
   * first cut of this had the thing's own bounding box nearly eight metres
   * tall on a five and a half metre set, all of it spidering out into the
   * room. A crack is a thing the glass is doing, so it stops where the glass
   * does.
   */
  const pane = { x: screen.wide / 2 - 0.06, y: screen.high / 2 - 0.06 };
  /**
   * There is glass here, which now has two halves to it.
   *
   * Inside the pane, as before — and outside the hole, which is new and is
   * the whole reason the cracks had to be reseeded. They used to spider out
   * of a point low and left of the middle of the screen; the middle of the
   * screen is not there any more, so every one of them would have started in
   * mid-air and crossed four metres of nothing before reaching anything it
   * could be a crack in. They start at the rim of the break and run outwards
   * instead, which is also the right physics: the break is where it gave.
   */
  const onGlass = (x, y) =>
    Math.abs(x) <= pane.x &&
    Math.abs(y) <= pane.y &&
    (x / GAP.x) ** 2 + (y / GAP.y) ** 2 >= 1;
  const strut = (ax, ay, bx, by, wide) => {
    // Walk back along the segment until the far end is on the glass. Cheap,
    // exact enough at this length, and it leaves the crack ending at the
    // edge rather than vanishing.
    let t = 1;
    while (t > 0.05 && !onGlass(ax + (bx - ax) * t, ay + (by - ay) * t)) t -= 0.05;
    const ex = ax + (bx - ax) * t;
    const ey = ay + (by - ay) * t;
    const dx = ex - ax;
    const dy = ey - ay;
    if (Math.hypot(dx, dy) < 0.05) return false;
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(dx, dy), wide), crackMat);
    bar.position.set((ax + ex) / 2, (ay + ey) / 2, 0);
    bar.rotation.z = Math.atan2(dy, dx);
    cracks.add(bar);
    return t >= 1;
  };
  for (let i = 0; i < 13; i++) {
    let a = (i / 13) * Math.PI * 2 + ((i * 29) % 7) * 0.06;
    // Out of the rim of the hole, a hair outside it so the first segment has
    // glass under its own start.
    let x = Math.cos(a) * GAP.x * 1.06;
    let y = Math.sin(a) * GAP.y * 1.06;
    let run = screen.high * (0.2 + ((i * 17) % 5) * 0.11);
    for (let seg = 0; seg < 3 + (i % 2); seg++) {
      const step = run * (0.55 - seg * 0.1);
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      // Ran into the edge of the pane: that crack is finished.
      if (!strut(x, y, nx, ny, 0.075 - seg * 0.012)) break;
      // A splinter off the joint, every third one.
      if (seg === 1 && i % 3 === 0) {
        const b = a + (((i * 11) % 2 ? 1 : -1) * (0.5 + ((i * 13) % 4) * 0.12));
        strut(nx, ny, nx + Math.cos(b) * step * 0.7, ny + Math.sin(b) * step * 0.7, 0.05);
      }
      x = nx;
      y = ny;
      a += (((i * 7 + seg * 5) % 5) - 2) * 0.17;
    }
  }

  /**
   * And the maw, which is the face it pulls when it is loose.
   *
   * It is not a mouth drawn on a screen. It is a hole punched out through
   * the front of the thing: the glass is gone in the middle, the teeth are
   * in the gap, and what is behind them is the inside of the animal. That is
   * the whole difference between the first pass at this and this one — a
   * shape in the picture is a logo, and a thing you can see into is a mouth.
   *
   * Hidden while it is still on the wall. Up there it has the face it has
   * had all game; this is what that face turns into.
   *
   * Built out of THREE.Shape rather than boxes. Everything else this
   * character is made of is rectangles because everything else about it is
   * rectangular; a mouth full of triangles is the one place that stops being
   * true, and faking triangles out of turned boxes would show.
   */
  const maw = new THREE.Group();
  // Low enough to leave the eyes. The burst is the widest thing on the
  // screen and sat level with them it swallowed both.
  maw.position.set(0, -screen.high * 0.15, 0.2);
  maw.scale.set(1.3, 1, 1);
  maw.visible = false;
  group.add(maw);
  const mawParts = [];
  const lit = () => new THREE.MeshBasicMaterial({ color: FACE, toneMapped: false, side: THREE.DoubleSide });

  /**
   * The rim: broken glass standing out of the hole, not a drawn star.
   *
   * Every point gets its own length and its own angle off a hash, because a
   * regular star is an asterisk. The first pass used nine even points and
   * read as a sheriff's badge; this is the same idea with the symmetry taken
   * out of it, which is most of what makes a break look like a break.
   */
  const SHARD = { points: 15, outer: screen.high * 0.37, inner: screen.high * 0.26 };
  const ragged = (count, far, near, seed) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= count * 2; i++) {
      const wobble = (((i * seed) % 9) / 8 - 0.5) * 0.6;
      const a = ((i + wobble) / (count * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = (i % 2 ? near : far) * (0.72 + (((i * (seed + 3)) % 7) / 6) * 0.42);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    return shape;
  };

  const rim = ragged(SHARD.points, SHARD.outer, SHARD.outer * 0.6, 5);
  rim.holes.push(ragged(SHARD.points, SHARD.inner * 1.15, SHARD.inner * 0.8, 11));
  const rimMesh = new THREE.Mesh(new THREE.ShapeGeometry(rim), lit());
  maw.add(rimMesh);
  mawParts.push(rimMesh);

  /**
   * What is behind the glass, which is nothing you want to see.
   *
   * Two layers. A flat unlit near-black for the throat, because a lit dark
   * material facing a room with a lamp in it comes back grey and grey is a
   * wall — the meat cube's every opening is painted this way and for this
   * reason, see CAVITY in meatCube.js. And a ring of gum in front of it, in
   * the body's own flesh, so the teeth are standing in something.
   */
  const throat = new THREE.Mesh(
    new THREE.ShapeGeometry(ragged(11, SHARD.inner * 1.3, SHARD.inner * 1.05, 7)),
    new THREE.MeshBasicMaterial({ color: '#04070a', toneMapped: false })
  );
  throat.position.z = -0.08;
  maw.add(throat);

  /**
   * The teeth, in two jaws that come apart.
   *
   * Uneven on purpose — nine up and nine down, each a different length and
   * each leaning its own way, because a row of matched triangles is a saw
   * blade and a jaw is not one. The two rows are their own groups so the
   * thing can open and shut: see `gape` in the update, which drives them off
   * whatever syllable it is currently saying. A mouth that works while it
   * talks to you is worth more than any amount of detail in a mouth that
   * does not.
   */
  /**
   * And the teeth are bone, which they were not.
   *
   * They used to be drawn in the face's own green and pushed into its parts
   * list, so they breathed and flickered with the eyes — right while this was
   * a shape on a screen, wrong the moment there is a face of meat behind the
   * glass with the teeth standing in it. A green tooth is part of the
   * picture. This is part of the animal.
   *
   * Lit rather than unlit, and that is the point: the only strong light on it
   * is the screen's own glow, which is FACE-coloured and sitting a metre and
   * a half in front of the mouth, so the bone comes back green anyway —
   * green *because the screen is shining on it*, which is a thing in a room
   * rather than a thing on a tube.
   */
  const ivory = new THREE.MeshStandardMaterial({
    color: '#9e9377',
    roughness: 0.5,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const jaws = [];
  for (const row of [1, -1]) {
    const jaw = new THREE.Group();
    maw.add(jaw);
    jaws.push(jaw);
    for (let i = 0; i < 9; i++) {
      const across = (i / 8 - 0.5) * SHARD.inner * 1.72;
      const lip =
        row * Math.sqrt(Math.max(0, 1 - (across / (SHARD.inner * 1.0)) ** 2)) * SHARD.inner * 0.74;
      // Shorter than they were. At 1.3 metres the two longest in the bottom
      // row hung below the bezel, and a tooth outside the casing is not a
      // tooth in a mouth, it is a shape next to a television.
      const long = SHARD.inner * (0.34 + ((i * 13 + (row + 1) * 5) % 5) * 0.12);
      const wide = SHARD.inner * (0.13 + ((i * 7) % 3) * 0.05);
      const tooth = new THREE.Shape();
      tooth.moveTo(-wide, 0);
      tooth.lineTo(wide, 0);
      tooth.lineTo(((((i * 17) % 5) - 2) / 2) * wide, -long);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(tooth), ivory);
      mesh.position.set(across, lip, 0.01);
      mesh.rotation.z = (row > 0 ? 0 : Math.PI) + ((((i * 11) % 5) - 2) / 2) * 0.16;
      jaw.add(mesh);
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
  /**
   * Showing the teeth, which now also breaks the screen.
   *
   * One switch, because they are one moment: the glass goes, the meat behind
   * it is there to be seen, and the mouth it has instead of a drawn one opens
   * in the hole. Before this it is a television with a face on it — whole
   * pane, no cracks, no flesh, the same character that has been talking to
   * you all game. That is worth keeping for the second and a half it has: the
   * break reads as something that happens rather than as how the thing always
   * looked, and the only frame that can sell it is the one before.
   */
  const bare = (on) => {
    maw.visible = on;
    /**
     * And the drawn face goes with the glass it was drawn on.
     *
     * The eyes were kept through two cuts of this on the argument that they
     * are what makes the thing chasing you the thing that has been talking
     * to you — the one part of the character that survives into the animal.
     * That argument loses to a simpler one: the face is a picture on a
     * screen, and the screen is broken. Two lit green plug-shapes floating
     * in a hole where there is no longer anything to draw them on is a face
     * that has outlived its tube.
     *
     * What is left in their place is better anyway. The sockets were built
     * as rings of meat round an unlit pit, so with nothing in front of them
     * the face keeps the holes and loses the eyes, which is the whole of
     * what the change is: the thing stops looking at you out of a television
     * and starts looking at you out of a head.
     */
    faceGroup.visible = !on;
    glassWhole.visible = !on;
    broken.visible = on;
    visage.visible = on;
    cracks.visible = on;
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

  /**
   * How big it is once the limbs are away: the casing, and nothing more.
   *
   * This is the floor of the fold and therefore the thing `clearance` is
   * measured against — anything tighter than this and the only way through
   * is to crush. Taken off the screen rather than written down, so it cannot
   * drift from the television it is.
   */
  const FOLDED = { wide: screen.wide + edge * 2, high: screen.high + edge * 2 };

  /**
   * And how big it is with everything out, which is measured once and
   * written down rather than taken from `span` every frame.
   *
   * `span` walks nine hundred vertices and zeroes the yaw to do it; it is a
   * getter for harnesses, not a thing to call sixty times a second. These
   * are what it reports spread, to the nearest tenth.
   */
  const SPREAD = { wide: 13.6, high: 13.3 };

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
  /** Where you have been, oldest first. See TRAIL. */
  let trail = [];
  let heldUntil = null;
  /**
   * Fit the next frame's fold and crush instead of easing into them.
   *
   * Both are eased, which is right everywhere except the frame it is put
   * somewhere new. It arrives at full size and takes about a second to come
   * down to the room — and where it is put is now, twice, somewhere it is
   * meant to come out of: a shaft at the bottom of a lift, into a corridor
   * six and a half metres wide. For half a second it stood eight and a half
   * across with its arms through the walls, which is the one half second
   * anybody who hears it arrive is going to turn round for.
   */
  let snapFit = false;
  /** How crushed it currently is, eased. 1 is its own size. */
  const cram = { x: 1, y: 1 };
  /** And how folded, eased the same way. 0 is limbs out. */
  let folded = 0;
  const home = new THREE.Vector3(at.x, at.y, at.z);
  const here = new THREE.Vector3().copy(home);
  const want = new THREE.Vector3();

  /** Which side of the gate's wall a point is on. -1 is the shed, 1 is beyond. */
  const sideOf = (z) => (z < gate.z ? 1 : -1);

  const speed = () => {
    const burst = SPEED.from + (SPEED.to - SPEED.from) * Math.min(1, hunted / SPEED.ramp);
    const easing = Math.max(
      0,
      Math.min(1, (hunted - SPEED.ramp) / (SPEED.settle - SPEED.ramp))
    );
    return burst + (SPEED.cruise - burst) * easing;
  };

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
      /**
       * From the vertices, which is the second thing this had to learn.
       *
       * Box3.setFromObject takes each child's *geometry* bounding box — a
       * cube, for a sphere — and expands it by the child's matrix, so a lump
       * that is a squashed turned sphere is measured as the AABB of a turned
       * cube. The error is up to root three, and once the body was nineteen
       * big lumps it was reading 15.7 across and 7.1 tall for a mass whose
       * furthest actual vertex is 10.1 by 5.5. That is not a rounding
       * difference, it is the difference between a door this fits through and
       * one it does not — and the number is used to decide exactly that.
       *
       * `precise` walks the positions instead. It costs a traversal of about
       * nine hundred vertices on a getter nothing calls in a frame.
       */
      new THREE.Box3().setFromObject(group, true).getSize(size);
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

    /**
     * Something has come down in front of it: stay this side of `z` for
     * `seconds`, then come through whatever it is.
     *
     * This replaces the shutter ending the chase. A barrier that stops the
     * thing for good is the end of the game's only pursuer forty metres into
     * a two-hundred metre run; a barrier that stops it for four seconds is a
     * head start, which is the thing the rest of the route is built out of.
     * It makes the noise on the way out rather than on the way in — what you
     * hear from the far side of a shutter is not it arriving, it is it
     * leaving.
     *
     * `axis` is which way it is being stopped, and it is a parameter because
     * there are now two of these and they are at right angles: the shutter is
     * across the hall and holds it off a plane in z, and the roof comes down
     * across the front of the machine and holds it off a plane in x. Both are
     * a floor and not a ceiling — the thing travels toward -z down the hall
     * and toward -x down the shed, so in each case the barrier is the lowest
     * value it is allowed to reach. A general obstacle would be a box and a
     * normal; two barriers at right angles are a field name.
     */
    holdAt(plane, seconds, axis = 'z', keep = null) {
      if (phase !== 'hunt') return;
      /**
       * And a hold that is already standing is not replaced by a shorter one.
       *
       * This was a silent fault and it cost the whole mechanism. There are two
       * barriers in this chase and the player trips the second one while the
       * first is still holding: the roof comes down across the shed and buys
       * fifteen seconds, and about eleven seconds later you run under the
       * shutter in the hall, which asked for its own two and eight tenths and
       * *got it* — a straight assignment, so a barrier forty metres behind the
       * thing it is supposed to be stopping cut the roof's hold down to the
       * shutter's and released it at the shutter's plane. Every hold from
       * twelve seconds up measured the same arrival at the far end, which is
       * what sent me looking.
       *
       * Whichever barrier has it keeps it, and a second one can only make the
       * wait longer. That is also the honest reading: the thing is standing at
       * the heap, and the shutter coming down is nothing it can see.
       */
      if (heldUntil) {
        heldUntil.left = Math.max(heldUntil.left, seconds);
        return;
      }
      heldUntil = { plane, left: seconds, axis, keep };
    },

    /** Whether something is currently in its way. For a harness. */
    get isHeld() {
      return heldUntil !== null;
    },

    /**
     * Put it back and start it again, for a death that should not cost the
     * whole building.
     *
     * The trail goes with it. Crumbs are a record of where you went before
     * you died, and a thing that respawns and then walks your last run is a
     * thing chasing a ghost.
     */
    restartAt(at, yaw = FACING) {
      phase = 'hunt';
      hunted = 0;
      caught = false;
      heldUntil = null;
      trail = [];
      snapFit = true;
      here.copy(at);
      group.visible = true;
      group.position.copy(here);
      group.rotation.set(0, yaw, 0);
      bare(true);
      music.start();
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
     * It has not finished, which is also not the same as gone.
     *
     * For the end of the corridor. It gives up at the gap because the gap is
     * too small, and then — fourteen seconds later, with you at the window
     * and no longer listening — it does not. Everything about where it is
     * stays where it is: this is the same animal in the same place, told to
     * start again, and the only reason it is a method rather than a second
     * call to `restartAt` is that there is nowhere to put it. It is already
     * standing where it needs to be.
     *
     * The trail goes, like it does on a respawn. Crumbs from before it stopped
     * are a record of a run that is over, and you have not moved since.
     */
    again() {
      if (phase !== 'done') return;
      phase = 'hunt';
      hunted = 0;
      caught = false;
      heldUntil = null;
      trail = [];
      group.visible = true;
      music.start();
    },

    /**
     * It is somewhere you cannot see it, which is not the same as gone.
     *
     * For the lift. The doors shut on it and the car goes down twelve metres
     * of shaft with the thing on the roof, and there is no honest way to draw
     * that: the shaft is three and a quarter metres across, the animal is
     * eleven, and crushing it into the box would be a great deal of work to
     * make a monster quarter size inside something you cannot see into anyway.
     * So the body stays and the picture goes, and the ride is carried entirely
     * by what you can hear overhead — see the `riding` phase in codeLift.js.
     *
     * `restartAt` is what brings it back, and it is written to be called on a
     * thing in this state: it puts the body somewhere, shows it, and starts
     * hunting from a clean trail.
     */
    lurk() {
      if (phase === 'wait') return;
      phase = 'done';
      music.stop();
      life.stop();
      group.visible = false;
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
      trail = [];
      heldUntil = null;
      cram.x = 1;
      cram.y = 1;
      folded = 0;
      group.scale.set(1, 1, 1);
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

      /**
       * Drop a crumb, and do it from the frame it comes off the wall rather
       * than the frame it starts moving.
       *
       * Those are three seconds apart and they are the three seconds in
       * which you get your head start — all of which is path the thing would
       * otherwise have no record of. Started at the hunt, its first crumb is
       * fourteen metres down the shed and it walks to that through whatever
       * is in the way.
       */
      const you = player.position;
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(you.x - last.x, you.z - last.z) > TRAIL.step) {
        trail.push({ x: you.x, y: you.y, z: you.z });
        if (trail.length > TRAIL.keep) trail.shift();
      }

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
         * Where it is going, which is where you went.
         *
         * This used to be one special case: a single gate, and if you and it
         * were on opposite sides of that one wall it steered for the opening
         * first. That was exactly enough for a room with one hole in it, and
         * nothing at all for the hundred and fifty metres past it — a route
         * with a climb, three junctions and six dead ends has no single
         * opening to aim at, and a pursuer that aims straight at the player
         * crosses it through the rock.
         *
         * So it walks your crumbs. The oldest one it has not reached is where
         * it is going; reaching one throws it away. Corners, the heap, the
         * branch you took by mistake — it does all of them without this file
         * knowing any of them are there.
         *
         * Close in, it stops caring about the path and comes straight at you.
         * See TRAIL.cut.
         */
        const prey = player.position;
        const flatTo = Math.hypot(prey.x - here.x, prey.z - here.z);
        while (trail.length && Math.hypot(trail[0].x - here.x, trail[0].z - here.z) < TRAIL.step * 1.6) {
          trail.shift();
        }
        const crumb = flatTo > TRAIL.cut ? trail[0] : null;
        want.set(
          crumb ? crumb.x : prey.x,
          (crumb ? crumb.y : prey.y) + LIFT + Math.sin(hunted * 1.7) * 0.18,
          crumb ? crumb.z : prey.z
        );

        /**
         * Unless something has come down in front of it, in which case it is
         * at that thing rather than at you.
         *
         * `heldUntil` is a plane and a clock. The shutter at the end of the
         * hall used to end the chase outright; now it buys you the seconds it
         * takes the thing to get through it, which is a better use of a
         * shutter and the only reason the run that follows is survivable.
         */
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

        if (heldUntil) {
          heldUntil.left -= delta;
          const { axis, keep } = heldUntil;
          here[axis] = Math.max(here[axis], heldUntil.plane + 1.2);
          /**
           * And inside the room the barrier is in, which is not the same
           * thing and was the whole bug.
           *
           * A plane in one axis leaves the other two free, and a thing that
           * is still steering at you with two axes free does not stand behind
           * a barrier — it slides along it. The shutter got away with that
           * because the hall it is in is seven metres wide; the roof across
           * the shed does not, because the free axis there runs forty metres
           * out of the back of the building. Held for fifteen seconds it went
           * with you: clamped in x at the heap, it tracked your z straight
           * through the end wall and sat in the void alongside the corridor
           * you were running down, which cost it nothing. Four extra seconds
           * of hold measured two extra metres of lead at the far end.
           *
           * So a hold is a plane *and* the box it is allowed to be in. With
           * the box on, the same fifteen seconds is fifteen seconds of
           * standing still, which is the eighty metres of trail it then has
           * to walk to get back to where you are.
           */
          if (keep) {
            for (const a of ['x', 'y', 'z']) {
              if (!keep[a]) continue;
              here[a] = Math.max(keep[a][0], Math.min(keep[a][1], here[a]));
            }
          }
          if (heldUntil.left <= 0) {
            heldUntil = null;
            playSpikeGrind(1);
            playScreech(0.8);
          }
        }

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
      const room = clearance?.(here.x, here.z);
      const near =
        phase === 'hunt'
          ? Math.max(
              0,
              Math.min(1, (TUCK.from - Math.abs(here.z - gate.z)) / (TUCK.from - TUCK.tight))
            )
          : 0;
      /**
       * And it stays folded once it is through, which it did not.
       *
       * The fold was keyed on how near the wall is, in both directions, so
       * seven metres past the hole the animal opened out to its full fifteen
       * across — inside a hall that is thirteen wide and was built to the
       * width of the television on purpose. It spent the last stretch of the
       * chase with its arms in the walls.
       *
       * Beyond the wall it keeps most of the tuck, because beyond the wall it
       * is in a corridor the size of itself. Not all of it: a tenth of the
       * spread back is enough for the limbs to be visibly working without
       * putting them through the brick, and the squash easing off is the one
       * thing that shows the mass is still bigger than the gap it just came
       * through.
       */
      /**
       * And the room it is in has a say, which is where the 0.88 went.
       *
       * The fold used to be purely a function of how near the one hole in
       * the shed was, with a hard 0.88 clamped on for "anywhere past it" —
       * a number picked because that is what fits the transfer hall. That
       * hall can say so itself: thirteen wide and six and a half high
       * against a spread of about fourteen by twelve and a half works out
       * at 0.88 on its own, and the same sum gives nearly zero for the
       * eleven-metre chamber past the breach, which is the one place after
       * the shed where it gets to open out again. One rule, three rooms, no
       * constants.
       */
      /**
       * And the curve on it is measured, because the fold is not linear.
       *
       * Folding swings four limbs about their shoulders. Early in that
       * swing they are still almost as far up and down as they started —
       * most of the height only comes off in the last third of the
       * movement. Straight interpolation therefore under-folds: asked for
       * the 0.35 that the chamber's ten and a half metres of head works out
       * at, the animal came back twelve and a half tall and had its
       * shoulders through the ceiling.
       *
       * Three measured points — 0 gives 13.3, 0.35 gives 12.4, 1 gives 5.8 —
       * fit height = spread - range * tuck^2.2 closely enough, so the
       * demand is raised to that root. It is a fit to this creature's own
       * geometry and it is wrong the moment the limbs change; `span` is
       * what checks it.
       */
      const needed = room
        ? Math.max(
            0,
            Math.min(1, (SPREAD.high - room.high) / (SPREAD.high - FOLDED.high))
          ) ** (1 / 2.2)
        : 0;
      /**
       * Eased, for the same reason the crush is.
       *
       * The fold used to be read straight off how near the wall was, which
       * is a quantity that changes smoothly, so nothing ever snapped. The
       * rooms it now asks are a set of boxes, and crossing between two of
       * them steps the answer: a limb that goes from spread to folded
       * between one frame and the next does not read as folding, it reads as
       * a different model.
       */
      // Named `wantFold` and not `want`: there is already a `want` in this
      // closure — the vector the steering aims at — and a `const want` here
      // shadows it for the whole of `update`, which puts the steering's own
      // `want.set(...)` fifty lines above into the temporal dead zone. It
      // threw "Cannot access 'want' before initialization" every frame, and
      // an exception every frame is a game loop that does not run: the
      // symptom was the player standing still in an empty aisle while the
      // thing walked up to them.
      const wantFold = phase === 'hunt' || phase === 'done' ? Math.max(near, needed) : near;
      folded += (wantFold - folded) * (snapFit ? 1 : 1 - Math.exp(-3.4 * delta));
      const tuck = folded;
      /**
       * The meat giving, on the same ramp the limbs fold on.
       *
       * This is the only deformation in the game and it earns its place: the
       * body is wider and taller than the hole, so either it squeezes or it
       * passes through solid wall. Nonuniform scale on a group of turned
       * lumps shears them, which on anything built would be a bug and on a
       * sack of meat being pushed through a letterbox is the effect.
       */
      body.scale.set(1 - tuck * SQUASH.wide, 1 - tuck * SQUASH.high, 1 + tuck * SQUASH.out);

      /**
       * And then, if the place it is in is smaller than it is, it crushes.
       *
       * The fold is an animal putting its limbs away and it bottoms out at
       * the size of the television, which is eleven and a half metres. The
       * corridors past the collapse are seven. Something has to give and it
       * is not going to be the corridors: a building whose every passage is
       * wide enough for this thing is a building with no corridors in it.
       *
       * So it crushes. `clearance` is asked what the space here is and the
       * whole animal — screen, frame, meat, limbs — is scaled to fit it, on
       * both axes independently, never above its own size. A television
       * forced through a service tunnel, bowing, is a better answer than any
       * of the alternatives: a monster that stops at the door, a monster
       * that walks through rock, or a building made of aircraft hangars.
       *
       * Eased rather than snapped, because the squeeze is the thing worth
       * watching. Non-uniform scale shears everything under it as it turns,
       * which on a creature being forced through a hole is the effect.
       */
      const wantX = room ? Math.min(1, room.wide / FOLDED.wide) : 1;
      const wantY = room ? Math.min(1, room.high / FOLDED.high) : 1;
      const ease = snapFit ? 1 : 1 - Math.exp(-2.6 * delta);
      cram.x += (wantX - cram.x) * ease;
      cram.y += (wantY - cram.y) * ease;
      snapFit = false;
      group.scale.set(cram.x, cram.y, Math.min(cram.x, cram.y) * 0.4 + 0.6);
      for (const limb of limbs) {
        const beat = Math.sin(since * 2.6 + limb.phase) * (1 - tuck);
        /**
         * Back, and the sign of that is not cosmetic.
         *
         * Euler XYZ applies z first, so the limb is swung to vertical and
         * then pitched out of the frontal plane — and the pitch that takes a
         * limb hanging *down* backwards takes one standing *up* forwards. At
         * one sign for all four, the two upper arms spent the squeeze
         * reaching four metres out through the front of the screen: the span
         * read 17.6 deep, all of it in front of the glass, with two arms
         * crossing the face at the exact moment the shot wants the face.
         */
        limb.root.rotation.x = tuck * (Math.PI / 2) * (limb.up > 0 ? -1 : 1);
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

      /**
       * And the jaws work off whatever syllable it is on.
       *
       * `life.update` hands back the mouth shape it just set on the face —
       * the same `open` and `wide` the three drawn blocks are scaled to — so
       * the hole in the glass chews on exactly the sound the voice is
       * making. No second clock, no guess at the cadence: one mouth, two
       * places it is drawn.
       *
       * The floor under it is the point. Shut, the teeth still stand apart
       * by a fifth of the gape, because a mouth that closes completely is a
       * seam and this one has to look like it cannot close.
       */
      const shape = life.update(delta, 1);
      const gape = (0.2 + shape.mouthOpen * 0.95) * SHARD.inner;
      jaws[0].position.y = gape * 0.5;
      jaws[1].position.y = -gape * 0.5;
      throat.scale.y = 0.75 + shape.mouthOpen * 0.6;
    },
  };
}
