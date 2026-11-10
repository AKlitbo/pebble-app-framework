// stops: settings need SETTINGS_FRESH in messageKeys beside SETTINGS_REQUEST
// without the fresh flag the watch cannot tell the phone it lost its settings, so the phone copies
// the watch's defaults over the wearer's
#define HAS_MESSAGE_KEY_SETTINGS_REQUEST 1
#include "io/appmessage/appmessage_features.h"
