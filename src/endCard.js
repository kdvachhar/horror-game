/**
 * The screen you get when you go out of the window.
 *
 * The death screen's opposite number and deliberately built out of the same
 * parts — see death.js, which sets out why a screen like this is one line on
 * black and nothing else. Same face, same grey-green, same letter-spacing:
 * the game has spoken to you directly twice before this, on the start screen
 * and over whatever killed you, and the last time it does it should be
 * recognisably the same voice.
 *
 * Two things it does differently.
 *
 * It fades to black itself, over about a second, and the death screen
 * explicitly does not. The argument there is that whatever killed you arrives
 * with the black already in the world — the meat cube drives the camera down
 * its own throat — so a fade would be the game announcing a state change over
 * the top of something the world had already said. Nothing says it here.
 * There is no floor on the other side of that window and no building model
 * out there to fall past: a cut to black on the frame you cross the sill is a
 * crash, and the fade is the only thing standing in for the drop.
 *
 * And it takes no key. A death screen's whole job is to get out of the way,
 * because the thing on the other side of it is the game. There is nothing on
 * the other side of this one. The player who wants another go has a page to
 * reload and knows it; a "press any key" here would be the game asking for
 * one more input after the end of itself.
 */

const STYLE = `
#over {
  position: fixed; inset: 0; z-index: 95;
  display: flex; align-items: center; justify-content: center;
  background: #000;
  font-family: "Courier New", Courier, monospace;
  opacity: 0; pointer-events: none;
  transition: opacity 1.1s linear;
}
#over.up { opacity: 1; pointer-events: auto; }

#over p {
  color: #9aa79c;
  font-size: clamp(1rem, 3.4vw, 1.5rem);
  letter-spacing: 0.34em;
  /* letter-spacing puts a gap after the last character too, which walks the
     line off centre by half a space. */
  text-indent: 0.34em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 1.4s linear;
}
#over.said p { opacity: 1; }

/* Nothing from the running game on top of it, the same list the death screen
   hides and for the same reason. */
body.over #crosshair,
body.over #prompt,
body.over #objective,
body.over #note,
body.over #subtitle { opacity: 0 !important; }
`;

/**
 * How long the black takes, which is the same 1.1s the stylesheet above
 * fades over, and it is here because something has to happen on the far
 * side of it. See `onBlack`.
 */
const FADE = 1.1;

/**
 * Black, then the words.
 *
 * Longer than the death screen's nine tenths, because that beat starts from
 * black and this one starts from a window going past the lens. The fade is a
 * second and a tenth of it; the words arrive a little after they have landed.
 */
const BEAT = 1.8;

/**
 * @param said   the line, once, in the middle of the screen
 * @param onBlack once, the frame the fade finishes — which is where the
 *               caller switches the body off. The player goes out of that
 *               window with a drop under them and nothing modelled to land
 *               on: for as long as there is anything to see they should be
 *               falling, and a body switched off on the sill is a player
 *               hanging in the air behind a half-black screen.
 */
export function createEndCard({ said = 'Thanks for playing', onBlack } = {}) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const screen = document.createElement('div');
  screen.id = 'over';
  const line = document.createElement('p');
  line.textContent = said;
  screen.append(line);
  document.body.appendChild(screen);

  let showing = false;
  let timer = 0;
  let blacked = false;

  return {
    get isShowing() {
      return showing;
    },

    /** Up it goes, and nothing takes it down again. */
    show() {
      if (showing) return;
      showing = true;
      timer = 0;
      blacked = false;
      document.body.classList.add('over');
      screen.classList.add('up');
    },

    /** Straight down with no beat. For the debug menu and for scene jumps. */
    clear() {
      showing = false;
      timer = 0;
      blacked = false;
      screen.classList.remove('up', 'said');
      document.body.classList.remove('over');
    },

    update(delta) {
      if (!showing) return;
      timer += delta;
      if (!blacked && timer >= FADE) {
        blacked = true;
        onBlack?.();
      }
      if (timer >= BEAT) screen.classList.add('said');
    },
  };
}
