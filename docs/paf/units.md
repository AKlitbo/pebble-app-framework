# Units

A unit is a folder with a `paf.config.json`. Each unit pins its own framework tag, keeps its own copy of the framework in `paf/`, and has its own `package.json`, lock, and `node_modules`. It works like a small repo of its own inside the face repo.

`paf` finds the repo from the nearest folder above it holding `.git`, so it runs from anywhere inside the repo, a family's folder included. Outside a repo it stops with `this is not inside a git repo. Run paf from a face repo`.

## Where Units Sit

`paf` looks in two places:

* the repo root, for a repo that is one face or one family
* each folder straight under `watchfaces/` or `watchapps/`, for a family or a face of its own

The two folders only sort faces from apps, and a unit in either is laid out the same. A unit at the root is named after the repo's folder. A unit under `watchfaces/` or `watchapps/` is named after its own folder, and two units with the same name are refused.

## Finding the Faces

A face is a folder holding a `pebble.appinfo.json` at its own root.

* **A face of its own:** the appinfo sits at the unit's root, and the face is named by the `name` in it.
* **A family:** the unit has a `core/` folder for the code its faces share, and each folder beside `core/` holding an appinfo is a face, named by its folder.

A face's name has to be unique across the whole repo, since commands like `paf build` take a face by name alone.

## One Face at the Root

A repo that is a single face, such as the LCARS face:

```
my-face/
  paf.config.json
  package.json          workspaces: ["paf", "paf/plugins/*"]
  package-lock.json
  pebble.appinfo.json   this makes the root a face
  src/
  resources/
  tsconfig.json
  paf/                  filled by paf sync
  node_modules/
  targets/              build output
```

## One Family at the Root

A repo that is a single family keeps `core/` and its faces at the root:

```
my-family/
  paf.config.json
  package.json
  package-lock.json
  core/                 the code every face in the family shares
  first-face/           pebble.appinfo.json, src/, resources/
  second-face/
  paf/
  node_modules/
  targets/
```

## Units under watchfaces/

A repo with several units keeps each under `watchfaces/` or `watchapps/`. Each one is a family or a face of its own, laid out as above:

```
my-faces/
  watchfaces/
    my-family/          a family
      paf.config.json
      package.json
      core/
      first-face/
      second-face/
      paf/
    my-face/            a face of its own
      paf.config.json
      package.json
      pebble.appinfo.json
      src/
      paf/
```

## paf.config.json

The unit's settings. `paf pin` writes `framework` and `commit` and leaves every other key as it was.

```json
{
  "framework": "v4.0.0",
  "commit": "400253928ca9a73316ebb33082258be9ca9df5a2",
  "plugins": {
    "icons": { "sources": "../../icons" },
    "thumbnails": {},
    "dev": {},
    "code-style": { "prettier": true }
  },
  "gen": {
    "palettes": { "script": "tools/generate-palettes.ts", "after": "clay" }
  }
}
```

**`framework`:** the framework tag the unit builds against. It has to be a framework 4 version tag, such as `v4.0.0`.

**`commit`:** the commit the tag pointed at when it was pinned. If the tag later points somewhere else, `paf sync` stops rather than build against a framework nobody chose. `paf pin` records it, and so does the first `paf sync` when it is missing.

**`plugins`:** the framework plugins the unit uses, each with its settings, or `{}` for none. Only listed plugins are copied into `paf/plugins/`, and only their generators, checks, and tools run. The order matters, since `paf gen <face> all` runs the plugins' generators in the order they are listed.

**`gen`:** the unit's own generators. Each one has a `script`, a `.ts` file with its path from the unit, and can take an `after` naming the generator it runs straight after, and a `when` naming the file or folder a face needs for it to run. See [Generators](workflows.md#generators).

A name made only of digits, a generator called `all`, and the name `__proto__` are refused.

## The Framework's Plugins

Framework 4 ships these. List one under `plugins` to use it.

| Plugin | What `paf` runs from it |
| :-- | :-- |
| `icons` | the `icons` generator and its check. `sources` is the folder of icon SVGs, from the unit |
| `thumbnails` | the `thumbnails` generator and its check |
| `frame` | the `background` generator, for faces with a `frame/frame.config.json` |
| `dev` | the `clay-preview` and `tap-walk` tools |
| `code-style` | `paf lint` and `paf format`. `"prettier": true` turns on Prettier for `paf format` |

The framework itself, with no plugin listed, offers the `clay` generator, the check that its output is current, and the build.

## package.json

`npm` installs the unit from its own `package.json`, so every unit needs one, along with a `package-lock.json`. It has to list the framework and its plugins as workspaces:

```json
{
  "private": true,
  "workspaces": ["paf", "paf/plugins/*"],
  "engines": { "node": "^22.18.0 || >=24.2.0" },
  "scripts": {
    "test": "vitest run"
  }
}
```

Without the workspaces npm never installs the framework's packages or the plugins', and every command that readies the unit stops and says what to add. `paf test` runs the unit's own `test` script, so a unit with specs keeps its own `vitest.config.ts`.

## .gitignore

Everything `paf` fills or writes is ignored:

```
/paf/
/paf.paf-*/
/node_modules/
/targets/
```

`paf.paf-new/` and `paf.paf-old/` only exist for a moment while `paf/` is swapped for a new copy. `paf doctor` reports any of these folders that git would pick up.

## What paf/ Holds

`paf/` is a copy of the framework's `src/` folder at the pinned commit. It leaves out the framework's specs, their fixtures, and any plugin the unit does not list. It has no `.git`, and an edit made there is lost the next time it is filled. To work on the framework itself, point the unit at a clone with [paf use](commands.md#paf-use).

A face imports the framework by relative path from `paf/`, and the build stages the framework's C from there too. The editor, the specs, and the build all read the same `paf/`, so each unit checks and builds against its own framework.
