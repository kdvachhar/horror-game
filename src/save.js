/**
 * Where you had got to, kept between sessions.
 *
 * One value in localStorage and nothing else, and the value is a room — not a
 * position, not a camera angle, not a list of which doors are open. The
 * reason is that this game already has a complete, tested way of putting the
 * world into a given state: the twenty-two scene jumps in main.js, each of
 * which winds everything back and then stands the building up at one beat of
 * the story. `npm run check:scenes` walks all of them every time anything
 * changes.
 *
 * So a save is an index into that list. Loading is the same code path the
 * debug menu and the test harness have been using since the second room was
 * built, which means the save can never restore a state the game cannot
 * actually be in — the failure mode of every save system that serialises the
 * world a field at a time.
 *
 * What it costs is granularity. You come back to the door of the room you
 * were last in rather than to the exact spot you were standing on, and
 * anything you had solved in that room is unsolved again. For a game that is
 * twenty minutes end to end and whose rooms are five minutes each at the
 * outside, that is the right trade; for a longer one it would not be.
 *
 * Everything here is wrapped, because localStorage is not a safe call. In a
 * private window, with site data blocked, or inside some embedded webviews,
 * reading it throws rather than returning null — and a game that will not
 * boot because it could not find out whether you had played it before is a
 * worse bug than having no saves at all.
 */

const KEY = 'friend-factory/progress';

/** The shape, version included so a later change can refuse an older file. */
const VERSION = 1;

export function readSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || save.version !== VERSION) return null;
    if (!Number.isInteger(save.room) || save.room < 0) return null;
    return save;
  } catch {
    return null;
  }
}

/**
 * @param room  index into the scene list
 * @param label that scene's own name, written alongside so the menu can say
 *              where you are going back to without having to boot the game
 *              first to find out.
 */
export function writeSave(room, label) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: VERSION, room, label, at: new Date().toISOString() })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it and nothing that depends on it having worked.
  }
}
