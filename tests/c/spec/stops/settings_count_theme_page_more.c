// stops: the settings page offers 5 choices on APPEARANCE_THEME, but the table the face passed holds THEME_COUNT
// a theme added to the page and not to the face's table would be picked and draw nothing
#define SETTINGS_COUNT_APPEARANCE_THEME 5
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_APPEARANCE_THEME;

typedef enum
{
    THEME_LIGHT,
    THEME_DARK,
    THEME_DUSK,
    THEME_INK,
    THEME_COUNT
} FaceTheme;

static const SettingField s_fields[] = { KNOWN_THEME(0, THEME_COUNT) };
