import { VERSION } from 'svelte/compiler';

// The version matrix in CI runs these tests on the lowest supported Svelte as well; a few know
// they need a newer one.
export function atLeast(version: string, minimum: string): boolean {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true;
}

export const svelteAtLeast = (minimum: string): boolean => atLeast(VERSION, minimum);
