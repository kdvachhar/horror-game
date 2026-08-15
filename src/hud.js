import { playObjectiveBlip } from './audio.js';

// Thin wrapper over the DOM overlay. Kept separate so game code never reaches
// into the document directly.

const objective = document.getElementById('objective');
const objectiveText = document.getElementById('objective-text');
const prompt = document.getElementById('prompt');
const promptLabel = document.getElementById('prompt-label');
const promptKey = document.getElementById('prompt-key');
const note = document.getElementById('note');

let currentPrompt = null;
let currentKey = null;
let noteTimer = null;

/**
 * A line about something you just did, which clears itself.
 *
 * Deliberately not setObjective: an objective is a thing still to do and it
 * stays until it is done. "Your friend is waiting here" is neither — it is an
 * acknowledgement, and putting it in the objective plate would overwrite what
 * you are actually meant to be doing with it.
 */
export function showNote(text, seconds = 1.8) {
  note.textContent = text;
  note.classList.add('visible');
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => note.classList.remove('visible'), seconds * 1000);
}

export function setObjective(text) {
  if (objectiveText.textContent === text) return;
  objectiveText.textContent = text;

  // Removing the class and forcing a reflow restarts the CSS animation —
  // without the reflow the browser coalesces both changes and nothing plays.
  objective.classList.remove('updated');
  void objective.offsetWidth;
  objective.classList.add('updated');

  playObjectiveBlip();
}

/** `key` is the key cap shown beside the label — E to interact, F to possess. */
export function showPrompt(label, key = 'E') {
  if (label === currentPrompt && key === currentKey) return;
  currentPrompt = label;
  currentKey = key;

  if (label) {
    promptLabel.textContent = label;
    promptKey.textContent = key;
    prompt.classList.add('visible');
  } else {
    prompt.classList.remove('visible');
  }
}
