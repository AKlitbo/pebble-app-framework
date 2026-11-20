// stops: the settings page offers 8 choices on HEALTH_GOAL_STEPS, but the table the face passed holds 7
// a step goal added to the page and not to the framework's table would be picked and aim for the first goal
#define SETTINGS_COUNT_HEALTH_GOAL_STEPS 8
#include "system/settings/settings_catalog.h"

extern uint32_t MESSAGE_KEY_HEALTH_GOAL_STEPS;

static const SettingField s_fields[] = { KNOWN_GOAL_STEPS(0) };
