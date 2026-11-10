"""
Builds a staged sandbox: the include paths, the C and the PebbleKit JS, one app per platform, and
the bundle.
"""

import hashlib
import os
import re

from paf_features import define_cflags, feature_cflags, read_manifest, text_define_cflags

# the lines tools/pkjs/settings-page.ts writes into page/settings_page.h
FINGERPRINT_LINE = re.compile(r'^// sandbox fingerprint: ([0-9a-f]{64})$', re.MULTILINE)
COUNTED_LINE = re.compile(r'^// counted on: (.*)$', re.MULTILINE)
FORMAT_LINE = re.compile(r'^// format: (\d+)$', re.MULTILINE)

# the header format tools/pkjs/settings-page.ts writes, its HEADER_FORMAT. a header without it was
# written before the header carried the defaults, so its fingerprint can match while the defaults are missing
HEADER_FORMAT = 2


def sandbox_fingerprint(sandbox):
    """
    The sandbox's fingerprint, worked out the way sandboxFingerprint in tools/pkjs/settings-page.ts
    works it out: a sha256 over package.json and every file under emit/, in order of their paths
    from the sandbox with forward slashes, each as its path, a newline, its bytes, and a newline.
    """
    files = []
    emit = os.path.join(sandbox, 'emit')
    for root, _dirs, names in os.walk(emit):
        for name in names:
            full = os.path.join(root, name)
            if os.path.isfile(full) and not os.path.islink(full):
                files.append(os.path.relpath(full, sandbox).replace(os.sep, '/'))
    if os.path.isfile(os.path.join(sandbox, 'package.json')):
        files.append('package.json')

    digest = hashlib.sha256()
    for rel in sorted(files, key=lambda path: path.encode('utf-8')):
        digest.update(rel.encode('utf-8') + b'\n')
        with open(os.path.join(sandbox, *rel.split('/')), 'rb') as handle:
            digest.update(handle.read())
        digest.update(b'\n')
    return digest.hexdigest()


def page_header_problem(sandbox):
    """
    What is wrong with the sandbox's page/settings_page.h, or None when it was written for this very
    build. paf build writes the header from the phone code it just compiled, so a missing header, or
    one whose fingerprint does not match the sandbox's package.json and emit/, would hand the C counts
    from a page that is not the one the face ships. A header of another format is refused before its
    fingerprint, since one from before the defaults can match the fingerprint and still lack them.
    """
    header = os.path.join(sandbox, 'page', 'settings_page.h')
    if not os.path.isfile(header):
        return 'No page/settings_page.h in this sandbox. Build the face with paf build, which writes it.'

    with open(header, 'r') as handle:
        text = handle.read()
    form = FORMAT_LINE.search(text)
    if not form or int(form.group(1)) != HEADER_FORMAT:
        return ('page/settings_page.h was written by another version of paf build. '
                'Build the face with paf build, which writes it.')
    found = FINGERPRINT_LINE.search(text)
    if not found or found.group(1) != sandbox_fingerprint(sandbox):
        return ('page/settings_page.h was written for another build of this sandbox. '
                'Build the face with paf build, which writes it.')
    return None


def page_platforms_problem(sandbox, target_platforms):
    """
    What is wrong with the platforms page/settings_page.h was counted on, or None when they cover every
    platform this build makes. The build counts the page on the appinfo's targetPlatforms, or on its own
    list of the SDK's platforms when the appinfo has none, so an SDK with a platform that list lacks
    would build it with counts from the other platforms' pages. A header with no such line has no counts.
    """
    with open(os.path.join(sandbox, 'page', 'settings_page.h'), 'r') as handle:
        found = COUNTED_LINE.search(handle.read())
    if not found:
        return None
    counted = found.group(1).split()
    missing = [platform for platform in target_platforms if platform not in counted]
    if missing:
        return ('page/settings_page.h counts the settings page as it opens on {}, but this build also makes '
                'the face for {}. List the face\'s platforms in its appinfo\'s targetPlatforms.'
                .format(', '.join(counted), ', '.join(sorted(missing))))
    return None


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

    # the header tools/build.ts writes from the face's settings page, which settings_catalog.h
    # includes for the choice counts. it is always written, empty for a face with no page, and it
    # carries the fingerprint of the sandbox it was written for, so a sandbox without it, or one
    # whose phone code changed since, was not built by paf build
    problem = page_header_problem(ctx.path.abspath()) or \
        page_platforms_problem(ctx.path.abspath(), list(ctx.env.TARGET_PLATFORMS))
    if problem:
        ctx.fatal(problem)
    page_dir = ctx.path.find_dir('page')

    # the framework's C roots and the face-local dir are on the include path. every shared header is
    # included with its folder relative to a root (e.g. "ui/engine/engine.h" or "clock/beats.h") so
    # moving a folder never touches this list. c/ itself is a root too, so a plugin's folder, such as
    # the dev harness, keeps its "dev/" prefix without being one more root of its own. page/ goes
    # first, so the build's settings_page.h wins over any header of that name in the face
    include_paths = [
        page_dir.abspath(),
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

    # the framework's own feature switches, then any define the face set for itself, then the text
    # defines the build worked out for it
    manifest = read_manifest(ctx)
    cflags = feature_cflags(ctx, manifest) + define_cflags(ctx, manifest) + text_define_cflags(ctx, manifest)
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
