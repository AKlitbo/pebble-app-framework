/**
 * The settings page of the page check's no choice fixture.
 *
 * The face shows weather and keeps the builder's location section, marks and all, but its page has
 * no Data Source select. It fetches from its one provider, so a plugin is never picked, and the
 * page offers no plugin choice and no supported plugins panel.
 */
import { locationSection } from '../../../../../../ts/pkjs/config-builder';
import { heading } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const clayConfig: ClayConfigItem[] = [
  heading('Page Check No Choice'),
  locationSection({ location: {} }) as ClayConfigItem,
  {
    type: 'submit',
    defaultValue: 'Save',
  },
];

export default clayConfig;
