import * as THREE from 'three';
import { makeMetalPanelSurface } from './textures.js';
import { createSpeechRunner, MOUTH_AT_REST } from './voice.js';

/**
 * The face on the screen, and the life behind it.
 *
 * There is one character in this game that talks, and it lives on glass. It
 * started on the television in the ward and there is now a second screen for it
 * to appear on, so the face moved in here rather than being drawn twice. That
 * matters more than the usual argument against duplication: two copies of a
 * character are two characters, and the whole effect of the thing being on the
 * console at the end of the red hall is that it is the *same* one, watching from
 * further along.
 *
 * The casing is in here too, and that is deliberate. The first attempt gave the
 * console at the end of the red hall its own small monitor and scaled the face
 * down to fit it, which was wrong in a way worth writing down: the set — a wide
 * grey box with the face floating in the middle of far too much screen, loose
 * wires out of the top and bottom, a green glow thrown on the wall behind it —
 * is as much the character as the eyes are. Shrunk into a desk terminal it read
 * as a computer with a face on it rather than as the thing from the ward.
 */

// Screen face, from the drawing: sickly green on a dead grey tube. Rendered
// exactly as written — see screenMaterial.
export const FACE = '#6f9040';

/**
 * The face is drawn, not lit — and not tone mapped either.
 *
 * Unlit alone was not enough. A standard material picked up the ward lamp and
 * washed the face out to white, so it became MeshBasicMaterial; but ACES still
 * had it, and ACES lifts hard through the mids. At an exposure of 1.42 a mid
 * green came out close to mint no matter what was authored — darkening the
 * constant twice barely moved the pixels. Exempting it means the value written
 * here is the value on screen, which is the only way to actually pick a colour.
 */
export function screenMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

/**
 * The mouth at rest: a stepped block, widest at the top and narrowing downward.
 *
 * Narrow, not short. It keeps its full height — step height and step spacing
 * are the same number, so the three stay contiguous — and it is the width of
 * each step that comes in.
 *
 * Widened by half again on top of the drawn widths. The eyes sit 0.42 out from
 * the middle and are 0.28 across, so the face is 1.12 wide at the top and was
 * 0.54 at the mouth — which on a tube this size read as a small mouth a long
 * way under a pair of big eyes rather than as a face. The ratios between the
 * three are untouched at 3:2:1.
 *
 * At module scope because the frown is written as a departure from this and has
 * to be able to find its way back.
 *
 * [width, height, y]
 */
const MOUTH_STEPS = [
  [0.86, 0.14, 0.14],
  [0.58, 0.14, 0],
  [0.29, 0.14, -0.14],
];

/**
 * Two eyes and a mouth, built at the size they were drawn.
 *
 * The face does not scale with whatever it is sitting in — on the television it
 * sits in the middle of a lot more screen, and on the console the group is
 * scaled down as a whole. Everything below is in that drawn space.
 */
export function buildScreenFace() {
  const group = new THREE.Group();
  const eyes = [];
  const faceParts = [];

  // Eyes. In the drawing each is a narrow vertical bar with a wider cap across
  // the top, like a plug — so that's exactly how they're built.
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.42, 0.28, 0);

    // The open eye, in its own group so shutting can squash it without also
    // squashing the closed shape sitting alongside it.
    const open = new THREE.Group();
    eye.add(open);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), screenMaterial(FACE));
    cap.position.y = 0.3;
    open.add(cap);

    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.04), screenMaterial(FACE));
    open.add(stem);

    // The closed eye: a filled half-disc, flat edge down and the curve on top.
    // A squashed version of the open eye only ever gives a flat bar, and a bar
    // reads as switched off rather than as a shut eye.
    const closed = new THREE.Mesh(
      new THREE.CircleGeometry(0.16, 24, 0, Math.PI),
      screenMaterial(FACE)
    );
    closed.position.y = -0.06;
    closed.visible = false;
    eye.add(closed);

    group.add(eye);
    eyes.push({ group: eye, open, cap, closed });
    faceParts.push(cap, stem, closed);
  }

  // Mouth: MOUTH_STEPS, above.
  const mouth = new THREE.Group();
  mouth.position.y = -0.42;
  for (const [w, h, y] of MOUTH_STEPS) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), screenMaterial(FACE));
    step.position.y = y;
    mouth.add(step);
    faceParts.push(step);
  }
  group.add(mouth);

  return { group, eyes, mouth, faceParts };
}

/** The loose wiring's colours, from the drawing. */
const WIRE_COLOURS = ['#b23b2e', '#2f4b9c', '#8a9440'];

/**
 * One loose wire: a wavy tube. The drawing has them sprouting untidily from the
 * casing in different colours and lengths, which is most of what makes the
 * thing look torn out of something rather than installed.
 */
function buildWire(origin, direction, length, colour) {
  const points = [];
  const segments = 6;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push(
      new THREE.Vector3(
        origin.x + direction.x * length * t + Math.sin(t * 7 + origin.x) * 0.12 * t,
        origin.y + direction.y * length * t + Math.cos(t * 9 + origin.y) * 0.14 * t,
        origin.z + direction.z * length * t + Math.sin(t * 5) * 0.05
      )
    );
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 20, 0.022, 6, false),
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.7, metalness: 0.05 })
  );
  mesh.castShadow = true;
  return mesh;
}

