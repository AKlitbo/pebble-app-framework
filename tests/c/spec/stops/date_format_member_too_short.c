// stops: Blob.date_format has to be 16 bytes, the size its entry writes
// a date member any shorter would have the date format written over the field after it
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_CLOCK_DATE_FORMAT;

typedef struct
{
    char date_format[12];
    uint8_t next;
} Blob;

static const SettingField s_fields[] = { KNOWN_DATE_FORMAT(Blob, date_format) };
