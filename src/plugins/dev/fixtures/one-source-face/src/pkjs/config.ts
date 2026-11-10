/**
 * The settings page of the page check's one source fixture.
 *
 * The face's own weather section offers OpenWeatherMap alone, with no plugin source mark. Its key
 * row shows only for a keyed provider and a line about Open-Meteo shows only for Open-Meteo, each
 * through a visibleWhen of the face's own. With plugins off the select drops to its one option, and
 * each condition is settled against it, so the key row shows and the Open-Meteo line stays hidden.
 */
import { heading, select } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const clayConfig: ClayConfigItem[] = [
  heading('Page Check One Source'),
  {
    type: 'section',
    items: [
      heading('Weather'),
      select('WEATHER_PROVIDER', 'Data Source', [{ label: 'OpenWeatherMap', value: 'owm' }], 'owm'),
      {
        type: 'text',
        defaultValue: 'Open-Meteo needs no key, so this face asks for none.',
        visibleWhen: { key: 'WEATHER_PROVIDER', in: ['openmeteo'] },
      },
      {
        type: 'input',
        messageKey: 'WEATHER_API_KEY',
        label: 'API Key',
        visibleWhen: { key: 'WEATHER_PROVIDER', in: ['owm', 'weatherapi'] },
        attributes: {
          maxlength: 64,
        },
      },
    ],
  },
  {
    type: 'submit',
    defaultValue: 'Save',
  },
];

export default clayConfig;
