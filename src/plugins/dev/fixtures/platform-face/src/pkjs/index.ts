/**
 * The settings page loader's fixture for a face whose page differs from one watch to the next.
 *
 * Its own feature adds a theme picker in its page hook, with one more theme on a round watch, so the
 * build has to load the page for each platform the face targets and take the larger count.
 */
import app from '../../../../../../ts/pkjs/app';
import type { FeatureHooks } from '../../../../../../ts/pkjs/feature';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

/** Which watch the page was opened from, which the phone's bridge reports. */
function platform(): string {
  return (Pebble as unknown as { getActiveWatchInfo(): { platform: string } }).getActiveWatchInfo().platform;
}

/** A feature whose page hook offers a round watch a fourth theme. */
function themes(): FeatureHooks {
  return {
    page(config: ClayConfigItem[]): ClayConfigItem[] {
      const count = platform() === 'gabbro' ? 4 : 3;
      const options = Array.from({ length: count }, (_unused, value) => ({ label: `Theme ${value}`, value }));

      return [...config, { type: 'select', messageKey: 'APPEARANCE_THEME', label: 'Theme', defaultValue: 0, options }];
    },
  };
}

app.startPebbleApp({
  clayConfig: [
    {
      type: 'select',
      messageKey: 'CLOCK_WEEK_START',
      label: 'Week Starts On',
      defaultValue: 0,
      options: [{ label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }],
    },
    { type: 'submit', defaultValue: 'Save' },
  ],
  features: [themes],
});
