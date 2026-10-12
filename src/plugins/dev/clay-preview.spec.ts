/**
 * Specs for the Clay preview's own decisions.
 *
 * Building the page is Clay's work, and compiling it is the build's. What the preview decides itself
 * is what it was asked for, and which page and components it hands Clay. A wrong answer there
 * previews a fresh install when a returning wearer was asked for, or shows a working page for a face
 * whose settings never open on the phone.
 */
import { describe, expect, test } from 'vitest';
import { captureStart, parseClayPreviewArgs, type StartHost, type StartOptions } from './clay-preview.ts';

describe('parseClayPreviewArgs', () => {
  /** The flags a face developer types every day have to land where the build reads them. */
  test('reads the face and every flag', () => {
    const result = parseClayPreviewArgs(['my-face', '--watch', '--platform=gabbro', '--settings=saved.json']);

    expect(result).toEqual({ face: 'my-face', watch: true, platform: 'gabbro', settings: 'saved.json', help: false });
  });

  /** With nothing but the face it previews a fresh install on emery, the watch most faces are built for. */
  test('defaults to a fresh install on emery', () => {
    const result = parseClayPreviewArgs(['my-face']);

    expect(result).toEqual({ face: 'my-face', watch: false, platform: 'emery', settings: null, help: false });
  });

  /**
   * The mistake this guards. Ignoring a space in place of the equals sign would show a fresh install
   * while the developer believes they are looking at their saved settings.
   */
  test('refuses --settings with a space instead of an equals sign', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--settings', 'saved.json']);

    expect(result).toThrow('unknown argument: --settings');
  });

  /** A typo in a flag stops the run rather than previewing something other than what was asked for. */
  test('refuses a flag it does not know', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--plaform=gabbro']);

    expect(result).toThrow('unknown argument: --plaform=gabbro');
  });

  /** An empty value, such as a shell variable that expanded to nothing, is named as missing rather than as a typo. */
  test('refuses a flag with nothing after the equals sign', () => {
    const result = () => parseClayPreviewArgs(['my-face', '--settings=']);

    expect(result).toThrow('--settings needs a value');
  });

  /** A flag where the face belongs would otherwise be read as a face named --watch. */
  test('refuses a run with no face first', () => {
    const result = () => parseClayPreviewArgs(['--watch']);

    expect(result).toThrow('no face given');
  });

  /** paf passes a -- through as typed, so it marks the end of paf's options rather than being a typo. */
  test('skips a bare -- before the flags', () => {
    const result = parseClayPreviewArgs(['my-face', '--', '--watch']);

    expect(result.watch).toBe(true);
  });

  /** Asking for help never builds anything, even beside a flag that would otherwise be refused. */
  test('asks only for the usage when --help is anywhere', () => {
    const result = parseClayPreviewArgs(['my-face', '--nonsense', '--help']);

    expect(result.help).toBe(true);
  });
});

describe('captureStart', () => {
  /** A host whose real startPebbleApp records that it ran, so a spec can see whether it was put back. */
  function recordingHost(): { host: StartHost; realCalls: StartOptions[] } {
    const realCalls: StartOptions[] = [];
    const host: StartHost = { startPebbleApp: (options) => { realCalls.push(options); } };

    return { host, realCalls };
  }

  /**
   * The point of the capture. The preview registers exactly what the face passes, so a component
   * left out of startPebbleApp is missing here too, the way it is on the phone.
   */
  test('hands back what the face passed to startPebbleApp', () => {
    const { host } = recordingHost();
    const passed: StartOptions = { clayConfig: [{ type: 'heading', defaultValue: 'Page' }], components: ['layout'], customClay: 'reset' };

    const result = captureStart(host, () => host.startPebbleApp(passed), 'my-face');

    expect(result).toBe(passed);
  });

  /** The face's start-up must never reach the real startPebbleApp, which would wire phone events under node. */
  test('keeps the real startPebbleApp from running', () => {
    const { host, realCalls } = recordingHost();

    captureStart(host, () => host.startPebbleApp({ clayConfig: [] }), 'my-face');

    expect(realCalls).toHaveLength(0);
  });

  /** A rebuild under --watch loads the face again, so the real call has to be back after a failed load. */
  test('puts the real startPebbleApp back when the load throws', () => {
    const { host } = recordingHost();
    const real = host.startPebbleApp;
    const load = () => { throw new Error('bad face'); };

    const result = () => captureStart(host, load, 'my-face');

    expect(result).toThrow('bad face');
    expect(host.startPebbleApp).toBe(real);
  });

  /** A face whose start-up never starts has no page the phone would build, so the preview says so. */
  test('refuses a face that never calls startPebbleApp', () => {
    const { host } = recordingHost();

    const result = () => captureStart(host, () => {}, 'my-face');

    expect(result).toThrow("my-face's src/pkjs/index.ts never calls startPebbleApp");
  });
});
