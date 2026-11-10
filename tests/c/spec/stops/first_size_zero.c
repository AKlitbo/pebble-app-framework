// stops: first size is 0 or bigger than the settings struct
// a first size of 0 would take an empty blob, which cannot even hold the version byte
#include "system/settings/settings.h"

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, 0) };
