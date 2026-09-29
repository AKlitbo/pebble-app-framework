/**
 * Types every `*.g` module, such as the Clay components and the thumbnail table the generators write
 * for a face. They are generated JavaScript with no types of their own, so TypeScript that imports
 * one gets it loosely typed. The real `.g.js` is what runs.
 */
declare module '*.g' {
  const value: any;
  export = value;
}
