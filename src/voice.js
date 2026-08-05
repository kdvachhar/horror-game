/**
 * The voice, and the subtitles under it.
 *
 * Shared by everything in the game that talks: the thing in the dark at the end
 * of the first room, and the television in the medical room. It is the same
 * character speaking in both places, so there is one definition of how it
 * sounds and one subtitle bar, rather than a copy per scene that can drift.
 *
 * Browser text-to-speech is a PLACEHOLDER. Synthesised speech cannot sound like
 * a person — that needs a recording. `speak()` takes an optional `clip`, and if
 * one is present it is played instead of being synthesised, so swapping in real
 * audio is a per-line change and touches nothing else. A base64 data URI works,
 * which keeps the project asset-free.
 */

const STYLE = `
#subtitle {
  position: fixed; left: 50%; bottom: 12%; transform: translateX(-50%);
  max-width: min(860px, 82vw); text-align: center; z-index: 60; pointer-events: none;
  font-family: "Courier New", Courier, monospace; font-size: clamp(1rem, 2.1vw, 1.5rem);
  letter-spacing: 0.06em; line-height: 1.5; color: #dfe9e0;
  text-shadow: 0 0 18px rgba(0, 0, 0, 0.95), 0 2px 6px rgba(0, 0, 0, 0.9);
  opacity: 0; transition: opacity 0.25s;
}
#subtitle.show { opacity: 1; }
`;

/**
 * Best available voice for a boy, in order.
 *
 * An actual child voice if the system ships one. Failing that, a light voice
 * pitched up — which lands far closer to a boy than a man's voice pitched up
 * does, because raising a deep voice that far just sounds like a cartoon. The
 * default on most systems is the old formant synth, which is the robot this is
 * trying not to be, so it stays last.
 */
const VOICE_PREFERENCE = [
  /\b(junior|kid|child|boy)\b/i,
  // A light voice that is also one of the good neural ones.
  /(natural|neural|premium|enhanced).*(flo|sandy|shelley|zoe|ava|allison|samantha|karen|tessa|serena)/i,
  /(flo|sandy|shelley|zoe|ava|allison|samantha|karen|tessa|serena).*(natural|neural|premium|enhanced)/i,
  /\b(flo|sandy|shelley|zoe|ava|allison|samantha|karen|tessa|serena)\b/i,
  /natural/i,
  /neural/i,
  /google (uk|us) english/i,
  /premium|enhanced/i,
];

/** A boy: pitched well up, and a shade quick and eager with it. Above about
 *  1.6 it stops sounding like a child and starts sounding like a sped-up tape. */
const PITCH = 1.5;
const RATE = 1.02;

/**
 * Mouth shapes, one per vowel, as multipliers on the face's resting mouth.
 * `open` is how far it drops, `wide` how far it spreads — which is the whole
 * distinction that makes a rounded "oh" read differently from a flat "ee"
 * rather than everything being the same chew at a different speed.
 */
const SHAPES = {
  a: { open: 1.0, wide: 1.16 },
  e: { open: 0.6, wide: 1.14 },
  i: { open: 0.38, wide: 1.06 },
  o: { open: 0.86, wide: 0.72 },
  u: { open: 0.5, wide: 0.64 },
  y: { open: 0.42, wide: 1.02 },
};
/** Between syllables, and on consonants. */
const CLOSED = { open: 0.06, wide: 0.94 };
/** Not speaking. Sits at the mouth's drawn size. */
export const MOUTH_AT_REST = { open: 0.47, wide: 1 };

/** Seconds a syllable holds. A diphthong takes longer to get through. */
const SYLLABLE = 0.2;
const DIPHTHONG = 0.26;
const WORD_GAP = 0.06;
const COMMA_PAUSE = 0.2;
const SENTENCE_PAUSE = 0.34;

/**
 * Vowel groups of one word, which is close enough to its syllables for a face
 * that is a television. Handles the two English spellings that would otherwise
 * add a syllable that is never said: a silent final `e` ("awake" is two, not
 * three), except after another vowel or an `l`, where it is sounded ("able").
 */
function nucleiOf(word) {
  const w = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!w) return [];

  const groups = w.match(/[aeiouy]+/g) ?? [];
  if (groups.length > 1 && /e$/.test(w) && !/[aeiouy]e$/.test(w) && !/le$/.test(w)) {
    groups.pop();
  }
  // A word with no written vowel still gets a beat rather than being skipped.
  return groups.length ? groups : ['a'];
}

/** The vowel a group is heard as. Leading `y` is a consonant — "you" is "oo". */
function shapeFor(group) {
  const key = group.length > 1 && group[0] === 'y' ? group[1] : group[0];
  return SHAPES[key] ?? CLOSED;
}

/**
 * Turn a line into a timed list of mouth shapes.
 *
 * Each entry carries the character offset of the word it came from, so that
 * `onboundary` — where the browser supports it — can pull the playhead back
 * onto the word actually being spoken instead of letting the estimate drift.
 */
function buildSchedule(text) {
  const schedule = [];
  let at = 0;
  // Word plus whatever punctuation trails it, and where it starts in the line.
  const words = [...text.matchAll(/\S+/g)];

  for (const match of words) {
    const word = match[0];
    for (const group of nucleiOf(word)) {
      const span = group.length > 1 ? DIPHTHONG : SYLLABLE;
      schedule.push({ at, until: at + span * 0.78, shape: shapeFor(group), charIndex: match.index });
      at += span;
    }
    at += WORD_GAP;
    if (/[,;:—–]$/.test(word)) at += COMMA_PAUSE;
    else if (/[.!?…]$/.test(word)) at += SENTENCE_PAUSE;
  }
  return schedule;
}

