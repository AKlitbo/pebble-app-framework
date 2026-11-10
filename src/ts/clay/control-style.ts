/**
 * The look of the tappable parts of the framework's own Clay components, shared the way
 * callout-style.ts shares the callout.
 *
 * Each string is the body of one CSS rule, so a component wraps it in its own selector and can add
 * declarations after it. Every colour reads a custom property first and falls back to Clay's stock
 * colours, so a face that sets none of them keeps the look it has. A face sets them on :root from
 * its own component CSS:
 *   --pf-accent      a pressed row, a link, and the focus ring, #ff4700 unless set
 *   --pf-on-accent   text on --pf-accent, #fff unless set
 *   --pf-surface     a dropdown list's fill, #fff unless set
 *   --pf-ink         a dropdown list's text, #000 unless set
 *   --pf-line        a dropdown list's edges, #ccc for the list and #eee between its rows unless set
 *
 * None of these set a size. A row keeps the padding its component gives it, so a face that sets
 * nothing sees the same boxes in the same places.
 */

/** The list a search shows its results in. */
export const LIST = 'background: var(--pf-surface, #fff); color: var(--pf-ink, #000); border: 1px solid var(--pf-line, #ccc);';

/** A row the wearer taps in a list, such as a search result. */
export const LIST_ROW = 'padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--pf-line, #eee);';

/** The row while it is pressed or under a pointer. */
export const LIST_ROW_PRESSED = 'background: var(--pf-accent, #ff4700); color: var(--pf-on-accent, #fff);';

/** A details summary drawn as a row the wearer taps. The browser's own marker is hidden for DISCLOSURE_MARKER. */
export const DISCLOSURE = 'display: flex; align-items: center; gap: 0.5rem; cursor: pointer; list-style: none;';

/** The summary's arrow, written as its :before. It points right while closed, and the component turns it down when open. */
export const DISCLOSURE_MARKER = 'content: ""; flex: none; width: 0.45em; height: 0.45em; margin: 0 0.15em; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); transition: transform 0.15s;';

/** A link out of the settings page. */
export const LINK = 'color: var(--pf-accent, #ff4700); text-decoration: underline; text-underline-offset: 2px;';

/** The ring a keyboard user sees under :focus-visible, since Clay turns the outline off on every control. */
export const FOCUS_RING = 'outline: 2px solid var(--pf-accent, #ff4700); outline-offset: 2px;';

export default { LIST, LIST_ROW, LIST_ROW_PRESSED, DISCLOSURE, DISCLOSURE_MARKER, LINK, FOCUS_RING };
