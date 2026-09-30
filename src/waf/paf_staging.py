"""
Stages a face's sandbox: the face's own sources, the framework's C, any listed plugin's C, and the
family core, copied into targets/<target>/ so the SDK sees a self-contained project.

A wscript is generated from waf/wscript.template by build-manifests.ts, which fills in where the
framework, the face and its family core sit. The wscript puts this folder first on the path and
imports this module and paf_build.py by bare name, which is why each carries a paf_ prefix no module
waf or the SDK loads could share. It calls stage_shared_sources here, then build_face there, once
per sandbox under targets/<target>/.

Every folder in the source dict the wscript passes is relative to the repo root:

    engine       the framework, such as paf
    face         the face, such as gridlock in a family, or . for a face on its own
    family_core  the face's family core, which is core in a family, or empty for none
    family       the family's name, such as mosaic, or empty for none
"""

import os
import shutil


def _repo_root(ctx):
    """
    The repo root. A sandbox always sits at targets/<target>/ under it, so it is two levels up.
    """
    return ctx.path.parent.parent


def _family_name(ctx, source):
    """
    The family a face belongs to, or None for a face in no family. build-manifests.ts works the
    name out, since a family at the root of its own project has no folder above its core to read.
    """
    if not source['family_core']:
        return None
    return source['family'] or None


# the framework's own C roots the build compiles. a plugin's C joins them from the plugin's c/
# folder. everything else in the framework (its ts/, tools/, docs, specs and git metadata) stays out
# of the sandbox, since the PebbleKit JS reaches the build already compiled into emit/
ENGINE_C_ROOTS = ('core', 'pebble')


def _plugin_c_roots(ctx, engine_root):
    """
    Every folder under a plugin's c/, by the name it is staged under beside the framework's own C.

    A plugin only sits in the framework's plugins/ when the unit lists it, since paf copies nothing
    else, so a folder being there is the whole switch. The name is what a face includes it by, such
    as "dev/dev_walk.h", so two plugins with the same folder, or a plugin with a core or pebble folder,
    would shadow each other and the build stops rather than pick one. Names are compared without case,
    since a Windows drive treats Dev and dev as one folder. A C source or header straight inside c/
    has no folder name to be included by, so it stops the build too rather than being left out
    quietly. Anything else there, such as a .DS_Store or Thumbs.db an OS leaves behind, is skipped.
    """
    roots = {}
    # each folder name in lower case, with the plugin that has it, so a second plugin's folder of the
    # same name is caught however its case is written
    claimed = {}
    plugins_dir = os.path.join(engine_root, 'plugins')
    if not os.path.isdir(plugins_dir):
        return roots

    for plugin in sorted(os.listdir(plugins_dir)):
        c_dir = os.path.join(plugins_dir, plugin, 'c')
        if not os.path.isdir(c_dir):
            continue
        for name in sorted(os.listdir(c_dir)):
            folder = os.path.join(c_dir, name)
            if not os.path.isdir(folder):
                if not name.lower().endswith(('.c', '.h')):
                    continue
                ctx.fatal('The {} plugin has c/{} straight inside its c/ folder. Move it into a folder of its own, which is the name a face includes it by.'.format(plugin, name))
            key = name.lower()
            if key in ENGINE_C_ROOTS:
                ctx.fatal("The {} plugin has a c/{} folder, which is the framework's own. Rename the plugin's folder.".format(plugin, name))
            if key in claimed:
                ctx.fatal('The {} and {} plugins both have a c/{} folder. Rename one of them.'.format(claimed[key], plugin, name))
            claimed[key] = plugin
            roots[name] = (plugin, folder)
    return roots


