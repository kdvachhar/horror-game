import * as THREE from 'three';

/**
 * The lamps in the tall room, and the one light outside its way in.
 *
 * Out of tallRoom.js because it is the largest stretch of that file that puts
 * nothing into the world but meshes — no colliders, no openings, no geometry
 * anybody has to stand on. It reads the room's bounds and the hoist's window
 * and returns the fittings, which the room flickers.
 *
 * It is the easy half of that file's length. The hard half is the wall
 * builder, a thousand lines holding materials, sockets, platforms, refuges
 * and flights in one closure, and that is a redesign of how the room shares
 * state rather than a file split.
 */
export function buildTallRoomLights({ parent, bounds, out: OUT, port, window: WINDOW, trimMat }) {
  const group = parent;
  const { midX, midZ, minX, maxX, minZ, maxZ, HEIGHT } = bounds;

  /**
   * Three low lamps, then a run of them climbing to the window, then nothing.
   *
   * The three low ones are the room as it was, and the argument for them still
   * holds on the ground — you come in, the courses over your head are
   * unmistakable black rectangles, the next one up is a suggestion, and above
   * that is a great deal of nothing that you know from the two you can see is
   * not empty.
   *
   * The ones above them reverse a decision this file used to argue for at
   * length, and it is worth saying why rather than quietly deleting the note.
   * The old rule was that lighting the whole shaft turns it into a warehouse
   * with holes in it, and standing on the floor that is still true. What broke
   * it is the window in the east wall — the room at the top of the hoist looks
   * in through it, and it is the only eye that will ever be up there. An unlit
   * shaft seen from the *bottom* is a room you cannot see the top of, which is
   * frightening. An unlit shaft seen from a window part way up is a black
   * rectangle, which is nothing.
   *
   * So they climb to the window and stop there, and the height they climb to is
   * read off the window rather than written here. That is the whole reason this
   * is a loop: the hoist has moved its room up the wall twice now, and both
   * times a list of fixed heights would have left the glass looking at the one
   * stretch of wall nobody lit. Above the glass the lamps stop dead, because
   * above the glass is the part of this room that nothing has ever seen.
   *
   * They are on the east wall — the wall the window is in. A lamp on the far
   * side would be a glare in the middle of the view, and one beside the glass
   * would turn it into a mirror; lighting a room from the wall you are looking
   * out of is what lights it and not you. The one exception is any that would
   * land inside the opening itself, which get pushed along to the far end of
   * the wall where there is still wall to hang them on.
   *
   * Wall brackets rather than the hall's pendants throughout. A fitting hung on
   * a rod from a slab you cannot see is a fitting hanging from nothing.
   */
  const fittings = [];
  const BRACKETS = [
    [maxX - 0.5, 5.6, midZ + 3.4, 95, 26, -Math.PI / 2],
    [minX + 0.5, 5.6, midZ - 3.4, 95, 26, Math.PI / 2],
    // This one used to hang on the near wall at eleven metres. That wall is a
    // hole now for its whole bottom twelve, so it has come round onto the side
    // wall by the entrance — same height, same job of lighting the courses over
    // your head as you come in, on a wall that exists. It is also the first
    // light in the room you see, from the hall, through the opening.
    [minX + 0.5, 11.2, maxZ - 2.6, 70, 30, Math.PI / 2],
  ];

  /**
   * And the run climbing to the window.
   *
   * Higher wattage and longer range than the low ones, because there is nothing
   * up here for light to bounce off — fifteen metres of empty air across to the
   * far wall, and a lamp sized for the bottom of this room dies long before it
   * gets there.
   */
  const EYE = port ? port.cill : 24;
  /**
   * Six of them, spread over however far it is, rather than one every 7.5
   * metres however many that comes to. The window has climbed from 24 to 48 to
   * the top of the wall over three changes, and a fixed pitch turns each of
   * those into three or four more point lights in a forward renderer that
   * shades every surface with every one of them. The count is the thing worth
   * fixing; the spacing is what should give.
   *
   * They stop three metres *below* the glass, and that is the whole of what
   * this room has left to protect. The window is at the top now, so a run that
   * climbed to meet it would put a lamp within a metre of the ceiling — and a
   * lit ceiling is the end of the only idea this room has ever had, which is
   * that you stand at the bottom and cannot see the top. Stopping short costs
   * the view nothing: the window looks *down*, so down is what wants lighting,
   * and the last few metres of wall and the slab over it are no part of that.
   */
  const CLIMB = { from: 17.6, lamps: 6, under: 3.0 };
  const step = (EYE - CLIMB.under - CLIMB.from) / (CLIMB.lamps - 1);
  for (let n = 0, fy = CLIMB.from; n < CLIMB.lamps; fy += step, n++) {
    let fz = midZ + [-3.2, 0.4, 2.4, -1.6, 4.2][n % 5];
    // Not in the hole. The window is most of this wall at its own height, so a
    // bracket at the top of the run lands in the opening as often as not; the
    // far end of the wall is the piece of it the glass does not take.
    if (WINDOW && fy > EYE - 0.6 && Math.abs(fz - port.z) < port.width / 2 + 0.6) {
      fz = midZ - 5.0;
    }
    BRACKETS.push([maxX - 0.5, +fy.toFixed(2), fz, 112, 34, -Math.PI / 2]);
  }

  /**
   * And then the dead ones, all the way to the top, which carry no light at all.
   *
   * Fifty metres of unlit air above the last lamp is a ceiling that never
   * arrives, and that is the point of the height — but it is also fifty metres
   * with nothing in it to measure, and a distance you cannot measure is not a
   * distance, it is just dark. A row of fittings going up gives it a scale: they
   * get smaller, they get closer together, and the last one is a speck. It is
   * the lift shaft's trick — lamps as a beat you can count — used for size
   * rather than for speed.
   *
   * `watt` zero, and that is not a saving, it is the whole design. Every light
   * in this scene is a forward-rendered light that shades every fragment of
   * every surface and is compiled into the material, so eight more would cost
   * more than the fifty metres are worth, and it would also *work* — the top
   * would be lit, and the room's one idea is that it is not. A lens is an unlit
   * plane. It reads as a working lamp too far away to reach you, which is
   * exactly what it is.
   */
  for (let n = 0, fy = EYE + 6.4; fy < HEIGHT - 4; fy += 5.8, n++) {
    const east = n % 2 === 0;
    BRACKETS.push([
      east ? maxX - 0.5 : minX + 0.5,
      fy,
      midZ + [3.6, -2.8, 0.8][n % 3],
      0,
      0,
      east ? -Math.PI / 2 : Math.PI / 2,
    ]);
  }

  for (const [fx, fy, fz, watt, range, ry] of BRACKETS) {
    const bracket = new THREE.Group();
    bracket.position.set(fx, fy, fz);
    bracket.rotation.y = ry;
    group.add(bracket);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), trimMat);
    arm.position.z = 0.3;
    bracket.add(arm);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.42), trimMat);
    housing.position.set(0, -0.1, 0.66);
    housing.castShadow = true;
    bracket.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.06, 0.34),
      new THREE.MeshBasicMaterial({ color: '#cdd4cf', toneMapped: false })
    );
    lens.position.set(0, -0.26, 0.66);
    bracket.add(lens);

    let lamp = null;
    if (watt > 0) {
      lamp = new THREE.PointLight(0xc6d0cd, watt, range, 1.4);
      lamp.position.set(fx + Math.sin(ry) * 0.7, fy - 0.4, fz + Math.cos(ry) * 0.7);
      group.add(lamp);
    }
    // The dark ones are dimmer in the glass as well as unlit in the room. A lens
    // as bright as one four metres away, forty metres up, reads as a hole in the
    // dark rather than as a distant fitting.
    fittings.push({ lamp, lens, watt, level: 1, gain: lamp ? 1 : 0.34 });
  }

  // A lamp inside the way on, so it reads as a way on and not as a ninety-first
  // hole. It is the one opening in this room that is lit from the inside, which
  // is the whole of how you tell it from the others.
  {
    const lamp = new THREE.PointLight(0xc6d0cd, 40, 22, 1.4);
    lamp.position.set(OUT.x, 2.0, minZ - 1.1);
    group.add(lamp);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.3), trimMat);
    housing.position.set(OUT.x, OUT.height - 0.1, minZ - 1.1);
    group.add(housing);
    const lens = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.05, 0.22),
      new THREE.MeshBasicMaterial({ color: '#cdd4cf', toneMapped: false })
    );
    lens.position.set(OUT.x, OUT.height - 0.19, minZ - 1.1);
    group.add(lens);
  }

  return fittings;
}
