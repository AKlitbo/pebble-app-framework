// stops: PLUGIN_WEATHER keeps the weather source on the watch, so it needs PLUGIN_SOURCE_WEATHER_DEFAULT
// a build that kept the choice with no default would give a fresh watch an empty source to send back
#define PLUGIN_WEATHER 1
#define HAS_MESSAGE_KEY_WEATHER_PROVIDER 1
#include "system/settings/plugin_source.h"
