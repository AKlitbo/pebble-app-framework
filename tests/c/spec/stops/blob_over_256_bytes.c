// stops: settings struct is over 256 bytes, so move some fields into a companion schema
// one persist key holds 256 bytes, and the watch saves only that much of a longer struct
#include "system/settings/settings.h"

static struct
{
    uint8_t version;
    uint8_t layout[256];
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, 257) };
