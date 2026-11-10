/**
 * @file appmessage_features.h
 * @brief Which of the phone's optional features a face has, worked out from the message keys it
 * declares. The waf build defines a HAS_MESSAGE_KEY_* for every key in the face's messageKeys, and
 * this turns those into one switch per feature, so every file asking the same question gets the
 * same answer.
 *
 * APPMESSAGE_HAS_WEATHER is defined when the face has weather, and APPMESSAGE_HAS_LOCATION when it
 * gets coordinates. APPMESSAGE_HAS_PHONE is defined when it shows the phone's battery, and
 * APPMESSAGE_HAS_MUSIC when it shows what the phone is playing.
 *
 * A face that keeps a plugin source choice without both settings keys stops the build here too. The
 * manifest build refuses it first, so this is what still stops a build run some other way.
 *
 * @ingroup lib_io
 */
#pragma once

// a face has weather when it declares all four of these. the watch asks with the first and reads a
// reading off the other three, so all four are one decision. the ok flag is the one that tells a
// failed fetch from a reading, and a face without it would show "NO GPS" as a live 0 degrees.
// a face that declares none opted out of weather and builds without it. a face that declares only
// some has a typo or a gap, which would otherwise build and go wrong on the watch, so the build
// stops and names each missing key
#if defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) && defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) && \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) && defined(HAS_MESSAGE_KEY_WEATHER_OK)
#define APPMESSAGE_HAS_WEATHER 1 ///< the face declares all four weather keys
#elif defined(HAS_MESSAGE_KEY_WEATHER_REQUEST) || defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE) || \
    defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS) || defined(HAS_MESSAGE_KEY_WEATHER_OK)
#if !defined(HAS_MESSAGE_KEY_WEATHER_REQUEST)
#error "weather needs WEATHER_REQUEST in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_TEMPERATURE)
#error "weather needs WEATHER_TEMPERATURE in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_CONDITIONS)
#error "weather needs WEATHER_CONDITIONS in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#if !defined(HAS_MESSAGE_KEY_WEATHER_OK)
#error "weather needs WEATHER_OK in messageKeys. A face with weather declares WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK"
#endif
#endif

// a face gets coordinates when it declares both halves of the pair. they arrive together, so one
// without the other could never make a fix, and the build stops and names the missing half rather
// than leave the face without coordinates and nothing to say why
#if defined(HAS_MESSAGE_KEY_LOCATION_LATITUDE) && defined(HAS_MESSAGE_KEY_LOCATION_LONGITUDE)
#define APPMESSAGE_HAS_LOCATION 1 ///< the face declares both coordinate keys
#elif defined(HAS_MESSAGE_KEY_LOCATION_LATITUDE)
#error "coordinates need LOCATION_LONGITUDE in messageKeys beside LOCATION_LATITUDE"
#elif defined(HAS_MESSAGE_KEY_LOCATION_LONGITUDE)
#error "coordinates need LOCATION_LATITUDE in messageKeys beside LOCATION_LONGITUDE"
#endif

// a face shows the phone's battery when it declares both phone keys. the watch asks with one and
// reads the level off the other, so one without the other could never show a level, and the build
// stops and names the missing one
#if defined(HAS_MESSAGE_KEY_PHONE_BATTERY) && defined(HAS_MESSAGE_KEY_PHONE_REQUEST)
#define APPMESSAGE_HAS_PHONE 1 ///< the face declares both phone battery keys
#elif defined(HAS_MESSAGE_KEY_PHONE_BATTERY)
#error "the phone battery needs PHONE_REQUEST in messageKeys beside PHONE_BATTERY"
#elif defined(HAS_MESSAGE_KEY_PHONE_REQUEST)
#error "the phone battery needs PHONE_BATTERY in messageKeys beside PHONE_REQUEST"
#endif

// a face shows what the phone is playing when it declares all four music keys. the phone sends the
// three values in one message and the watch asks with the fourth, so they are one decision, and a
// face that declares only some of them stops the build with each missing one named
#if defined(HAS_MESSAGE_KEY_MUSIC_TITLE) && defined(HAS_MESSAGE_KEY_MUSIC_ARTIST) && \
    defined(HAS_MESSAGE_KEY_MUSIC_PLAYING) && defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#define APPMESSAGE_HAS_MUSIC 1 ///< the face declares all four now playing keys
#elif defined(HAS_MESSAGE_KEY_MUSIC_TITLE) || defined(HAS_MESSAGE_KEY_MUSIC_ARTIST) || \
    defined(HAS_MESSAGE_KEY_MUSIC_PLAYING) || defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#if !defined(HAS_MESSAGE_KEY_MUSIC_TITLE)
#error "now playing needs MUSIC_TITLE in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#if !defined(HAS_MESSAGE_KEY_MUSIC_ARTIST)
#error "now playing needs MUSIC_ARTIST in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#if !defined(HAS_MESSAGE_KEY_MUSIC_PLAYING)
#error "now playing needs MUSIC_PLAYING in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#if !defined(HAS_MESSAGE_KEY_MUSIC_REQUEST)
#error "now playing needs MUSIC_REQUEST in messageKeys. A face with now playing declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, and MUSIC_REQUEST"
#endif
#endif

// a face that keeps a plugin source choice needs both settings keys, since only the settings reply
// hands the wearer's pick back to the phone. without them a reinstall of the Pebble app loses it
#include "system/settings/plugin_source.h"
#if PLUGIN_SOURCE_KEEPS_ANY && !(defined(HAS_MESSAGE_KEY_SETTINGS_REQUEST) && defined(HAS_MESSAGE_KEY_SETTINGS_FRESH))
#error "a kept plugin source choice needs SETTINGS_REQUEST and SETTINGS_FRESH in messageKeys, since only the settings reply hands it back to the phone"
#endif
