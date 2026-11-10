// stops: today's forecast needs WEATHER_PRECIP_CHANCE in messageKeys
// today's forecast is read whole, so a face missing one of the four would build and never see any of it
#define HAS_MESSAGE_KEY_WEATHER_REQUEST 1
#define HAS_MESSAGE_KEY_WEATHER_TEMPERATURE 1
#define HAS_MESSAGE_KEY_WEATHER_CONDITIONS 1
#define HAS_MESSAGE_KEY_WEATHER_OK 1
#define HAS_MESSAGE_KEY_WEATHER_UV_INDEX 1
#define HAS_MESSAGE_KEY_WEATHER_TEMP_MAX 1
#define HAS_MESSAGE_KEY_WEATHER_TEMP_MIN 1
#include "io/appmessage/appmessage_features.h"
