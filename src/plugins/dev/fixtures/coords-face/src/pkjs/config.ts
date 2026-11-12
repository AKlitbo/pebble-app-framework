/**
 * The page check fixture's settings page.
 *
 * The location and weather sections come from the config builder, marks and all. The calendar
 * section is the face's own, laid out the way a face with calendar controls of its own builds it: a
 * heading, a lead line, then the iCal sentence, the link, and a refresh interval, each marked to hide
 * while the events come from a plugin.
 */
import { locationSection, weatherSection } from '../../../../../../ts/pkjs/config-builder';
import { heading, select } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const builderSections = [
  locationSection({ location: {} }),
  weatherSection({ weather: {}, temperature: {} }),
].filter((section): section is ClayConfigItem => section !== null);

const clayConfig: ClayConfigItem[] = [
  heading('Page Check'),
  {
    type: 'text',
    defaultValue: 'A face with weather and a calendar, for checking the settings page.',
  },
  ...builderSections,
  {
    type: 'section',
    items: [
      heading('Calendar Preferences'),
      {
        type: 'text',
        defaultValue: 'Add a Calendar panel to your layout to see your next events.',
      },
      {
        type: 'text',
        defaultValue: 'Paste your private iCal link below.',
        pluginSourceHides: 'CALENDAR_SOURCE',
      },
      {
        type: 'input',
        messageKey: 'CALENDAR_ICS_URL',
        label: 'iCal URL',
        pluginSourceHides: 'CALENDAR_SOURCE',
        attributes: {
          placeholder: 'https://.../calendar.ics',
          maxlength: 512,
        },
      },
      {
        ...select('CALENDAR_POLL', 'Refresh Interval', [
          { label: '15 min', value: 0 },
          { label: '30 min', value: 1 },
          { label: '1 hour', value: 2 },
        ], 1),
        pluginSourceHides: 'CALENDAR_SOURCE',
      },
    ],
  },
  {
    type: 'submit',
    defaultValue: 'Save',
  },
];

export default clayConfig;
