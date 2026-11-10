// stops: 'SETTINGS_COUNT_APPEARANCE_THEME' undeclared
// a theme with no count from the page would hold every saved theme to a count nobody wrote
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_APPEARANCE_THEME;

static const SettingField s_fields[] = { KNOWN_THEME(0, 4) };
