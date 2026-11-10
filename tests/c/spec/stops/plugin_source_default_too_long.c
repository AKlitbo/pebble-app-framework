// stops: the default weather source has to be 1 to 11 characters
// a default past the buffer would be kept cut short, and the watch would send back a provider no page offers
#define PLUGIN_WEATHER 1
#define HAS_MESSAGE_KEY_WEATHER_PROVIDER 1
#define PLUGIN_SOURCE_WEATHER_DEFAULT "openmeteoplus"
#include "system/settings/plugin_source.h"
