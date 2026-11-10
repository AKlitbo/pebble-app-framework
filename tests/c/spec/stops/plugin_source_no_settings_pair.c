// stops: a kept plugin source choice needs SETTINGS_REQUEST and SETTINGS_FRESH in messageKeys
// the watch keeps the wearer's weather source pick, and only the settings reply hands it back to the phone
#define PLUGIN_WEATHER 1
#define HAS_MESSAGE_KEY_WEATHER_PROVIDER 1
#define PLUGIN_SOURCE_WEATHER_DEFAULT "openmeteo"
#include "io/appmessage/appmessage_features.h"
