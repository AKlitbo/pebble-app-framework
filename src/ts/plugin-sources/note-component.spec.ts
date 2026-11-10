// @vitest-environment jsdom
/**
 * Specs for the plugin note Clay component.
 *
 * It is registered on the settings page, so Clay serializes it by writing each function's toString,
 * and a shorthand method stops the whole page parsing. The rest is the one thing the note exists to
 * get right: the words reach the wearer as text. A plugin names itself, and a name that became
 * markup would run in the settings page, while a name shown with its escapes would read as garbage.
 */
import { describe, test, expect } from 'vitest';
import component from './note-component';
import * as harness from '../clay/builder/ts/testing/harness';
import type { ClayComponentDefinition } from '../clay/builder/ts/testing/harness';

/** Mounts the note the way Clay does, runs initialize, then sets the words as Clay sets a defaultValue. */
function showNote(value: string, config: Record<string, unknown> = {}) {
  const { ctx, root } = harness.mount(component as unknown as ClayComponentDefinition, config);

  ctx.initialize();
  ctx.set(value);

  return root;
}

describe('Clay serialization safety', () => {
  /** Shorthand method syntax is written out as `set:set(value) {`, and the config page never opens. */
  test.each([
    ['initialize', component.initialize],
    ['set', component.manipulator.set],
    ['get', component.manipulator.get],
  ])('declares %s as a function expression', (_name, method) => {
    const result = String(method);

    expect(result.startsWith('function')).toBe(true);
  });
});

describe('the words', () => {
  /** page.ts escapes a plugin's name before it reaches the page, and a note that kept the escapes would show &lt;img to the wearer. */
  test('shows escaped words as the text they stand for', () => {
    const root = showNote('&lt;img src=x onerror=alert(1)&gt; sends &quot;Tom&#39;s&quot; weather &amp; more.');

    const result = root.querySelector('.pf-note-text')?.textContent;

    expect(result).toBe('<img src=x onerror=alert(1)> sends "Tom\'s" weather & more.');
  });

  /** A name that became markup would run its script inside the settings page. */
  test('never turns the words into markup', () => {
    const root = showNote('&lt;img src=x onerror=alert(1)&gt; is here.');

    const result = root.querySelectorAll('img').length;

    expect(result).toBe(0);
  });

  /** Undoing &amp; first would turn an escaped &amp;lt; into a < the name never held. */
  test('undoes each escape once', () => {
    const root = showNote('a &amp;lt; b');

    const result = root.querySelector('.pf-note-text')?.textContent;

    expect(result).toBe('a &lt; b');
  });

  /** page.ts escapes every dollar sign so Clay's replace cannot read it as a pattern, and a note that kept the escape would show &#36; to the wearer. */
  test('shows an escaped dollar sign as the dollar sign it stands for', () => {
    const root = showNote('Rain&#36;&#39;Check &#36;&#36;SETTINGS&#36;&#36; and &amp;#36;');

    const result = root.querySelector('.pf-note-text')?.textContent;

    expect(result).toBe('Rain$\'Check $$SETTINGS$$ and &#36;');
  });

  /** Clay pastes the note's methods into the page with a plain string replace, so a dollar sign in them would be read as a pattern. */
  test('carries no dollar sign pattern in its methods', () => {
    const result = [component.initialize, component.manipulator.set, component.manipulator.get].map(String).join('\n');

    expect(result).not.toMatch(/\$[$&'`]/);
  });
});

describe('the tone', () => {
  /** A warning without its badge reads as a plain line the wearer skims past. */
  test('gives a note the warning style unless it asks for info', () => {
    const root = showNote('Allow Location.');

    const result = root.querySelector('.pf-note')?.className;

    expect(result).toBe('pf-note pf-note-warning');
  });

  /** The note on where the weather comes from is a fact, and a warning badge on it would read as something gone wrong. */
  test('gives an info note the calmer style', () => {
    const root = showNote('The weather comes from the Pebble app.', { tone: 'info' });

    const result = root.querySelector('.pf-note')?.className;

    expect(result).toBe('pf-note pf-note-info');
  });

  /** The badge is the warning's own mark, drawn only for that tone, with the accent a face can restyle. */
  test('draws the badge for the warning tone alone, in the accent colour', () => {
    const result = component.style;

    expect(result).toContain('.pf-note-warning:before { content: "!";');
    expect(result).toContain('color: var(--pf-note-accent, #ff4700)');
    expect(result).not.toContain('.pf-note-info:before');
  });
});
