/**
 * What a collider is, and the three questions both bodies ask of one.
 *
 * These lived twice, once in player.js and once in friend.js, in copies kept
 * in step by hand. The friend's copy says so out loud — "the two bodies have
 * to mean the same thing by every field on a collider" and "See player.js" —
 * which is the right instinct maintained by the wrong mechanism. It held for
 * `resolveCollisions` and `supportHeight` and then failed on the third
 * function, where the two ended up disagreeing about what a ceiling is.
 *
 * ── a collider ────────────────────────────────────────────────────────────
 *
 * An axis-aligned box in world space. `minX/maxX/minZ/maxZ` are required;
 * everything else is optional and changes what the box *means*, including by
 * being absent:
 *
 *   top         The surface you can stand on. Absent means the box is solid
 *               at every height below its top — a wall, a pillar, the
 *               machine — and there is nothing to climb onto.
 *
 *   bottom      Its underside. A box with one is a plate in the air with open
 *               space beneath, so passing below it is not passing through it,
 *               and it is the thing your head stops against. Decks declare it
 *               a hair under their own surface rather than under the plate,
 *               because what stops you is the floor and a floor stops you by
 *               being under your feet.
 *
 *   passHeight  A gap only something shorter than this fits through. The
 *               medical room's broken window, which is how the bucket gets in
 *               and the player does not.
 *
 *   rise        How far `top` climbed this frame. Only the hoist sets it. A
 *               floor that comes up under a body in mid air has to carry it
 *               rather than eject it sideways, and the distance it is allowed
 *               to catch up by is the distance it actually moved.
 *
 *   stopsFriend A box that is there for the bucket and not for you. The
 *               inverse of `passHeight`: not a hole too small for a body, but
 *               a body that will not go somewhere.
 *
 *   enabled()   The box can gate itself — a doorway solid only while the door
 *               is down, a deck that is only standable once its wall has run
 *               it out.
 *
 * ── and a body ────────────────────────────────────────────────────────────
 *
 * `{ radius, height, stepHeight, kind }`, where `kind` is PLAYER or FRIEND and
 * decides `stopsFriend` and nothing else. Everything that changes frame to
 * frame — where it is, whether it is grounded, where it was — is passed per
 * call, so these stay pure and can be flooded over a fixture offline. See
 * test/world.test.js.
 */

export const PLAYER = 'player';
export const FRIEND = 'friend';

/** True when this box is something this body has to care about at all. */
function concerns(box, body) {
  if (box.enabled?.() === false) return false;
  // There for the bucket and not for you.
  if (box.stopsFriend && body.kind !== FRIEND) return false;
  return true;
}

/** True when the body's footprint overlaps this box in plan view. */
export function overlaps(box, x, z, radius) {
  return x > box.minX - radius && x < box.maxX + radius && z > box.minZ - radius && z < box.maxZ + radius;
}

/**
 * Push a body out of anything it is standing inside, along whichever axis it
 * overlaps least — which slides it around corners instead of sticking.
 *
 * `at` is read and written: pass the candidate position, get the resolved one.
 */
export function pushOut(colliders, body, at) {
  const r = body.radius;

  for (const box of colliders) {
    if (!concerns(box, body)) continue;
    // Anything the body has climbed above no longer blocks it, widened by
    // however far this box's top rose this frame. See `rise`.
    if (at.feetY >= (box.top ?? Infinity) - 0.02 - (box.rise ?? 0)) continue;
    // Low enough to walk up onto rather than be stopped by. Only from the
    // ground — stepping in mid air would drag a body onto ledges it jumped
    // past, and the point of a step is that your feet are on something.
    if (at.grounded && box.top !== undefined && box.top - at.feetY <= body.stepHeight) continue;
    // A gap only short things fit through.
    if (body.height <= (box.passHeight ?? -Infinity)) continue;
    // Ducked clean under it.
    if (at.feetY + body.height <= (box.bottom ?? -Infinity)) continue;
    if (!overlaps(box, at.x, at.z, r)) continue;

    const pushLeft = at.x - (box.minX - r);
    const pushRight = box.maxX + r - at.x;
    const pushBack = at.z - (box.minZ - r);
    const pushFront = box.maxZ + r - at.z;
    const smallest = Math.min(pushLeft, pushRight, pushBack, pushFront);

    if (smallest === pushLeft) at.x = box.minX - r;
    else if (smallest === pushRight) at.x = box.maxX + r;
    else if (smallest === pushBack) at.z = box.minZ - r;
    else at.z = box.maxZ + r;
  }

  return at;
}

/**
 * The highest surface under the body it could land on this frame, or 0.
 *
 * `previousFeetY` is the guard and the whole point: a surface only supports
 * you if you were already above it, or you get snapped up through anything you
 * merely bump into — walking into the side of a bed used to teleport the
 * bucket 0.86 into the air and leave it standing on top.
 *
 * Grounded, that reach opens to a step's worth, which is what carries a body
 * onto the thing `pushOut` just let it walk into. Airborne it is a hair —
 * except against a surface that came up to meet it, which is allowed the
 * distance it actually climbed, and that is what lets the hoist collect a
 * bucket that was off the deck when it started moving.
 */
