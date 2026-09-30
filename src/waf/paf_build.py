"""
Builds a staged sandbox: the include paths, the C and the PebbleKit JS, one app per platform, and
the bundle.
"""

import os

from paf_features import feature_cflags, read_manifest


def build_face(ctx, source, extra_cflags=None):
    """
    The build: resolve include paths, collect the face's C and JS plus the framework's, compile the
    app per target platform, bundle with PebbleKit JS, and archive the .pbw afterward.
    extra_cflags are appended to every platform's CFLAGS (the watchapp build passes
    -DBUILD_WATCHAPP).
    """
    # the framework as staged into this sandbox. its c/core/ is pure (SDK-free and host-testable),
    # its c/pebble/ needs the SDK, and a listed plugin's C sits beside them, such as the dev plugin's
    # c/dev/ screenshot harness. the PebbleKit JS is compiled out of its ts/ into emit/ before the
    # build, so only the C comes from here
    engine_dir = ctx.path.find_dir(source['engine'])
    if not engine_dir:
        ctx.fatal('The engine is not staged at "{}" in this sandbox.'.format(source['engine']))

    lib_c = engine_dir.find_dir('c')
    lib_c_core = lib_c.find_dir('core')
    lib_c_pebble = lib_c.find_dir('pebble')
    # this face's own sources (grid engine, widgets, main, theme)
    local_c = ctx.path.find_dir('src/c')

    # the framework's C roots and the face-local dir are on the include path. every shared header is
    # included with its folder relative to a root (e.g. "ui/engine/engine.h" or "clock/beats.h") so
    # moving a folder never touches this list. c/ itself is a root too, so a plugin's folder, such as
    # the dev harness, keeps its "dev/" prefix without being one more root of its own
    include_paths = [
        lib_c_core.abspath(),
        lib_c_pebble.abspath(),
        lib_c.abspath(),
        local_c.abspath()
    ]

    # the family root, for a face that belongs to one (see paf_staging.stage_shared_sources). it goes on
    # last so a face-local header always wins, and family headers carry the family's name as
    # their first path segment (e.g. "line/sky/sky.h") so they cannot shadow the face's own
    # scene/, theme/ or widgets/
    family_dir = ctx.path.find_dir('family')
    if family_dir:
        include_paths.append(family_dir.abspath())

    # one glob recurses the whole staged tree: c/core/ (pure), c/pebble/ (SDK), and any plugin's C,
    # such as c/dev/ (the harness, which the linker drops from any face that never calls it).
    # the framework's host specs are never staged, so none of them reach the watch
    c_sources = ctx.path.ant_glob('src/c/**/*.c') + lib_c.ant_glob('**/*.c')

    if family_dir:
        c_sources += family_dir.ant_glob('**/*.c', excl=['**/*.spec.c'])

    # emit/ is the pkjs build's output and holds nothing but the JS the watch ships. the specs,
    # the spec helpers, and the clay/builder pieces are left out by the tsconfig that
    # tools/pkjs/build-pkjs.ts writes, and the generated *.g.js components are copied in
    # beside it. so the whole tree goes
    js_sources = ctx.path.ant_glob('emit/**/*.js')

    binaries = []
    cached_env = ctx.env

    cflags = feature_cflags(ctx, read_manifest(ctx))
    if extra_cflags:
        cflags.extend(extra_cflags)

    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        ctx.set_group(ctx.env.PLATFORM_NAME)

        ctx.env.append_value('INCLUDES', include_paths)
        if cflags:
            ctx.env.append_value('CFLAGS', cflags)

        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)

        # a copy per platform, because the SDK appends to whatever list it is handed:
        # setup_pebble_cprogram adds appinfo.auto.c, resource_ids.auto.c and message_keys.auto.c
        # through append_to_attr, which extends the list in place. the first two are per-platform
        # nodes, but message_keys.auto.c lives at build/src/ and is shared, so handing the same
        # list to both platforms leaves it in there twice and the link fails on multiple
        # definitions of every MESSAGE_KEY_*
        ctx.pbl_build(
            source=list(c_sources),
            target=app_elf,
            bin_type='app'
        )

        binaries.append({'platform': platform, 'app_elf': app_elf})

    ctx.env = cached_env

    # emit/ keeps the source tree's shape, so the entry sits under the face's own folder: straight
    # at emit/src/pkjs/ for a face on its own, one folder deeper for a face in a family, and under the
    # face rather than the sandbox when a face feeds several targets
    entry = ctx.path.find_node(os.path.normpath(os.path.join('emit', source['face'], 'src', 'pkjs', 'index.js')))
    if not entry:
        ctx.fatal('No pkjs entry in emit/. tools/build.ts runs the pkjs build first, so build the face with paf build.')
    js_entry = entry.path_from(ctx.path)

    ctx.set_group('bundle')
    ctx.pbl_bundle(
        binaries=binaries,
        js=js_sources,
        js_entry_file=js_entry
    )
