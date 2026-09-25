"""
The helpers every build target's wscript shares. A wscript is generated from
tools/waf/wscript.template by build-manifests.ts, which fills in where the framework, the face and
its family core sit. The wscript imports this module directly and calls stage_shared_sources and
build_face with those folders. waf runs the wscript as part of build.sh, once per sandbox under
targets/<target>/.

Every folder in the source dict the wscript passes is relative to the repo root:

    engine       the framework, such as lib
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


# the framework's C roots the build compiles. everything else in the framework (its ts/, tools/,
# docs, specs and git metadata) stays out of the sandbox, since the PebbleKit JS reaches the build
# already compiled into emit/
ENGINE_C_ROOTS = ('core', 'pebble', 'dev')


def stage_shared_sources(ctx, source):
    """
    Mirror the face's src/ and resources/, the framework's C, and the family core into this build
    folder (targets/<target>/) so the SDK sees a normal, self-contained project. The framework's
    c/core, c/pebble and c/dev are staged under its own folder name, the same one the face's imports use,
    and nothing else of the framework is.

    emit/ is not staged. build:pkjs writes it straight into this sandbox (targets/<target>/emit)
    keeping the source tree's shape, so the entry's relative requires into the framework's ts/ already
    resolve here.

    Only files whose size or mtime differ are copied, and mtimes are preserved, so an
    untouched rebuild does not force a full recompile. Staged files whose source is
    gone are dropped, and so are the host specs (*.spec.c), which never reach the watch.

    The weather tables under c/ are generated but committed, so the build compiles them as they
    are. The framework's spec fails when one no longer matches its source.
    """
    # the framework is always mounted in a folder of its own. staged at the sandbox root, cutting
    # it back to its C below would take the face's own sources with it
    if os.path.normpath(source['engine']) in ('.', ''):
        ctx.fatal('The framework has to sit in a folder of its own, not at the repo root.')

    repo_root = _repo_root(ctx).abspath()
    face_root = os.path.normpath(os.path.join(repo_root, source['face']))
    if not os.path.isfile(os.path.join(face_root, 'config', 'pebble.appinfo.json')):
        ctx.fatal('No face at "{}". Run build-manifests.ts again to rewrite this sandbox.'.format(source['face']))

    engine_root = os.path.join(repo_root, source['engine'])
    sources = {
        'src': os.path.join(face_root, 'src'),
        'resources': os.path.join(face_root, 'resources'),
    }
    for name in ENGINE_C_ROOTS:
        sources[os.path.join(source['engine'], 'c', name)] = os.path.join(engine_root, 'c', name)

    # a face nested inside a family folder also gets that family's core: code shared by a handful
    # of related faces but not by all of them, so it cannot live in the framework. it is staged under
    # the family's own name, and that name is a path segment the build synthesises rather than one
    # anybody types, which is what keeps a family header from colliding with a face-local folder
    family = _family_name(source)
    if family:
        sources[os.path.join('family', family)] = os.path.join(repo_root, source['family_core'], 'c')

    for name, src_dir in sources.items():
        dst = os.path.join(ctx.path.abspath(), name)
        _refuse_link(ctx, dst)
        if os.path.isdir(src_dir):
            _mirror_tree(src_dir, dst)

    # _mirror_tree only prunes inside the one root it is handed, so anything else already in the
    # sandbox is cut back to what this build staged. that covers a family the face has left too
    staged_engine = os.path.join(ctx.path.abspath(), source['engine'])
    _keep_only(ctx, staged_engine, {'c'})
    _keep_only(ctx, os.path.join(staged_engine, 'c'), set(ENGINE_C_ROOTS))
    _keep_only(ctx, os.path.join(ctx.path.abspath(), 'family'), {family} if family else set())


def _refuse_link(ctx, folder):
    """Stop the build if a sandbox folder, or any folder above it in the sandbox, is a link. Staging or pruning through it would write into its target, which could be the real framework."""
    sandbox = ctx.path.abspath()
    path = sandbox
    for part in os.path.relpath(folder, sandbox).split(os.sep):
        path = os.path.join(path, part)
        if os.path.islink(path):
            ctx.fatal('{} is a link, not a folder of its own. Delete it and build again.'.format(path))


def _keep_only(ctx, folder, names):
    """Delete everything directly inside folder whose name is not in names. A missing folder is fine."""
    _refuse_link(ctx, folder)
    if not os.path.isdir(folder):
        return

    for name in os.listdir(folder):
        if name in names:
            continue
        path = os.path.join(folder, name)
        if os.path.isdir(path) and not os.path.islink(path):
            shutil.rmtree(path)
        else:
            os.remove(path)


def _staged(name):
    """Whether a source file belongs in the sandbox. A host spec never does."""
    return not name.endswith('.spec.c')


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
            if not _staged(name):
                continue
            src_file = os.path.join(root, name)
            dst_file = os.path.join(dst_root, name)
            if _needs_copy(src_file, dst_file):
                shutil.copy2(src_file, dst_file)

    # drop staged files (and now-empty dirs) whose source has gone away
    for root, dirs, files in os.walk(dst, topdown=False):
        rel = os.path.relpath(root, dst)
        src_root = src if rel == '.' else os.path.join(src, rel)
        for name in files:
            if not _staged(name) or not os.path.exists(os.path.join(src_root, name)):
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


def _read_manifest(ctx):
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


def _feature_cflags(ctx, manifest):
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

    media = pebble.get('resources', {}).get('media', [])
    if not isinstance(media, list) or not all(isinstance(m, dict) for m in media):
        ctx.fatal('package.json resources.media has to be a list of resources.')
    names = set(m.get('name') for m in media)

    # the shared weather-icon lookup (lib/c/.../ui/weather/icons.c) is gated on
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


def build_face(ctx, source, extra_cflags=None):
    """
    The build: resolve include paths, collect the face's C and JS plus the framework's, compile the
    app per target platform, bundle with PebbleKit JS, and archive the .pbw afterward.
    extra_cflags are appended to every platform's CFLAGS (the watchapp build passes
    -DBUILD_WATCHAPP).
    """
    # the framework as staged into this sandbox. its c/core/ is pure (SDK-free and host-testable),
    # its c/pebble/ needs the SDK, and its c/dev/ is the screenshot harness. the PebbleKit JS is
    # compiled out of its ts/ into emit/ before the build, so only the C comes from here
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
    # moving a folder never touches this list. c/ itself is a root too, so the dev harness keeps its
    # "dev/" prefix without being one more root of its own
    include_paths = [
        lib_c_core.abspath(),
        lib_c_pebble.abspath(),
        lib_c.abspath(),
        local_c.abspath()
    ]

    # the family root, for a face that belongs to one (see stage_shared_sources). it goes on
    # last so a face-local header always wins, and family headers carry the family's name as
    # their first path segment (e.g. "line/sky/sky.h") so they cannot shadow the face's own
    # scene/, theme/ or widgets/
    family_dir = ctx.path.find_dir('family')
    if family_dir:
        include_paths.append(family_dir.abspath())

    # one glob recurses the whole shared tree: lib/c/core/ (pure), lib/c/pebble/ (SDK), and
    # lib/c/dev/ (the harness, which the linker drops from any face that never calls it).
    # the framework's host specs are never staged, so none of them reach the watch
    c_sources = ctx.path.ant_glob('src/c/**/*.c') + lib_c.ant_glob('**/*.c')

    if family_dir:
        c_sources += family_dir.ant_glob('**/*.c', excl=['**/*.spec.c'])

    # emit/ is build:pkjs output and holds nothing but the JS the watch ships. the specs,
    # the spec helpers, and the clay/builder pieces are left out by the tsconfig that
    # tools/pkjs/build-pkjs.ts writes, and the generated *.g.js components are copied in
    # beside it. so the whole tree goes
    js_sources = ctx.path.ant_glob('emit/**/*.js')

    binaries = []
    cached_env = ctx.env

    cflags = _feature_cflags(ctx, _read_manifest(ctx))
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
