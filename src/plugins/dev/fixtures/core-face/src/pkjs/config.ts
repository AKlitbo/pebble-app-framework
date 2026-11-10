/**
 * The settings page of the page check's family core fixture.
 *
 * The location section comes from the config builder, marks and all. The weather section is laid
 * out the way a family core builds its own, with the Data Source select made by config-rows and no
 * plugin source mark on it or on its key row, so the plugin choice has to find the select by its key.
 */
import { locationSection } from '../../../../../../ts/pkjs/config-builder';
import { heading, select } from '../../../../../../ts/pkjs/config-rows';
import type { ClayConfigItem } from '../../../../../../ts/clay/types';

const clayConfig: ClayConfigItem[] = [
  heading('Page Check Core'),
  locationSection({ location: {} }) as ClayConfigItem,
  {
    type: 'section',
    items: [
      heading('Weather Preferences'),
      select('WEATHER_TEMPERATURE_UNIT', 'Temperature Unit', [
        { label: 'Celsius (°C)', value: 0 },
        { label: 'Fahrenheit (°F)', value: 1 },
      ], 0),
      select('WEATHER_WIND_UNIT', 'Wind Speed Unit', [
        { label: 'Kilometers/hour (km/h)', value: 0 },
        { label: 'Miles/hour (mph)', value: 1 },
      ], 0),
      select('WEATHER_PROVIDER', 'Data Source', [
        { label: 'Open-Meteo (Free, No Key Required)', value: 'openmeteo' },
        { label: 'OpenWeatherMap', value: 'owm' },
        { label: 'WeatherAPI.com', value: 'weatherapi' },
      ], 'openmeteo', 'Choose where your watch pulls its weather data. Open-Meteo works right out of the box with no setup required.'),
      {
        type: 'input',
        messageKey: 'WEATHER_API_KEY',
        label: 'API Key',
        description: 'Only required if you selected OpenWeatherMap or WeatherAPI above.',
        attributes: {
          placeholder: 'Paste your private API key here...',
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
