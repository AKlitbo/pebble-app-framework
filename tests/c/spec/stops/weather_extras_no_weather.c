// stops: the weather groups need weather in messageKeys
// the watch reads the extras inside the weather block, so all five without weather would build and never arrive
#define HAS_MESSAGE_KEY_WEATHER_HUMIDITY 1
#define HAS_MESSAGE_KEY_WEATHER_WIND_SPEED 1
#define HAS_MESSAGE_KEY_WEATHER_WIND_DIR 1
#define HAS_MESSAGE_KEY_WEATHER_SUNRISE 1
#define HAS_MESSAGE_KEY_WEATHER_SUNSET 1
#include "io/appmessage/appmessage_features.h"