let cachedVoice;

function pickVoice() {
  if (cachedVoice) return cachedVoice;

  const voices = speechSynthesis.getVoices();
  // Populated asynchronously in some browsers; leave it uncached and retry on
  // the next line rather than locking in the default.
  if (voices.length === 0) return null;

  const english = voices.filter((v) => /^en\b|^en[-_]/i.test(v.lang));
  const pool = english.length ? english : voices;

  for (const pattern of VOICE_PREFERENCE) {
    const match = pool.find((v) => pattern.test(v.name));
    if (match) return (cachedVoice = match);
  }
  return (cachedVoice = pool[0] ?? null);
}

let subtitle = null;

function ensureSubtitle() {
  if (subtitle) return subtitle;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  subtitle = document.createElement('div');
  subtitle.id = 'subtitle';
  document.body.appendChild(subtitle);
  return subtitle;
}

export function showSubtitle(text) {
  const element = ensureSubtitle();
  element.textContent = text;
  element.classList.add('show');
}

export function hideSubtitle() {
  ensureSubtitle().classList.remove('show');
}

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/**
 * Says one line and puts it on screen. `onEnd` fires when playback reports
 * finishing — callers must not rely on it alone, because browsers drop it when
 * the tab loses focus mid-sentence. Every caller keeps its own timer as a
 * backstop.
 */
export function speak(line, onEnd, onWord) {
  showSubtitle(line.text);

  if (line.clip) {
    const audio = new Audio(line.clip);
    audio.onended = () => onEnd?.();
    audio.play().catch(() => {});
    return;
  }

  if (typeof speechSynthesis === 'undefined') return;

  const utterance = new SpeechSynthesisUtterance(line.text);
  utterance.pitch = PITCH;
  utterance.rate = RATE;
  utterance.volume = 1;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.onend = () => onEnd?.();
  // Not supported everywhere — Safari in particular is unreliable here — so it
  // is a correction to the estimate, never the thing driving it.
  utterance.onboundary = (event) => {
    if (event.name && event.name !== 'word') return;
    onWord?.(event.charIndex ?? 0);
  };
  speechSynthesis.speak(utterance);
}

/**
 * Plays a list of lines in order, holding each for `hold` seconds past the end
 * of playback. Returns a handle whose `update(delta)` must be pumped from the
 * render loop, and whose `isSpeaking` says whether anything is still on screen.
 */
export function createSpeechRunner() {
  let lines = null;
  let index = 0;
  let timer = 0;
  let onFinished = null;

  // Mouth state: the shape schedule for the current line, and how far into it
  // we believe the voice has got.
  let schedule = null;
  let playhead = 0;
  let mouth = MOUTH_AT_REST;

  /** The shape due at `playhead`, or a closed mouth in the gaps between. */
  function shapeNow() {
    if (!schedule) return MOUTH_AT_REST;
    for (const syllable of schedule) {
      if (playhead < syllable.at) break;
      if (playhead < syllable.until) return syllable.shape;
    }
    // Past the end of the line: the estimate ran out before the voice did.
    return playhead > schedule[schedule.length - 1]?.until ? MOUTH_AT_REST : CLOSED;
  }

  return {
    get isSpeaking() {
      return lines !== null;
    },
    /** The line currently on screen, or null. Lets a face animate to it. */
    get line() {
      return lines ? lines[index] : null;
    },

    /**
     * The mouth shape for the syllable being spoken right now, as `open` and
     * `wide` multipliers. A face should ease toward this rather than snap to
     * it — real mouths do not teleport between shapes.
     */
    get mouth() {
      return mouth;
    },

    play(nextLines, done) {
      lines = nextLines;
      index = 0;
      onFinished = done;
      stopSpeaking();
      say();
    },

    stop() {
      lines = null;
      onFinished = null;
      schedule = null;
      mouth = MOUTH_AT_REST;
      stopSpeaking();
      hideSubtitle();
    },

    update(delta) {
      if (!lines) return;

      playhead += delta;
      mouth = shapeNow();

      timer -= delta;
      if (timer > 0) return;

      index++;
      if (index < lines.length) {
        say();
        return;
      }

      lines = null;
      schedule = null;
      mouth = MOUTH_AT_REST;
      hideSubtitle();
      const done = onFinished;
      onFinished = null;
      done?.();
    },
  };

  function say() {
    const line = lines[index];
    // The backstop, not the primary clock: onEnd shortens it when playback
    // actually reports finishing.
    timer = line.hold + 2.5;
    schedule = buildSchedule(line.text);
    playhead = 0;

    speak(
      line,
      () => {
        if (lines && lines[index] === line) timer = Math.min(timer, line.tail ?? 0.5);
      },
      (charIndex) => {
        // A word boundary from the browser. Pull the playhead onto that word,
        // but only when it has drifted far enough to be worth a jump —
        // correcting every few milliseconds would make the mouth stutter.
        if (!schedule || lines?.[index] !== line) return;
        const next = schedule.find((syllable) => syllable.charIndex >= charIndex);
        if (next && Math.abs(next.at - playhead) > 0.12) playhead = next.at;
      }
    );
  }
}
