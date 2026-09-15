"""
The helpers every build target's wscript shares. A wscript is generated from
tools/waf/wscript.template by build-manifests.ts, which fills in where the engine, the face and
its family core sit. The wscript imports this module directly and calls stage_shared_sources,
build_conditions and build_face with those folders. waf runs the wscript as part of build.sh,
once per sandbox under targets/<target>/.

Every folder in the source dict the wscript passes is relative to the repo root:

    engine       the engine, such as lib
    face         the face, such as watchfaces/mosaic/gridlock, or . for a face at the root
    family_core  the face's family core, such as watchfaces/mosaic/core, or empty for none
"""

import os
import shutil
import json


def _repo_root(ctx):
    """
    The repo root. A sandbox always sits at targets/<target>/ under it, so it is two levels up.
    """
    return ctx.path.parent.parent


def _family_name(source):
    """
    The family a face belongs to, which is the folder its family core sits in, or None for a face
    in no family.
    """
    if not source['family_core']:
        return None
    return os.path.basename(os.path.dirname(os.path.normpath(source['family_core'])))


def build_conditions(ctx, source):
    """
    Regenerate the weather lookup tables (icons_table.g.h and friends) from the shared condition
    vocabulary in the engine's ts/weather/conditions.ts. It runs the engine copy staged into this
    sandbox, so the tables regenerate for this build without touching the engine checkout itself.
    Non-fatal: the generated headers are committed, so a node-less environment still builds with
    the last ones.
    """
    from waflib import Logs

    # the tools are ESM .ts in a package with no "type", which is what keeps the tsc-emitted
    # runtime .js CommonJS for the bundler. node detects the module type from the syntax and
    # warns about it, so silence just that warning rather than declare a type
    script = ctx.path.find_node(source['engine'] + '/tools/build-conditions.ts')
    cmd = ['node', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script.abspath()] if script else None
    if script and ctx.exec_command(cmd) != 0:
        Logs.warn('build-conditions: node unavailable; using committed icons_table.g.h')


def stage_shared_sources(ctx, source):
    """
    Mirror the face's src/ and resources/, the engine, and the family core into this build folder
    (targets/<target>/) so the SDK sees a normal, self-contained project. The engine is staged under
    its own folder name, the same one the face's imports use.

    emit/ is not staged. build:pkjs writes it straight into this sandbox (targets/<target>/emit)
    keeping the source tree's shape, so the entry's relative requires into the engine's ts/ already
    resolve here.

    Only files whose size or mtime differ are copied, and mtimes are preserved, so an
    untouched rebuild does not force a full recompile. Staged files whose source is
    gone are dropped.
    """
    repo_root = _repo_root(ctx).abspath()
    face_root = os.path.normpath(os.path.join(repo_root, source['face']))
    if not os.path.isfile(os.path.join(face_root, 'config', 'pebble.appinfo.json')):
        ctx.fatal('No face at "{}". Run build-manifests.ts again to rewrite this sandbox.'.format(source['face']))

    sources = {
        'src': os.path.join(face_root, 'src'),
        'resources': os.path.join(face_root, 'resources'),
        source['engine']: os.path.join(repo_root, source['engine']),
    }

    # a face nested inside a family folder also gets that family's core: code shared by a handful
    # of related faces but not by all of them, so it cannot live in the engine. it is staged under
    # the family's own name, and that name is a path segment the build synthesises rather than one
    # anybody types, which is what keeps a family header from colliding with a face-local folder
    family = _family_name(source)
    if family:
        sources[os.path.join('family', family)] = os.path.join(repo_root, source['family_core'], 'c')

    for name, src_dir in sources.items():
        if os.path.isdir(src_dir):
            _mirror_tree(src_dir, os.path.join(ctx.path.abspath(), name))

    _drop_stale_families(ctx.path.abspath(), family)


def _drop_stale_families(sandbox, family):
    """
    Drop any staged family that is not this face's any more.

    _mirror_tree only prunes inside the one root it is handed, so a face that changed families
    or left one would keep the old tree staged and the build would go on compiling it.
    """
    staged = os.path.join(sandbox, 'family')
    if not os.path.isdir(staged):
        return

    for name in os.listdir(staged):
        if name != family:
            shutil.rmtree(os.path.join(staged, name), ignore_errors=True)


def _mirror_tree(src, dst):
    """Copy src into dst, refreshing changed files and dropping ones src no longer has."""
    if not os.path.isdir(dst):
        os.makedirs(dst)

    # add or refresh anything that differs
    for root, _dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        dst_root = dst if rel == '.' else os.path.join(dst, rel)
        if not os.path.isdir(dst_root):
            os.makedirs(dst_root)
        for name in files:
            src_file = os.path.join(root, name)
            dst_file = os.path.join(dst_root, name)
            if _needs_copy(src_file, dst_file):
                shutil.copy2(src_file, dst_file)

    # drop staged files (and now-empty dirs) whose source has gone away
    for root, dirs, files in os.walk(dst, topdown=False):
        rel = os.path.relpath(root, dst)
        src_root = src if rel == '.' else os.path.join(src, rel)
        for name in files:
            if not os.path.exists(os.path.join(src_root, name)):
                os.remove(os.path.join(root, name))
        for name in dirs:
            staged = os.path.join(root, name)
            if not os.path.isdir(os.path.join(src_root, name)) and not os.listdir(staged):
                os.rmdir(staged)


