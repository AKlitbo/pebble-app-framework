// @vitest-environment jsdom
/**
 * Specs for how the shared drag engine finishes a drag.
 *
 * A builder that lifts a placed item out of its model has nothing on screen holding it, so which
 * callback runs at the end decides whether that item comes back or is gone. A release away from
 * any target means remove it, while a pointer taken away mid drag means put it back, and telling
 * those two apart is most of what is pinned here.
 *
 * The rest is the two ends of an armed press. The threshold is what keeps a tap on a placed block
 * from grabbing it, and the drop over an allowed target is the only way anything is ever placed.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createDrag } from './drag';
import type { DragSpec } from './drag';

/** A pointerdown the handle can start from. jsdom has no PointerEvent, and only these are read. */
function pointerDown(pointerId?: number): PointerEvent {
  return { clientX: 0, clientY: 0, pointerId: pointerId, preventDefault: () => {} } as unknown as PointerEvent;
}

/** A pointer event from one finger. jsdom's MouseEvent has no pointerId, so it is added afterwards. */
function fingerEvent(doc: Document, type: string, pointerId: number, x: number, y: number): void {
  const event = new MouseEvent(type, { clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  doc.dispatchEvent(event);
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

/**
 * A document of its own for one drag.
 *
 * createDrag leaves its listeners on the document for the life of the config page, so two drags
 * sharing one document both answer the same move and a press armed in one test reaches the next.
 */
function ownDocument(): Document {
  return document.implementation.createHTMLDocument('');
}

/** A pointer move to a point, which is all the engine reads off the event. */
function pointerMove(doc: Document, x: number, y: number): void {
  doc.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
}

/** A release at a point. */
function pointerUp(doc: Document, x: number, y: number): void {
  doc.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y }));
}

describe('arm', () => {
  /**
   * A press that has not travelled is a tap. Lifting on it would make every touch of a placed
   * block pull it out of the grid, which on a touchscreen reads as a builder that grabs at
   * everything.
   */
  test('leaves a press that has not passed the threshold armed', () => {
    const lift = vi.fn();
    const spec = specWith({ lift: lift });
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.arm('panel', pointerDown());
    pointerMove(doc, 10, 0);

    expect(lift).not.toHaveBeenCalled();
    expect(doc.body.children).toHaveLength(0);
  });

  /** Past the threshold the press is a real drag, so the item comes out of the model and a ghost follows the finger. */
  test('lifts and begins the drag once the press passes the threshold', () => {
    const lift = vi.fn();
    const spec = specWith({ lift: lift });
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.arm('panel', pointerDown());
    pointerMove(doc, 11, 0);

    expect(lift).toHaveBeenCalledWith('panel');
    expect(doc.body.children).toHaveLength(1);
  });

  /**
   * Releasing a press that never travelled must touch nothing. Running dropOutside on it would
   * delete the block the user only tapped.
   */
  test('leaves the model alone when an armed press is released as a tap', () => {
    const spec = specWith();
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.arm('panel', pointerDown());
    pointerUp(doc, 2, 2);

    expect(spec.drop).not.toHaveBeenCalled();
    expect(spec.dropOutside).not.toHaveBeenCalled();
  });
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

  /** The one way anything is ever placed in a builder, so the target under the release has to reach drop. */
  test('commits a release over a target that allows the payload', () => {
    const spec = specWith({ hitTest: () => 3, allows: () => true });
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.start('panel', pointerDown());
    pointerUp(doc, 40, 40);

    expect(spec.drop).toHaveBeenCalledWith('panel', 3);
    expect(spec.dropOutside).not.toHaveBeenCalled();
  });

  /**
   * A target that refuses this payload, such as a cell too small for the block, is not a drop. The
   * release goes to dropOutside, so a block dragged onto a spot it cannot fit is not wedged there.
   */
  test('sends a release over a target that refuses the payload to dropOutside', () => {
    const spec = specWith({ hitTest: () => 3, allows: () => false });
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.start('panel', pointerDown());
    pointerUp(doc, 40, 40);

    expect(spec.dropOutside).toHaveBeenCalledWith('panel');
    expect(spec.drop).not.toHaveBeenCalled();
  });
});

describe('a second finger', () => {
  /**
   * A second finger on the screen sends its own moves and releases. Following them jumped the
   * ghost to that finger and dropped the panel wherever it lifted.
   */
  test('leaves the drag to the finger that started it', () => {
    const spec = specWith({ hitTest: () => 3, allows: () => true });
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.start('panel', pointerDown(1));
    fingerEvent(doc, 'pointerup', 2, 40, 40);

    expect(spec.drop).not.toHaveBeenCalled();
    expect(doc.body.children).toHaveLength(1);
  });

  /**
   * A new drag starting over one still under way replaced it and left the old ghost stuck on the
   * page, with the lifted item never put back.
   */
  test('cancels the drag under way before starting another', () => {
    const cancel = vi.fn();
    const spec = specWith({ cancel: cancel });
    const doc = ownDocument();
    const drag = createDrag<string, number>(spec, doc);

    drag.start('panel', pointerDown(1));
    drag.start('clock', pointerDown(2));

    expect(cancel).toHaveBeenCalledWith('panel');
    expect(doc.body.children).toHaveLength(1);
  });
});
