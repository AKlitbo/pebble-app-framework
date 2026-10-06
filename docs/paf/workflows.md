# Workflows

## Setting Up a Fresh Clone

A clone has no `paf/` and no `node_modules` yet, since both are gitignored. One sync fills every unit:

```sh
git clone https://github.com/<you>/<face-repo>.git
cd <face-repo>
paf sync
paf status
```

Every unit should read `ready`. Then build a face from WSL, Linux, or macOS:

```sh
paf build <face>
```

The first build of each face is always clean, and says so. `paf doctor` checks the rest of the setup, the SDK included.

## Moving a Unit to a New Framework

Each unit moves on its own, so one family can take a new framework while the others stay where they are.

1. Run `paf status`. A unit whose `TAG` is behind `LATEST` has a newer framework to move to. `LATEST` is as of the last fetch, and `paf pin` fetches again anyway.
2. Run `paf pin <unit> latest`, or name a tag. It prints every breaking entry in the framework changelog between the two tags. Read them before going on, since each one says what to change in the unit.
3. Make those changes. The full changelog is in `paf/CHANGELOG.md` once the pin has moved.
4. Run `paf gen <face> all` for each face it names, since a new framework can change what the generators write.
5. Run `paf check`, `paf test`, `paf typecheck`, and `paf build <face>`. The build starts clean on its own, since `paf/` changed.
6. Commit `paf.config.json` and `package-lock.json` along with the changes. A teammate's next command picks up the new pin by itself.

## Working on the Framework Itself

To try a framework change in a face before it is tagged, point the face's unit at a framework clone:

```sh
paf use <unit> local ../pebble-app-framework
paf build <face>
```

The path defaults to `../pebble-app-framework` beside the repo, so it can be left out when the clone sits there. Edit the framework, then build again. Every command that readies the unit copies the clone's working tree in first, uncommitted edits included. `paf status` shows the unit as `local`, and `paf doctor` notes it.

When the change is tagged, move back:

```sh
paf use <unit> pinned       # back to the tag it pins
paf pin <unit> <new tag>    # or straight onto the new tag
```

`paf sync --locked` refuses a unit on a local framework, so a workflow can never build one by mistake.

## Switching between WSL and Windows

`paf build` only runs where the Pebble SDK does, but the other commands run on Windows too. A unit's `node_modules` holds native packages for the system that installed it, so a clone shared between WSL and Windows can only be installed for one at a time. `paf` stops rather than use the other system's install:

```
paf: watchfaces/my-family/node_modules was installed from linux, and its native packages only run there. Run paf sync --force to reinstall it for win32, which breaks it for the other one
```

`paf sync --force` reinstalls for the system you are on. Running it again from the other side switches back. Keeping all the work on one side of the clone avoids the switch.

A local framework path recorded from one system may not be there on the other, such as a `/mnt/e/...` path on Windows. Run `paf use <unit> local <path>` again with the path as the current system sees it.

## Adding a Plugin

1. List it under `plugins` in the unit's `paf.config.json`, with `{}` when it takes no settings.
2. Run `paf sync`. It refills `paf/` with the plugin and installs its packages.
3. Run `paf gen <face> all` if the plugin brings a generator.

Dropping a plugin is the same in reverse. Its folder leaves `paf/plugins/` on the next sync.

## Generators

`paf gen <face> all` runs the framework's generators first, then each listed plugin's in the order `paf.config.json` lists them, then the unit's own.

A unit's own generator with an `after` runs straight after the generator it names. One without `after` runs last. A generator naming one nobody offers, or a ring of `after`s, is refused with the names involved.

A generator only runs under `all` on a face that holds the file or folder its `when` names, such as `frame/frame.config.json` for `background`. For a `when` under `src/pkjs/`, a face in a family also counts its core's matching folder under `core/pkjs/`, where a family keeps its shared Clay builder. A unit generator placed after `clay` still runs on a face with no Clay page, unless it has a `when` of its own.

`paf gen <face> <kind>` runs one generator whatever its `when` says, and passes on the arguments typed after it. Under `all` each generator gets the arguments its plugin set for it, such as every frame and every theme for `background`.

## CI

The CLI repo has an action that installs `paf` and runs `paf sync --locked`. Load it at the release tag, then build:

```yaml
steps:
  - uses: actions/checkout@v7

  - uses: AKlitbo/pebble-app-framework-cli/.github/actions/sync@v2.0.0
    with:
      face: my-face

  - uses: AKlitbo/pebble-app-framework/.github/actions/setup-pebble@v4.0.0
    with:
      face: my-face

  - run: paf build my-face
```

**`face`** fills only the unit that face builds from. Leave it empty to fill every unit, such as for a job that runs `paf check` or `paf test` across the repo.

**`node-version`** defaults to `24`. It has to fall inside the framework's `engines.node`, which on framework 4 is 22.18 or later on Node 22, or 24.2 or later.

`--locked` installs from the committed lock with `npm ci` and never writes `paf.config.json` or the lock. A lock or a pin that is out of step fails the job rather than being fixed in CI. `paf doctor` reports a workflow that loads the framework's actions at a tag older than the newest pin as a problem, and exits `1`.

## The Cache

`paf` keeps one bare clone of the framework, the mirror, and fills every unit on the machine from it:

* `~/.cache/paf/` on Linux, WSL, and macOS, or `$XDG_CACHE_HOME/paf/` when that is set
* `%LOCALAPPDATA%\paf\` on Windows

`PAF_HOME` moves it. The mirror is safe to delete, and the next command that needs it clones it again.

`PAF_REPO` fetches the framework from another URL or a local path, such as a fork or a clone holding tags that are not pushed yet. A relative path is read from the folder `paf` runs in. Each source gets a mirror of its own.

```sh
PAF_REPO=../pebble-app-framework paf sync
```
