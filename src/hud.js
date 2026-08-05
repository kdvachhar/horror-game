import { playObjectiveBlip } from './audio.js';

// Thin wrapper over the DOM overlay. Kept separate so game code never reaches
// into the document directly.

const objective = document.getElementById('objective');
const objectiveText = document.getElementById('objective-text');
const prompt = document.getElementById('prompt');
const promptLabel = document.getElementById('prompt-label');
const promptKey = document.getElementById('prompt-key');

let currentPrompt = null;
let currentKey = null;

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
