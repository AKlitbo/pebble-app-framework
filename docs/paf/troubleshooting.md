# Troubleshooting

Start with `paf doctor`. It checks git, Node, the pins, every unit's layout, the SDK, and the workflows in one go, and names what to fix. `paf status` then shows where each unit stands.

Every message below is quoted as `paf` prints it, with the unit and face names from an example repo. A command that stops prints its message after `paf:`. One that runs over several units prints each unit's problem after the unit's name, then a closing line such as `sync failed in watchfaces/mosaic`.

## The Tag Moved

```
watchfaces/mosaic: v4.0.0 now points at <new commit>, but mosaic/paf.config.json recorded <old commit>. If the move is expected, run paf pin mosaic v4.0.0 to take it
```

The framework tag the unit pins was moved to another commit after the unit recorded it. `paf` stops rather than quietly build against a framework nobody chose. If the move is expected, run the `paf pin` it names, which records the new commit. Then commit `paf.config.json`.

## A Framework 3 Pin

```
watchfaces/mosaic: mosaic/paf.config.json pins v3.0.0, which is framework 3 and needs paf 1.0.0. This paf fills framework 4, so move the unit to a framework 4 tag with paf pin
```

`paf` 2.0.0 only fills framework 4. Move the unit with `paf pin mosaic latest` once its faces are ready for framework 4, or keep `paf` 1.0.0 for it until then.

`paf pin` refuses a framework 3 tag the same way, and lists the framework 4 tags it would take.

## node_modules from the Other System

```
paf: watchfaces/mosaic/node_modules was installed from linux, and its native packages only run there. Run paf sync --force to reinstall it for win32, which breaks it for the other one
```

