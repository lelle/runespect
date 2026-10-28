import { assembleSerialized } from './serialize.js';

// Injected into the page during prod capture, AFTER the dev bootModule. Redefines
// __runespectReconstruct to assemble the prod tree (static sub-trees registered by the runtime-chunk
// wrappers + their live recorded signals) when present, otherwise delegates to the dev reconstruct.
// So the same overlay/panel works for dev capture and prod capture. assembleSerialized
// is embedded via toString() — single source with the unit-tested function.
export function bootModuleProd(): string {
  return `(() => {
  const g = globalThis;
  const assemble = ${assembleSerialized.toString()};
  const prev = g.__runespectReconstruct;
  g.__runespectReconstruct = function () {
    const trees = g.__RS_PROD_TREES__;
    if (trees && trees.length) return assemble(trees);
    return prev ? prev() : [];
  };
})();
`;
}
