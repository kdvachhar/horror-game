/**
 * The arithmetic of the tall room's banded ladder, and nothing else.
 *
 * Extracted from tallRoom.js because it is the one part of that room that is
 * pure — no three.js, no scene, no colliders, just which column of which wall
 * a flight is on. That makes it the one part that can be checked in a
 * millisecond instead of a ninety-second headless boot, and it is also where
 * the two worst bugs in the room came from:
 *
 *   - the refuge being cut into the socket the outward flight needed, every
 *     time the lane walk turned at the end of a wall, which stopped the climb
 *     at 7.67m of a seventy-six metre shaft;
 *   - and before that, the band gating turning off two different things at
 *     once, which bricked up a third of every wall.
 *
 * Both are invariants over these functions and nothing else. See
 * test/lanes.test.js, which states them.
 */

/**
 * A triangle wave, not a modulo.
 *
 * The two flights of a course and the flight of the course above it have to be
 * on *adjacent* columns: that is the step across at the wall and the jump
 * across in the middle, and at 2.7 apart both are something a body can do. A
 * wrapping counter gets that right four times out of five and then jumps from
 * column 4 to column 0, which is 10.8 metres of air. Bouncing off the ends
 * instead means every consecutive pair is one column apart, always.
 */
export function bounce(n, span) {
  const period = 2 * (span - 1);
  const r = ((n % period) + period) % period;
  return r < span ? r : period - r;
}

/**
 * Where a wall's lane walk starts: the middle column, every time.
 *
 * The bounce is re-based on the band rather than run from course zero, and the
 * reason is the handover. A band's first inward flight is the thing the band
 * below has to reach, and the middle column is the one place on a wall that is
 * nearest to every adjacent wall's middle — measured, not guessed: middle to
 * middle across a corner is 1.22m and the next best pairing is 2.03m. Starting
 * every band at the same column makes every handover the short one.
 *
 * It only fixes one end. A band's lanes are a walk of 2n entries stepping one
 * column at a time, so getting back to where it started would take an odd
 * number of steps to undo an even displacement, which cannot be done — the
 * last outward flight of a band is always one column off the middle, and
 * always 2.03m from the next band's first. That is what the landings are for.
 */
export const LANE_START = 2;

/**
 * Cut the courses into one band per wall, in climb order.
 *
 * `Math.floor`, so the remainder falls on the *last* band, and that is not a
 * rounding preference — it is the only place it can go without costing a
 * handover. How far a band's last outward flight finishes from the next band's
 * first inward flight depends on how many courses the band had, because the
 * lane walk is a triangle wave and where it has got to by the end is a
 * function of its length. Measured: bands of three or four courses end one
 * column off the middle and hand over across 2.03m; bands of five or six end
 * three columns off and hand over across 3.66m. Seventeen courses over four
 * walls has to put a spare course somewhere, and the last band is the one with
 * nothing above it to reach — its top is the hub, which is a deck the room
 * builds deliberately rather than a gap anybody has to cross. So the long band
 * goes there and all three real handovers stay short.
 *
 * Returned indexed by wall, not by position in `order`, because every caller
 * has a wall index in hand and none of them has a step number.
 */
export function makeBands(order, courseCount) {
  const out = [];
  let at = 0;
  order.forEach((wall, k) => {
    const left = order.length - k;
    const size = left === 1 ? courseCount - at : Math.floor((courseCount - at) / left);
    out[wall] = { from: at, to: at + size - 1, step: k };
    at += size;
  });
  return out;
}

/**
 * The whole lane plan for a room: which wall owns which courses, and which
 * column each course's two flights sit in.
 *
 * One object rather than loose functions so that a caller cannot pick up
 * `laneIn` while holding somebody else's `bands` — which is the shape the bug
 * took when the walk was re-based and half the room went on using the old
 * numbering.
 */
export function planClimb({ order, courseCount, columnCount }) {
  const bands = makeBands(order, courseCount);

  const owns = (wall, course) => course >= bands[wall].from && course <= bands[wall].to;
  /** How far into its band this course is, counted in flights rather than courses. */
  const rung = (wall, course) => (course - bands[wall].from) * 2 + LANE_START;
  /** The flight you walk in along, and the one you walk out along. */
  const laneIn = (wall, course) => bounce(rung(wall, course), columnCount);
  const laneOut = (wall, course) => bounce(rung(wall, course) + 1, columnCount);

  return { bands, owns, rung, laneIn, laneOut, order, courseCount, columnCount };
}

/**
 * Where the refuge goes: the column of the flight you arrive on.
 *
 * It is not a choice any more and this function is nearly a rename, which is
 * the point — it used to pick a column clear of both flights, and picking is
 * what went wrong. `bounce(rung - 1)` against an outward flight of
 * `bounce(rung + 1)` is the same column every time the rung lands on a turn of
 * the wave, because the wave comes back down the way it went up. Re-basing the
 * walk made every rung even and put half of them on exactly those turns.
 *
 * Stacked on its own flight there is nothing to collide with: the refuge sits
 * above that socket rather than instead of it.
 */
export function refugeLane(plan, wall, course) {
  return plan.laneIn(wall, course);
}
