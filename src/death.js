/**
 * The screen you get when something in the building kills you.
 *
 * One line of text on black, and a way back. That is the whole of it, and the
 * restraint is the point rather than an economy.
 *
 * A death screen is read at the worst possible moment — you have just lost
 * whatever you were in the middle of — and the two things it can do are tell
 * you what happened and get out of the way. Anything else it does is
 * punishment on top of the punishment: a slow wipe, a stinger, a score, a menu
 * with your hand on the mouse. This game's one death is a thing you walked
 * into on purpose from seventy metres away, so the screen's job is to name
 * that, in one sentence, and then take any key at all.
 *
 * The line is handed in rather than written here. The screen knows how to be a
 * death screen; the room that killed you knows what it did. There is one
 * caller today and the moment there are two, the second one would have had to
 * put its own sentence somewhere anyway.
 *
 * It does not fade in. Whatever killed you is expected to arrive with the
 * screen already black — the meat cube's version drives the camera down its
 * own throat, which is an unlit black plane, so by the time this appears the
 * black has been there for half a second and came from something in the world.
 * A screen that fades to black itself would throw that away and announce, in
 * the same gesture every game uses, that a state had changed.
 *
 * The text fades, though, and slowly. Black, a held beat of nothing, and then
 * words — which is the order that reads as coming round rather than as a
 * screen being shown to you.
 */

const STYLE = `
#death {
  position: fixed; inset: 0; z-index: 90;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 2.2rem;
  background: #000;
  font-family: "Courier New", Courier, monospace;
  opacity: 0; pointer-events: none;
  transition: opacity 0.35s linear;
}
#death.up { opacity: 1; pointer-events: auto; cursor: pointer; }

#death p {
  /* The same grey-green the start screen is set in. This is the second time
     the game has spoken to you directly rather than through the world, and it
     should be recognisably the same voice as the first. */
  color: #9aa79c;
  font-size: clamp(1rem, 3.4vw, 1.5rem);
  letter-spacing: 0.34em;
  /* letter-spacing puts a gap after the last character too, which walks the
     line off centre by half a space. */
  text-indent: 0.34em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 1.1s linear;
}
#death small {
  color: #4a524c;
  font-size: 0.72rem;
  letter-spacing: 0.24em; text-indent: 0.24em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 0.8s linear;
}
#death.said p, #death.said small { opacity: 1; }

/* Nothing from the running game on top of it. */
body.dead #crosshair,
body.dead #prompt,
body.dead #objective,
body.dead #subtitle { opacity: 0 !important; }
`;

/** Black, then the line. Long enough to be a pause and not a load. */
const BEAT = 0.9;

export function createDeathScreen({ onRestart }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const screen = document.createElement('div');
  screen.id = 'death';
  const line = document.createElement('p');
  const hint = document.createElement('small');
  hint.textContent = 'press any key';
  screen.append(line, hint);
  document.body.appendChild(screen);

  let showing = false;
  let timer = 0;
  /**
   * Whether the key that dismisses this is being listened for yet.
   *
   * Armed a beat after the screen goes up rather than with it. You die with
   * your hands on the keys — mid-stride, W held, very often mashing something
   * — and a screen that takes any key the instant it appears is a screen you
   * never see. The beat that the text fades in over is the same beat that
   * protects it from the input you died holding.
   */
  let listening = false;
  /**
   * A press that arrived during that beat, kept rather than dropped.
   *
   * The first version threw them away, and the flaw took a harness run to
   * see: press once inside the first nine tenths of a second, which is
   * exactly what somebody who has just died does, and nothing happens — and
   * because "press any key" has already been obeyed once, there is no reason
   * to press again. The screen sits there forever looking broken.
   *
   * So an early press is remembered and spent the moment the beat is up. The
   * protection is unchanged — you still cannot get off this screen before you
   * have seen it — and the input is no longer silently eaten.
   */
  let wanted = false;

  const dismiss = (event) => {
    if (!showing) return;
    // Auto-repeat from a key that was already down when you died is not a
    // press. Without this the W you were walking in on hammers `wanted` sixty
    // times a second and the beat may as well not exist — which is the whole
    // thing the beat was for, so the buffer above is only safe with this.
    if (event.repeat) return;
    event.stopPropagation();
    event.preventDefault();
    if (!listening) {
      wanted = true;
      return;
    }
    // Swallowed, not just intercepted. `onRestart` below switches the player
    // body back on, and without this the same keystroke goes on to reach that
    // body's own handler a moment later — so the key you pressed to come back
    // is also a key you pressed in the game, and you respawn mid-jump.
    event.stopPropagation();
    event.preventDefault();
    showing = false;
    listening = false;
    screen.classList.remove('up', 'said');
    document.body.classList.remove('dead');
    onRestart?.();
  };

  // Capture, so this sees the key before anything in the game does and can
  // take it out of the stream — see `dismiss`.
  window.addEventListener('keydown', dismiss, { capture: true });
  window.addEventListener('pointerdown', dismiss, { capture: true });

  return {
    get isShowing() {
      return showing;
    },

    /**
     * Up you go. `line` is what killed you, said once, in the killer's own
     * terms — see the note at the top about who owns the sentence.
     */
    kill(said) {
      if (showing) return;
      showing = true;
      listening = false;
      wanted = false;
      timer = 0;
      line.textContent = said;
      document.body.classList.add('dead');
      screen.classList.add('up');
    },

    /** Straight down with no beat. For the debug menu and for scene jumps. */
    clear() {
      showing = false;
      listening = false;
      wanted = false;
      timer = 0;
      screen.classList.remove('up', 'said');
      document.body.classList.remove('dead');
    },

    update(delta) {
      if (!showing || listening) return;
      timer += delta;
      if (timer < BEAT) return;
      listening = true;
      screen.classList.add('said');
      // And if you already asked, that is enough asking.
      if (wanted) dismiss(new KeyboardEvent('keydown'));
    },
  };
}
