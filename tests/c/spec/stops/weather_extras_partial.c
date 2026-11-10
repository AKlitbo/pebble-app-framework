// stops: the weather extras need WEATHER_WIND_DIR in messageKeys
// the extras are read whole, so a face missing one of the five would build and never see any of them
#define HAS_MESSAGE_KEY_WEATHER_REQUEST 1
#define HAS_MESSAGE_KEY_WEATHER_TEMPERATURE 1
#define HAS_MESSAGE_KEY_WEATHER_CONDITIONS 1
#define HAS_MESSAGE_KEY_WEATHER_OK 1
#define HAS_MESSAGE_KEY_WEATHER_HUMIDITY 1
#define HAS_MESSAGE_KEY_WEATHER_WIND_SPEED 1
#define HAS_MESSAGE_KEY_WEATHER_SUNRISE 1
#define HAS_MESSAGE_KEY_WEATHER_SUNSET 1
#include "io/appmessage/appmessage_features.h"
