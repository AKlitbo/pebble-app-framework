// stops: pasting ")" and "_is_a_number"
// a macro is expanded before the check, so one holding sizeof stops the same as sizeof written out
#include "system/settings/settings.h"

#define FACE_SETTINGS_V1_SIZE sizeof(s_blob)

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, FACE_SETTINGS_V1_SIZE) };
