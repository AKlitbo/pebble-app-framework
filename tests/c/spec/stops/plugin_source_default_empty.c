// stops: the default calendar source has to be 1 to 7 characters
// an empty default would let an empty save through as a value, so a page sending a blank source would wipe the choice
#define PLUGIN_CALENDAR 1
#define HAS_MESSAGE_KEY_CALENDAR_SOURCE 1
#define PLUGIN_SOURCE_CALENDAR_DEFAULT ""
#include "system/settings/plugin_source.h"
