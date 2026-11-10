// stops: weather needs WEATHER_OK in messageKeys
// a face with three of the four weather keys and the extras is told the weather key it is missing,
// since the extras are fine once the weather is whole
#define HAS_MESSAGE_KEY_WEATHER_REQUEST 1
#define HAS_MESSAGE_KEY_WEATHER_TEMPERATURE 1
#define HAS_MESSAGE_KEY_WEATHER_CONDITIONS 1
#define HAS_MESSAGE_KEY_WEATHER_HUMIDITY 1
#define HAS_MESSAGE_KEY_WEATHER_WIND_SPEED 1
#define HAS_MESSAGE_KEY_WEATHER_WIND_DIR 1
#define HAS_MESSAGE_KEY_WEATHER_SUNRISE 1
#define HAS_MESSAGE_KEY_WEATHER_SUNSET 1
#include "io/appmessage/appmessage_features.h"
