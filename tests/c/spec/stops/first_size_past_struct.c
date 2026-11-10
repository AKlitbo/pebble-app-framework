// stops: first size is 0 or bigger than the settings struct
// a first size past the struct would turn away every save, even one at today's size
#include "system/settings/settings.h"

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, 3) };
