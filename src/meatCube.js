import * as THREE from 'three';
import { makeMeatSurface, cloneSurface, MEAT } from './textures.js';
import { buildFinger } from './glove.js';

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
 * Nothing here is a mechanism. It does not open, it cannot be interacted with
 * and it does not follow you across the room — it breathes, its eyes move, and
 * that is the entire behaviour. See the tall room's platforms for the same
 * argument at the scale of a wall: the room is read, not solved.
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
 * Edge of the cube, and how far the bottom teeth hold it off the floor.
 *
 * It stands on them. The tips run a little under floor level rather than
 * resting exactly on it — a tooth stopping dead at y=0 is a prop set down on a
 * surface, and one pressed into it is gripping. Nothing below the floor is
 * visible from anywhere in the room, so the only thing this costs is the
 * pretence that the floor is soft.
 */
const SIZE = 2.9;
const STAND = 0.44;

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
  return (
    (Math.sin(p.x * 2.1 + 1.7) * Math.sin(p.y * 1.7 - 0.6) * Math.sin(p.z * 2.5 + 2.4) * 0.030 +
      Math.sin(p.x * 4.3 - 2.1) * Math.sin(p.y * 5.1 + 1.1) * Math.sin(p.z * 3.9 - 0.4) * 0.014 +
      Math.sin(p.x * 8.7) * Math.sin(p.y * 7.9) * Math.sin(p.z * 9.3) * 0.006) *
    (SIZE / LUMP) *
    LUMP
  );
}

/** Corners taken off, the same way for the body and for the surface probe. */
function rounded(p) {
  const out = p.clone();
  return out.lerp(out.clone().normalize().multiplyScalar(HALF), ROUND);
}

