// stops: implicit declaration of function 'KNOWN_HEADER_FONT'
// the header font is a face's own field, so a face still naming the catalogue's entry stops rather than building without it
#define SETTINGS_COUNT_APPEARANCE_HEADER_FONT 8
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_APPEARANCE_HEADER_FONT;

void face_fields(void)
{
    SettingField field = KNOWN_HEADER_FONT(0, 8);
    (void)field;
}