The unit was installed from WSL and this command ran on Windows, or the other way round. Run `paf sync --force` on the system you want to use. See [Switching between WSL and Windows](workflows.md#switching-between-wsl-and-windows).

## The Workspaces Are Missing

```
paf: watchfaces/mosaic/package.json does not list paf/plugins/* in its workspaces, so npm never installs the plugins' packages. Make it "workspaces": ["paf", "paf/plugins/*"]
```

```
paf: watchfaces/mosaic has no package.json, so npm would install into the folder above it. Give it one with "workspaces": ["paf", "paf/plugins/*"]
```

Every unit needs its own `package.json` listing both workspaces. See [package.json](units.md#packagejson).

## A paf/ That paf Did Not Fill

```
paf: /work/pebble-watchfaces/watchfaces/mosaic/paf holds a framework paf did not put there. Remove it first, with git rm paf for a submodule
```

`paf/` already holds files `paf` has no record of filling, such as a framework mounted there by hand as a git submodule. It could hold uncommitted work, so `paf` leaves it for you to remove. Run `git rm paf` in the unit for a submodule, or move the folder away, then sync.

## paf sync --locked Refuses

`--locked` never writes `paf.config.json` or the lock, so anything it would have to write stops it instead.

```
watchfaces/mosaic: watchfaces/mosaic has no package-lock.json, and --locked writes none
```

Run `paf sync` once without `--locked` and commit the lock it writes.

```
watchfaces/mosaic: mosaic/paf.config.json records no commit for v4.0.0, and --locked writes none. Run paf pin mosaic v4.0.0
```

Run the `paf pin` it names and commit `paf.config.json`.

```
pebble-watchface-lcars: ./paf is on the local framework at /home/me/src/pebble-app-framework, not its pinned tag. Run paf use pebble-watchface-lcars pinned first
```

The unit is on a local framework from `paf use`. Put it back with `paf use <unit> pinned`.

When `npm ci` itself fails, the lock is out of step with a `package.json`. Run `paf sync` without `--locked`, then commit the updated `package-lock.json`.

## A Plugin Is Missing

```
paf: the unit lists the plugin frames, which v4.0.0 does not have. It has code-style, dev, frame, icons, and thumbnails
```

The unit lists a plugin the tag does not have, or misspells one. Fix the name under `plugins`, or move to a tag that has it.

```
paf: no generator called background. The frame plugin offers it, so list it under plugins in paf.config.json and run paf sync
```

The generator or tool comes from a plugin the unit does not list. Add it under `plugins` and run `paf sync`. See [Adding a Plugin](workflows.md#adding-a-plugin).

## The Wrong Node

```
watchfaces/mosaic: paf/package.json asks for Node ^22.18.0 || >=24.2.0, and this is 23.1.0. Outside it a tool can stop partway, or stop before it starts, so run paf from a Node inside it
```

The framework's tools only run inside the Node range its `package.json` names. Switch to a Node inside it, such as the newest 24. `paf` itself runs on Node 23, so `sync`, `status`, and `pin` still work there.

## An Appinfo Left in config/

```
paf: watchfaces/mosaic/gridlock/config/pebble.appinfo.json is where framework 3 keeps an appinfo. Move each up a folder, beside the face's src/, since framework 4 finds a face by the pebble.appinfo.json at its own root
```

Framework 4 finds a face by the `pebble.appinfo.json` at its own root. Move each one named up a folder.

## Files Left from paf 1.0.0

```
paf: watchfaces/mosaic still has a paf.json, which paf 1.0.0 reads. This paf reads paf.config.json. Move each unit by hand, then delete its paf.json
```

`paf` 2.0.0 reads `paf.config.json` instead. Move the settings across by hand, then delete `paf.json`. Every command stops until each one is gone, so a repo half moved never syncs some units and not others.

`paf doctor` also finds a `lib/` that `paf` 1.0.0 filled:

```
problem  watchfaces/mosaic/lib is left from paf 1.0.0, which filled it. Delete it, since paf 2.0.0 fills paf/
```

## Workflows on an Older Framework

```
problem  .github/workflows/ci.yml loads the framework's actions at v3.0.0, older than v4.0.0. Move them to @v4.0.0
```

A workflow loads the framework's actions, such as `setup-pebble`, at a tag older than the newest one a unit pins. Move each `@` to the tag `paf doctor` names.

## An Older SDK

```
behind   SDK 4.32.0 is older than 4.33.1, which v4.0.0 was built with (mosaic)
```

The SDK `pebble` reports is older than the one the framework tag was built and tested with. Install the SDK it names with `pebble sdk install`. A newer SDK is only a `note`.

## Names That Clash

```
paf: two units are named mosaic, at watchfaces/mosaic and watchapps/mosaic. Rename one of the folders
```

```
paf: two faces are named gridlock, in watchfaces/mosaic and watchfaces/gridlock. A face's name has to be unique in the repo
```

Commands take a unit or a face by name alone, so every name has to point at one place. Rename one of the folders, or the `name` in a face's appinfo.

## Nothing Found

```
paf: this is not inside a git repo. Run paf from a face repo
```

`paf` works on the git repo it runs inside. Change into the face repo first.

```
paf: no units here. A unit is a folder with a paf.config.json holding { "framework": "<tag>" }, at the repo root or under watchfaces/ or watchapps/
```

The repo has no `paf.config.json` where `paf` looks. See [Where Units Sit](units.md#where-units-sit).

```
paf: no unit or face called gridlok. Run paf status for the units here
```

The name is misspelled, or the face is in a unit whose appinfo could not be read, which the message then names. `paf status` lists every unit and face.

## TypeScript Not Found

```
watchfaces/mosaic has no typescript installed. Delete its node_modules and run paf sync mosaic
```

`paf typecheck` runs the TypeScript the unit installed, and found none inside the unit. Do what the message says.

## A paf Too Old for the Framework

```
paf: toolchain.json is format 2, which this paf does not read. Update paf
```

The framework tag is newer than this `paf` understands. Install the latest `paf` release, as under [Install](index.md#install).
