// stops: passed 3 arguments, but takes just 2
// a face still passing its own date default would otherwise keep a second copy that can drift from the page
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_CLOCK_DATE_FORMAT;

typedef struct
{
    uint8_t version;
    char date_format[16];
} Blob;

static const SettingField s_fields[] = { KNOWN_DATE_FORMAT(Blob, date_format, "%a %d %b") };
