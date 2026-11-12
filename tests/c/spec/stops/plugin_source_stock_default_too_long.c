// stops: the default stock source has to be 1 to 13 characters
// a default past the buffer would be kept cut short, and the watch would send back a provider no page offers
#define PLUGIN_STOCKS 1
#define HAS_MESSAGE_KEY_STOCK_PROVIDER 1
#define PLUGIN_SOURCE_STOCK_DEFAULT "alphavantage12"
#include "system/settings/plugin_source.h"
