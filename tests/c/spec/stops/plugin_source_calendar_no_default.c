// stops: PLUGIN_CALENDAR keeps the calendar source on the watch, so it needs PLUGIN_SOURCE_CALENDAR_DEFAULT
// a build that kept the choice with no default would give a fresh watch an empty source to send back
#define PLUGIN_CALENDAR 1
#define HAS_MESSAGE_KEY_CALENDAR_SOURCE 1
#include "system/settings/plugin_source.h"
