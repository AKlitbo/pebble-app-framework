// stops: pasting ")" and "_is_a_number"
// the struct's sizeof rises with every append, which would turn away every save from before it
#include "system/settings/settings.h"

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, sizeof(s_blob)) };
