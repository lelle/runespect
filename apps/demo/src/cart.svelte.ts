// The cart as apps keep it: module state behind functions, shown under Modules in the tree.
export interface Line {
  name: string;
  price: number;
  qty: number;
}

let lines = $state<Line[]>([]);
const subtotal = $derived(lines.reduce((sum, line) => sum + line.price * line.qty, 0));

export function add(name: string, price: number, qty: number): void {
  const line = lines.find((l) => l.name === name);
  if (line) line.qty += qty;
  else lines.push({ name, price, qty });
}
export function remove(name: string): void {
  lines = lines.filter((l) => l.name !== name);
}
export function clear(): void {
  lines = [];
}
export function getLines(): Line[] {
  return lines;
}
export function getSubtotal(): number {
  return subtotal;
}
