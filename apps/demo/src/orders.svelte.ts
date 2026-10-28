// Placed orders are never changed, only added to, so they are raw state: replaced, not proxied.
export interface Order {
  id: number;
  name: string;
  total: number;
}

let orders = $state.raw<Order[]>([]);

export function placeOrder(name: string, total: number): void {
  orders = [...orders, { id: orders.length + 1, name, total: Math.round(total * 100) / 100 }];
}
export function getOrders(): Order[] {
  return orders;
}
