/**
 * Specs for the shared control and callout rules.
 *
 * Every colour in them reads a --pf-* custom property, and most faces set none. A property written
 * without its fallback would leave those faces with a see-through search list or an invisible link,
 * and nothing else on the page would show why. So the fallbacks are what is worth pinning.
 */

import { describe, test, expect } from 'vitest';
import controlStyle from './control-style';
import calloutStyle from './callout-style';

const RULES = Object.entries({ ...controlStyle, ...calloutStyle });

describe('the custom properties', () => {
  /** A face that sets no --pf-* property has to keep Clay's own colours, not lose the colour altogether. */
  test.each(RULES)('%s gives every property a fallback', (name, rule) => {
    const result = rule.match(/var\(--pf-[a-z-]+\)/g);

    expect(result).toBeNull();
  });
});
