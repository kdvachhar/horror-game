import * as THREE from 'three';
import { FACE } from './screenFace.js';

/**
 * The black wire: what it is made of, the fitting it goes into a wall through,
 * and what runs down it when the thing at the far end wakes up.
 *
 * It is one cable and it now runs through three rooms — out of the television
 * in the ward, across the back room and under the red door, the length of the
 * red hall, and through the end wall into the set on the far side of it — and
 * each of those is built by a different file. Its thickness and its colour are
 * one fact about one object; written down three times they are three objects,
 * and they stop matching the first time one of them is retuned.
 *
 * The route itself stays with whichever room the cable is lying in. Only what
 * the cable *is* lives here.
 */

export const WIRE_RADIUS = 0.055;

/**
 * @param fog Fog is distance tinting and takes no notice of light, so on an
 *   unlit cable in an unlit room it is the only thing you would see of it. The
 *   half of the run that lies in the dark room turns it off.
 */
export function blackWireMaterial({ fog = true } = {}) {
  return new THREE.MeshStandardMaterial({
    color: '#141517',
    roughness: 0.75,
    metalness: 0.05,
    fog,
  });
}

/**
 * Where it goes into a wall: a backplate, a collar and a short sleeve for the
 * cable to disappear up.
 *
 * Both faces of the wall between the red hall and the room behind it carry one,
 * and they are the same fitting because it is the same hole — you watch the
 * cable go into the wall beside the way out, and when you are through the door
 * it is coming out of the wall beside the way in, at the same height, a metre
 * and a half further on. Two fittings that merely resembled each other would be
 * two cables.
 *
 * Built facing +x. A port in a wall the other way round is the same group with
 * a half turn on it.
 */
export function buildWirePort() {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: '#4a4d4c',
    roughness: 0.6,
    metalness: 0.05,
  });

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.26), metal);
  group.add(plate);

  // A torus is born in the xy plane, facing +z. A quarter turn stands it in the
  // wall, round the hole, instead of lying flat across it like a washer.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.028, 8, 16), metal);
  collar.rotation.y = Math.PI / 2;
  collar.position.x = 0.02;
  group.add(collar);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.14, 10), metal);
  sleeve.rotation.z = Math.PI / 2;
  sleeve.position.x = 0.08;
  sleeve.castShadow = true;
  group.add(sleeve);

  return group;
}

// ------------------------------------------------------------- the current ---

/**
 * What runs down the cable when the set at the end of it comes on.
 *
 * Held at module scope, and that is the argument for this file existing rather
 * than an accident of it. The current is one fact about one object: the cable
 * leaves the ward in medicalRoom.js, crosses the back room, runs the hall in
 * gauntlet.js and arrives in exitRoom.js, and a charge that is on in one of
 * those files and off in another is two cables again. Each room hands its own
 * stretch over with `chargeWire` and then never thinks about it; one call turns
 * the whole run on.
 *
 * Every stretch is drawn in the same direction — away from the ward, toward the
 * set in the room behind the hall — so a single scroll runs the length of the
 * building the right way round. Whichever room you are standing in, it is going
 * where the thing that just woke up went.
 */

/** Metres between one pulse and the next, along the whole run. */
const PULSE_SPACING = 3.6;
/** Metres a second they travel. Walking pace: you can follow one with your eye. */
const PULSE_SPEED = 5.5;

/**
 * One pulse, drawn once into a strip that every stretch of cable repeats: a
 * bright head with the charge trailing off behind it.
 *
 * Asymmetric on purpose. A symmetrical blob has no direction and reads as a
 * bead on a string; the tail is what makes it a thing travelling.
 */
/**
 * How bright the charge is, `t` of the way through one pulse. Head at 0.5,
 * sharp in front and smeared behind.
 *
 * A function rather than a shape baked into the canvas, because the far end of
 * the run has to be able to ask what is arriving *right now* — see `arrival`.
 * Reading it back off the texture would mean reading a pixel; this is the same
 * number the pixel was drawn from.
 */
function pulseProfile(t) {
  const d = t - 0.5;
  return d > 0 ? Math.exp(-((d / 0.03) ** 2)) : Math.exp(-((-d / 0.1) ** 1.3));
}

function pulseTexture() {
  const width = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, 1);
  for (let i = 0; i < width; i++) {
    const v = Math.round(255 * Math.min(1, pulseProfile(i / width)));
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

let pulses = null;
/** Every stretch of cable in the world, with the length it covers. */
const strands = [];
let level = 0;
let target = 0;
/** How far the pulses have travelled, in metres, since the current came on. */
let travelled = 0;

/**
 * Register a stretch of cable so the current runs through it.
 *
 * @param mesh a tube built with blackWireMaterial.
 * @param metres how long that tube actually is, which is the only way the
 *   pulses can be the same size and speed in every room: TubeGeometry lays u
 *   from 0 to 1 whether it is covering four metres or forty, so a scroll rate
 *   in texture space would run four times slower down the hall than across the
 *   ward.
 */
export function chargeWire(mesh, metres) {
  if (!pulses) pulses = pulseTexture();
  const map = pulses.clone();
  map.needsUpdate = true;
  map.repeat.set(metres / PULSE_SPACING, 1);

  mesh.material.emissive.set(FACE);
  mesh.material.emissiveMap = map;
  mesh.material.emissiveIntensity = 0;
  mesh.material.needsUpdate = true;

  strands.push({ material: mesh.material, map, metres });

  return {
    /**
     * What is arriving at the far end of this stretch this frame, 0 to 1.
     *
     * The charge has to land on something. A pulse that travels the length of
     * the building and then stops being drawn at the last vertex is a pulse
     * that goes nowhere; whatever is on the end of the cable asks this every
     * frame and does something with it — in the room behind the hall the face
     * brightens on every one, which is the whole point of the cable being
     * plugged into it.
     *
     * The value at u = 1 is the pattern at repeat + offset, and the fraction of
     * that is where in a pulse the end of the cable currently sits.
     */
    arrival() {
      if (level === 0) return 0;
      const at = metres / PULSE_SPACING + travelled / PULSE_SPACING;
      return level * pulseProfile(at - Math.floor(at));
    },
  };
}

/** Turn the whole run on or off. It fades rather than snapping. */
export function setWireCurrent(on) {
  target = on ? 1 : 0;
}

export function updateWireCurrent(delta) {
  if (target === 0 && level === 0) return;
  level += (target - level) * (1 - Math.exp(-2.6 * delta));
  // Snapped at the bottom, so a run that has been switched off stops costing
  // anything instead of easing towards zero for the rest of the session.
  if (target === 0 && level < 0.004) level = 0;
  // Wrapped at one pulse. It only ever moves the texture by a fraction of a
  // repeat, and an offset that climbs all evening loses precision doing it.
  travelled = (travelled + delta * PULSE_SPEED) % PULSE_SPACING;

  for (const strand of strands) {
    // In pulses rather than in metres, because the offset is in texture space.
    // Positive: measured, not reasoned about. Winding it the other way sent the
    // charge back up the hall towards the ward, which is the wrong way round —
    // the thing that just woke up came *here*.
    strand.map.offset.x = travelled / PULSE_SPACING;
    // Overdriven at the head, but not far: emissive is not exempt from tone
    // mapping and at 1 the green came back the colour of the face rather than
    // of something running through a cable. Pushed to 2.4 it went the other
    // way — the tail saturated with the head and the pulse stopped having a
    // front, which is the only thing that says which way it is going.
    strand.material.emissiveIntensity = level * 1.8;
  }
}
