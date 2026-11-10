// stops: pasting "settings_first_size_" and "("
// a sum over a length macro moves when the length does, so it has to be written out as a number
#include "system/settings/settings.h"

#define FACE_LAYOUT_LEN 1

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, (1 + FACE_LAYOUT_LEN)) };
