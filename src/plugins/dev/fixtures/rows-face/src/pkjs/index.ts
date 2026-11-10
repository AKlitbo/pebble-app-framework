/**
 * The page check fixture with one row of every kind Clay draws in a card.
 *
 * It has no features, no visibleWhen row, and no customClay of its own, so the page carries nothing
 * but Clay's rows and the framework's components. The padding checks read every row kind on it, in
 * the usual order and in the order the Pebble Android app leaves the page in.
 */
import app from '../../../../../../ts/pkjs/app';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

// Clay takes a checkbox group's options as plain words, which the page's types do not cover
const checkboxes = { type: 'checkboxgroup', messageKey: 'ROW_SOME', label: 'Some', defaultValue: [true, false], options: ['First', 'Second'] } as unknown as ClayConfigItem;

app.startPebbleApp({
  clayConfig: [
    { type: 'heading', defaultValue: 'Page Check Rows' },
    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Every Row' },
        { type: 'text', defaultValue: 'One row of each kind.' },
        { type: 'select', messageKey: 'ROW_PICK', label: 'Pick', defaultValue: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
        { type: 'input', messageKey: 'ROW_WORDS', label: 'Words' },
        { type: 'toggle', messageKey: 'ROW_SWITCH', label: 'Switch', defaultValue: true },
        { type: 'slider', messageKey: 'ROW_LEVEL', label: 'Level', defaultValue: 2, attributes: { min: 0, max: 5 } },
        { type: 'color', messageKey: 'ROW_INK', label: 'Ink', defaultValue: '000000' },
        { type: 'radiogroup', messageKey: 'ROW_ONE', label: 'One', defaultValue: 'a', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] },
        checkboxes,
        { type: 'button', defaultValue: 'Press' },
      ],
    },
    { type: 'submit', defaultValue: 'Save' },
  ],
});