export function supportHeight(colliders, body, at) {
  let ground = 0;
  for (const box of colliders) {
    const top = box.top;
    if (top === undefined) continue;
    if (!concerns(box, body)) continue;
    const reach = Math.max(at.grounded ? body.stepHeight : 0.02, (box.rise ?? 0) + 0.02);
    if (top > at.previousFeetY + reach) continue;
    if (top <= ground) continue;
    if (!overlaps(box, at.x, at.z, body.radius)) continue;
    ground = top;
  }
  return ground;
}

/**
 * The lowest underside over the body's head, or Infinity where there is sky.
 *
 * `previousHeadY` is this function's version of the same guard, and it is what
 * makes the rule safe on a staircase — which is not obvious and is worth
 * writing down, because the player briefly grew a separate `ceiling` field to
 * dodge a problem this already solves.
 *
 * Every deck in the tall room carries a `bottom`. The treads of a flight are
 * 2.2 deep on a 1.7 pitch, so they overlap: standing on one, the tread 0.7
 * above is partly over your head. Taking the lowest underside flatly would
 * read it as a ceiling and clamp a body down through the floor of its own
 * staircase. But that tread's underside is at feet + 0.68 and the head is at
 * feet + 1.78, so it is already *below* the head — cleared — and the guard
 * drops it. A room's lid at 3.6 over a head at 2.6 is not cleared, and is
 * caught. Both come out right under one rule.
 */
export function ceilingHeight(colliders, body, at) {
  let lowest = Infinity;
  for (const box of colliders) {
    if (box.bottom === undefined) continue;
    if (!concerns(box, body)) continue;
    if (box.bottom < at.previousHeadY - 0.02) continue;
    if (box.bottom >= lowest) continue;
    if (!overlaps(box, at.x, at.z, body.radius)) continue;
    lowest = box.bottom;
  }
  return lowest;
}

/**
 * ── and the schema, enforced ──────────────────────────────────────────────
 *
 * The fields above are a tagged union held together by prose. That was
 * survivable while two files read it and both were written by the same person
 * in the same week; it stops being survivable the moment a field is renamed,
 * because a collider with a key nobody reads does not fail — it silently
 * means something else. `ceiling` was exactly that for two days: thirteen
 * boxes carrying a field that one body honoured and the other had never heard
 * of.
 *
 * So: a known-key list, checked. The unknown-key rule is the one that earns
 * its keep — a typo, or a field deleted from the reader and left on the
 * writer, is otherwise invisible.
 */
const KNOWN = new Set([
  'minX', 'maxX', 'minZ', 'maxZ',
  'top', 'bottom', 'passHeight', 'rise', 'stopsFriend', 'enabled',
]);

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Everything wrong with one collider, as a list of sentences. Empty is good. */
export function checkCollider(box) {
  const wrong = [];
  if (!box || typeof box !== 'object') return ['not an object'];

  for (const edge of ['minX', 'maxX', 'minZ', 'maxZ']) {
    if (!finite(box[edge])) wrong.push(`${edge} is not a finite number`);
  }
  if (finite(box.minX) && finite(box.maxX) && box.minX > box.maxX) wrong.push('minX is past maxX');
  if (finite(box.minZ) && finite(box.maxZ) && box.minZ > box.maxZ) wrong.push('minZ is past maxZ');

  for (const field of ['top', 'bottom', 'passHeight', 'rise']) {
    if (box[field] !== undefined && !finite(box[field])) wrong.push(`${field} is not a finite number`);
  }
  // A box cannot have its underside above its surface.
  if (finite(box.top) && finite(box.bottom) && box.bottom > box.top) {
    wrong.push(`bottom ${box.bottom} is above top ${box.top}`);
  }
  // `rise` is how far `top` moved. Without a top it describes nothing.
  if (box.rise !== undefined && box.top === undefined) wrong.push('rise without top');
  if (box.enabled !== undefined && typeof box.enabled !== 'function') wrong.push('enabled is not a function');
  if (box.stopsFriend !== undefined && typeof box.stopsFriend !== 'boolean') {
    wrong.push('stopsFriend is not a boolean');
  }

  for (const key of Object.keys(box)) {
    if (!KNOWN.has(key)) wrong.push(`unknown field \`${key}\``);
  }
  return wrong;
}

/**
 * Check the whole world and report, rather than throw.
 *
 * Reporting because a bad collider is a thing to fix, not a reason the game
 * should refuse to start — and because the first run of this found nothing,
 * which is only reassuring if it would have printed something had it not.
 */
export function validateColliders(colliders, log = console.warn) {
  const faults = [];
  colliders.forEach((box, i) => {
    for (const fault of checkCollider(box)) faults.push({ i, fault, box });
  });
  if (faults.length) {
    log(`collision: ${faults.length} bad collider${faults.length === 1 ? '' : 's'}`);
    for (const { i, fault, box } of faults.slice(0, 20)) {
      log(`  [${i}] ${fault}`, box);
    }
  }
  return faults;
}
