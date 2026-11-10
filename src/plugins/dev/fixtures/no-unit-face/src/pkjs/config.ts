/**
 * The settings page of the page check fixture with weather and no temperature unit.
 *
 * The location and weather sections come from the config builder. With no unit row, the Weather card
 * holds only its heading, the lead line, the Data Source select, and the key row, so a page that drops
 * the select and its lead line has to take the card off with them.
 */
import { locationSection, weatherSection } from '../../../../../../ts/pkjs/config-builder';
import { heading } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const builderSections = [
  locationSection({ location: {} }),
  weatherSection({ weather: {} }),
].filter((section): section is ClayConfigItem => section !== null);

const clayConfig: ClayConfigItem[] = [
  heading('Page Check'),
  ...builderSections,
  {
    type: 'submit',
    defaultValue: 'Save',
  },
];

export default clayConfig;
