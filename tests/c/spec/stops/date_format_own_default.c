// stops: passed 2 arguments, but takes just 1
// a face still passing its own date default would otherwise keep a second copy that can drift from the page
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_CLOCK_DATE_FORMAT;

static const SettingField s_fields[] = { KNOWN_DATE_FORMAT(0, "%a %d %b") };
