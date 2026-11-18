/**
 * A builder's palette: a tab per panel size, a row of group tabs under it, the draggable panel
 * tiles, and a status line under them saying which group is showing.
 *
 * The group row keeps each list short, so a panel is never a long drag away from the face above
 * it. A tab opens on its first group rather than on everything for the same reason.
 *
 * The face hands in its groups, its sizes, and its panels, so nothing here knows what a group or a
 * size means on any one face. The classes all start with `pf-palette`, and `css/palette.css` lays
 * them out.
 *
 * This is a Clay builder piece. esbuild bundles it into a component's initialize, which runs in
 * the config webview, so it sticks to browser APIs.
 */

/** What the palette reads off a panel. A face's own panel type can carry more. */
export interface PaletteModule {
  value: number;
  label: string;
  /** What the tile shows when the panel has no screenshot at its size. */
  icon: string;
  /** The tile's fill behind the icon. */
  color: string;
  /** The size keys the panel comes in, such as "1x2". */
  sizes: string[];
  /** The name of its group. A panel with none, or one the face lists no group for, shows under Other. */
  group?: string;
}

/** One group tab: its name, which the status line shows too, and its icon. */
export interface PaletteGroup {
  name: string;
  icon: string;
}

/** The group a panel lands in when the face lists no group for it. */
export const OTHER_GROUP: PaletteGroup = { name: 'Other', icon: '·' };

// the group tab that shows every panel in the size
const ALL = 'All';

/** One size tab. A wide size spans the grid, so its shots are twice as wide. */
export interface PaletteSize {
  key: string;
  wide: boolean;
}

/** One group as a size tab shows it, with its panels in list order. */
export interface PaletteSection<Module extends PaletteModule = PaletteModule> {
  group: PaletteGroup;
  modules: Module[];
}

/**
 * The groups a size tab shows, in the order the face lists them, each holding its panels in the
 * order the module list has them. A group with no panel at this size is left out. A panel with no
 * known group lands in Other at the end, so a new panel nobody grouped still shows.
 *
 * @param modules The placeable panels.
 * @param groups The face's groups, in tab order.
 * @param size The size key, such as "1x2".
 * @return The groups with at least one panel at this size.
 */
export function groupsForSize<Module extends PaletteModule>(modules: Module[], groups: PaletteGroup[], size: string): PaletteSection<Module>[] {
  const known: Record<string, boolean> = {};
  const sections: PaletteSection<Module>[] = [];
  const atSize = modules.filter(function (module) {
    return module.sizes.indexOf(size) !== -1;
  });

  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const members = atSize.filter(function (module) {
      return module.group === group.name;
    });

    known[group.name] = true;

    if (members.length > 0) {
      sections.push({ group: group, modules: members });
    }
  }

  const others = atSize.filter(function (module) {
    return !module.group || !known[module.group];
  });

  if (others.length > 0) {
    sections.push({ group: OTHER_GROUP, modules: others });
  }

  return sections;
}

/** What the palette cannot own itself, handed in by the builder. */
export interface PaletteEnv<Module extends PaletteModule = PaletteModule> {
  /** The element the palette is built into. */
  container: HTMLElement;
  /** The placeable panels, in the order each group lists them. */
  modules: Module[];
  /** The group tabs, in order. A face with one group, or none, gets no group row. */
  groups: PaletteGroup[];
  /** The size tabs, in order. A size no panel comes in gets no tab. */
  sizes: PaletteSize[];
  /** The panel's screenshot at a size, or null to show its icon on its colour. */
  thumbFor(value: number, size: string): string | null;
  /** Starts a drag from a tile, called on its pointerdown. */
  onPick(module: Module, size: string, event: PointerEvent): void;
}

/** The palette's handle for the builder. */
export interface Palette {
  /** Dims the tiles of the panels already on the face, by panel value. */
  markPlaced(values: number[]): void;
}

/**
 * Builds the palette into the container.
 *
 * The group picked on each size tab is kept while the page is open, so switching size and back
 * lands on the same group. A size with a single group shows its panels with no group row, since
 * there is nothing to pick between.
 *
 * @param env The container, the panels, the groups, the size tabs, the thumbnail lookup, and what a drag start calls.
 * @return markPlaced, which dims the tiles already on the face.
 */
