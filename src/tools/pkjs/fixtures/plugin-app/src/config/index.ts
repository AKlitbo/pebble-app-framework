// the settings page the plugin page specs build. a toggle, a secret link shown only while its feed is
// on, and a select from a file beside it, which is enough to see a value of each kind load and save
import type { ClayConfigItem } from '../../../../../../ts/clay/types';
import { REFRESH_ROW } from './rows';

export const clayConfig: ClayConfigItem[] = [
  { type: 'heading', defaultValue: 'Fixture Plugin' },
  { type: 'toggle', messageKey: 'FEED_ON', label: 'Show the Feed', defaultValue: false },
  { type: 'input', messageKey: 'FEED_URL', label: 'iCal Link', defaultValue: '', visibleWhen: { key: 'FEED_ON', in: [true] } },
  REFRESH_ROW,
];
