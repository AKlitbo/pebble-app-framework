/**
 * A Clay component that draws nothing and carries the framework's rules for the whole settings page.
 *
 * Clay adds a component's style to the page as the page registers it, whether or not a row uses the
 * component. createClay registers this one on every page, so its rules reach every face with no page
 * code of their own. The page registers each component once by name, so the rules land once however
 * often anything around them runs.
 *
 * Several of Clay's own components take some padding off their row inside a card and let the label
 * and the description inside carry it, such as a select's `.section .component-select { padding: 0 }`.
 * Its base sheet's `.section > .component` rule pads every row, and the two rules have the same
 * weight, so the sheet that comes later wins. Clay adds every component's style at the end of the
 * page's head, after its base sheet, so the component's padding wins on most phones. The Pebble
 * Android app runs a script at the very start of the page while plugins are on, and that script makes
 * a head of its own ahead of the page's. Every component's style then lands ahead of the base sheet,
 * and each of those rows gets a second gap under it and on each side. The rules here repeat each of
 * Clay's with one more class, so Clay's padding wins in either order. In the usual order they set what
 * Clay's own rules already set.
 *
 * The location search and the theme picker borrow the classes of Clay's text box and select. Clay adds
 * a component's style only to a page that registers it, so createClay registers Clay's own text box
 * and select on any page holding one of those rows, unless the face passes its own. Clay's own rule
 * is then always there for them, and the rules here move no row in the usual order.
 *
 * A text row whose markup carries `pf-footer`, such as `<div class="pf-footer">`, is centred, so a
 * page puts a credit or a note under Save with no style of its own. The rule outweighs Clay's own text
 * rules by a class, so it holds in either order.
 */

/**
 * The padding each of Clay's own components gives its row inside a card, by the class Clay gives the
 * row, copied from the component's `.section .component-X` rule. The spec reads Clay's own styles and
 * checks them against this, so the two cannot drift apart.
 */
export const CLAY_ROW_PADDING: Record<string, string> = {
  'component-button': 'padding-bottom: 0;',
  'component-checkbox': 'padding-right: 0.375rem;',
  'component-color': 'padding: 0;',
  'component-input': 'padding: 0;',
  'component-radio': 'padding-right: 0.375rem;',
  'component-select': 'padding: 0;',
  'component-slider': 'padding: 0;',
  'component-toggle': 'padding: 0;',
};

/** Each of Clay's row rules with one more class, so it wins whichever sheet comes later. */
const ROW_PADDING = Object.keys(CLAY_ROW_PADDING).map((kind) => `.section > .component.${kind} { ${CLAY_ROW_PADDING[kind]} }`).join('');

/** Centres the markup a text row marks with `pf-footer`, the line under Save. */
const FOOTER = '.component-text .pf-footer { text-align: center; }';

export default {
  /** The component type name. No row uses it, since the component is here only for its style. */
  name: 'pafPageStyle',

  // Clay needs a template and a manipulator for every component, even one no row draws
  template: '<div></div>',

  manipulator: 'html',

  /** The rules for the whole page. */
  style: ROW_PADDING + FOOTER,
};
