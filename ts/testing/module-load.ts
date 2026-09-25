/**
 * Stands modules in for the ones a face's phone code requires lazily.
 *
 * `startPebbleApp` requires `message_keys` and Clay only once it runs, and the watch build aliases
 * both to files that do not exist under plain node. Node's `Module._load` is where every require
 * lands, so swapping it lets a spec or a dev tool hand back its own stand in.
 */

import Module from 'node:module';

type LoadFn = (request: string, ...args: unknown[]) => unknown;

/**
 * Routes each require through the stand ins first, and on to node for anything they do not cover.
 *
 * @param stub Gives the stand in for a module id, or undefined to load the real one.
 * @return Puts node's own loader back.
 */
export function stubModuleLoad(stub: (id: string) => unknown): () => void {
  // _load is a private Node internal so it is not in the public module types
  const moduleInternal = Module as unknown as { _load: LoadFn };
  const original = moduleInternal._load;

  moduleInternal._load = function (this: unknown, request: string, ...args: unknown[]) {
    return stub(request) ?? original.apply(this, [request, ...args]);
  };

  return () => {
    moduleInternal._load = original;
  };
}
