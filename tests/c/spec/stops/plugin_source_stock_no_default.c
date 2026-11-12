// stops: PLUGIN_STOCKS keeps the stock source on the watch, so it needs PLUGIN_SOURCE_STOCK_DEFAULT
// a build that kept the choice with no default would give a fresh watch an empty source to send back
#define PLUGIN_STOCKS 1
#define HAS_MESSAGE_KEY_STOCK_PROVIDER 1
#include "system/settings/plugin_source.h"
