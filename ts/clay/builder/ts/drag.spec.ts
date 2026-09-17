// @vitest-environment jsdom
/**
 * Specs for how the shared drag engine finishes a drag.
 *
 * A builder that lifts a placed item out of its model has nothing on screen holding it, so which
 * callback runs at the end decides whether that item comes back or is gone. A release away from
 * any target means remove it, while a pointer taken away mid drag means put it back, and telling
 * those two apart is the whole of what is pinned here.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createDrag } from './drag';
import type { DragSpec } from './drag';

/** A pointerdown the handle can start from. jsdom has no PointerEvent, and only these are read. */
function pointerDown(): PointerEvent {
  return { clientX: 0, clientY: 0, preventDefault: () => {} } as unknown as PointerEvent;
}

/** The smallest spec that answers everything createDrag calls, with the finishers spied on. */
function specWith(extra: Partial<DragSpec<string, number>> = {}) {
  return {
    ghost: () => document.createElement('div'),
    hitTest: () => null,
    allows: () => false,
    highlight: () => {},
    drop: vi.fn(),
    dropOutside: vi.fn(),
    ...extra,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pointercancel', () => {
  /** The webview claiming the touch to scroll would otherwise bin a panel the user only meant to move. */
  test('hands a cancelled drag to cancel instead of dropOutside', () => {
    const cancel = vi.fn();
    const spec = specWith({ cancel: cancel });
    const drag = createDrag<string, number>(spec);

    drag.start('panel', pointerDown());
    document.dispatchEvent(new Event('pointercancel'));

    expect(cancel).toHaveBeenCalledWith('panel');
    expect(spec.dropOutside).not.toHaveBeenCalled();
  });

  /** A builder that never lifts anything out of its model needs no cancel, so the old single path has to keep working. */
  test('falls back to dropOutside for a spec with no cancel', () => {
    const spec = specWith();
    const drag = createDrag<string, number>(spec);

    drag.start('panel', pointerDown());
    document.dispatchEvent(new Event('pointercancel'));

    expect(spec.dropOutside).toHaveBeenCalledWith('panel');
  });

  /** A cancel with no drag under way must not hand a finisher an empty payload and delete whatever it names. */
  test('does nothing when no drag is under way', () => {
    const cancel = vi.fn();
    const spec = specWith({ cancel: cancel });
    createDrag<string, number>(spec);

    document.dispatchEvent(new Event('pointercancel'));

    expect(cancel).not.toHaveBeenCalled();
    expect(spec.dropOutside).not.toHaveBeenCalled();
  });
});

describe('pointerup', () => {
  /** A release away from any target is how a placed item is deleted, so cancel must not swallow it. */
  test('sends a release away from any target to dropOutside even when a cancel exists', () => {
    const cancel = vi.fn();
    const spec = specWith({ cancel: cancel });
    const drag = createDrag<string, number>(spec);

    drag.start('panel', pointerDown());
    document.dispatchEvent(new MouseEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(spec.dropOutside).toHaveBeenCalledWith('panel');
    expect(cancel).not.toHaveBeenCalled();
  });
});
