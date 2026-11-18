/**
 * The hosts the location search calls from inside the settings page: Open-Meteo's geocoder for the
 * places, and its forecast call for a place's time zone.
 *
 * The search writes its URLs out in full, since Clay runs its code in the webview where it reaches
 * nothing outside itself, and a spec checks this list against every host those URLs name. The plugin
 * page build checks a plugin app's permissions against it. Node runs that build straight from its
 * source, so this file imports nothing.
 */
export const LOCATION_SEARCH_HOSTS = ['geocoding-api.open-meteo.com', 'api.open-meteo.com'];
