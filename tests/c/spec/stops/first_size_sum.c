// stops: invalid suffix
// a sum with no brackets stops too, since it pastes into a field declaration that is not one name
#include "system/settings/settings.h"

#define FACE_LAYOUT_LEN 1

static struct
{
    uint8_t version;
    uint8_t theme;
} s_blob;

const SettingsSchema s_schema = { SETTINGS_BLOB(s_blob, 1 + FACE_LAYOUT_LEN) };
