/**
 * The look of a callout note on the settings page, shared by the Clay components that draw one.
 *
 * A callout is a tinted box with an orange left edge, and a warning one carries a round "!" badge in
 * its top left corner. Each string here is the body of one CSS rule, so a component wraps it in its
 * own selector and can add declarations after it to change a part.
 *
 * The orange reads --pf-note-accent, #ff4700 unless set, which a face can put on :root or on any
 * element above the note. A webview without color-mix keeps the plain tint written before it.
 */

/** The box: its tint, its left edge, its spacing, and room on the left for the badge. */
export const CALLOUT_BOX = 'position: relative; margin: 0.7rem 0 0.15rem; padding: 0.5rem 0.6rem 0.5rem 2.1rem; background: rgba(255, 71, 0, 0.1); background: color-mix(in srgb, var(--pf-note-accent, #ff4700) 10%, transparent); border-left: 3px solid var(--pf-note-accent, #ff4700); font-size: 0.85em; line-height: 1.4;';

/** The badge, written as the box's :before, a "!" in a ring. */
export const CALLOUT_BADGE = 'content: "!"; position: absolute; left: 0.6rem; top: 0.65rem; width: 1.15em; height: 1.15em; border: 1px solid var(--pf-note-accent, #ff4700); border-radius: 50%; color: var(--pf-note-accent, #ff4700); font-size: 0.95em; font-weight: 700; line-height: 1.1em; text-align: center;';

export default { CALLOUT_BOX, CALLOUT_BADGE };
