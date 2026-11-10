// stops: pasting "settings_first_size_" and "("
// SETTINGS_BLOB_SIZE is the struct's sizeof, so it rises with every append the same way
#include "system/settings/settings.h"

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, SETTINGS_BLOB_SIZE(s_blob)) };
