// A module whose derived nothing reads: Svelte never evaluates it unless someone else does.
export const evaluations = { n: 0 };
let count = $state(0);
const doubled = $derived((evaluations.n++, count * 2));

export function bump(): void {
  count++;
}
export function getDoubled(): number {
  return doubled;
}
