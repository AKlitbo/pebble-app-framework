/**
 * Puts the settings page code together into the one custom function Clay takes.
 *
 * The framework's page code comes first and a face's own customClay last, and each runs once, in
 * order, with the page as `this`. Clay keeps no function. It writes the custom function into the page
 * as source text, through its toString, and the page runs that text. So a plain wrapper that called
 * the parts would reach nothing once it was on the page. The combined function carries a toString of
 * its own that writes out every part's source, each inside its own try, so the phone builds it with
 * no eval or new Function.
 *
 * Clay pastes that text into the page with a plain string replace, which reads `$$`, `$&`, `` $` ``,
 * and `$'` as replacement patterns. The text written around the parts holds no dollar sign at all,
 * the labels included. Its own names start with paf, so a part that reads a free name of its own
 * never picks up the wrapper's argument or error by mistake.
 */

/** One piece of page code and the words the page logs it by when it throws. */
export interface PagePart {
  /** The function the page runs, or undefined or null when this page has none of it. */
  code: unknown;
  /** What the part is, such as "the face's customClay", as plain text. */
  label: string;
}

/**
 * A label made safe to sit inside a single-quoted string on the page. A backslash, a quote, a dollar
 * sign, a `<`, and a line break are written as `\x` or `\u` escapes, so the string cannot end early, close
 * the page's script tag, or hand Clay's replace a pattern.
 */
function quoted(label: string): string {
  return label.replace(/[\\'$<\n\r\u2028\u2029]/g, (char) => {
    const code = char.charCodeAt(0);

    return code > 0xff ? `\\u${code.toString(16).padStart(4, '0')}` : `\\x${code.toString(16).padStart(2, '0')}`;
  });
}

/**
 * The source the page runs for two or more parts. Each part is called on the page with `this` and
 * the helper it would get on its own, inside a try of its own, so one part throwing leaves the next
 * one running.
 */
function combinedSource(parts: PagePart[]): string {
  const calls = parts.map((part) => [
    '  try {',
    '    (',
    String(part.code),
    '    ).call(this, pafMinified);',
    '  } catch (pafError) {',
    `    console.error('${quoted(part.label)} threw: ' + pafError);`,
    '  }',
  ].join('\n'));

  return ['function (pafMinified) {', ...calls, '}'].join('\n');
}

/**
 * Combines the settings page code into the custom function Clay takes.
 *
 * Every part's code is a function, which createClay checks for the face's customClay as the app
 * starts. A part whose code is left out, as undefined or null, is skipped. With none left there is no
 * custom function, and Clay keeps its own do-nothing one. With one, that code goes to Clay as it is,
 * so the page carries exactly its source. With two or more, the page runs each once, in order, and
 * logs a part that throws with console.error, by its label, while the next one still runs.
 *
 * The combined function only runs on the settings page, from the text Clay writes there. Called
 * straight it throws, so there is one copy of how the parts run and no second one to drift from it.
 *
 * @param parts The page code, the framework's first and the face's customClay last.
 * @return The custom function to hand Clay, or undefined when there is none.
 */
export function combineCustomFns(parts: PagePart[]): unknown {
  // Clay treats a custom function that is not truthy as none, so the parts do the same
  const present = parts.filter((part) => Boolean(part.code));

  if (present.length < 2) {
    return present.length ? present[0].code : undefined;
  }

  const source = combinedSource(present);

  const combined = function (): void {
    throw new Error('the combined settings page code only runs on the settings page, through Clay');
  };

  combined.toString = () => source;

  return combined;
}

/** What a face's customClay is, as far as running it on the page goes. */
export type CustomClayShape = 'none' | 'plain' | 'not-plain' | 'not-function';

/**
 * Sorts a face's customClay by whether the page can run it with the page as `this`.
 *
 * Anything falsy is no customClay at all. A function whose text starts with the word function, a
 * plain, named, or async one, can take the page as `this`. Any other function cannot, such as an
 * arrow, which sees the `this` around it, or a method shorthand, whose text starts with its own name
 * and is not a function expression on the page. A bound function's text reads as a plain function
 * whatever it wraps, so it passes. The phone and the build both sort it here, so they never disagree.
 *
 * @param customClay What the face handed startPebbleApp as its customClay.
 * @return none, plain, not-plain, or not-function.
 */
export function customClayShape(customClay: unknown): CustomClayShape {
  if (!customClay) {
    return 'none';
  }

  if (typeof customClay !== 'function') {
    return 'not-function';
  }

  return /^(async\s+)?function\b/.test(String(customClay)) ? 'plain' : 'not-plain';
}
