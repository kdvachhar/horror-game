import * as THREE from 'three';
import { makeMeatSurface, cloneSurface, MEAT } from './textures.js';
import { buildFinger } from './glove.js';
import { playKnockout, playSpikeGrind, playGurgle } from './audio.js';
import { PLAYER } from './config.js';

/**
 * The meat cube.
 *
 * Built from a set of drawings, one per face, and the faces are not
 * interchangeable — each was drawn as a particular side of a particular thing
 * and they are laid out here exactly as they were labelled. What makes it work
 * is that the six of them share a vocabulary and spend it unevenly: creases and
 * eyes on all six, but the mouths are on the bottom and the front only, the
 * arms are on the top, the back has nothing on it at all.
 *
 *   bottom  a ring of jagged teeth round an opening most of the face wide, with
 *           a tongue lolling out of the front of it. Two small eyes in opposite
 *           corners. It stands on these teeth.
 *   top     one big lidded eye, and an arm out of either side, raised, hands
 *           open.
 *   front   a tall toothed mouth with an eye inside it and a dark throat under
 *           that, and three loose eyes around it.
 *   back    creases and two eyes. Nothing else. It is the side with nothing on
 *           it, and it is only a side with nothing on it because the other five
 *           have something.
 *   left    an eye, and a dark wet pit that is not an eye.
 *   right   a big lidded eye with a slit pupil, and a nostril under it.
 *
 * The uneven spend is the whole design. A cube with a mouth on every face is a
 * pattern and you have understood it from the first face; a cube with a mouth
 * on two faces has a front, and a thing with a front is facing you or it is
 * not. Walking round this one changes what it is.
 *
 * There is one input on it and it is the last one available: touch it, and it
 * kills you. No key, no prompt, no lit spot on the surface — you are in
 * contact with the thing or you are not, and the game never says which of
 * those it would rather you did. See the touch, down with the rest of the
 * behaviour, for the argument; the short version is that a hall seventy metres
 * long pointed at a wall of meat is a hall asking you to walk up and put a
 * hand on it, and for a long time the answer to that was nothing at all.
 *
 * What being caught by it means is not decided here. This file notices the
 * contact, says so once, and moves the animal; the camera, the black and the
 * screen you end up on belong to tallRoom.js and death.js. Same line
 * `scripted` is drawn on, same reason.
 *
 * Nothing else here is a mechanism. It does not open otherwise, it does not
 * follow you across the room, and there is nothing to solve on it — it
 * breathes, its eyes move, it climbs, and it eats you if you handle it. See
 * the tall room's platforms for the same argument at the scale of a wall: the
 * room is read, not solved.
 */

// Two stops below where the eye wants to put flesh, because of the tone mapping
// — see makeMeatSurface. Everything here is darker than it looks written down.
/**
 * The one colour every hole on this thing is painted, and it is painted unlit.
 *
 * Lit black facing a room with a lamp in it comes back grey, and grey is a
 * wall. There is no shaded throat behind any of these — see the openings below
 * — so this flat value is doing all of the work of being an inside.
 */
const CAVITY = '#0b0605';
const TOOTH = '#443d30';
const TOOTH_ROOT = '#332f26';
const SCLERA = '#3a3529';
const IRIS = '#241610';
const PUPIL = '#050406';
const NAIL = '#5b5344';

/**
 * Edge of the cube, and how far its underside is pressed below the floor.
 *
 * It sat on the tips of its bottom teeth with two metres of air under it. It
 * does not now: it is down on the floor, and the floor is what the underside is
 * set into rather than what it stands on.
 *
 * `SETTLE` is not the interesting number — the interesting one is worked out at
 * build time. The underside is not flat, and dropping the cube until its
 * *lowest* point met the floor would have left every hollow in it riding clear,
 * a gap you can see under at the edges from thirty metres down the hall. So the
 * cube is set down until its *highest* underside point is below floor level and
 * everything else follows it under. That buries up to a metre of it, which
 * costs nothing: the floor is opaque and you are always above it. It also
 * buries the whole of the bottom face's mouth, which is the price of the thing
 * touching the floor and is not recoverable — see the bottom of the drawings.
 *
 * Fourteen point six, which is bigger than the room is deep. It touches.
 *
 * The room is fifteen across and fourteen deep, so a cube cannot touch all four
 * of its walls without being bigger than the room on one axis. This one is: at
 * 14.6 it is over the depth and under the width, and the difference is taken
 * out of it by the walls. See `fit` — every point of the surface is clamped to
 * the room's inside, so the front and back are pressed flat against the
 * concrete for their whole area and the sides reach it wherever the meat swells
 * and fall away from it where it does not.
 *
 * Sized at exactly fourteen it came out 0.145 short of the side walls, because
 * the swell is a product of three sines and never reaches its own maximum on a
 * real vertex — measured, not reasoned about. Overshooting the room and letting
 * it be clamped is the version that cannot be wrong.
 *
 * A soft thing in a tight box spreads against the box, and the flat patches
 * where it does are the whole of what says this was put in here rather than
 * built in here.
 *
 * It seals the room. That is what touching the walls means: there is no aisle,
 * the far wall it is pressed against is the one with the way on in it, and the
 * front face stands in the plane of the opening you would come in by. You walk
 * the length of the hall and what is at the end of it is not a room.
 *
 * At this size you cannot see it, and that is the point of it. At 2.9 it was a
 * thing in a room and you walked round it reading the faces off; here it is the
 * room, and one eye is wider than you are. The drawings survive being this big
 * far better than they survived being small — a mouth eight metres tall is the
 * same drawing and a different fact.
 */
const SIZE = 14.6;
const SETTLE = 0.06;

/**
 * The drawings were laid out on a 2.9m cube and every size below is in those
 * terms, so this carries them up.
 *
 * Positions were always written as fractions of the edge and look after
 * themselves; sizes were not. Without this the cube grows and its eyes, marks
 * and nostril stay where they were, which is a ten metre lump of meat with
 * freckles on it.
 */
const S = SIZE / 2.9;

/**
 * How far the surface wanders off the true cube, as a fraction of the edge.
 *
 * Small on purpose. The drawings are square with a wobble on them, and past
 * about this the shape stops being a cube and becomes a boulder — at which
 * point every face reading below is landing on a surface that is not where the
 * drawing put it. It has to stay a cube for the six faces to mean anything.
 */
const LUMP = 0.05;
/** How much the corners are taken off. Meat does not hold an arris. */
const ROUND = 0.16;

const HALF = SIZE / 2;

/**
 * The surface, as a field rather than as geometry.
 *
 * Written once and used twice: the body's vertices are pushed out along it, and
 * every eye, tooth and crease is placed by asking it where the skin actually
 * ended up. Placing features on the ideal cube instead leaves them hovering
 * over the hollows and buried in the swells, and on a lumpy thing that reads
 * immediately as decals on a box.
 *
 * Deterministic — three sines, no randomness — so the cube is the same cube on
 * every load and a screenshot of it means something.
 */
function lump(p) {
  // Frequencies are per metre, so they are divided through by the scale: left
  // alone, a cube four times the size gets four times as many lumps of the same
  // depth and comes out as gravel rather than as a swollen thing.
  const x = p.x / S;
  const y = p.y / S;
  const z = p.z / S;
  return (
    (Math.sin(x * 2.1 + 1.7) * Math.sin(y * 1.7 - 0.6) * Math.sin(z * 2.5 + 2.4) * 0.030 +
      Math.sin(x * 4.3 - 2.1) * Math.sin(y * 5.1 + 1.1) * Math.sin(z * 3.9 - 0.4) * 0.014 +
      Math.sin(x * 8.7) * Math.sin(y * 7.9) * Math.sin(z * 9.3) * 0.006) *
    SIZE
  );
}

/** Corners taken off, the same way for the body and for the surface probe. */
function rounded(p) {
  const out = p.clone();
  return out.lerp(out.clone().normalize().multiplyScalar(HALF), ROUND);
}

/** Deterministic 0..1 from a couple of integers. Never Math.random here. */
function rand(a, b = 0) {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return ((n % 1) + 1) % 1;
}

/**
 * A lens — the almond an eye sits in, and the shape of the lidded ones.
 *
 * Two quadratic curves rather than a scaled circle. A squashed circle has its
 * widest point in the middle and tapers evenly, which is a rugby ball; an eye
 * comes to a corner at each end, and the corners are what stop it reading as a
 * bead pushed into the meat.
 */
function lensShape(halfW, halfH) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfW, 0);
  shape.quadraticCurveTo(0, halfH * 2.0, halfW, 0);
  shape.quadraticCurveTo(0, -halfH * 2.0, -halfW, 0);
  return shape;
}

/**
 * A piece of flesh with a hole through it, and rounded on every edge.
 *
 * This is the answer to the thing that went wrong first: a lid built as a flat
 * shape with a lens cut in it, laid on the skin, reads as a sticker. It has a
 * cut edge and the cut edge catches the light as a hard line all the way round,
 * at which point the eye is painted on. Extruded and bevelled, both boundaries
 * — the outside and the hole — roll over instead, and the same piece becomes a
 * lid, a nostril rim or the lip of a pit depending only on the two outlines it
 * is handed.
 */