def _needs_copy(src_file, dst_file):
    """True when dst is missing or differs from src in size or whole-second mtime."""
    if not os.path.exists(dst_file):
        return True
    src_stat = os.stat(src_file)
    dst_stat = os.stat(dst_file)
    return (src_stat.st_size != dst_stat.st_size
            or int(src_stat.st_mtime) != int(dst_stat.st_mtime))


def build_face(ctx, source, extra_cflags=None):
    """
    The build: resolve include paths, collect the face's C and JS plus the engine's, compile the
    app per target platform, bundle with PebbleKit JS, and archive the .pbw afterward.
    extra_cflags are appended to every platform's CFLAGS (the watchapp build passes
    -DBUILD_WATCHAPP).
    """
    # the engine as staged into this sandbox. its c/core/ is pure (SDK-free and host-testable) and
    # its c/pebble/ needs the SDK. the PebbleKit JS is compiled out of its ts/ into emit/ before
    # the build, so only the C comes from here
    engine_dir = ctx.path.find_dir(source['engine'])
    if not engine_dir:
        ctx.fatal('The engine is not staged at "{}" in this sandbox.'.format(source['engine']))

    lib_c = engine_dir.find_dir('c')
    lib_c_core = lib_c.find_dir('core')
    lib_c_pebble = lib_c.find_dir('pebble')
    # this face's own sources (grid engine, widgets, main, theme)
    local_c = ctx.path.find_dir('src/c')

    # only the engine's two C roots and the face-local dir are on the include path. every shared
    # header is included with its folder relative to a root (e.g. "ui/engine/engine.h" or
    # "clock/beats.h") so moving a folder never touches this list
    include_paths = [
        lib_c_core.abspath(),
        lib_c_pebble.abspath(),
        local_c.abspath()
    ]

    # the family root, for a face that belongs to one (see stage_shared_sources). it goes on
    # last so a face-local header always wins, and family headers carry the family's name as
    # their first path segment (e.g. "line/sky/sky.h") so they cannot shadow the face's own
    # scene/, theme/ or widgets/
    family_dir = ctx.path.find_dir('family')
    if family_dir:
        include_paths.append(family_dir.abspath())

    # one glob recurses the whole shared tree: lib/c/core/ (pure) + lib/c/pebble/ (SDK).
    # drop the colocated host tests (*.spec.c) and the vendored test harness (spec/) so
    # they never spend a byte on the watch
    c_sources = ctx.path.ant_glob('src/c/**/*.c') + lib_c.ant_glob(
        '**/*.c', excl=['**/*.spec.c', 'spec/**'])

    if family_dir:
        c_sources += family_dir.ant_glob('**/*.c', excl=['**/*.spec.c'])

    # emit/ is build:pkjs output and holds nothing but the JS the watch ships: the specs
    # and the clay/builder pieces are dropped at the tsc level (config/tsconfig.pkjs.json),
    # and the generated *.g.js components are copied in beside it. so the whole tree goes
    js_sources = ctx.path.ant_glob('emit/**/*.js')

    binaries = []
    cached_env = ctx.env

    cflags = []
    pkg_node = ctx.path.find_node('package.json')
    if pkg_node:
        try:
            with open(pkg_node.abspath(), 'r') as pkg_f:
                pkg_data = json.load(pkg_f)
                mkeys = pkg_data.get('pebble', {}).get('messageKeys', [])
                if isinstance(mkeys, list):
                    for mk in mkeys:
                        if isinstance(mk, str):
                            cflags.append('-DHAS_MESSAGE_KEY_' + mk + '=1')
                elif isinstance(mkeys, dict):
                    for mk in mkeys.keys():
                        cflags.append('-DHAS_MESSAGE_KEY_' + mk + '=1')

                # the shared weather-icon lookup (lib/c/.../ui/weather/icons.c) is gated on
                # HAS_WEATHER_ICONS. it references the ICON_WEATHER_NOW_* set via generated
                # tables, so only a face that ships those icons should compile it. the whole
                # set travels together, so the always-present fallback is a reliable proxy.
                media = pkg_data.get('pebble', {}).get('resources', {}).get('media', [])
                if isinstance(media, list) and any(
                        isinstance(m, dict) and m.get('name') == 'ICON_WEATHER_NOW_NA' for m in media):
                    cflags.append('-DHAS_WEATHER_ICONS=1')

                # a face that bundles both Quiet Time marks can draw the slot either way, the way
                # bluetooth does. one that only ships the muted one draws it when it applies and
                # leaves the slot empty otherwise
                if isinstance(media, list) and any(
                        isinstance(m, dict) and m.get('name') == 'ICON_QUIET_ON' for m in media):
                    cflags.append('-DHAS_QUIET_PAIR=1')
        except Exception:
            pass

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
    # at emit/src/pkjs/ for a face at the root, deeper for one under watchfaces/, and under the face
    # rather than the sandbox when a face feeds several targets
    entry = ctx.path.find_node(os.path.normpath(os.path.join('emit', source['face'], 'src', 'pkjs', 'index.js')))
    if not entry:
        ctx.fatal('No pkjs entry in emit/: did build:pkjs run for this face?')
    js_entry = entry.path_from(ctx.path)

    ctx.set_group('bundle')
    ctx.pbl_bundle(
        binaries=binaries,
        js=js_sources,
        js_entry_file=js_entry
    )
