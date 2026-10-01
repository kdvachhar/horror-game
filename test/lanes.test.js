/**
 * The invariants that define a working ladder.
 *
 * Every assertion here is one that was false at some point in the tall room's
 * history, and each time it was found by driving the game in a browser and
 * reading heights off a flood fill. They are arithmetic, so they can be found
 * in a millisecond instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { bounce, makeBands, planClimb, refugeLane, LANE_START } from '../src/climbLanes.js';

/** The room as it is actually built: 17 courses, 5 columns, walls 4-1-3-2. */
const ORDER = [3, 0, 2, 1];
const COURSES = 17;
const COLUMNS = 5;

const plan = planClimb({ order: ORDER, courseCount: COURSES, columnCount: COLUMNS });

/** Every (wall, course) pair the climb actually uses. */
function* owned(p = plan) {
  for (const wall of p.order) {
    for (let c = p.bands[wall].from; c <= p.bands[wall].to; c++) yield [wall, c];
  }
}

test('bounce never leaves the wall', () => {
  for (let n = -40; n < 200; n++) {
    const v = bounce(n, COLUMNS);
    assert.ok(v >= 0 && v < COLUMNS, `bounce(${n}) = ${v}`);
  }
});

test('bounce steps one column at a time, including across the turns', () => {
  // The whole reason it is a triangle wave and not a modulo: a wrapping
  // counter gets this right four times in five and then jumps 4 -> 0, which
  // is 10.8 metres of air.
  for (let n = -40; n < 200; n++) {
    assert.equal(Math.abs(bounce(n + 1, COLUMNS) - bounce(n, COLUMNS)), 1);
  }
});

test('the bands cover every course exactly once, with the remainder last', () => {
  const bands = makeBands(ORDER, COURSES);
  const seen = [];
  for (const wall of ORDER) {
    const { from, to } = bands[wall];
    assert.ok(to >= from, `wall ${wall} has an empty band`);
    for (let c = from; c <= to; c++) seen.push(c);
  }
  assert.deepEqual(
    seen,
    Array.from({ length: COURSES }, (_, i) => i),
    'bands must tile the courses in climb order with no gap and no overlap'
  );

  // The spare course goes to the last band, which is the one with no handover
  // above it. Anywhere else and that handover gets longer — measured at 3.66m
  // against a 2.1m jump.
  const sizes = ORDER.map((w) => bands[w].to - bands[w].from + 1);
  const last = sizes[sizes.length - 1];
  assert.ok(
    sizes.slice(0, -1).every((n) => n <= last),
    `remainder is not on the last band: ${sizes.join(',')}`
  );
});

test('every band starts its walk on the middle column', () => {
  // What makes every handover the short one: middle to middle across a corner
  // is 1.22m and the next best pairing is 2.03m.
  const middle = bounce(LANE_START, COLUMNS);
  for (const wall of ORDER) {
    assert.equal(plan.laneIn(wall, plan.bands[wall].from), middle);
  }
});

test('a course never puts two things in one socket', () => {
  // The bug that stopped the climb at 7.67m of a 76m shaft: the refuge was
  // `bounce(rung - 1)` and the outward flight `bounce(rung + 1)`, which are
  // the same column every time the rung lands on a turn of the wave. Re-basing
  // the walk on the band made every rung even and put half of them on exactly
  // those turns.
  for (const [wall, course] of owned()) {
    const into = plan.laneIn(wall, course);
    const out = plan.laneOut(wall, course);
    const hole = refugeLane(plan, wall, course);
    assert.notEqual(into, out, `wall ${wall} course ${course}: both flights in one socket`);
    // The refuge is stacked above the arrival flight rather than beside it, so
    // it shares that column deliberately and must not share the other.
    assert.equal(hole, into, `wall ${wall} course ${course}: refuge left its flight`);
    assert.notEqual(hole, out, `wall ${wall} course ${course}: refuge ate the stair`);
  }
});

test("a course's two flights are on adjacent columns", () => {
  // The step across at the wall. At 2.7m apart it is a move a body can make;
  // two columns is 5.4 and it is not.
  for (const [wall, course] of owned()) {
    assert.equal(Math.abs(plan.laneOut(wall, course) - plan.laneIn(wall, course)), 1);
  }
});

test('the climb chains from each course to the one above it', () => {
  // Course k's outward tip and course k+1's inward tip are at the same height
  // by construction — half a course up from one is half a course down from the
  // next — so the only thing that can break the chain is the columns drifting
  // apart. This is the assertion that fails the moment a flight goes missing.
  for (const wall of plan.order) {
    const { from, to } = plan.bands[wall];
    for (let c = from; c < to; c++) {
      assert.equal(
        Math.abs(plan.laneOut(wall, c) - plan.laneIn(wall, c + 1)),
        1,
        `wall ${wall}: course ${c} does not reach course ${c + 1}`
      );
    }
  }
});

test('the room stays sound at other sizes', () => {
  // The bands are worked out rather than written down so that changing the
  // room's height re-cuts them. If that is true, the invariants hold for any
  // plausible shaft — and if it is not, this is where it shows.
  for (let courses = 4; courses <= 40; courses++) {
    for (const columnCount of [3, 4, 5, 6, 7]) {
      const p = planClimb({ order: ORDER, courseCount: courses, columnCount });
      const label = `${courses} courses x ${columnCount} columns`;

      const seen = [];
      for (const wall of ORDER) {
        for (let c = p.bands[wall].from; c <= p.bands[wall].to; c++) seen.push(c);
      }
      assert.equal(seen.length, courses, `${label}: bands do not tile`);

      for (const [wall, course] of owned(p)) {
        assert.notEqual(
          p.laneIn(wall, course),
          p.laneOut(wall, course),
          `${label}: wall ${wall} course ${course} has both flights in one socket`
        );
      }
      for (const wall of p.order) {
        const { from, to } = p.bands[wall];
        for (let c = from; c < to; c++) {
          assert.equal(
            Math.abs(p.laneOut(wall, c) - p.laneIn(wall, c + 1)),
            1,
            `${label}: wall ${wall} breaks between ${c} and ${c + 1}`
          );
        }
      }
    }
  }
});