function fleshRing({ outer, hole, depth, bevel, material }) {
  const shape = new THREE.Shape(outer);
  // Holes wind the other way round, or the triangulator fills them in.
  shape.holes.push(new THREE.Path([...hole].reverse()));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geometry.translate(0, 0, -depth / 2 - bevel);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

/** A blobby closed outline, for lid ridges and the wet pits. */
function blobPath(radius, wobble, lobes, seed, points = 40) {
  const path = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r =
      radius *
      (1 +
        wobble * Math.sin(a * lobes + seed) +
        wobble * 0.55 * Math.sin(a * (lobes + 3) - seed * 2.3));
    path.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return path;
}

export function createMeatCube({ parent, colliders, x, z, yaw = 0, fit, player, travel, onTouched }) {
  /**
   * Where the skin is, for a point on the ideal cube — squeezed into `fit`.
   *
   * `fit` is the room's own inside, as half-extents about the cube's centre,
   * and every displaced vertex is clamped to it. That single clamp is what lets
   * a cube touch the walls of a room that is not square: the surface swells as
   * far as it likes and then simply stops at the concrete, so it is flush where
   * it meets a wall and lumpy where it does not, and it can never pass through
   * one into a wall socket on the far side.
   *
   * It only works because the cube is square to the room — which at this size
   * it is obliged to be, the diagonal being wider than the room is.
   *
   * Local to the factory rather than module scope, because it is the one part
   * of the shape that depends on the room the cube was put in.
   */
  const skin = (p) => {
    const r = rounded(p);
    const out = r.clone().addScaledVector(r.clone().normalize(), lump(r));
    if (fit) {
      out.x = Math.min(Math.max(out.x, -fit.x), fit.x);
      out.z = Math.min(Math.max(out.z, -fit.z), fit.z);
    }
    return out;
  };

  const group = new THREE.Group();
  group.position.set(x, HALF, z);
  group.rotation.y = yaw;
  parent.add(group);

  /**
   * Set it down, by asking the surface where its underside actually is.
   *
   * Sampled rather than derived. The displacement is three sines multiplied
   * together and its true maximum never lands on a real point of the surface,
   * so the only honest way to know how high the underside rides is to walk the
   * bottom face and look — the same lesson as sizing it to the walls, which was
   * 0.145 short for exactly this reason.
   */
  let keel = Infinity;
  {
    let highest = -Infinity;
    const STEPS = 48;
    const probe = new THREE.Vector3();
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        probe.set(-HALF + (i / STEPS) * SIZE, -HALF, -HALF + (j / STEPS) * SIZE);
        const y = skin(probe).y;
        highest = Math.max(highest, y);
        // The other end of the same walk, which only matters once this thing
        // leaves the floor: the collider needs an underside to be air below,
        // and the underside is as lumpy as everything else about it.
        keel = Math.min(keel, y);
      }
    }
    group.position.y = -highest - SETTLE;
  }

  /**
   * And the crown of it, walked the same way and for the same reason.
   *
   * The top face is as lumpy as the bottom one and its true maximum is no more
   * derivable, so it is sampled rather than reasoned about — see the note above,
   * which is the third time in this file that sampling beat algebra.
   *
   * This is here because the box below needs a `top`, and it needs a `top`
   * because of what is nineteen metres over this animal's back. The collider
   * used to be solid at every height: fine while the cube was the only thing in
   * a sealed room, and wrong the moment a window opened into that room at
   * twenty-four metres. What it meant was that the entire volume of the tall
   * room above the cube — two thirds of the tallest space in the game — was a
   * solid you could see straight through. Nothing could reach it then. Something
   * can now, and anything that got in would have been shoved back out by a wall
   * that is not there.
   */
  let crown = -Infinity;
  {
    const STEPS = 48;
    const probe = new THREE.Vector3();
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        probe.set(-HALF + (i / STEPS) * SIZE, HALF, -HALF + (j / STEPS) * SIZE);
        crown = Math.max(crown, skin(probe).y);
      }
    }
  }

  // Everything that breathes hangs off this, so the collider and the floor
  // position stay put while the body swells.
  const body = new THREE.Group();
  group.add(body);

  /**
   * One tile of meat per face, and the map left to speak for itself.
   *
   * `color` is white and `roughness` is 1. Both are multipliers over the maps,
   * and the first pass set a dark red tint over an already dark red map and a
   * 0.62 roughness over a roughness map — which darkened the albedo twice and
   * halved the roughness everywhere, so the only thing left with any strength
   * was the specular. That is how a lump of meat comes out looking like foil.
   */
  const meatSurface = makeMeatSurface(1, 1);
  const meatMaterial = (repeat) =>
    new THREE.MeshStandardMaterial({
      ...cloneSurface(meatSurface, repeat, repeat),
      roughness: 1,
      metalness: 0,
    });

  // One tile per 2.9m of face, not one tile per face. Left at one, the creases
  // stretch with the cube and a fold ends up three metres long.
  const flesh = meatMaterial(Math.max(1, Math.round(S)));
  // Darker flesh for the insides of things — lids, gums, the roots of teeth.
  const inner = new THREE.MeshStandardMaterial({ color: '#2a0f0d', roughness: 0.5, metalness: 0.03 });
  const toothMat = new THREE.MeshStandardMaterial({ color: TOOTH, roughness: 0.55, metalness: 0.03 });
  const rootMat = new THREE.MeshStandardMaterial({ color: TOOTH_ROOT, roughness: 0.7 });
  const scleraMat = new THREE.MeshStandardMaterial({ color: SCLERA, roughness: 0.6, metalness: 0 });
  const irisMat = new THREE.MeshStandardMaterial({ color: IRIS, roughness: 0.2 });
  const pupilMat = new THREE.MeshStandardMaterial({ color: PUPIL, roughness: 0.15 });

  // ------------------------------------------------------------------ body ---

  /**
   * The lump itself: a heavily subdivided cube, corners taken off, pushed
   * about by the surface field.
   *
   * Displaced along the direction from the centre rather than along each
   * vertex's own normal. A box's normals are per-face, so two vertices sitting
   * on the same edge get pushed different ways and the cube splits open along
   * all twelve of them. From the centre, a shared position is a shared
   * direction, and the seams stay shut.
   */
  {
    const geometry = new THREE.BoxGeometry(SIZE, SIZE, SIZE, 26, 26, 26);
    const position = geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      const s = skin(v);
      position.setXYZ(i, s.x, s.y, s.z);
    }
    // Each face samples its own window of the one meat texture. Without this
    // all six carry an identical set of creases, and a cube whose sides match
    // is a crate.
    const uv = geometry.attributes.uv;
    geometry.groups.forEach((g, face) => {
      const ox = Math.floor(rand(face, 11) * 5) + rand(face, 3) * 0.4;
      const oy = Math.floor(rand(face, 29) * 5) + rand(face, 5) * 0.4;
      // Groups index the *index* buffer; the vertices they touch are a
      // contiguous run for BoxGeometry, so walking the indices is the honest
      // way to find them rather than assuming the range.
      const seen = new Set();
      for (let i = g.start; i < g.start + g.count; i++) {
        const idx = geometry.index.getX(i);
        if (seen.has(idx)) continue;
        seen.add(idx);
        uv.setXY(idx, uv.getX(idx) + ox, uv.getY(idx) + oy);
      }
    });
    uv.needsUpdate = true;
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, flesh);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }

  // ----------------------------------------------------------------- faces ---

  /**
   * A frame per face: local +z out of the cube, +x and +y across it.
   *
   * `left` and `right` are the viewer's, standing in front of the front face —
   * which is the way the drawings are laid out and the only reading under which
   * a net of six squares is unambiguous.
   */
  const faces = {};
  for (const [name, rx, ry] of [
    ['front', 0, 0],
    ['back', 0, Math.PI],
    ['right', 0, Math.PI / 2],
    ['left', 0, -Math.PI / 2],
    ['top', -Math.PI / 2, 0],
    ['bottom', Math.PI / 2, 0],
  ]) {
    const face = new THREE.Group();
    face.rotation.set(rx, ry, 0);
    face.updateMatrix();
    body.add(face);
    faces[name] = face;
  }

  /**
   * Sit a thing on the skin at (u, v) on a face, proud by `proud`.
   *
   * The z it lands at is read out of the surface field rather than assumed, so
   * a feature in a hollow sinks with it. `inverse` takes the skin point back
   * into the face's own frame, which is where the z we want is.
   */
  const place = (face, object, u, v, proud = 0) => {
    const inverse = face.matrix.clone().invert();
    const ideal = new THREE.Vector3(u, v, HALF).applyMatrix4(face.matrix);
    const local = skin(ideal).applyMatrix4(inverse);
    object.position.set(u, v, local.z + proud);
    face.add(object);
    return object;
  };

  // ------------------------------------------------------------------ eyes ---

  const eyes = [];

  /**
   * One eye: a ball in a hole in a lid.
   *
   * The lid is a blob of flesh with a lens cut out of it, laid on the skin, so
   * what you see through the aperture is the ball behind — an eye set into the
   * meat rather than a bead stuck onto it. Building it the other way round, as
   * a dark almond with a sphere in front, gives you something that reads
   * correctly in a screenshot and wrongly the moment you walk past it, because
   * the highlight sits proud of the surface at every angle.
   */
  function buildEye({ radius, slit = false, lidded = false, bare = false, seed = 0 }) {
    const eye = new THREE.Group();
    const r = radius;

    // The swelling it sits in. Nothing on this cube is flush — an eye set into
    // a flat face is a hole in a wall, and an eye on a mound is on something.
    //
    // Except the one in the mouth, which gets no mound and no lid: it is meant
    // to be an eye with nothing round it, in a hole, and the swelling that
    // makes the others sit in flesh is exactly what fills the mouth up and
    // takes the dark out of it.
    if (!bare) {
      const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), flesh);
      mound.scale.set(r * 2.4, r * 2.1, r * 0.7);
      mound.position.z = -r * 0.5;
      mound.castShadow = true;
      eye.add(mound);
    }

    // The ball, on its own group so it can be turned to look at people. Set
    // back far enough that its front stays behind the lid's: sitting proud of
    // the aperture it is not an eye in a socket, it is a marble pushed into
    // meat, and no amount of colour on it fixes that.
    const ball = new THREE.Group();
    ball.position.z = -r * 0.34;
    eye.add(ball);

    const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), scleraMat);
    ball.add(sclera);
    // The big lidded ones are drawn as a wide almond with the iris filling the
    // middle of it, so their ball is stretched to suit rather than sitting in
    // the slot as a small round bead with dark either side of it.
    const wide = lidded ? 1.45 : 1;
    ball.scale.x = wide;
    /**
     * Iris and pupil as caps on the ball, not discs in front of it.
     *
     * They started as flat circles at z = 0.85r, which is inside a sphere of
     * radius r everywhere except the outer edge — so the middle of each one was
     * buried in the eyeball and only a thin ring of iris surfaced round the
     * sclera. Every eye on the cube came out a pale dome with a dark ring round
     * it, which reads as a rivet, and no amount of darkening the sclera or
     * enlarging the iris could have fixed it because the iris was never the
     * thing you were looking at.
     *
     * A cap of the same radius lies on the surface at every angle, so it is
     * still right when the eye turns to the side.
     */
    const cap = (scale, sine, material) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(r * scale, 24, 14, 0, Math.PI * 2, 0, Math.asin(sine)),
        material
      );
      mesh.rotation.x = Math.PI / 2; // the cap is built round +y; the eye faces +z
      return mesh;
    };
    ball.add(cap(1.004, lidded ? 0.86 : 0.74, irisMat));
    // A goat's pupil on the big ones, which is the drawing's and is the single
    // cheapest way to say the thing is not a person.
    const pupil = cap(1.012, slit ? 0.9 : 0.44, pupilMat);
    if (slit) pupil.scale.x = 0.26;
    ball.add(pupil);

    // A wet catchlight, sitting just off the surface. One unlit dot, and it is
    // most of what separates an eye that is looking from a ball in a hole.
    const glint = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.075, 10),
      new THREE.MeshBasicMaterial({ color: '#aab0a8', toneMapped: false })
    );
    const towards = new THREE.Vector3(-0.3, 0.32, 0.9).normalize();
    glint.position.copy(towards).multiplyScalar(r * 1.03);
    glint.lookAt(towards.multiplyScalar(r * 2));
    ball.add(glint);

    // The lid: flesh with an almond through it, rolled at both edges. The
    // aperture is what the drawing actually draws — the outline, not the ball.
    if (bare) {
      eyes.push({ ball, radius: r, wide });
      return eye;
    }

    const lid = fleshRing({
      outer: blobPath(r * (lidded ? 2.05 : 1.9), 0.06, 3, seed + 3.1),
      hole: lensShape(r * (lidded ? 1.7 : 1.15), r * (lidded ? 0.68 : 0.78)).getPoints(44),
      depth: r * 0.16,
      bevel: r * 0.2,
      material: flesh,
    });
    lid.position.z = r * 0.2;
    eye.add(lid);

    eyes.push({ ball, radius: r, wide });
    return eye;
  }

  // ---------------------------------------------------------------- mouths ---

  /**
   * Every hole on this cube is drawn *proud* of the skin, not behind it.
   *
   * The body is one solid displaced cube — nothing is cut out of it — so a
   * bowl or a black plate set back inside the surface is simply inside the
   * meat, and what you see through the "opening" is the cube's own skin with
   * teeth standing on it. The mouths only ever looked like holes by accident:
   * a cap built 21° wider than a hemisphere stood far enough out of the face
   * to be seen, and squaring that up correctly took the dark away with it.
   *
   * So each opening is a shallow dish standing a little off the surface, seen
   * from the inside, with its rim hidden under the ridge of flesh around it.
   * It costs nothing, it shades like a hole, and it is the only version of this
   * that survives being walked past.
   */

  /**
   * A toothed opening.
   *
   * The drawings are consistent about the teeth and it is worth copying
   * exactly: each one is a rectangle at the gum with a triangle on the end of
   * it, they alternate long and short, and they lean in over the hole. That is
   * a set of teeth in sockets rather than a saw blade, and the difference is
   * whether the mouth reads as something that grew or something that was cut.
   */
  function buildMouth({ radiusU, radiusV, teeth, depth, seed, lobes = 5 }) {
    const mouth = new THREE.Group();

    // The gum line, as an irregular closed curve. Everything else is hung off
    // this one path so the teeth cannot drift away from the hole.
    const at = (a) => {
      const wobble =
        1 + 0.16 * Math.sin(a * lobes + seed) + 0.09 * Math.sin(a * (lobes + 4) - seed * 1.7);
      return new THREE.Vector2(Math.cos(a) * radiusU * wobble, Math.sin(a) * radiusV * wobble);
    };

    const rim = [];
    const STEPS = 52;
    let top = -Infinity;
    let bottom = Infinity;
    for (let i = 0; i < STEPS; i++) {
      const p = at((i / STEPS) * Math.PI * 2);
      rim.push(p);
      top = Math.max(top, p.y);
      bottom = Math.min(bottom, p.y);
    }
    // How far the opening actually reaches, measured off the outline it ended
    // up with rather than off the radius it was asked for — the wobble is worth
    // a quarter either way and the caller wants to line the real edge up with
    // something.
    mouth.userData.reach = { top, bottom };

    // The opening: one unlit black face, cut to the outline, standing just off
    // the skin.
    //
    // Flat, in the end, and after trying three ways to give it depth. The body
    // is solid, so a real recess cannot be seen into; a dish standing proud of
    // the surface can, but it has to be small enough to hide its rim under the
    // gum and then it no longer fills the mouth. And the drawings are flat too
    // — a solid black shape with teeth round it — which is the version that
    // actually reads, because what makes a mouth is the teeth and the outline,
    // never the shading of a throat nobody can see.
    //
    // Unlit rather than a dark material: a lit black surface facing the room
    // picks up the lamp and comes back as grey, and grey is a wall.
    const hole = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(rim), 14),
      new THREE.MeshBasicMaterial({ color: CAVITY })
    );
    hole.position.z = 0.02;
    mouth.add(hole);

    // The gums: a ridge following the rim, holding the teeth. Thin and dark.
    // At the radius it started on it was a pink rope laid round the mouth and
    // it was the loudest thing on the cube — the teeth are what the drawing
    // spends its ink on, and the gum's whole job is to be where they come from.
    const gumCurve = new THREE.CatmullRomCurve3(
      rim.map((p) => new THREE.Vector3(p.x, p.y, 0)),
      true
    );
    const gum = new THREE.Mesh(
      new THREE.TubeGeometry(gumCurve, 72, Math.min(radiusU, radiusV) * 0.045, 7, true),
      inner
    );
    // Behind the teeth, not among them. It sat proud of their roots, which at a
    // mouth this size put a half-metre rope weaving over the front of them —
    // the gum's whole job is to be the line they come out of.
    gum.position.z = 0.008;
    mouth.add(gum);

    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const p = at(a);
      const r = rand(i, seed * 100);
      // Alternating long and short, with a third of the variation left to the
      // hash so the alternation is a tendency and not a stripe.
      const long = i % 2 === 0 ? 1 : 0.66;
      const scale = Math.min(radiusU, radiusV);
      const length = scale * (0.52 + 0.30 * r) * long;
      const width = scale * (0.23 + 0.09 * rand(i, 7));

      const tooth = new THREE.Group();
      // Point it at the middle of the hole, and lean it out of the face.
      tooth.position.set(p.x, p.y, 0.01 * S);
      tooth.rotation.z = Math.atan2(-p.y, -p.x) - Math.PI / 2;
      tooth.rotation.x = -0.34 - 0.2 * rand(i, 13);

      const root = new THREE.Mesh(new THREE.BoxGeometry(width, length * 0.3, width * 0.72), rootMat);
      root.position.y = length * 0.15;
      tooth.add(root);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.62, length * 0.8, 4), toothMat);
      tip.position.y = length * 0.3 + length * 0.4;
      tip.rotation.y = Math.PI / 4;
      tip.castShadow = true;
      tooth.add(tip);

      mouth.add(tooth);
    }

    return mouth;
  }

  // ------------------------------------------------------- the small stuff ---

  /** The wet pit on the left face. Not an eye, which is the point of it. */
  function buildPit(radius, seed) {
    const pit = new THREE.Group();

    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), flesh);
    mound.scale.set(radius * 1.9, radius * 1.75, radius * 0.55);
    mound.position.z = -radius * 0.4;
    pit.add(mound);

    // Unlit, like the mouths. A pit lit by the room is a dent; the whole of
    // what makes this one read as wet is that no light comes back out of it.
    const bowl = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(blobPath(radius, 0.11, 5, seed + 1.4, 34)), 10),
      new THREE.MeshBasicMaterial({ color: CAVITY })
    );
    bowl.position.z = radius * 0.5;
    pit.add(bowl);

    const lip = fleshRing({
      outer: blobPath(radius * 1.5, 0.12, 4, seed),
      hole: blobPath(radius * 1.06, 0.11, 5, seed + 1.4, 34),
      depth: radius * 0.16,
      bevel: radius * 0.12,
      material: flesh,
    });
    lip.position.z = radius * 0.24;
    pit.add(lip);
    return pit;
  }

  /** The nostril under the right eye: a small tapered hole. */
  function buildNostril(size) {
    const nose = new THREE.Group();

    // Built after the outline below, so it is exactly the hole in the rim.
    let bowl = null;

    // Rounded off at the top and drawn out to a point at the bottom, which is
    // the drawing's shape and is a nostril rather than a bullet hole.
    const opening = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const taper = 1 - 0.42 * Math.max(0, -Math.sin(a));
      opening.push(new THREE.Vector2(Math.cos(a) * size * 0.82 * taper, Math.sin(a) * size * 1.1));
    }
    const lip = fleshRing({
      outer: blobPath(size * 1.75, 0.16, 4, 2.6),
      hole: opening,
      depth: size * 0.22,
      bevel: size * 0.26,
      material: flesh,
    });
    nose.add(lip);

    bowl = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape(opening), 10),
      new THREE.MeshBasicMaterial({ color: CAVITY })
    );
    bowl.position.z = size * 0.1;
    nose.add(bowl);
    return nose;
  }

  /**
   * The little three-line mark that turns up on four of the six faces.
   *
   * Whatever it is, it is the same thing each time, so it is built once. That
   * is the entire argument for it being here at all: a mark that repeats across
   * faces says something made these, and a mark that appears once says the pen
   * slipped.
   */
  function buildMark(size) {
    const mark = new THREE.Group();
    for (const angle of [-0.75, 0, 0.75]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(size * 0.1, size, size * 0.12), inner);
      line.position.set(Math.sin(angle) * size * 0.42, Math.cos(angle) * size * 0.42, 0);
      line.rotation.z = -angle;
      mark.add(line);
    }
    return mark;
  }

  // ------------------------------------------------------------------ arms ---

  /**
   * An arm out of the side of it, raised, hand open.
   *
   * They are drawn on the top sheet coming out of both sides, which is the one
   * thing in the drawings that is not a marking on a face — so they are built
   * as limbs, off the shoulders of the left and right faces, and they are the
   * only part of this that can be seen from anywhere in the room. A cube on the
   * floor is a cube whose top face nobody will ever see; the arms are the top
   * face's presence in a room you can only walk around it in.
   *
   * The fingers come from glove.js, which is where every hand in this game
   * comes from. Ungloved, in flesh, so they are unmistakably the same hands as
   * the pair in the medical room wall and unmistakably not wearing anything.
   */
  function buildArm(side) {
    const arm = new THREE.Group();

    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), flesh);
    shoulder.scale.set(1, 0.85, 0.85);
    shoulder.castShadow = true;
    arm.add(shoulder);

    // Held much closer to the body than the drawing has them, and this is
    // forced rather than chosen. The arms are the only part of the cube that
    // reaches past its own faces, and everything here is multiplied by S: a
    // lean that put the elbow 0.82 out on a 2.9m cube puts it three metres out
    // on this one, which is half a metre inside the concrete — measured, on the
    // -x side, where the surface lump already spends some of the aisle.
    //
    // Up rather than out, then, which is what the drawing is mostly doing
    // anyway. The hands are raised, not spread.
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.72, 8, 16), flesh);
    upper.castShadow = true;
    upper.position.set(side * 0.15, 0.36, 0);
    upper.rotation.z = -side * 0.32;
    arm.add(upper);

    // The elbow is a joint the forearm hangs off, so the hand comes with it.
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.2, 0.76, 0);
    arm.add(elbow);

    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), flesh);
    elbow.add(knuckle);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.64, 8, 16), flesh);
    fore.castShadow = true;
    fore.position.y = 0.4;
    elbow.add(fore);

    const wrist = new THREE.Group();
    wrist.position.y = 0.78;
    elbow.add(wrist);

    // The hand. Splayed and barely curled — the drawing has them open, fingers
    // apart, which is a hand showing you it is empty and is much worse than a
    // fist.
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), flesh);
    palm.scale.set(0.17, 0.2, 0.075);
    palm.castShadow = true;
    wrist.add(palm);

    const fingers = [];
    [-0.115, -0.038, 0.038, 0.115].forEach((fx, i) => {
      const finger = buildFinger([0.3, 0.35, 0.32, 0.25][i], 0.072, flesh, inner);
      finger.root.position.set(fx, 0.16, 0.005);
      finger.root.rotation.z = -fx * 2.2;
      for (const joint of finger.joints) joint.rotation.x = 0.09;
      wrist.add(finger.root);
      fingers.push(finger);
      // A nail on the end of each, dark and flat.
      const nail = new THREE.Mesh(
        new THREE.CircleGeometry(0.026, 8),
        new THREE.MeshStandardMaterial({ color: NAIL, roughness: 0.35 })
      );
      nail.position.set(0, [0.3, 0.35, 0.32, 0.25][i] * 0.2, 0.03);
      finger.joints[2].add(nail);
    });

    const thumb = buildFinger(0.26, 0.085, flesh, inner);
    thumb.root.position.set(-0.15, -0.02, 0.03);
    thumb.root.rotation.z = 1.15;
    for (const joint of thumb.joints) joint.rotation.x = 0.12;
    wrist.add(thumb.root);
    fingers.push(thumb);

    return { group: arm, elbow, wrist, fingers };
  }

  // ============================================================ the drawings ==

  // -- bottom: the mouth it stands on ----------------------------------------
  {
    const face = faces.bottom;
    const mouth = buildMouth({
      radiusU: HALF * 0.62,
      radiusV: HALF * 0.58,
      teeth: 26,
      depth: 0.26 * S,
      seed: 1.7,
      lobes: 6,
    });
    place(face, mouth, 0, 0.02, 0.02 * S);

    // The tongue out of the front of it. Lolling, so it touches the floor —
    // which is the detail that says this thing has been standing here.
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), inner);
    tongue.scale.set(HALF * 0.34, HALF * 0.42, 0.16 * S);
    place(face, tongue, 0, -HALF * 0.52, -0.02);
    tongue.rotation.x = 0.4;

    place(face, buildEye({ radius: 0.13 * S, seed: 2.2 }), -HALF * 0.62, HALF * 0.58, 0.01 * S);
    place(face, buildEye({ radius: 0.115 * S, seed: 5.1 }), HALF * 0.6, -HALF * 0.56, 0.01 * S);
  }

  // -- top: the big eye, and the arms ---------------------------------------
  {
    const face = faces.top;
    place(face, buildEye({ radius: 0.3 * S, lidded: true, seed: 0.4 }), 0, HALF * 0.28, 0.01 * S);
    place(face, buildMark(0.26 * S), -HALF * 0.1, -HALF * 0.62, 0.01 * S);
  }
  /** Straight up out of the top face, and what the climbing stroke swings from. */
  const ARM_BASE_X = Math.PI / 2;
  const arms = [];
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    const arm = buildArm(side);
    // Built at the size the drawings were laid out at, then carried up whole —
    // one scale on the group takes the limb, the hand and every finger joint
    // with it, which is the only way to enlarge a chain of nested transforms
    // without going through it a number at a time.
    arm.group.scale.setScalar(S);
    /**
     * Out of the top face, near its left and right edges.
     *
     * They used to come out of the shoulders of the side faces, which worked
     * while there was an aisle to reach into. There is no aisle now — the sides
     * are against the wall — so an arm leaving that way leaves into concrete.
     *
     * The top is where the drawing has them anyway. They are on the Top sheet,
     * either side of the square, and putting them there means the only thing on
     * this cube that reaches past its own faces reaches into the one direction
     * the room has seventy-six metres of: up.
     */
    place(faces.top, arm.group, HALF * 0.78 * side, 0, -0.05 * S);
    // The face's own +z is world up, so the arm — built along +y — is turned a
    // quarter about x to stand up out of it. The climb swings from here, so it
    // is a named base rather than a number written once and read never.
    arm.group.rotation.x = ARM_BASE_X;
    arms.push(arm);
  }

  /**
   * The front mouth, kept, because it is the one part of this animal that
   * something else has a reason to move. See the touch, below.
   */
  let jaw = null;

  // -- front: the tall mouth with an eye in it -------------------------------
  {
    const face = faces.front;
    const mouth = buildMouth({
      radiusU: HALF * 0.44,
      radiusV: HALF * 0.72,
      teeth: 30,
      depth: 0.22 * S,
      seed: 3.3,
      lobes: 4,
    });

    /**
     * Sat down on the floor, bottom lip first.
     *
     * It hung off the head of the entrance before this, which put its top lip
     * on the lintel and left it a metre and a bit clear of the ground. Dropped,
     * it takes that metre and a bit — which is the whole of what there is to
     * take, the mouth being 10.84 tall in an opening 12 high. Any further and
     * the bottom of it starts going under the floor, where the bottom face's
     * mouth already is.
     *
     * The two anchors do not coexist: something 10.84 long in a 12 hole is
     * either against the top or against the bottom. Against the bottom is the
     * better of the two anyway — a mouth hung from the lintel is a decoration
     * over a doorway, and one sitting on the floor is something that has come
     * down to where you are. What is left above it is a metre of forehead,
     * which is enough to say the head goes on past the top of the way in.
     *
     * `reach.bottom` off the built outline, not the radius it was asked for: the
     * wobble is worth a quarter of the radius either way, and anchoring on the
     * nominal number leaves the edge you can actually see a metre out.
     */
    const MOUTH_U = -HALF * 0.1;
    // World y = 0 in the face's own frame. The face group carries no offset of
    // its own, so this is the cube's placement height and nothing else.
    const mouthV = -group.position.y - mouth.userData.reach.bottom;
    place(face, mouth, MOUTH_U, mouthV, 0.02 * S);
    // Held on the bottom lip, which is the point it was anchored on. Opening a
    // mouth by scaling it about its middle drives the bottom lip down through
    // the floor and the whole thing reads as a growing mouth rather than an
    // opening one; pivoted on the lip that is resting on the ground, only the
    // top of it moves, which is what a jaw does.
    jaw = { group: mouth, restV: mouthV, lip: mouth.userData.reach.bottom, restZ: mouth.position.z };

    // The eye inside the mouth. It is the single worst thing in the drawings
    // and it costs nothing: an eye where teeth are is an eye that is not on the
    // outside of the animal.
    // Just inside the lip rather than down the throat. Set back where the
    // drawing suggests it is, no light reaches it and the best thing in the
    // drawings is a black shape in a black hole; here it catches the room at a
    // grazing angle and its catchlight — which is unlit and so always visible —
    // does the rest.
    // Through `place` like everything else. Set directly, these two carried a
    // z of a few centimetres in the face's own frame — which is the frame whose
    // origin is the middle of the cube, not its surface — so the eye in the
    // mouth and the throat under it spent every version of this buried at the
    // core of the thing, a metre and a half behind the face they belong to.
    // Off the mouth's own middle, so it stays in the mouth wherever the mouth
    // is put rather than at a spot on the face the mouth used to be over.
    place(
      face,
      buildEye({ radius: 0.15 * S, bare: true, seed: 6.6 }),
      MOUTH_U,
      mouthV + HALF * 0.04,
      0.12 * S
    );

    // The drawing's dark arch at the bottom of the mouth is not built. Against
    // a flat black opening there is nothing for it to be darker than, and a
    // second black shape inside the first is a shape nobody can see.

    place(face, buildEye({ radius: 0.17 * S, seed: 1.1 }), HALF * 0.52, HALF * 0.55, 0.01 * S);
    place(face, buildEye({ radius: 0.145 * S, seed: 4.4 }), -HALF * 0.55, HALF * 0.44, 0.01 * S);
    place(face, buildEye({ radius: 0.125 * S, seed: 7.7 }), HALF * 0.46, -HALF * 0.48, 0.01 * S);
    place(face, buildMark(0.2 * S), HALF * 0.3, HALF * 0.42, 0.01 * S);
  }

  // -- back: nothing but creases and two eyes --------------------------------
  {
    const face = faces.back;
    place(face, buildEye({ radius: 0.19 * S, seed: 8.2 }), HALF * 0.16, HALF * 0.18, 0.01 * S);
    place(face, buildEye({ radius: 0.15 * S, seed: 9.5 }), -HALF * 0.34, -HALF * 0.12, 0.01 * S);
    place(face, buildMark(0.22 * S), -HALF * 0.24, HALF * 0.24, 0.01 * S);
  }

  // -- left: an eye and a pit ------------------------------------------------
  {
    const face = faces.left;
    place(face, buildEye({ radius: 0.18 * S, seed: 2.9 }), HALF * 0.22, HALF * 0.3, 0.01 * S);
    place(face, buildPit(0.3 * S, 4.8), -HALF * 0.4, -HALF * 0.04, 0.01 * S);
  }

  // -- right: the slit eye and the nostril -----------------------------------
  {
    const face = faces.right;
    place(face, buildEye({ radius: 0.24 * S, slit: true, lidded: true, seed: 3.7 }), 0, HALF * 0.12, 0.01 * S);
    place(face, buildNostril(0.11 * S), -HALF * 0.02, -HALF * 0.42, 0.01 * S);
    place(face, buildMark(0.22 * S), 0, HALF * 0.56, 0.01 * S);
  }

  // ------------------------------------------------------------- collision ---

  // The box it actually occupies, which is the squeezed one: out to the wall on
  // every side it reaches a wall. The arms are inside this too; they come off
  // the top face and go up, so nothing reaches past it in plan.
  //
  // `top` is the sampled crown. It is not there to be climbed — nothing can get
  // to it from the floor and nothing is meant to — it is there so that the room
  // above the animal is air. That mattered not at all until the hoist's window
  // opened into this room from twenty-four metres up.
  const halfX = fit ? fit.x : HALF + 0.08;
  const halfZ = fit ? fit.z : HALF + 0.08;
  const box = {
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    top: group.position.y + crown,
    /**
     * And an underside, which it never had and now cannot do without.
     *
     * Sat on the floor, a box with a `top` and no `bottom` was exactly right:
     * solid from the ground to the crown is what a fifteen metre animal wedged
     * in a room is. The moment it leaves the floor that same box is a column of
     * meat still filling the room it has climbed out of. `keel` is the lowest
     * point of the sampled underside, so what is beneath it is air the instant
     * there is any.
     */
    bottom: group.position.y + keel,
    /**
     * How far it climbed this frame — the same field the hoist publishes.
     *
     * Both bodies read it: a surface rising past a body in the air has to carry
     * it rather than eject it sideways. See liftTower.js, where it was invented
     * for a lift, and player.js, which does not care which of them is moving.
     */
    rise: 0,
  };
  colliders.push(box);

  // --------------------------------------------------------------- alive ----

  const home = group.position.y;

  /**
   * Up and down the tower.
   *
   * The room was built around this thing being wedged in the bottom of it: a
   * shaft you cannot enter because the animal is the floor and the walls and
   * the ceiling of the part you can reach. Moving it does not soften that, it
   * points it — the room is only sealed while the thing sealing it is *here*,
   * and now there is a minute and a half of every cycle where it is not.
   *
   * `high` is worked out from the room's ceiling rather than handed in, because
   * only this file knows how tall the animal actually is: the crown was sampled,
   * not derived. At the top of the travel it is against the slab with its face
   * across the hoist's window, which is the one place in this building somebody
   * is standing to look at it.
   *
   * Six metres a second, which is no longer a lift at all.
   *
   * It has been 1.6, then 4, then 8, and now back a step: 55.76 metres in
   * 9.3 seconds. At 1.6 it was a process and at 4 an event; at 8 it was
   * something the building did to you, over inside the time it takes to
   * cross the room it happens in, and from the floor the first thing you
   * knew about it was that the light had gone.
   *
   * Eight turned out to be past the point where the climb is a thing you
   * watch. The room is seventy-six metres of waiting for this and then
   * getting out of its way, and at eight the getting out of the way is the
   * whole of it — there is no stretch where it is simply coming, which is
   * the part that is worth being in a room with. Six buys 2.3 seconds of
   * that back and costs nothing else: the cycle goes 17 seconds to 19.3,
   * and every place the climb is survived from is concrete that does not
   * care how fast it went past.
   *
   * Not five, and the reason is below rather than dramatic. At the clamped
   * 0.05 step five is 0.25 of travel a frame, which is the bucket's free
   * step exactly, and the note below is about how narrow exactly is. Six is
   * 0.30 and stays the same side of it.
   *
   * The pause is four. There is no point holding the ends of a travel this
   * short for longer than the travel.
   *
   * And it only climbs. Coming down it lets go — see the fall below, which is
   * the same gravity every body in this game falls under and not a speed at
   * all. Up is eight metres a second of effort and seven and a half seconds of
   * watching it work; down is two and a half seconds and no effort whatsoever,
   * and the asymmetry is the whole character of the thing. Something that hauls
   * itself up and then drops is something that was holding on.
   *
   * This is past a line, and the line is worth naming rather than discovering.
   * A body standing on the crown is kept there by two separate rules: the free
   * step, which every grounded body gets, and `rise`, which this box publishes
   * every frame and which both bodies read. At the clamped 0.05s step six
   * metres a second is 0.30 of travel per frame — over the bucket's free step
   * of 0.25, and so from here on the bucket is carried by `rise` alone. It is
   * the same mechanism the hoist proved and it holds, but it is now load
   * bearing on its own, which is why the reach it grants is the movement
   * *plus* the same hair of slack the rest of the collision code works to.
   * Exactly equal was true and one rounding error wide — and that is the
   * margin, 0.30 against 0.25, that keeps the speed above off five.
   */
  const RIDE = travel
    ? {
        low: home,
        high: travel.ceiling - crown - (travel.clear ?? 0.1),
        speed: travel.speed ?? 6.0,
        pause: travel.pause ?? 4,
      }
    : null;
  let lift = 0;
  let going = 1;
  let waiting = RIDE ? RIDE.pause : 0;

  /**
   * The climb, as an animation, and the one decision in it that matters.
   *
   * `climbPhase` is advanced by *distance travelled*, not by time. That is the
   * whole trick and it is the difference between a thing hauling itself up a
   * shaft and a thing sliding up a shaft with its arms waving. Hands that keep
   * their own clock slip against the wall the moment the speed changes — and
   * this speed has changed three times in an afternoon, from 1.6 to 4 to 8. Tie
   * the stroke to the metres and it cannot slip: at eight metres a second it
   * hauls fast, at rest it does not haul at all, and nobody has to remember to
   * retune it.
   *
   * `STROKE` is how far it goes per arm. Three and a half metres on a body
   * fifteen metres across is a short, fast grab rather than a long reach, which
   * is what something with arms that size and no shoulders to speak of would
   * actually do.
   */
  const STROKE = 3.5;
  let climbPhase = 0;
  let climbing = 0;
  let falling = 0;
  /**
   * Whether something else is driving it.
   *
   * The cycle turns itself around at both ends. A scripted beat needs it to
   * arrive and *stay* arrived until told otherwise — see tallRoom.js, which
   * drops it in front of you, holds it there while it looks at you, and then
   * sends it back up. `going` of nought is the state the automatic version
   * never has: at an end, and not leaving.
   */
  let scripted = false;
  /** Downward speed, metres a second, while it is on its way back down. */
  let drop = 0;
  /** How hard the last landing was, decaying, for the squash. */
  let jolt = 0;

  const toPlayer = new THREE.Vector3();
  const local = new THREE.Vector3();
  let blink = 2.4;
  let lid = 0;

  /**
   * It gurgles. Not on a cue — all the time, because it is always doing it.
   *
   * The one in the greeting is the same sound used as a line of dialogue: it
   * drops in front of you, holds still, and makes it *at* you. That only works
   * if the thing has been making it all along and you have been hearing it
   * through a wall for the last five minutes. A creature whose only noise is
   * the noise it makes during its cutscene is a speaker with a cutscene
   * attached.
   *
   * The gaps are uneven and they come out of a hash rather than Math.random,
   * for the reason everything else in this file does: the room has to be the
   * same room twice. Six to fifteen seconds, which is slow enough that you are
   * never waiting for the next one and often enough that the silence never
   * gets a chance to become the normal state.
   */
  const GURGLE = { near: 46, quiet: 6.5, spread: 8.5, busy: 0.55 };
  let gurgleIn = 2.5;
  let gurgleCount = 0;

  // ------------------------------------------------------------- the touch ---

  /**
   * Put a hand on it and it takes you.
   *
   * This is the one input the cube has and the only one it needs, and
   * everything about how it is built is an argument for why it should be the
   * only one.
   *
   * The room is a hall seventy metres long with this at the end of it. You walk
   * the whole length towards a wall of meat that breathes, whose eyes have been
   * following you since the doorway, and which has been gurgling at you through
   * the concrete for five minutes — and for every version of this room before
   * now, nothing happened, because it was scenery. Every reading of it was
   * correct and the thing still never once acknowledged the distance closing.
   * The eyes tracking you are not an acknowledgement; they do that to an empty
   * room.
   *
   * So: the one input is the last one available. Not a key, not a prompt, not a
   * lit spot on the surface — you are in contact with it or you are not, and
   * the game never tells you which of those it would rather you did. A death
   * you walked into is worth three a room hands you, and the only way to be
   * sure the player walked into this one is to make walking the whole of the
   * interface.
   *
   * It is once. There is no cooldown and nothing to learn from a second go,
   * because there is no second go — see `seize`, which does not come back.
   *
   * What this file does about it, and what it does not:
   *
   *   it does    notice the contact, say so once through `onTouched`, and then
   *              move the animal — the lunge, the jaw, the eyes, the arms.
   *   it doesn't take the camera, black the screen, or have any opinion about
   *              what being caught by it means.
   *
   * That line is the same one `scripted` was drawn on and for the same reason:
   * this file knows how the animal moves and nothing about why. The room that
   * has a reason is the room that holds the clock. See tallRoom.js.
   */
  const SEIZE = {
    /** Past the body's own radius, in metres, before contact counts. */
    reach: 0.12,
    /**
     * How far it throws itself, and over how long.
     *
     * Four metres, which is four times what it was, and the reason is that
     * nothing else moves any more. The shot used to fly the camera up to the
     * mouth over two seconds; it does not, it cuts, and then it holds
     * absolutely still. Something has to close the last five metres and the
     * only thing left to do it is the animal — which is the better version of
     * this beat anyway, and not only because it is cheaper. A camera flown
     * into a mouth is the game moving you. A camera nailed to the floor while
     * fifteen metres of meat comes across the gap at it is the thing moving,
     * and being unable to move is most of what is frightening about it.
     *
     * Half a second for four metres. Slower than the old lunge and it reads
     * as faster, because at nine tenths of a metre there was nothing to see:
     * the distance is what makes a lunge legible, not the speed.
     */
    lunge: 4.2,
    out: 0.5,
    /**
     * The beat it waits before coming, with its mouth already open.
     *
     * The single most important number here. Cut straight to a mouth already
     * travelling and there is no jumpscare, there is a smear — you need two
     * tenths of a second of a held, legible, open mouth for the cut to land
     * before the thing behind it moves. It is also the whole of the pause: it
     * looks at you, and then it does not.
     */
    hold: 0.22,
    /** The jaw, which is not on the body's clock. It is open before it moves. */
    gape: 0.12,
  };

  /** Seconds since it was seized, or null if it has not been. */
  let seizedFor = null;

  /**
   * How far the player's feet are from the side of the animal, in plan.
   *
   * Plan only, and then two vertical states thrown out entirely. Standing on
   * its back and standing clear underneath it are both positions where the
   * distance to the surface is nought and neither of them is a hand on the
   * thing — one is a floor and the other is a ceiling, and the collider has
   * already given you both. Contact means beside it.
   */
  const reachToTheMeat = () => {
    const p = player.position;
    if (p.y >= box.top - 0.05) return Infinity;
    if (p.y + PLAYER.eyeHeight <= box.bottom + 0.05) return Infinity;
    const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX);
    const dz = Math.max(box.minZ - p.z, 0, p.z - box.maxZ);
    return Math.hypot(dx, dz);
  };

  /**
   * The throw, 0 to 1: nothing for `hold`, then out over `out`, then stays.
   *
   * There is no coming back from this one. An earlier version threw the body
   * at you and pulled it in again over three quarters of a second, which was
   * right when you survived it and is wrong now — whatever is happening over
   * the next second is happening inside a mouth that is still open, and an
   * animal that relaxes while it is eating is an animal playing an animation.
   *
   * Linear rather than eased, for the one reason that matters: the whole of a
   * lunge is that its first frame is already at full speed. An eased
   * departure is a thing deciding to move, and this one decided during the
   * pause.
   */
  const lungeShape = () =>
    seizedFor === null ? 0 : Math.min(1, Math.max(0, (seizedFor - SEIZE.hold) / SEIZE.out));

  /**
   * The jaw, on its own clock and a much faster one.
   *
   * Tied to the body's throw it opened as the thing arrived, which is a mouth
   * opening around you — too late to be seen and too late to be the reason
   * you are frightened. Open first, then come: what the cut lands on is a
   * mouth that is already as wide as it goes.
   */
  const gapeShape = () =>
    seizedFor === null ? 0 : Math.min(1, seizedFor / SEIZE.gape);

  return {
    group,
    /** For the harness: what got built, and where. */
    parts: { eyes: eyes.length, arms: arms.length, size: SIZE, sunk: +(HALF - group.position.y).toFixed(3) },

    /**
     * The arms, as numbers, for the harness.
     *
     * Handed out rather than found. A harness that goes looking for these in
     * the scene graph is a harness guessing which of forty groups is a limb,
     * and the first version of this one guessed wrong and reported an empty
     * list — which looks exactly like an animation that is not running.
     */
    get limbs() {
      return arms.map((arm) => ({
        swing: +arm.group.rotation.x.toFixed(3),
        sweep: +arm.group.rotation.z.toFixed(3),
        elbow: +arm.elbow.rotation.x.toFixed(3),
        grip: +arm.fingers[0].joints[0].rotation.x.toFixed(3),
      }));
    },

    /**
     * Taking orders, for a scripted beat.
     *
     * `scripted(true)` stops it turning itself round at the ends; everything
     * else here is a cue. It is deliberately not a "play this cutscene" call —
     * this file knows how the animal moves and nothing about why, and the room
     * that has a reason is the room that should be holding the clock. See
     * tallRoom.js.
     */
    scripted(on) {
      scripted = on;
      if (!on && going === 0) {
        going = lift > 0 ? -1 : 1;
        waiting = RIDE ? RIDE.pause : 0;
      }
    },
    /**
     * Stop where you are — unless you are falling, in which case land first.
     *
     * `scripted` on its own is not enough for this and the difference is the
     * whole reason it exists as a second call. Scripted means "do not turn
     * yourself round at the ends", which for a body on its way down is
     * exactly right: it finishes the fall, hits the floor, thuds, and stays
     * there. For a body on its way *up* it means it carries on to the top,
     * and the thing that wants this call has just taken hold of the player —
     * two more seconds of climbing is seventeen metres of shaft with the
     * camera dragged up it.
     *
     * So the climb is cut here and the fall is not. A thing that stops dead
     * in mid-air the instant it touches you is a thing whose animation was
     * switched off; a thing that finishes falling on you is a thing that
     * fell on you.
     */
    takeHold() {
      scripted = true;
      if (going > 0) {
        going = 0;
        waiting = 0;
      }
    },

    /** Straight to the top, no travel — it is sixty metres up and out of sight. */
    /**
     * Stop where you are — unless you are falling, in which case land first.
     *
     * `scripted` on its own is not enough for this, and the difference is the
     * whole reason this exists as a second call. Scripted means "do not turn
     * yourself round at the ends", which for a body on its way down is exactly
     * right: it finishes the fall, hits the floor, thuds, and stays there. For
     * a body on its way *up* it means it carries on to the top — and the thing
     * that wants this call has just taken hold of the player, so two more
     * seconds of climbing is seventeen metres of shaft with the camera dragged
     * up it.
     *
     * So the climb is cut here and the fall is not. Something that stops dead
     * in mid-air the instant it touches you is something whose animation was
     * switched off; something that finishes falling on you is something that
     * fell on you.
     */
    takeHold() {
      scripted = true;
      if (going > 0) {
        going = 0;
        waiting = 0;
      }
    },

    snapToTop() {
      if (!RIDE) return;
      lift = RIDE.high - RIDE.low;
      group.position.y = RIDE.high;
      box.top = group.position.y + crown;
      box.bottom = group.position.y + keel;
      box.rise = 0;
      drop = 0;
      going = 0;
      waiting = 0;
      climbing = 0;
      falling = 0;
    },
    /** Let go. */
    letGo() {
      going = -1;
      waiting = 0;
      drop = 0;
    },
    /** Haul back up. */
    haulUp() {
      going = 1;
      waiting = 0;
      drop = 0;
    },
    get atTop() {
      return !RIDE || lift >= RIDE.high - RIDE.low - 0.01;
    },
    get landed() {
      return !RIDE || lift <= 0.01;
    },

    /**
     * Seized, for the harness. `out` is how far the lunge has got, in metres,
     * which is the only part of this with a number on it a test can watch.
     */
    get seized() {
      return {
        taken: seizedFor !== null,
        age: seizedFor === null ? null : +seizedFor.toFixed(2),
        out: +(lungeShape() * SEIZE.lunge).toFixed(3),
        gape: +gapeShape().toFixed(2),
        // Whatever is waiting on this thing to finish arriving — see the end
        // of the shot in tallRoom.js — waits on the animal rather than on a
        // copy of its clock kept somewhere else.
        arrived: lungeShape() >= 1,
        reach: +Math.min(99, reachToTheMeat()).toFixed(2),
      };
    },

    /**
     * The mouth, in world space, and the way out of the face it is on.
     *
     * Handed out because something else has to aim a camera down it and this
     * is the only file that knows where it ended up. It is not a number that
     * can be written down anywhere else: the mouth was anchored on its own
     * bottom lip, against an outline that came out of a wobble, on a face
     * whose skin position was sampled — three separate places where the honest
     * answer was "measure it", and asking the scene graph is the fourth.
     */
    get maw() {
      if (!jaw) return null;
      group.updateMatrixWorld(true);
      const at = jaw.group.getWorldPosition(new THREE.Vector3());
      // The front face's own +z, in the world. The whole cube is square to its
      // room so this is an axis, but it is read off the matrix rather than
      // assumed, because `yaw` is a parameter and one day it will not be nought.
      const out = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(faces.front.getWorldQuaternion(new THREE.Quaternion()))
        .normalize();
      return { at, out };
    },

    /** Where it is in its climb, for the harness and for whoever asks. */
    get ride() {
      return RIDE && { y: +group.position.y.toFixed(2), crown: +(group.position.y + crown).toFixed(2),
                       low: +RIDE.low.toFixed(2), high: +RIDE.high.toFixed(2), going,
                       waiting: +waiting.toFixed(1), drop: +drop.toFixed(1) };
    },

    reset() {
      body.scale.setScalar(1);
      body.position.set(0, 0, 0);
      seizedFor = null;
      // Including the hold a script had on it. Nothing else clears this and
      // the one thing that sets it is a scene that ends with you dead, so a
      // reset that left it on would bring you back to a room with a fifteen
      // metre animal frozen in the doorway for good.
      scripted = false;
      group.position.y = home;
      lift = 0;
      going = 1;
      gurgleIn = 2.5;
      gurgleCount = 0;
      drop = 0;
      jolt = 0;
      falling = 0;
      climbing = 0;
      waiting = RIDE ? RIDE.pause : 0;
      box.top = home + crown;
      box.bottom = home + keel;
      box.rise = 0;
    },

    update(delta) {
      const t = performance.now() / 1000;

      // The climb. Written before the breathing because the breathing is a
      // scale on the body inside the group, and this moves the group.
      if (RIDE) {
        box.rise = 0;
        // Eased rather than switched, so the arms take up the stroke over a
        // few frames at each end instead of snapping into it.
        const hauling = going > 0 && waiting <= 0 ? 1 : 0;
        climbing += (hauling - climbing) * Math.min(1, delta * 6);
        // Let go, and the arms know it before the floor does.
        const loose = going < 0 && waiting <= 0 ? 1 : 0;
        falling += (loose - falling) * Math.min(1, delta * (loose ? 9 : 3));
        if (waiting > 0) {
          waiting = Math.max(0, waiting - delta);
        } else {
          const before = group.position.y;
          const span = RIDE.high - RIDE.low;
          if (going === 0) {
            // Told to hold. Nothing moves and nothing turns it round.
            drop = 0;
          } else if (going > 0) {
            drop = 0;
            lift = Math.min(span, lift + RIDE.speed * delta);
          } else {
            /**
             * Falling, under the same gravity as everything else in the game.
             *
             * Not a descent speed. A descent speed is a machine lowering a
             * load, and this is not a machine — it climbed up there by hand and
             * what it does at the top is stop holding on. From sixty-one metres
             * that is two and a half seconds and it arrives at fifty metres a
             * second, which is the only number in this file that should
             * frighten anybody.
             *
             * The same constant the player falls under, imported rather than
             * repeated: one gravity in the game means the drop reads as the
             * same physics you have been living under all along, only applied
             * to fifteen metres of animal.
             */
            drop += PLAYER.gravity * delta;
            lift = Math.max(0, lift - drop * delta);
          }
          group.position.y = RIDE.low + lift;
          box.top = group.position.y + crown;
          box.bottom = group.position.y + keel;
          box.rise = Math.max(0, group.position.y - before);
          // Signed, so coming back down runs the same hand-over-hand backwards
          // — a thing lowering itself, rather than a thing falling with its
          // arms still climbing.
          // Only while it is hauling. Falling is not a stroke, and running the
          // phase backwards at fifty metres a second would spin the arms like a
          // windmill on the one part of the cycle they are meant to be limp.
          if (going > 0) climbPhase += ((group.position.y - before) / STROKE) * Math.PI * 2;
          if (going !== 0 && (lift === span || lift === 0)) {
            if (lift === 0 && drop > 0) {
              // Fifteen metres of animal arriving on a concrete floor. The
              // knockout thud is the heaviest thing in the audio and this is
              // the heaviest thing in the building; the grind under it is the
              // room taking it.
              jolt = Math.min(1, drop / 40);
              playKnockout();
              playSpikeGrind(0.8);
              // And it has something to say about the landing. Straight after
              // the thud rather than under it, so it reads as the thing
              // reacting to the floor rather than as part of hitting it.
              gurgleIn = 0.35;
            }
            drop = 0;
            // Under a script it arrives and stops. Left to itself it turns
            // round, which is the difference between a cycle and a cue.
            if (scripted) {
              going = 0;
            } else {
              going = -going;
              waiting = RIDE.pause;
            }
          }
        }
      }

      /**
       * Breathing, and only upward.
       *
       * It used to swell on all three axes and ride up and down as well, which
       * was right for something standing in the middle of a room. This one is
       * wedged: swelling sideways drives the baked surface through the side
       * walls it is already touching, and riding up lifts the underside clear of
       * the floor and opens a gap you can see under from down the hall — the
       * 0.016 on y alone was worth 0.117m at this size, which is not subtle.
       *
       * So it breathes on y, anchored at the bottom rather than the middle: the
       * underside stays where it was set down and the swell goes up, into the
       * one direction the room has any room in. Which is the correct thing for
       * the shape to do anyway, and it took being this big to notice.
       */
      const breath = Math.sin(t * 0.52);
      // And the heave: two surges per cycle, one per arm, on the same phase the
      // hands are on. Without it the body is a lift car with limbs attached —
      // the thing that sells a haul is that the mass moves *because* the arm
      // pulled, so the swell peaks a little after the pull does.
      const heave = climbing * 0.012 * Math.sin(climbPhase * 2 - 0.7);
      // And the landing. It arrives, it flattens, and it comes back — one
      // damped bounce and out, because a thing this size that wobbles is a
      // balloon and a thing this size that stops dead is a brick.
      if (jolt > 0) jolt = Math.max(0, jolt - delta * 1.15);
      const squash = jolt > 0 ? -Math.sin(jolt * Math.PI * 2.4) * jolt * 0.075 : 0;
      body.scale.set(1, 1 + breath * 0.008 + heave + squash, 1);
      body.position.y = HALF * (body.scale.y - 1);

      // --------------------------------------------------------- the touch ---
      /**
       * Notice it, say so, and start moving — in that order and in one frame,
       * so the lunge below is already on its first frame rather than a frame
       * behind the thing that caused it.
       *
       * Three gates, and none of them is a timer. `scripted` is the greeting,
       * which drops this animal in the doorway in front of you and would
       * otherwise kill you on arrival; `isEnabled` is every other beat that
       * takes the body away, the opening cutscene included; `isControlled` is
       * the bucket, because the thing this kills is the body you are behind
       * the eyes of, and a parked body brushing the meat sixty metres from
       * where you are actually standing is not you touching anything.
       */
      if (seizedFor === null) {
        const free = !scripted && player.isEnabled !== false && player.isControlled !== false;
        if (free && reachToTheMeat() < PLAYER.radius + SEIZE.reach) {
          seizedFor = 0;
          onTouched?.();
        }
      } else {
        seizedFor += delta;
      }

      /**
       * Out of the front face, always, whichever side of it you were standing
       * on.
       *
       * It used to work out the nearest face and come at you off that one,
       * which was the honest answer while this was a shove you walked away
       * from. It is not that any more: the shot cuts to the mouth, and the
       * mouth is on the front. A lunge along any other axis is the animal
       * moving one way while the camera watches it from another — and worse,
       * the two faces that are not the front are pressed flat against the
       * side walls, so a sideways throw is four metres of meat driven into
       * concrete.
       *
       * Front is also the one direction that has somewhere to go. The room is
       * sealed on three sides and open on the fourth, and the fourth is the
       * hall you came down.
       */
      const thrown = lungeShape();
      if (thrown !== 0) body.position.z = thrown * SEIZE.lunge;

      // And the mouth, which opened before any of that and stays open.
      const gape = gapeShape();
      if (jaw) {
        const k = 1 + gape * 0.42;
        jaw.group.scale.y = k;
        // Pivoted on the bottom lip. See where `jaw` is built: the mouth was
        // anchored on the lip sitting on the floor and scaling about the
        // group's own middle takes that anchor away again.
        jaw.group.position.y = jaw.restV + jaw.lip * (1 - k);
        jaw.group.position.z = jaw.restZ + gape * 0.5;
      }

      // The eyes. All of them look at you, which is free — they are already
      // built as balls in sockets — and is the only thing this does that
      // acknowledges you are in the room.
      // The player's eyes, not their feet plus a guess. Aimed 1.5 up it looked
      // past you at your chest, and on a lidded eye — which can only show its
      // iris through a slot a few degrees wide — looking at your chest and
      // looking away are the same picture.
      toPlayer.copy(player.position);
      toPlayer.y += 1.68;

      /**
       * And the noise, pitched by how far away you are and how hard it is
       * working.
       *
       * Distance is measured to the body rather than to the room, because this
       * body moves sixty metres and a sound that does not follow it is a sound
       * coming from a hole in the floor. Nothing is scheduled at all past
       * `near` — the hall is long and there is no point filling the graph with
       * nodes for something inaudible at the other end of it.
       *
       * `busy` shortens the gaps while it is climbing or falling. A thing
       * hauling itself up a shaft has more to say about it than a thing sitting
       * at the bottom, and it is also the only cue you get, from down the hall,
       * that the room at the end has started moving.
       */
      gurgleIn -= delta;
      if (gurgleIn <= 0) {
        const away = Math.hypot(
          toPlayer.x - group.position.x,
          toPlayer.y - group.position.y,
          toPlayer.z - group.position.z
        );
        if (away < GURGLE.near) {
          // Full voice up close, down to a mutter at the edge of hearing.
          playGurgle(Math.max(0.12, Math.min(1, 1.15 - away / GURGLE.near)));
        }
        const n = Math.sin(gurgleCount * 91.7 + 13.2) * 43758.5453;
        const roll = ((n % 1) + 1) % 1;
        const working = RIDE && (going !== 0 || drop > 0) && waiting <= 0;
        gurgleIn = (GURGLE.quiet + roll * GURGLE.spread) * (working ? GURGLE.busy : 1);
        gurgleCount++;
      }
      for (const eye of eyes) {
        const socket = eye.ball.parent;
        socket.updateMatrixWorld(true);
        // Into the socket's frame to clamp, then back out to the world's to
        // aim. `lookAt` takes a world point — handed the local one it turns
        // every ball to face somewhere arbitrary, which shows you the blank
        // back of the eye and no iris at all, and looks for all the world like
        // a lighting problem.
        local.copy(toPlayer);
        socket.worldToLocal(local);
        // Held to a cone, so an eye on the far side does not swivel through
        // its own skull to follow somebody standing in front of the cube.
        local.z = Math.max(local.z, Math.hypot(local.x, local.y) * 1.1, 0.05);
        socket.localToWorld(local);
        eye.ball.lookAt(local);
      }

      // And they blink, all at once, on a beat that is not regular — except
      // once it has you, when they are held open for good. A thing that blinks
      // while it is eating is a thing on a schedule.
      blink -= delta;
      if (gape > 0.02) {
        lid = 0;
        blink = Math.max(blink, 0.6);
      } else if (blink <= 0) {
        blink = 2.6 + rand(Math.floor(t), 21) * 5.5;
        lid = 1;
      }
      lid = Math.max(0, lid - delta * 5.5);
      const open = 1 - Math.sin(lid * Math.PI) * 0.94;
      // And they bulge. The lids are separate meshes laid on the skin and do
      // not move, so the ball growing through its own aperture is the whole of
      // what an eye this size has to be wide with.
      const bulge = 1 + gape * 0.3;
      // Through the eye's own width, not over it. Setting x to 1 here is what
      // quietly undid the lidded eyes' stretch every frame — they are built
      // wide to fill their slot and were being squared up again sixty times a
      // second, which no amount of looking at the builder would have shown.
      for (const eye of eyes)
        eye.ball.scale.set(eye.wide * bulge, Math.max(0.04, open) * bulge, bulge);

      /**
       * The arms: stirring when it is still, hauling when it is not.
       *
       * The stir is the room as it was — the drawing has them held up, and
       * something holding its arms up is either about to do something or has
       * been like that for a very long time.
       *
       * The haul is that same pair of arms on a stroke, half a cycle apart, and
       * it is built out of one angle: reach, plant, pull, release. The whole arm
       * swings back on the reach and forward through the pull; the elbow folds
       * only while the hand is loaded, because an elbow that folds on the reach
       * is an arm doing a backstroke; and the fingers are shut through the pull
       * and open through the reach, which is the part that reads at fifty
       * metres when nothing else does.
       *
       * Both are computed every frame and crossfaded on `climbing`. Switching
       * between two animations leaves the arms wherever the old one had them.
       */
      arms.forEach((arm, i) => {
        const idleElbowZ = Math.sin(t * 0.31 + i * 2.3) * 0.09;
        const idleWristY = Math.sin(t * 0.24 + i * 1.7) * 0.16;

        // Half a cycle apart: one hand is always loaded.
        const phase = climbPhase + i * Math.PI;
        const swing = Math.sin(phase);
        // 1 through the pull, 0 through the reach.
        const load = (1 - Math.cos(phase)) / 2;

        // Dragged back on the fall: nothing is holding on, and the arms of a
        // thing dropping sixty metres go where the air puts them.
        arm.group.rotation.x =
          ARM_BASE_X +
          climbing * swing * 0.62 -
          falling * (0.5 + 0.25 * Math.sin(t * 5 + i)) +
          // Thrown forward when it has you, and added rather than blended in:
          // whatever the arms were doing, this happens on top of it, which is
          // the only version that is right both while it stands there and
          // while it is halfway up the shaft.
          gape * 1.05;
        arm.group.rotation.z = climbing * Math.cos(phase) * 0.22 * (i ? -1 : 1);
        arm.elbow.rotation.x = climbing * load * 0.95;
        arm.elbow.rotation.z = (1 - climbing) * idleElbowZ;
        arm.wrist.rotation.y = (1 - climbing) * idleWristY;
        arm.wrist.rotation.x = climbing * (0.35 - load * 0.7);

        for (const [f, finger] of arm.fingers.entries()) {
          const idleCurl = 0.09 + 0.05 * Math.sin(t * 0.44 + f * 0.8 + i * 3.1);
          // Shut hard on the pull, open on the reach, and not all at once —
          // fingers close in a run, which is what makes a hand look like it is
          // taking hold of something rather than closing a clamp.
          const roll = Math.min(1, Math.max(0, load * 1.25 - f * 0.08));
          const gripCurl = 0.06 + roll * 1.05;
          const curl = (1 - climbing) * idleCurl + climbing * gripCurl;
          // Splayed. Whatever the hand was doing, it opens.
          for (const joint of finger.joints) joint.rotation.x = curl * (1 - gape);
        }
      });
    },
  };
}