/**
 * The television, its face, and the wiring hanging off it.
 *
 * The whole set piece, and the only way this character is ever presented. It
 * was built for the ward and there is a second one at the end of the red hall;
 * both are this, at this size, because a face crammed into a small monitor is a
 * different character wearing the same eyes. If it turns up somewhere else, it
 * turns up in one of these.
 */
export function buildTelevision() {
  const group = new THREE.Group();

  // Wide. The face inside it does not scale with the casing — it stays the
  // size it was drawn, sitting in the middle of a lot more screen.
  const width = 3.8;
  const height = 1.9;
  const depth = 0.36;

  // Casing: a deep grey box, bezel proud of the screen on all sides.
  const casing = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      ...makeMetalPanelSurface(1.4, 0.8, '#84847d'),
      metalness: 0.15,
    })
  );
  casing.castShadow = true;
  casing.receiveShadow = true;
  group.add(casing);

  // The tube itself, recessed into the bezel.
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.5, height - 0.44, 0.06),
    new THREE.MeshBasicMaterial({ color: '#0b0a0d', toneMapped: false })
  );
  screen.position.z = depth / 2 + 0.01;
  group.add(screen);

  // The face itself lives in screenFace.js: there is one character in this game
  // and it now has two screens to appear on, so it is built in one place.
  const { group: face, eyes, mouth, faceParts } = buildScreenFace();
  face.position.z = depth / 2 + 0.05;
  group.add(face);

  // Wiring out of the top and bottom of the casing, as in the drawing.
  const tops = [-0.72, -0.36, 0.08, 0.44, 0.8].map((f) => f * width * 0.5);
  tops.forEach((x, i) => {
    const wire = buildWire(
      new THREE.Vector3(x, height / 2, 0.1),
      new THREE.Vector3((i - 2) * 0.12, 1, 0.15).normalize(),
      0.55 + (i % 3) * 0.25,
      WIRE_COLOURS[i % WIRE_COLOURS.length]
    );
    group.add(wire);
  });
  [-0.6, -0.16, 0.28, 0.68].map((f) => f * width * 0.5).forEach((x, i) => {
    const wire = buildWire(
      new THREE.Vector3(x, -height / 2, 0.1),
      new THREE.Vector3((i - 1.5) * 0.14, -1, 0.2).normalize(),
      0.45 + (i % 3) * 0.22,
      WIRE_COLOURS[(i + 1) % WIRE_COLOURS.length]
    );
    group.add(wire);
  });

  // Its own glow on the wall around it.
  const glow = new THREE.PointLight(FACE, 2.2, 4.5, 2);
  glow.position.z = 0.7;
  group.add(glow);

  return { group, eyes, mouth, glow, screen, faceParts, width, depth };
}

/**
 * What the face does when nobody is asking it anything: breathe, flicker, blink,
 * watch, and shape its mouth around whatever it is saying.
 *
 * Owns the speech runner, because the mouth and the voice are the same
 * performance — the face is the only thing on screen that can tell you where
 * the sound is coming from. Whoever built the screen keeps the casing, the
 * shutdown fade and anything else attached to it, and hands the fade in as
 * `lit` each frame.
 */
