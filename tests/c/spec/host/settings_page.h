/**
 * @file settings_page.h
 * @brief The host specs' stand-in for the header paf build writes from a face's settings page.
 *
 * In a face's build this holds a SETTINGS_COUNT_<KEY> for each choice the face's page offers and a
 * SETTINGS_DEFAULT_<KEY> for each default it opens with, and settings_catalog.h includes it. The
 * specs have no face and no page, so it holds neither, as it does for a face with no settings page. A
 * spec or a stop that needs a count or a default defines it before it includes settings_catalog.h.
 */
#pragma once
