/**
 * The hosts the location search calls from inside the settings page: Open-Meteo's geocoder for the
 * places on every search, and its forecast call for a place's time zone on a field marked
 * `timeZone: true` alone.
 *
 * The search writes its URLs out in full, since Clay runs its code in the webview where it reaches
 * nothing outside itself, and a spec checks this list against every host those URLs name. The plugin
 * page build checks a plugin app's permissions against it. Node runs that build straight from its
 * source, so this file imports nothing.
 */

/** The geocoder every location search calls for its places. */
export const LOCATION_GEOCODER_HOST = 'geocoding-api.open-meteo.com';

/** The forecast host a timezone field's search calls for a picked place's zone. */
export const LOCATION_ZONE_HOST = 'api.open-meteo.com';

/** Every host the location search can call. */
export const LOCATION_SEARCH_HOSTS = [LOCATION_GEOCODER_HOST, LOCATION_ZONE_HOST];