export function createScreenLife({ eyes, mouth, faceParts, glow = null, glowLevel = 2.2 }) {
  // The three blocks, taken off the mouth rather than handed in beside it: the
  // caller already passes the group they are in, and a second parameter naming
  // its own children is a parameter somebody adds a screen without.
  const mouthSteps = mouth.children;
  const speech = createSpeechRunner();
  let time = 0;
  // Eased rather than snapped to. The schedule steps between shapes instantly
  // and a mouth that did the same would flicker; width settles a little slower
  // than the jaw, which is also true of the real thing.
  let mouthOpen = MOUTH_AT_REST.open;
  let mouthWide = MOUTH_AT_REST.wide;
  // 1 is open, 0 is shut. Eased, so it reads as eyes closing rather than the
  // eyes simply being replaced by two dashes between frames.
  let eyesOpen = 1;
  // And how hard it is scowling, on lines that ask for it.
  let browed = 0;
  // Brows down, which is a separate thing from the mouth and asked for a line
  // at a time. Almost nothing gets it.
  let angry = 0;

  return {
    speak(lines, onFinished) {
      speech.play(lines, onFinished);
    },
    stop() {
      speech.stop();
    },
    get isSpeaking() {
      return speech.isSpeaking;
    },
    /** The line being delivered, for anything else it is meant to be doing. */
    get line() {
      return speech.line;
    },

    /** @param lit 1 while the screen is on, easing to 0 as it goes out. */
    update(delta, lit = 1) {
      time += delta;
      speech.update(delta);

      // The screen is alive: a slow breath with the occasional dropped frame.
      const flicker = Math.sin(time * 31) > 0.96 ? 0.25 : 1;
      const breath = 0.82 + Math.sin(time * 1.9) * 0.14;
      const level = breath * flicker;

      for (const part of faceParts) {
        part.material.color.setStyle(FACE).multiplyScalar((0.45 + level * 0.55) * lit);
      }
      if (glow) glow.intensity = glowLevel * level * lit;

      /**
       * The frown, on any line that asks for one.
       *
       * The eyes lean into each other rather than growing brows above
       * themselves. Brows were the first attempt and they had nowhere to go:
       * the caps already reach within a finger's width of the top of the glass,
       * and a bar above them sat on the bezel — the face drawn on the casing,
       * which is the one mistake this character cannot survive twice.
       *
       * Leaning costs no room and the cap is a brow already: tip the plug and
       * its wide top bar comes down over the inside corner of the eye, which is
       * the whole of an angry face. It works shut as well as open, because it
       * is the eye that turns and not something stuck on the front of it.
       */
      browed += ((speech.line?.frown ? 1 : 0) - browed) * (1 - Math.exp(-9 * delta));
      // Faster than the mouth. A frown settles onto a face; this arrives.
      angry += ((speech.line?.brows === 'angry' ? 1 : 0) - angry) * (1 - Math.exp(-14 * delta));

      // It watches. The eyes track slowly from side to side.
      const look = Math.sin(time * 0.55) * 0.07;

      // Some lines are delivered with them shut, which on this face means the
      // arc rather than the plug — a pair of upturned semicircles, and how a
      // face this simple reads as pleased with itself.
      const lidTarget = speech.line?.eyes === 'closed' ? 0.08 : 1;
      eyesOpen += (lidTarget - eyesOpen) * (1 - Math.exp(-7 * delta));

      eyes.forEach((eye, i) => {
        eye.group.position.x = (i === 0 ? -0.42 : 0.42) + look;

        /**
         * The caps turn down, inner ends first, on a line that asks for it.
         *
         * Not on the frown. The frown is the mouth, and brows that came down
         * with it every time were a second opinion running over the top of
         * every sentence. This is its own cue and it is meant to be rare: one
         * line in the building has it, and it is the one where the thing on the
         * screen stops apologising and tells you what the corridor was for.
         *
         * It is the bar across the top that does the work — the stem stays
         * where it is. Leaning the whole plug was an earlier go and it read as
         * two eyes falling towards each other.
         */
        eye.cap.rotation.z = (i === 0 ? -1 : 1) * 0.5 * angry;
        eye.cap.position.y = 0.3 - 0.05 * angry;

        // The open eye squashes shut and the arc grows in behind it, so the
        // two swap over mid-blink rather than one popping in on the other.
        eye.open.scale.y = Math.max(0.001, eyesOpen);
        eye.open.visible = eyesOpen > 0.32;

        const shut = Math.min(1, Math.max(0, (0.5 - eyesOpen) / 0.42));
        eye.closed.visible = shut > 0.01;
        // And the shut eye turns over when it is scowling. Flat edge down with
        // the curve on top is a face pleased with itself; the same arc the
        // other way up is the same face not. Flipped by taking the scale
        // through zero rather than by spinning it, so it redraws itself
        // inverted instead of rolling over on its side on the way.
        eye.closed.scale.set(shut, shut * (1 - 2 * browed), 1);
      });

      // The mouth is shaped to the syllable actually being spoken: a rounded
      // "oh" narrows and drops it, a flat "ee" spreads it and barely opens it,
      // and the consonants between close it. Idles with a slow breath.
      const target = speech.isSpeaking ? speech.mouth : MOUTH_AT_REST;
      const idle = speech.isSpeaking ? 0 : Math.sin(time * 2.4) * 0.02;
      mouthOpen += (target.open + idle - mouthOpen) * (1 - Math.exp(-24 * delta));
      mouthWide += (target.wide - mouthWide) * (1 - Math.exp(-17 * delta));

      // 0.3 keeps the lips together rather than collapsing the mouth to a line.
      mouth.scale.set(mouthWide, 0.3 + mouthOpen * 1.5, 1);

      /**
       * And the mouth turns over on a line that asks for it.
       *
       * The frown is the mouth it already has, upside down: the same three
       * blocks in the same widths, with the widest at the bottom instead of the
       * top. Nothing is added and nothing is reshaped — the steps just trade
       * heights, so the taper that pointed down points up.
       *
       * That was worth backing up to. The first frown pulled the two narrow
       * blocks out to the ends of the wide one and turned them down into a bar
       * with corners, which is a frown out of a different drawing: a face this
       * simple has one mouth, and every expression it has must be that mouth
       * moved rather than a second one wearing its colour.
       *
       * Eased rather than swapped, so the steps are seen to cross over each
       * other, and it goes on talking the whole way through.
       */
      mouthSteps.forEach((step, i) => {
        step.position.y = MOUTH_STEPS[i][2] * (1 - 2 * browed);
      });

      return { level, mouthOpen, mouthWide, eyesOpen, browed, angry };
    },
  };
}
