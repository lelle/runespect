// What the specs read in the page: the agent's console surface.
import type { RunespectSurface } from '../packages/agent/src/index.ts';

declare global {
  interface Window {
    __runespect?: RunespectSurface;
  }
}