export function createPalette<Module extends PaletteModule>(env: PaletteEnv<Module>): Palette {
  const chosen: Record<string, string> = {};
  let placed: number[] = [];
  let activeSize = '';
  let activeWide = false;

  const wrap = document.createElement('div');

  wrap.className = 'pf-palette';

  const tabBar = document.createElement('div');

  tabBar.className = 'pf-palette-sizes';

  const groupBar = document.createElement('div');

  groupBar.className = 'pf-palette-groups';

  const box = document.createElement('div');

  box.className = 'pf-palette-box';

  const pane = document.createElement('div');

  pane.className = 'pf-palette-pane';
  // the group row sits inside the size tab's box, since its groups belong to that size
  box.appendChild(groupBar);
  box.appendChild(pane);

  function buildTile(module: Module, size: string): HTMLElement {
    const tile = document.createElement('div');
    const shot = env.thumbFor(module.value, size);

    // a full width block shows a wide shot, so its tile gets twice the room
    tile.className = 'pf-palette-tile ' + (activeWide ? 'wide' : 'narrow');
    tile.dataset.value = String(module.value);
    tile.title = module.label;

    if (shot) {
      const img = document.createElement('img');

      tile.style.background = '#000';
      img.className = 'pf-palette-shot';
      img.src = shot;
      img.alt = module.label;
      tile.appendChild(img);
    } else {
      const icon = document.createElement('div');

      tile.style.background = module.color;
      icon.className = 'pf-palette-icon';
      icon.textContent = module.icon;
      tile.appendChild(icon);
    }

    tile.addEventListener('pointerdown', function (event) {
      env.onPick(module, size, event as PointerEvent);
    });

    return tile;
  }

  function buildGroupTab(group: PaletteGroup | null, pressed: boolean): HTMLElement {
    const tab = document.createElement('button');
    const icon = document.createElement('span');
    const name = document.createElement('span');

    tab.type = 'button';
    tab.className = 'pf-palette-group';
    tab.title = group ? group.name : 'Every panel';
    tab.setAttribute('aria-pressed', String(pressed));
    icon.className = 'pf-palette-group-icon';
    icon.textContent = group ? group.icon : '▦';
    name.className = 'pf-palette-group-name';
    name.textContent = group ? group.name : ALL;
    tab.appendChild(icon);
    tab.appendChild(name);
    tab.addEventListener('click', function () {
      chosen[activeSize] = group ? group.name : ALL;
      draw();
    });

    return tab;
  }

  function applyPlaced(): void {
    const tiles = pane.querySelectorAll<HTMLElement>('.pf-palette-tile');

    for (let index = 0; index < tiles.length; index++) {
      const value = parseInt(tiles[index].dataset.value || '', 10);

      tiles[index].classList.toggle('placed', placed.indexOf(value) !== -1);
    }
  }

  // redraws the group row and the list for the active size
  function draw(): void {
    const sections = groupsForSize(env.modules, env.groups, activeSize);
    const single = sections.length < 2;
    let pick = chosen[activeSize];
    let total = 0;

    for (let index = 0; index < sections.length; index++) {
      total += sections[index].modules.length;
    }

    if (single) {
      pick = ALL;
    } else if (pick !== ALL && !sections.some(function (section) { return section.group.name === pick; })) {
      pick = sections[0].group.name;
    }

    while (groupBar.firstChild) {
      groupBar.removeChild(groupBar.firstChild);
    }

    groupBar.hidden = single;

    for (let index = 0; index < sections.length && !single; index++) {
      groupBar.appendChild(buildGroupTab(sections[index].group, sections[index].group.name === pick));
    }

    if (!single) {
      groupBar.appendChild(buildGroupTab(null, pick === ALL));
    }

    while (pane.firstChild) {
      pane.removeChild(pane.firstChild);
    }

    const showing = pick === ALL ? null : sections.filter(function (section) {
      return section.group.name === pick;
    })[0];

    const tiles = document.createElement('div');

    tiles.className = 'pf-palette-tiles';

    const listed = showing ? [showing] : sections;

    for (let index = 0; index < listed.length; index++) {
      for (let moduleIndex = 0; moduleIndex < listed[index].modules.length; moduleIndex++) {
        tiles.appendChild(buildTile(listed[index].modules[moduleIndex], activeSize));
      }
    }

    pane.appendChild(tiles);

    // the status line under the tiles is what makes the filter impossible to miss, so it names
    // the group and what is left out, with a way back to every panel
    if (showing) {
      const status = document.createElement('div');
      const what = document.createElement('span');
      const all = document.createElement('button');

      status.className = 'pf-palette-status';
      what.textContent = showing.group.name + ' · ' + showing.modules.length + ' of ' + total;
      all.type = 'button';
      all.className = 'pf-palette-all';
      all.textContent = 'Show all';
      all.addEventListener('click', function () {
        chosen[activeSize] = ALL;
        draw();
      });
      status.appendChild(what);
      status.appendChild(all);
      pane.appendChild(status);
    }

    applyPlaced();
  }

  function selectSize(size: PaletteSize): void {
    const tabs = tabBar.querySelectorAll<HTMLElement>('.pf-palette-size');

    activeSize = size.key;
    activeWide = size.wide;

    for (let index = 0; index < tabs.length; index++) {
      tabs[index].classList.toggle('active', tabs[index].dataset.size === size.key);
    }

    draw();
  }

  let first: PaletteSize | null = null;

  for (let index = 0; index < env.sizes.length; index++) {
    const size = env.sizes[index];

    // a size no panel comes in gets no tab
    if (groupsForSize(env.modules, env.groups, size.key).length === 0) {
      continue;
    }

    const tab = document.createElement('button');

    tab.type = 'button';
    tab.className = 'pf-palette-size';
    tab.dataset.size = size.key;
    tab.textContent = size.key;
    tab.addEventListener('click', function () {
      selectSize(size);
    });
    tabBar.appendChild(tab);

    if (!first) {
      first = size;
    }
  }

  wrap.appendChild(tabBar);
  wrap.appendChild(box);
  env.container.appendChild(wrap);

  if (first) {
    selectSize(first);
  }

  return {
    markPlaced: function (values) {
      placed = values.slice();
      applyPlaced();
    },
  };
}
