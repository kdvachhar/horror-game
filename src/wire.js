import * as THREE from 'three';

/**
 * The black wire: what it is made of, and the fitting it goes into a wall
 * through.
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
