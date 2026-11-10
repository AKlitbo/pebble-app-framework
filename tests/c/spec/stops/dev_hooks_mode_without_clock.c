// stops: DEV_MODE is on without DEV_TIME_HOUR and DEV_TIME_MIN. Turn dev mode on with paf build <face> --dev
// the build sets the pinned clock beside the mode, so a mode turned on anywhere else has no clock to pin
#define DEV_MODE 1
#include "dev/dev_hooks.h"
