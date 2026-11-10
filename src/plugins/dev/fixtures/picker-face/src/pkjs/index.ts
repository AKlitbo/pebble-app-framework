/**
 * The page check fixture with a theme picker and no plain select.
 *
 * The picker draws Clay's select markup, and Clay adds the select's style only to a page that
 * registers the select, so this is the page where the picker gets its look from the framework alone.
 * A toggle sits beside it so the Android order has a row of Clay's own to move. It has no features,
 * no visibleWhen row, and no customClay of its own.
 */
import app from '../../../../../../ts/pkjs/app';

app.startPebbleApp({
  clayConfig: [
    { type: 'heading', defaultValue: 'Page Check Picker' },
    {
      type: 'section',
      items: [
        { type: 'heading', defaultValue: 'Appearance' },
        { type: 'themePreview', messageKey: 'APPEARANCE_THEME', label: 'Theme', defaultValue: 0, options: [{ label: 'Day', value: 0 }, { label: 'Night', value: 1 }], previews: {} },
        { type: 'toggle', messageKey: 'PICK_SWITCH', label: 'Switch', defaultValue: true },
      ],
    },
    { type: 'submit', defaultValue: 'Save' },
  ],
});
