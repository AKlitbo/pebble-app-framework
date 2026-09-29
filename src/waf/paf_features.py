"""
The feature flags a face builds with, worked out from the manifest build-manifests.ts wrote into
its sandbox.
"""

import json


def read_manifest(ctx):
    """
    The sandbox's package.json, which build-manifests.ts wrote from the face's appinfo. The feature
    flags come out of it, so a missing or broken one stops the build rather than quietly building the
    face with every optional feature off.
    """
    pkg_node = ctx.path.find_node('package.json')
    if not pkg_node:
        ctx.fatal('No package.json in this sandbox. Run build-manifests.ts again to rewrite it.')

    try:
        with open(pkg_node.abspath(), 'r') as pkg_f:
            return json.load(pkg_f)
    except (OSError, ValueError) as error:
        ctx.fatal('Could not read {}: {}'.format(pkg_node.abspath(), error))


def feature_cflags(ctx, manifest):
    """
    The -D flags that switch the framework's optional C on for this face, worked out from the
    message keys it declares and the resources it ships. A manifest in a shape this does not
    expect stops the build, since skipping it would compile the face with the features off.
    """
    pebble = manifest.get('pebble')
    if not isinstance(pebble, dict):
        ctx.fatal('package.json has no pebble block.')

    cflags = []

    # the SDK takes messageKeys as a list of names or as a map of name to id
    mkeys = pebble.get('messageKeys', [])
    if isinstance(mkeys, dict):
        mkeys = list(mkeys.keys())
    if not isinstance(mkeys, list) or not all(isinstance(mk, str) for mk in mkeys):
        ctx.fatal('package.json messageKeys has to be a list of names or a map of name to id.')
    # an array key such as SLOT[4] is declared by its name, so the count comes off the macro
    for mk in mkeys:
        cflags.append('-DHAS_MESSAGE_KEY_' + mk.split('[')[0] + '=1')

    resources = pebble.get('resources', {})
    if not isinstance(resources, dict):
        ctx.fatal('package.json resources has to be an object.')
    media = resources.get('media', [])
    if not isinstance(media, list) or not all(isinstance(m, dict) for m in media):
        ctx.fatal('package.json resources.media has to be a list of resources.')
    names = set(m.get('name') for m in media)

    # the shared weather-icon lookup (c/pebble/ui/weather/icons.c) is gated on
    # HAS_WEATHER_ICONS. it references the ICON_WEATHER_NOW_* set via generated
    # tables, so only a face that ships those icons should compile it. the whole
    # set travels together, so the always-present fallback is a reliable proxy.
    if 'ICON_WEATHER_NOW_NA' in names:
        cflags.append('-DHAS_WEATHER_ICONS=1')

    # a face that bundles both Quiet Time marks can draw the slot either way, the way
    # bluetooth does. one that only ships the muted one draws it when it applies and
    # leaves the slot empty otherwise
    if 'ICON_QUIET_ON' in names:
        cflags.append('-DHAS_QUIET_PAIR=1')

    return cflags
