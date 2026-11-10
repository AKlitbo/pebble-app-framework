// stops: 'SETTINGS_COUNT_APPEARANCE_HEADER_FONT' undeclared
// the theme's count from the page is not the header font's, so a page with no font picker stops the font
#define SETTINGS_COUNT_APPEARANCE_THEME 4
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_APPEARANCE_THEME;
extern uint32_t MESSAGE_KEY_APPEARANCE_HEADER_FONT;

static const SettingField s_fields[] = { KNOWN_THEME(0, 4), KNOWN_HEADER_FONT(1, 8) };