def _refuse_shadowing(ctx, plugin_roots, roots):
    """
    Stop the build when a plugin file sits at a path the face or the framework already has.

    The include path runs the framework's core and pebble, then the staged c/ holding the plugins,
    then the face's own src/c, and a header is included by its path from one of them. A plugin's
    dev/dev_walk.h beside a face's own dev/dev.h is fine, since only whole paths collide. A plugin
    header at the same path as one of the face's, of core or pebble, or of the family core, would
    quietly win or lose depending on that order, so the build names both rather than compile against
    either. Each root comes with the folder name its headers are included under, which is empty for
    all but the family core, staged under the family's own name. A host spec is never staged, so it
    is never checked.
    """
    for name, (plugin, folder) in plugin_roots.items():
        for walk_root, _dirs, files in os.walk(folder):
            for file in files:
                if not file.lower().endswith(('.c', '.h')) or not _staged(file):
                    continue
                rel = os.path.join(name, os.path.relpath(os.path.join(walk_root, file), folder))
                for label, root, under in roots:
                    if under:
                        head, _, rest = rel.partition(os.sep)
                        if head.lower() != under.lower():
                            continue
                        path = os.path.join(root, rest)
                    else:
                        path = os.path.join(root, rel)
                    if os.path.exists(path):
                        ctx.fatal('The {} plugin has c/{}, and {} has the same path. Rename one of them.'.format(plugin, rel.replace(os.sep, '/'), label))


def stage_shared_sources(ctx, source):
    """
    Mirror the face's src/ and resources/, the framework's C, and the family core into this build
    folder (targets/<target>/) so the SDK sees a normal, self-contained project. The framework's
    c/core and c/pebble are staged under its own folder name, the same one the face's imports use, and
    each folder under a listed plugin's c/ is staged beside them, so the dev plugin's c/dev lands at
    c/dev. Nothing else of the framework is.

    emit/ is not staged. The pkjs build writes it straight into this sandbox (targets/<target>/emit)
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
        ctx.fatal('No face at "{}". Build the face with paf build, which rewrites this sandbox.'.format(source['face']))

    engine_root = os.path.join(repo_root, source['engine'])
    sources = {
        'src': os.path.join(face_root, 'src'),
        'resources': os.path.join(face_root, 'resources'),
    }
    for name in ENGINE_C_ROOTS:
        sources[os.path.join(source['engine'], 'c', name)] = os.path.join(engine_root, 'c', name)
    family = _family_name(ctx, source)
    plugin_roots = _plugin_c_roots(ctx, engine_root)
    shadow_roots = [
        ('the face', os.path.join(face_root, 'src', 'c'), ''),
        ("the framework's core", os.path.join(engine_root, 'c', 'core'), ''),
        ("the framework's pebble", os.path.join(engine_root, 'c', 'pebble'), ''),
    ]
    if family:
        shadow_roots.append(('the family core', os.path.join(repo_root, source['family_core'], 'c'), family))
    _refuse_shadowing(ctx, plugin_roots, shadow_roots)
    for name, (_, folder) in plugin_roots.items():
        sources[os.path.join(source['engine'], 'c', name)] = folder

    # a face in a family also gets that family's core: code shared by a handful
    # of related faces but not by all of them, so it cannot live in the framework. it is staged under
    # the family's own name, and that name is a path segment the build synthesizes rather than one
    # anybody types, which is what keeps a family header from colliding with a face-local folder
    if family:
        sources[os.path.join('family', family)] = os.path.join(repo_root, source['family_core'], 'c')

    for name, src_dir in sources.items():
        dst = os.path.join(ctx.path.abspath(), name)
        _refuse_link(ctx, dst)
        if os.path.isdir(src_dir):
            _mirror_tree(src_dir, dst)

    # _mirror_tree only prunes inside the one root it is handed, so the staged framework and family
    # folders are cut back to what this build staged. that covers a family the face has left too
    # a folder at the sandbox root that this build never stages is left where it is, and nothing compiles it
    staged_engine = os.path.join(ctx.path.abspath(), source['engine'])
    _keep_only(ctx, staged_engine, {'c'})
    _keep_only(ctx, os.path.join(staged_engine, 'c'), set(ENGINE_C_ROOTS) | set(plugin_roots))
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
