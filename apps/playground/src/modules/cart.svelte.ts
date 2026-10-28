// Module state as apps keep it: a private `let` behind functions, an exported object, a derived, and
// an instance of a class with rune fields. Instrumented in tests by the vitest config.
let items = $state<string[]>([]);
const count = $derived(items.length);
export const settings = $state({ vat: true });

class Coupon {
  code = $state('');
  get active(): boolean {
    return this.code !== '';
  }
}
const coupon = new Coupon();

export function add(item: string): void {
  items.push(item);
}
export function clear(): void {
  items = [];
}
export function getItems(): string[] {
  return items;
}
export function getCount(): number {
  return count;
}
export function getCoupon(): string {
  return coupon.active ? coupon.code : 'none';
}
export function useCoupon(code: string): void {
  coupon.code = code;
}
