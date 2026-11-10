// stops: 'SETTINGS_COUNT_APPEARANCE_NIGHT_THEME' undeclared
// a face's own choice field on a key the page has no choice for has no count to be held to
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_APPEARANCE_NIGHT_THEME;

static const SettingField s_fields[] = {
    { .id = SETTING_COUNT, .message_key = &MESSAGE_KEY_APPEARANCE_NIGHT_THEME, .type = SETTING_ENUM_U8,
      .offset = 0, .enum_count = SETTINGS_COUNT(APPEARANCE_NIGHT_THEME) },
};
