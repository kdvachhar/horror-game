import * as THREE from 'three';
import { buildTelevision, createScreenLife } from './screenFace.js';

/**
 * The front of the game: a name, a face, and two ways in.
 *
 * **The face is the real one.** It would have been quicker to draw the thing
 * as an SVG — it is two blocky eyes and a stepped mouth on a grey tube — and
 * it would have been wrong within a week, because the character is built in
 * screenFace.js and anything traced off it is a second copy that stops
 * agreeing with the first the moment either moves. So the title screen gets
 * its own small scene with the actual television in it, lit by its own glow,
 * blinking and breathing on the same `createScreenLife` the ward and the
 * console run on. It is the thing you are about to meet, not a picture of it.
 *
 * It costs a second WebGL context, which is the one real price here and is
 * paid only while the menu is up: the loop below renders nothing when the
 * screen is not visible, and the only time both contexts are drawing is a
 * menu over a paused building.
 *
 * It does not speak. The speech runner puts subtitles on screen and this
 * character's first line is a thing the ward is supposed to deliver.
 */

/**
 * How the set sits in the frame, and it is one number against one measurement.
 *
 * The television is 3.8 across. At a 38 degree vertical field on a three-by-two
 * panel, five metres back shows 5.1 of width — so the casing lands with a
 * finger's width of air either side of it and the wires out of the top and
 * bottom run off the frame, which is what wires are for. Closer than about
 * 4.7 and the bezel is cropped, which reads as a photograph of a television
 * rather than as a television.
 */
const SHOT = { distance: 5.0, height: 0.02, tilt: 0.02 };

export function createTitleScreen({ onNewGame, onLoadGame, save }) {
  const overlay = document.getElementById('overlay');
  const canvas = document.getElementById('title-face');
  const loadButton = document.getElementById('menu-load');
  const newButton = document.getElementById('menu-new');
  const where = document.getElementById('menu-where');

  // ------------------------------------------------------------ the portrait
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  // The same film as the game. The face itself is exempt from tone mapping —
  // see screenMaterial — so what this actually matches is the casing, which
  // is the part either film would otherwise disagree about.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.42;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40);
  camera.position.set(0, SHOT.height, SHOT.distance);
  camera.rotation.set(-SHOT.tilt, 0, 0, 'YXZ');

  const set = buildTelevision();
  set.group.position.y = -0.1;
  scene.add(set.group);

  /**
   * Two lamps and both of them low.
   *
   * The casing is a standard material and in a scene with no lights it is a
   * silhouette round a bright face — which is very nearly the right picture,
   * so these only lift it off the black rather than light it. The key is
   * off to the left at head height because the menu is on the right and the
   * shadow side should be the side the eye travels toward.
   */
  const key = new THREE.PointLight('#aebfae', 16, 11, 1.7);
  key.position.set(-3.2, 1.9, 3.0);
  scene.add(key);
  scene.add(new THREE.AmbientLight('#2a3630', 1.4));

  const life = createScreenLife({
    eyes: set.eyes,
    mouth: set.mouth,
    faceParts: set.faceParts,
    glow: set.glow,
  });

  let time = 0;
  let sized = 0;

  const resize = () => {
    const wide = canvas.clientWidth;
    const high = canvas.clientHeight;
    if (!wide || !high) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (sized === wide * 10000 + high) return;
    sized = wide * 10000 + high;
    renderer.setPixelRatio(ratio);
    renderer.setSize(wide, high, false);
    camera.aspect = wide / high;
    camera.updateProjectionMatrix();
  };

  // ------------------------------------------------------------- the buttons
  /**
   * Whether there is anything to load, said in the button rather than behind
   * it. A disabled control that explains itself is better than one that
   * takes the click and does nothing, and better than hiding it — a menu
   * that changes shape depending on history is a menu you cannot learn.
   */
  const offerSave = (held) => {
    loadButton.disabled = !held;
    where.textContent = held ? held.label.replace(/^\d+ · /, '') : 'No game saved yet';
  };
  offerSave(save);

  loadButton.addEventListener('click', (event) => {
    if (loadButton.disabled) return;
    event.stopPropagation();
    onLoadGame?.();
  });
  newButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onNewGame?.();
  });

  return {
    /** The menu is up whenever the overlay is, which the body class decides. */
    get isUp() {
      return !document.body.classList.contains('playing');
    },

    /** Tell the menu a save has appeared or moved on. */
    setSave(held) {
      offerSave(held);
    },

    update(delta) {
      if (!this.isUp) return;
      // And nothing at all when the panel has no size — the overlay is
      // display:none in every harness in tools/, and a renderer told to draw
      // into a zero-width canvas is work nobody can see.
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      resize();
      time += delta;
      // A slow look round the room it is in, which is the only motion in the
      // shot other than the face's own. Small: this is a portrait, and a
      // turntable would make it a product.
      set.group.rotation.y = Math.sin(time * 0.26) * 0.11;
      set.group.rotation.x = Math.sin(time * 0.19 + 1) * 0.03;
      life.update(delta, 1);
      renderer.render(scene, camera);
    },
  };
}
