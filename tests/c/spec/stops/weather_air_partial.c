// stops: the air readings need WEATHER_DEW_POINT in messageKeys
// the air readings are read whole, so a face missing one of the three would build and never see any of them
#define HAS_MESSAGE_KEY_WEATHER_REQUEST 1
#define HAS_MESSAGE_KEY_WEATHER_TEMPERATURE 1
#define HAS_MESSAGE_KEY_WEATHER_CONDITIONS 1
#define HAS_MESSAGE_KEY_WEATHER_OK 1
#define HAS_MESSAGE_KEY_WEATHER_FEELS_LIKE 1
#define HAS_MESSAGE_KEY_WEATHER_PRESSURE 1
#include "io/appmessage/appmessage_features.h"
