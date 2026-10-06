# paf

`paf` is the command a face repo builds with. It pins each family or face in the repo to its own framework tag, copies that framework into the unit at `paf/`, and runs the framework's build, generators, checks, and tools against it. Moving one family to a new framework leaves every other unit on the tag it already has.

`paf build` runs `pebble build` for you, once the framework's build script has staged the face into `targets/`. Every other `pebble` command is yours to run the usual way, such as installing an app, the emulator, logs, screenshots, and SDK installs.

These pages cover `paf` 2.0.0, which fills framework 4 tags. The source and the release downloads are in the [pebble-app-framework-cli](https://github.com/AKlitbo/pebble-app-framework-cli) repo.

## Install

Each release on GitHub carries the built package. Install it with npm, in WSL and on Windows alike:

```sh
npm i -g https://github.com/AKlitbo/pebble-app-framework-cli/releases/download/v2.0.0/pebble-app-framework-cli-2.0.0.tgz
```

`paf` needs `git` and Node 22.18 or later, with the npm that ships with it. It has no other dependencies.

The framework's own tools ask for a narrower Node. Framework 4 takes `^22.18.0 || >=24.2.0`, so Node 22.18 and later on 22, or 24.2 and later. On Node 23 `paf` itself runs, but `paf build`, `gen`, `check`, `tool`, `lint`, and `format` stop with a message naming the range.

Check the install from inside a face repo:

```sh
paf help
paf doctor
```

A unit on framework 3 needs `paf` 1.0.0. `paf` 2.0.0 refuses a framework 3 pin and says so.

## Where It Runs

`paf build` runs where the Pebble SDK does, which is WSL, Linux, or macOS. On Windows itself it stops with `paf build runs where the Pebble SDK does, which on Windows means WSL`.

Every other command works on Windows too. A unit's `node_modules` holds native packages for one system, though, so pick one system per clone or see [Switching between WSL and Windows](workflows.md#switching-between-wsl-and-windows).

## A First Run

From the root of a face repo that is already laid out as units:

```sh
paf sync          # fill each unit's paf/ and install its node_modules
paf status        # each unit, its faces, its tag, and whether it is ready
paf build my-face # build one face, from WSL, Linux, or macOS
```

The `.pbw` lands in `targets/<face>/build/` inside the unit.

## The Pages

* [Units](units.md): what a unit is, the layouts `paf` reads, and `paf.config.json`.
* [Commands](commands.md): every command with its flags and an example of what it prints.
* [Workflows](workflows.md): setting up a clone, moving to a new framework, working on the framework itself, and CI.
* [Troubleshooting](troubleshooting.md): what each common error means and what to run.
