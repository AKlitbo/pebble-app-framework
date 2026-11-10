// stops: the settings page offers 7 choices on APPEARANCE_HEADER_FONT, but the table the face passed holds 8
// a font added to the face's table and not to the page could never be picked
#define SETTINGS_COUNT_APPEARANCE_THEME 4
#define SETTINGS_COUNT_APPEARANCE_HEADER_FONT 7
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_APPEARANCE_THEME;
extern uint32_t MESSAGE_KEY_APPEARANCE_HEADER_FONT;

#define FACE_HEADER_FONT_COUNT 8

static const SettingField s_fields[] = { KNOWN_THEME(0, 4), KNOWN_HEADER_FONT(1, FACE_HEADER_FONT_COUNT) };
