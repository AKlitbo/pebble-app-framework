// stops: Blob.pick has to be 64 bytes, the size its entry writes
// a pick member any shorter would have the goal buzz text written over the field after it
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_HEALTH_GOAL_VIBE;

typedef struct
{
    char pick[32];
    uint8_t next;
} Blob;

static const SettingField s_fields[] = { KNOWN_GOAL_VIBE(Blob, pick) };