/** Where the skin is, for a point on the ideal cube. */
function skin(p) {
  const r = rounded(p);
  return r.clone().addScaledVector(r.clone().normalize(), lump(r));
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

export function createMeatCube({ parent, colliders, x, z, yaw = 0, player }) {
  const group = new THREE.Group();
  group.position.set(x, STAND + HALF, z);
  group.rotation.y = yaw;
  parent.add(group);

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

  const flesh = meatMaterial(1);
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
    for (let i = 0; i < STEPS; i++) rim.push(at((i / STEPS) * Math.PI * 2));

    // The hole. Unlit black, front-facing, so there is never a frame in which
    // you can see out the far side of the animal; the shaded bowl behind it is
    // what stops that black being a hole cut in the picture.
    // Exactly a hemisphere, and not a degree more. At 0.62π the cap runs 21°
    // past its own equator, so once it is turned to face into the cube it still
    // stands a fifth of its depth proud of the skin — and since it is BackSide
    // and lit, what you get is a pale dome sitting over the mouth with the
    // teeth poking out of it.
    //
    // The bowl first, then a flat unlit black behind it. In that order: the
    // bowl is what gives the inside of the mouth a shape to shade, and the
    // black is only there so that there is never an angle from which you can
    // see out of the far side of the animal. Put the black in front of the bowl
    // and it hides the only thing worth seeing in there.
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
      new THREE.TubeGeometry(gumCurve, 72, Math.min(radiusU, radiusV) * 0.075, 7, true),
      inner
    );
    gum.position.z = 0.03;
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
      tooth.position.set(p.x, p.y, 0.01);
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

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.72, 8, 16), flesh);
    upper.castShadow = true;
    upper.position.set(side * 0.42, 0.24, 0);
    upper.rotation.z = -side * 1.02;
    arm.add(upper);

    // The elbow is a joint the forearm hangs off, so the hand comes with it.
    const elbow = new THREE.Group();
    elbow.position.set(side * 0.82, 0.56, 0);
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
      depth: 0.26,
      seed: 1.7,
      lobes: 6,
    });
    place(face, mouth, 0, 0.02, 0.02);

    // The tongue out of the front of it. Lolling, so it touches the floor —
    // which is the detail that says this thing has been standing here.
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), inner);
    tongue.scale.set(HALF * 0.34, HALF * 0.42, 0.16);
    place(face, tongue, 0, -HALF * 0.52, -0.02);
    tongue.rotation.x = 0.4;

    place(face, buildEye({ radius: 0.13, seed: 2.2 }), -HALF * 0.62, HALF * 0.58, 0.01);
    place(face, buildEye({ radius: 0.115, seed: 5.1 }), HALF * 0.6, -HALF * 0.56, 0.01);
  }

  // -- top: the big eye, and the arms ---------------------------------------
  {
    const face = faces.top;
    place(face, buildEye({ radius: 0.3, lidded: true, seed: 0.4 }), 0, HALF * 0.28, 0.01);
    place(face, buildMark(0.26), -HALF * 0.1, -HALF * 0.62, 0.01);
  }
  const arms = [];
  for (const [name, side] of [['left', -1], ['right', 1]]) {
    const arm = buildArm(side);
    // Out of the shoulder of each side face, up near the top, which is where
    // the drawing has them leaving the cube.
    place(faces[name], arm.group, HALF * 0.1 * side, HALF * 0.72, -0.06);
    // The arm's own frame is the world's: it reaches up and out, not out of
    // the face it is attached to.
    arm.group.rotation.y = name === 'left' ? Math.PI / 2 : -Math.PI / 2;
    arms.push(arm);
  }

  // -- front: the tall mouth with an eye in it -------------------------------
  {
    const face = faces.front;
    const mouth = buildMouth({
      radiusU: HALF * 0.29,
      radiusV: HALF * 0.56,
      teeth: 26,
      depth: 0.22,
      seed: 3.3,
      lobes: 4,
    });
    place(face, mouth, -HALF * 0.14, HALF * 0.04, 0.02);

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
    place(face, buildEye({ radius: 0.13, bare: true, seed: 6.6 }), -HALF * 0.14, HALF * 0.06, 0.12);

    // The drawing's dark arch at the bottom of the mouth is not built. Against
    // a flat black opening there is nothing for it to be darker than, and a
    // second black shape inside the first is a shape nobody can see.

    place(face, buildEye({ radius: 0.17, seed: 1.1 }), HALF * 0.52, HALF * 0.55, 0.01);
    place(face, buildEye({ radius: 0.145, seed: 4.4 }), -HALF * 0.55, HALF * 0.44, 0.01);
    place(face, buildEye({ radius: 0.125, seed: 7.7 }), HALF * 0.46, -HALF * 0.48, 0.01);
    place(face, buildMark(0.2), HALF * 0.3, HALF * 0.42, 0.01);
  }

  // -- back: nothing but creases and two eyes --------------------------------
  {
    const face = faces.back;
    place(face, buildEye({ radius: 0.19, seed: 8.2 }), HALF * 0.16, HALF * 0.18, 0.01);
    place(face, buildEye({ radius: 0.15, seed: 9.5 }), -HALF * 0.34, -HALF * 0.12, 0.01);
    place(face, buildMark(0.22), -HALF * 0.24, HALF * 0.24, 0.01);
  }

  // -- left: an eye and a pit ------------------------------------------------
  {
    const face = faces.left;
    place(face, buildEye({ radius: 0.18, seed: 2.9 }), HALF * 0.22, HALF * 0.3, 0.01);
    place(face, buildPit(0.3, 4.8), -HALF * 0.4, -HALF * 0.04, 0.01);
  }

  // -- right: the slit eye and the nostril -----------------------------------
  {
    const face = faces.right;
    place(face, buildEye({ radius: 0.24, slit: true, lidded: true, seed: 3.7 }), 0, HALF * 0.12, 0.01);
    place(face, buildNostril(0.11), -HALF * 0.02, -HALF * 0.42, 0.01);
    place(face, buildMark(0.22), 0, HALF * 0.56, 0.01);
  }

  // ------------------------------------------------------------- collision ---

  // A plain box, and no `top`: it is three and a half metres to the crown of it
  // with the stand, so there is no standing on it and nothing to be gained by
  // pretending its lumps are climbable. The arms are outside this and stay
  // outside it — they are over head height and there is nothing to walk into.
  const half = HALF + 0.08;
  colliders.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });

  // --------------------------------------------------------------- alive ----

  const home = group.position.y;
  const toPlayer = new THREE.Vector3();
  const local = new THREE.Vector3();
  let blink = 2.4;
  let lid = 0;

  return {
    group,
    /** For the harness: what got built, and where. */
    parts: { eyes: eyes.length, arms: arms.length, size: SIZE, stand: STAND },

    reset() {
      body.scale.setScalar(1);
      group.position.y = home;
    },

    update(delta) {
      const t = performance.now() / 1000;

      // Breathing. One slow swell, and the whole thing rides up and down on it
      // a little, because a body that changes size without moving is a balloon.
      const breath = Math.sin(t * 0.52);
      body.scale.set(1 + breath * 0.012, 1 + breath * 0.016, 1 + breath * 0.012);
      group.position.y = home + breath * 0.02;

      // The eyes. All of them look at you, which is free — they are already
      // built as balls in sockets — and is the only thing this does that
      // acknowledges you are in the room.
      // The player's eyes, not their feet plus a guess. Aimed 1.5 up it looked
      // past you at your chest, and on a lidded eye — which can only show its
      // iris through a slot a few degrees wide — looking at your chest and
      // looking away are the same picture.
      toPlayer.copy(player.position);
      toPlayer.y += 1.68;
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

      // And they blink, all at once, on a beat that is not regular.
      blink -= delta;
      if (blink <= 0) {
        blink = 2.6 + rand(Math.floor(t), 21) * 5.5;
        lid = 1;
      }
      lid = Math.max(0, lid - delta * 5.5);
      const open = 1 - Math.sin(lid * Math.PI) * 0.94;
      // Through the eye's own width, not over it. Setting x to 1 here is what
      // quietly undid the lidded eyes' stretch every frame — they are built
      // wide to fill their slot and were being squared up again sixty times a
      // second, which no amount of looking at the builder would have shown.
      for (const eye of eyes) eye.ball.scale.set(eye.wide, Math.max(0.04, open), 1);

      // The arms stir. Not a gesture and not aimed at anything — the drawing
      // has them held up, and something holding its arms up is either about to
      // do something or has been like that for a very long time.
      arms.forEach((arm, i) => {
        arm.elbow.rotation.z = Math.sin(t * 0.31 + i * 2.3) * 0.09;
        arm.wrist.rotation.y = Math.sin(t * 0.24 + i * 1.7) * 0.16;
        for (const [f, finger] of arm.fingers.entries()) {
          const curl = 0.09 + 0.05 * Math.sin(t * 0.44 + f * 0.8 + i * 3.1);
          for (const joint of finger.joints) joint.rotation.x = curl;
        }
      });
    },
  };
}
