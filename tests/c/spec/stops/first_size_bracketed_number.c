// stops: pasting "settings_first_size_" and "("
// a size macro written with brackets stops too, so a face defines its first size as a bare number
#include "system/settings/settings.h"

#define FACE_SETTINGS_V1_SIZE (2)

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, FACE_SETTINGS_V1_SIZE) };
